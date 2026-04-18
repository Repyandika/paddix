from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

from database import get_db

router = APIRouter(
    prefix="/api/kpi",
    tags=["KPI"],
)


# ──────────────────────────────────────────────────────────────────────────────
# 1. GET /api/kpi
#    Semua data KPI kecamatan
# ──────────────────────────────────────────────────────────────────────────────
@router.get("", summary="Semua Data KPI Kecamatan")
def get_all_kpi(db: Session = Depends(get_db)):
    """Mengembalikan seluruh statistik KPI per kecamatan."""
    sql = text("""
        SELECT fid, kecamatan,
               "count"    AS jumlah_petak,
               "unique"   AS nilai_unik,
               "min"::float, "max"::float, "range"::float,
               "sum"::float, "mean"::float, "median"::float,
               "stddev"::float, "minority"::float, "majority"::float,
               q1::float, q3::float, iqr::float
        FROM kpi_kecamatan
        ORDER BY kecamatan
    """)
    rows = db.execute(sql).fetchall()
    return [dict(row._mapping) for row in rows]



# ──────────────────────────────────────────────────────────────────────────────
# 3. GET /api/kpi/sawah/kategori
#    Summary Luas dan kategori ukuran sawah (Cepat memakai sample/summary)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/sawah/kategori", summary="Summary Kategori Sawah")
def get_sawah_summary(db: Session = Depends(get_db)):
    """Mengembalikan data kecamatan sawah terluas dan distribusi sawah Kecil/Sedang/Besar."""
    
    # 1. Cari Kecamatan Terluas (menggunakan tabel KPI agar instan)
    sql_terluas = text("""
        SELECT kecamatan, "sum"::float as total_luas
        FROM kpi_kecamatan
        ORDER BY "sum" DESC
        LIMIT 1
    """)
    row_terluas = db.execute(sql_terluas).fetchone()
    kecamatan_terluas = dict(row_terluas._mapping) if row_terluas else {}

    # 2. Hitung jumlah berdasarkan kelas luas di seluruh sawah Karawang
    # Sawah Kecil: <= 0.5 Ha, Sedang: 0.5 - 1.0 Ha, Besar: > 1.0 Ha
    sql_klasifikasi = text("""
        SELECT 
            COUNT(CASE WHEN luas_ha <= 0.25 THEN 1 END) as sawah_kecil,
            COUNT(CASE WHEN luas_ha > 0.25 AND luas_ha <= 0.75 THEN 1 END) as sawah_sedang,
            COUNT(CASE WHEN luas_ha > 0.75 THEN 1 END) as sawah_besar
        FROM sawah_karawang
    """)
    row_klasifikasi = db.execute(sql_klasifikasi).fetchone()
    klasifikasi = dict(row_klasifikasi._mapping) if row_klasifikasi else {}

    return {
        "kecamatan_terluas": kecamatan_terluas,
        "kategori_ukuran": klasifikasi
    }


# ──────────────────────────────────────────────────────────────────────────────
# 4. GET /api/kpi/sawah/luas
#    Luas Sawah per Kecamatan (Horizontal Bar Chart)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/sawah/luas", summary="Luas Sawah per Kecamatan")
def get_sawah_luas(db: Session = Depends(get_db)):
    """Mengembalikan daftar kecamatan dan total luas sawahnya (diurutkan descending)."""
    sql = text("""
        SELECT kecamatan, "sum"::float as luas_ha
        FROM kpi_kecamatan
        WHERE "sum" IS NOT NULL
        ORDER BY "sum" DESC
    """)
    rows = db.execute(sql).fetchall()
    return [{"kecamatan": r.kecamatan, "luas_ha": r.luas_ha} for r in rows]

# ──────────────────────────────────────────────────────────────────────────────
# 5. GET /api/kpi/{kecamatan}
#    KPI untuk satu kecamatan tertentu
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/{kecamatan}", summary="KPI per Kecamatan")
def get_kpi_by_kecamatan(kecamatan: str, db: Session = Depends(get_db)):
    """Mengembalikan data KPI untuk satu kecamatan spesifik."""
    sql = text("""
        SELECT fid, kecamatan,
               "count"    AS jumlah_petak,
               "unique"   AS nilai_unik,
               "min"::float, "max"::float, "range"::float,
               "sum"::float, "mean"::float, "median"::float,
               "stddev"::float, "minority"::float, "majority"::float,
               q1::float, q3::float, iqr::float
        FROM kpi_kecamatan
        WHERE LOWER(kecamatan) = LOWER(:kecamatan)
    """)
    row = db.execute(sql, {"kecamatan": kecamatan}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"KPI untuk '{kecamatan}' tidak ditemukan.")
    return dict(row._mapping)
