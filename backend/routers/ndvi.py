from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Float
from typing import List, Optional

from database import get_db
from models import NdviKecamatan
from schemas import NdviResponse, NdviSummaryKecamatan, NdviTrendItem, NdviKategoriCount

router = APIRouter(
    prefix="/api/ndvi",
    tags=["NDVI"],
)


# ──────────────────────────────────────────────────────────────────────────────
# 1. GET /api/ndvi/kecamatan
#    Mengambil daftar nama kecamatan unik yang tersedia di database
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/kecamatan", summary="Daftar Kecamatan", response_model=List[str])
def get_daftar_kecamatan(db: Session = Depends(get_db)):
    """
    Mengembalikan daftar nama kecamatan unik yang terdapat di database.
    Berguna untuk mengisi dropdown/filter di dashboard.
    """
    results = (
        db.query(NdviKecamatan.kecamatan)
        .distinct()
        .order_by(NdviKecamatan.kecamatan)
        .all()
    )
    return [row[0] for row in results]


# ──────────────────────────────────────────────────────────────────────────────
# 2. GET /api/ndvi/summary
#    Ringkasan statistik NDVI per kecamatan (rata-rata, min, max, kategori dominan)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/summary", summary="Ringkasan NDVI per Kecamatan", response_model=List[NdviSummaryKecamatan])
def get_summary(
    tahun: Optional[int] = Query(None, description="Filter berdasarkan tahun (opsional)"),
    db: Session = Depends(get_db)
):
    """
    Mengembalikan ringkasan statistik NDVI untuk setiap kecamatan.
    Dapat difilter berdasarkan tahun tertentu.
    Cocok untuk ditampilkan di peta choropleth atau tabel ringkasan.
    """
    query = db.query(
        NdviKecamatan.kecamatan,
        cast(func.avg(NdviKecamatan.mean_ndvi), Float).label("avg_ndvi"),
        cast(func.min(NdviKecamatan.mean_ndvi), Float).label("min_ndvi"),
        cast(func.max(NdviKecamatan.mean_ndvi), Float).label("max_ndvi"),
        func.count(NdviKecamatan.id).label("total_records"),
    )

    if tahun:
        query = query.filter(NdviKecamatan.tahun == tahun)

    query = query.group_by(NdviKecamatan.kecamatan).order_by(NdviKecamatan.kecamatan)
    rows = query.all()

    # Ambil kategori dominan per kecamatan secara terpisah
    def get_kategori_dominan(kecamatan_nama: str) -> Optional[str]:
        sub = (
            db.query(NdviKecamatan.kategori, func.count(NdviKecamatan.id).label("cnt"))
            .filter(NdviKecamatan.kecamatan == kecamatan_nama)
        )
        if tahun:
            sub = sub.filter(NdviKecamatan.tahun == tahun)
        result = (
            sub.group_by(NdviKecamatan.kategori)
            .order_by(func.count(NdviKecamatan.id).desc())
            .first()
        )
        return result[0] if result else None

    summaries = []
    for row in rows:
        summaries.append(NdviSummaryKecamatan(
            kecamatan=row.kecamatan,
            avg_ndvi=row.avg_ndvi,
            min_ndvi=row.min_ndvi,
            max_ndvi=row.max_ndvi,
            total_records=row.total_records,
            kategori_dominan=get_kategori_dominan(row.kecamatan),
        ))

    return summaries


# ──────────────────────────────────────────────────────────────────────────────
# 3. GET /api/ndvi/trend
#    Tren NDVI rata-rata seluruh Karawang per bulan (agregat semua kecamatan)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/trend", summary="Tren NDVI Seluruh Karawang", response_model=List[NdviTrendItem])
def get_trend_karawang(
    tahun: Optional[int] = Query(None, description="Filter berdasarkan tahun (opsional)"),
    db: Session = Depends(get_db)
):
    """
    Mengembalikan tren rata-rata NDVI seluruh Karawang per periode bulan.
    Cocok untuk ditampilkan sebagai grafik garis (line chart) di dashboard.
    """
    query = db.query(
        NdviKecamatan.periode,
        NdviKecamatan.tahun,
        NdviKecamatan.bulan,
        cast(func.avg(NdviKecamatan.mean_ndvi), Float).label("mean_ndvi"),
    )

    if tahun:
        query = query.filter(NdviKecamatan.tahun == tahun)

    rows = (
        query.group_by(NdviKecamatan.periode, NdviKecamatan.tahun, NdviKecamatan.bulan)
        .order_by(NdviKecamatan.tahun, NdviKecamatan.bulan)
        .all()
    )

    return [
        NdviTrendItem(
            periode=row.periode,
            tahun=row.tahun,
            bulan=row.bulan,
            mean_ndvi=row.mean_ndvi,
            kategori=None,
        )
        for row in rows
    ]


# ──────────────────────────────────────────────────────────────────────────────
# 4. GET /api/ndvi/kategori
#    Distribusi jumlah data per kategori NDVI
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/kategori", summary="Distribusi Kategori NDVI", response_model=List[NdviKategoriCount])
def get_distribusi_kategori(
    tahun: Optional[int] = Query(None, description="Filter berdasarkan tahun (opsional)"),
    db: Session = Depends(get_db),
):
    """
    Mengembalikan jumlah data berdasarkan kategori NDVI.
    Cocok untuk ditampilkan sebagai pie chart atau bar chart di dashboard.
    """
    query = db.query(
        NdviKecamatan.kategori,
        func.count(NdviKecamatan.id).label("jumlah"),
    )
    if tahun:
        query = query.filter(NdviKecamatan.tahun == tahun)

    rows = query.group_by(NdviKecamatan.kategori).order_by(func.count(NdviKecamatan.id).desc()).all()
    return [NdviKategoriCount(kategori=row.kategori, jumlah=row.jumlah) for row in rows]


# ──────────────────────────────────────────────────────────────────────────────
# 5. GET /api/ndvi
#    Mengambil semua data NDVI dengan filter & pagination
# ──────────────────────────────────────────────────────────────────────────────
@router.get("", summary="Semua Data NDVI", response_model=List[NdviResponse])
def get_all_ndvi(
    kecamatan: Optional[str] = Query(None, description="Filter nama kecamatan"),
    tahun:     Optional[int] = Query(None, description="Filter tahun"),
    bulan:     Optional[int] = Query(None, description="Filter bulan (1-12)"),
    kategori:  Optional[str] = Query(None, description="Filter kategori NDVI"),
    limit:     int           = Query(100, ge=1, le=1000, description="Jumlah data per halaman"),
    offset:    int           = Query(0, ge=0, description="Offset untuk pagination"),
    db: Session = Depends(get_db),
):
    """
    Mengambil seluruh data NDVI dengan filter opsional dan pagination.
    """
    query = db.query(NdviKecamatan)

    if kecamatan:
        query = query.filter(NdviKecamatan.kecamatan.ilike(f"%{kecamatan}%"))
    if tahun:
        query = query.filter(NdviKecamatan.tahun == tahun)
    if bulan:
        query = query.filter(NdviKecamatan.bulan == bulan)
    if kategori:
        query = query.filter(NdviKecamatan.kategori.ilike(f"%{kategori}%"))

    return (
        query.order_by(NdviKecamatan.tahun, NdviKecamatan.bulan, NdviKecamatan.kecamatan)
        .offset(offset)
        .limit(limit)
        .all()
    )


# ──────────────────────────────────────────────────────────────────────────────
# 6. GET /api/ndvi/tahun  ← HARUS sebelum /{kecamatan}
#    Mengembalikan daftar tahun yang tersedia di tabel ndvi_kecamatan
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/tahun", response_model=List[int], summary="Daftar Tahun Tersedia")
def get_tahun_list(db: Session = Depends(get_db)):
    """Mengembalikan daftar tahun unik untuk dropdown filter tahun."""
    results = (
        db.query(NdviKecamatan.tahun)
        .distinct()
        .order_by(NdviKecamatan.tahun.asc())
        .all()
    )
    return [row[0] for row in results if row[0] is not None]





# ──────────────────────────────────────────────────────────────────────────────
# 8. GET /api/ndvi/dashboard/heatmap
#    Matrix Kecamatan x Bulan untuk pembuatan Heatmap
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/dashboard/heatmap", summary="Matrix Heatmap Kecamatan vs Bulan")
def get_heatmap_matrix(
    tahun: str = Query("all", description="Tahun ('all' untuk akumulatif semua tahun)"),
    db: Session = Depends(get_db)
):
    """
    Mengembalikan data siap pakai untuk tabel Heatmap di frontend.
    Bentuknya: [ { kecamatan: "A", bulan_1: 0.5, bulan_2: 0.4 ... }, ... ]
    """
    from sqlalchemy import text
    
    aggr = "AVG" if tahun == "all" else "MAX"
    where_clause = ""
    params = {}
    
    if tahun != "all":
        where_clause = "WHERE tahun = :tahun"
        params["tahun"] = int(tahun)

    sql = text(f"""
        SELECT 
            kecamatan,
            {aggr}(CASE WHEN bulan = 1 THEN mean_ndvi END) as b1,
            {aggr}(CASE WHEN bulan = 2 THEN mean_ndvi END) as b2,
            {aggr}(CASE WHEN bulan = 3 THEN mean_ndvi END) as b3,
            {aggr}(CASE WHEN bulan = 4 THEN mean_ndvi END) as b4,
            {aggr}(CASE WHEN bulan = 5 THEN mean_ndvi END) as b5,
            {aggr}(CASE WHEN bulan = 6 THEN mean_ndvi END) as b6,
            {aggr}(CASE WHEN bulan = 7 THEN mean_ndvi END) as b7,
            {aggr}(CASE WHEN bulan = 8 THEN mean_ndvi END) as b8,
            {aggr}(CASE WHEN bulan = 9 THEN mean_ndvi END) as b9,
            {aggr}(CASE WHEN bulan = 10 THEN mean_ndvi END) as b10,
            {aggr}(CASE WHEN bulan = 11 THEN mean_ndvi END) as b11,
            {aggr}(CASE WHEN bulan = 12 THEN mean_ndvi END) as b12
        FROM ndvi_kecamatan
        {where_clause}
        GROUP BY kecamatan
        ORDER BY kecamatan
    """)
    rows = db.execute(sql, params).fetchall()
    
    result = []
    for r in rows:
        result.append({
            "kecamatan": r.kecamatan,
            "1": r.b1, "2": r.b2, "3": r.b3, "4": r.b4, "5": r.b5, "6": r.b6,
            "7": r.b7, "8": r.b8, "9": r.b9, "10": r.b10, "11": r.b11, "12": r.b12
        })
    return result


# ──────────────────────────────────────────────────────────────────────────────
# 9. GET /api/ndvi/dashboard/yoy
#    Perbandingan Year-over-Year (Rata-rata tahunan) per kecamatan
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/dashboard/yoy", summary="YoY Comparison per Kecamatan")
def get_yoy_comparison(db: Session = Depends(get_db)):
    """
    Mengembalikan rata-rata NDVI 3 tahun terakhir per kecamatan.
    Cocok untuk Vertical Grouped Bar Chart.
    """
    from sqlalchemy import text
    sql = text("""
        SELECT 
            kecamatan,
            AVG(CASE WHEN tahun = 2023 THEN mean_ndvi END) as y2023,
            AVG(CASE WHEN tahun = 2024 THEN mean_ndvi END) as y2024,
            AVG(CASE WHEN tahun = 2025 THEN mean_ndvi END) as y2025
        FROM ndvi_kecamatan
        WHERE tahun IN (2023, 2024, 2025)
        GROUP BY kecamatan
        ORDER BY kecamatan
    """)
    rows = db.execute(sql).fetchall()
    return [
        {
            "kecamatan": r.kecamatan, 
            "2023": r.y2023, 
            "2024": r.y2024, 
            "2025": r.y2025
        } for r in rows
    ]

# ──────────────────────────────────────────────────────────────────────────────
# 10. GET /api/ndvi/{kecamatan}
#     Riwayat NDVI untuk satu kecamatan tertentu
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/{kecamatan}", summary="Riwayat NDVI per Kecamatan", response_model=List[NdviResponse])
def get_ndvi_by_kecamatan(
    kecamatan: str,
    tahun:     Optional[int] = Query(None, description="Filter tahun"),
    db: Session = Depends(get_db),
):
    """
    Mengembalikan riwayat NDVI lengkap untuk kecamatan tertentu,
    diurutkan dari yang paling lama hingga terbaru.
    Cocok untuk ditampilkan sebagai grafik detail per kecamatan.
    """
    query = (
        db.query(NdviKecamatan)
        .filter(NdviKecamatan.kecamatan.ilike(f"%{kecamatan}%"))
    )
    if tahun:
        query = query.filter(NdviKecamatan.tahun == tahun)

    results = query.order_by(NdviKecamatan.tahun, NdviKecamatan.bulan).all()

    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"Data NDVI untuk kecamatan '{kecamatan}' tidak ditemukan."
        )
    return results
