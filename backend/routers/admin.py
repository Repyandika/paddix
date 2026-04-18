import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import User
from auth_utils import require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ─── Schemas ──────────────────────────────────────────────────────────────────
class SawahCreate(BaseModel):
    kecamatan: str
    luas_ha: float
    id_sawah: Optional[float] = None
    status_data: Optional[str] = "valid"
    geojson_geometry: dict  # GeoJSON geometry object

class SawahUpdateGeometry(BaseModel):
    geojson_geometry: dict  # GeoJSON geometry object


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/admin/sawah  — Tambah poligon sawah baru
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/sawah", summary="Tambah poligon sawah baru (admin only)")
def create_sawah(body: SawahCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    geojson_str = json.dumps(body.geojson_geometry)
    sql = text("""
        INSERT INTO sawah_karawang (kecamatan, luas_ha, id_sawah, status_data, wkb_geometry)
        VALUES (:kecamatan, :luas_ha, :id_sawah, :status_data, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)))
        RETURNING ogc_fid
    """)
    result = db.execute(sql, {
        "kecamatan": body.kecamatan,
        "luas_ha": body.luas_ha,
        "id_sawah": body.id_sawah,
        "status_data": body.status_data,
        "geojson": geojson_str,
    })
    db.commit()
    new_id = result.fetchone()[0]
    return {"detail": "Poligon sawah berhasil ditambahkan", "ogc_fid": new_id}


# ──────────────────────────────────────────────────────────────────────────────
# PUT /api/admin/sawah/{ogc_fid}  — Edit geometri poligon
# ──────────────────────────────────────────────────────────────────────────────
@router.put("/sawah/{ogc_fid}", summary="Edit geometri poligon sawah (admin only)")
def update_sawah_geometry(ogc_fid: int, body: SawahUpdateGeometry, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Cek apakah poligon ada
    check = db.execute(text("SELECT ogc_fid FROM sawah_karawang WHERE ogc_fid = :fid"), {"fid": ogc_fid}).fetchone()
    if not check:
        raise HTTPException(status_code=404, detail=f"Poligon dengan ogc_fid={ogc_fid} tidak ditemukan")

    geojson_str = json.dumps(body.geojson_geometry)

    # Update geometri dan hitung ulang luas
    sql = text("""
        UPDATE sawah_karawang
        SET wkb_geometry = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)),
            luas_ha = ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)::geography) / 10000.0
        WHERE ogc_fid = :fid
    """)
    db.execute(sql, {"geojson": geojson_str, "fid": ogc_fid})
    db.commit()
    return {"detail": f"Geometri poligon ogc_fid={ogc_fid} berhasil diperbarui"}


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/admin/sawah/{ogc_fid}  — Hapus poligon
# ──────────────────────────────────────────────────────────────────────────────
@router.delete("/sawah/{ogc_fid}", summary="Hapus poligon sawah (admin only)")
def delete_sawah(ogc_fid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    check = db.execute(text("SELECT ogc_fid FROM sawah_karawang WHERE ogc_fid = :fid"), {"fid": ogc_fid}).fetchone()
    if not check:
        raise HTTPException(status_code=404, detail=f"Poligon dengan ogc_fid={ogc_fid} tidak ditemukan")

    db.execute(text("DELETE FROM sawah_karawang WHERE ogc_fid = :fid"), {"fid": ogc_fid})
    db.commit()
    return {"detail": f"Poligon ogc_fid={ogc_fid} berhasil dihapus"}


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/admin/sawah/export-csv  — Export CSV
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/sawah/export-csv", summary="Export data sawah ke CSV (admin only)")
def export_csv(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    sql = text("""
        SELECT ogc_fid, kecamatan, luas_ha, id_sawah, status_data,
               ST_AsText(wkb_geometry) as wkt_geometry
        FROM sawah_karawang
        ORDER BY kecamatan, ogc_fid
    """)
    rows = db.execute(sql).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ogc_fid", "kecamatan", "luas_ha", "id_sawah", "status_data", "wkt_geometry"])
    for row in rows:
        writer.writerow([row.ogc_fid, row.kecamatan, row.luas_ha, row.id_sawah, row.status_data, row.wkt_geometry])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sawah_karawang_export.csv"}
    )


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/admin/batas/import-csv  — Import CSV Batas Wilayah
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/batas/import-csv", summary="Import data batas wilayah dari CSV (admin only)")
async def import_batas_csv(file: UploadFile = File(...), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    Format CSV yang diterima:
    kecamatan, wkt_geometry
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File harus berformat .csv")

    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))

    updated = 0
    errors = []
    
    for i, row in enumerate(reader, start=2):
        try:
            kecamatan = row.get("kecamatan", "").strip()
            wkt = row.get("wkt_geometry", "").strip()

            if not kecamatan or not wkt:
                errors.append(f"Baris {i}: 'kecamatan' atau 'wkt_geometry' kosong")
                continue

            # Update geometri jika kecamatan ada
            sql_update = text("""
                UPDATE bataskarawang 
                SET wkb_geometry = ST_Multi(ST_SetSRID(ST_GeomFromText(:wkt), 4326))
                WHERE LOWER(name_3) = LOWER(:kecamatan)
            """)
            result = db.execute(sql_update, {"kecamatan": kecamatan, "wkt": wkt})
            
            # Jika kecamatan belum ada di DB, Insert data baru
            if result.rowcount == 0:
                sql_insert = text("""
                    INSERT INTO bataskarawang (name_3, wkb_geometry)
                    VALUES (:kecamatan, ST_Multi(ST_SetSRID(ST_GeomFromText(:wkt), 4326)))
                """)
                db.execute(sql_insert, {"kecamatan": kecamatan, "wkt": wkt})
            
            updated += 1
        except Exception as e:
            errors.append(f"Baris {i} Gagal: {str(e)}")

    db.commit()
    return {
        "detail": f"Import/Update batas wilayah selesai. {updated} baris berhasil diproses.",
        "errors": errors[:20],  # Tampilkan max 20 error
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/admin/ndvi/export-csv  — Export NDVI per kecamatan (ringan)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/ndvi/export-csv", summary="Export data NDVI per kecamatan ke CSV (admin only)")
def export_ndvi_csv(
    tahun: int = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    tahun_filter = "WHERE n.tahun = :tahun" if tahun else ""
    sql = text(f"""
        SELECT n.kecamatan, n.periode, n.tahun, n.bulan,
               n.mean_ndvi::float, n.std_ndvi::float,
               n.pixel_count, n.jumlah_citra, n.kategori
        FROM ndvi_kecamatan n
        {tahun_filter}
        ORDER BY n.kecamatan, n.tahun, n.bulan
    """)
    params = {"tahun": tahun} if tahun else {}
    rows = db.execute(sql, params).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["kecamatan", "periode", "tahun", "bulan", "mean_ndvi", "std_ndvi", "pixel_count", "jumlah_citra", "kategori"])
    for row in rows:
        writer.writerow([row.kecamatan, row.periode, row.tahun, row.bulan, row.mean_ndvi, row.std_ndvi, row.pixel_count, row.jumlah_citra, row.kategori])

    output.seek(0)
    fname = f"ndvi_karawang_{tahun}.csv" if tahun else "ndvi_karawang_semua.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )

