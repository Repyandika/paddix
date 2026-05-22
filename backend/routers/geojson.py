from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
import json

from database import get_db

router = APIRouter(
    prefix="/api/geo",
    tags=["GeoJSON"],
)


# ──────────────────────────────────────────────────────────────────────────────
# 1. GET /api/geo/batas
#    GeoJSON batas kecamatan + data NDVI & KPI sudah di-JOIN
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/batas", summary="GeoJSON Batas Kecamatan + NDVI + KPI")
def get_batas_geojson(
    tahun: Optional[int] = Query(None, description="Filter tahun NDVI"),
    bulan: Optional[int] = Query(None, description="Filter bulan NDVI (1-12)"),
    db: Session = Depends(get_db),
):
    """
    Mengembalikan GeoJSON FeatureCollection berisi poligon batas tiap kecamatan
    beserta data rata-rata NDVI dan statistik KPI yang sudah di-JOIN.
    Cocok untuk render peta choropleth di frontend.
    """
    tahun_filter = "AND n.tahun = :tahun" if tahun else ""
    bulan_filter = "AND n.bulan = :bulan" if bulan else ""

    sql = text(f"""
        SELECT
            b.name_3                            AS kecamatan,
            ST_AsGeoJSON(b.wkb_geometry)        AS geometry,
            sub_n.avg_ndvi,
            sub_n.min_ndvi,
            sub_n.max_ndvi,
            sub_n.total_records,
            k."count"                           AS jumlah_petak,
            k."mean"::float                     AS rata_rata_luas,
            k."sum"::float                      AS total_luas,
            k."median"::float                   AS median_luas,
            k."stddev"::float                   AS stddev_luas,
            k."min"::float                      AS min_luas,
            k."max"::float                      AS max_luas,
            (ST_Area(b.wkb_geometry::geography) / 10000.0) AS luas_wilayah_ha
        FROM bataskarawang b
        LEFT JOIN (
            SELECT
                kecamatan,
                AVG(mean_ndvi)::float   AS avg_ndvi,
                MIN(mean_ndvi)::float   AS min_ndvi,
                MAX(mean_ndvi)::float   AS max_ndvi,
                COUNT(*)::int           AS total_records
            FROM ndvi_kecamatan n
            WHERE 1=1 {tahun_filter} {bulan_filter}
            GROUP BY kecamatan
        ) sub_n ON LOWER(b.name_3) = LOWER(sub_n.kecamatan)
        LEFT JOIN kpi_kecamatan k ON LOWER(b.name_3) = LOWER(k.kecamatan)
        ORDER BY b.name_3
    """)

    params = {}
    if tahun: params["tahun"] = tahun
    if bulan: params["bulan"] = bulan
    rows = db.execute(sql, params).fetchall()

    features = []
    for row in rows:
        feature = {
            "type": "Feature",
            "geometry": json.loads(row.geometry) if row.geometry else None,
            "properties": {
                "kecamatan":      row.kecamatan,
                "avg_ndvi":       row.avg_ndvi,
                "min_ndvi":       row.min_ndvi,
                "max_ndvi":       row.max_ndvi,
                "total_records":  row.total_records,
                "jumlah_petak":   row.jumlah_petak,
                "rata_rata_luas": row.rata_rata_luas,
                "total_luas":     row.total_luas,
                "median_luas":    row.median_luas,
                "stddev_luas":    row.stddev_luas,
                "min_luas":       row.min_luas,
                "max_luas":       row.max_luas,
                "luas_wilayah":   row.luas_wilayah_ha,
            },
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


# ──────────────────────────────────────────────────────────────────────────────
# 2. GET /api/geo/sawah
#    GeoJSON poligon sawah per kecamatan (semua data, tanpa partial filtering)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/sawah", summary="GeoJSON Poligon Sawah per Kecamatan")
def get_sawah_geojson(
    kecamatan: str = Query(..., description="Nama kecamatan"),
    db: Session = Depends(get_db),
):
    """
    Mengembalikan GeoJSON poligon sawah untuk satu kecamatan (SEMUA poligon, tanpa partial).
    Menggunakan simplifikasi geometri (0.001) untuk performa optimal.
    Response di-streaming sebagai JSON untuk kecepatan transmisi.
    """
    params = {"nama_kecamatan": kecamatan}

    sql = text("""
        SELECT
            ogc_fid,
            ST_AsGeoJSON(ST_Simplify(wkb_geometry, 0.001)) AS geometry,
            luas_ha,
            id_sawah,
            kecamatan,
            status_data
        FROM sawah_karawang
        WHERE wkb_geometry IS NOT NULL
          AND LOWER(TRIM(kecamatan)) = LOWER(TRIM(:nama_kecamatan))
        ORDER BY ogc_fid
    """)

    rows = db.execute(sql, params).fetchall()

    features = []
    for row in rows:
        geom = row.geometry if row.geometry else "null"
        ogc_fid = row.ogc_fid
        luas_ha = row.luas_ha if row.luas_ha is not None else "null"
        id_sawah = row.id_sawah if row.id_sawah is not None else "null"
        kec = json.dumps(row.kecamatan)
        status_data = json.dumps(row.status_data)
        
        feat = f'{{"type":"Feature","geometry":{geom},"properties":{{"ogc_fid":{ogc_fid},"luas_ha":{luas_ha},"id_sawah":{id_sawah},"kecamatan":{kec},"status_data":{status_data}}}}}'
        features.append(feat)

    features_json = ",".join(features)
    result_json = f'{{"type":"FeatureCollection","features":[{features_json}]}}'

    return Response(content=result_json, media_type="application/json")