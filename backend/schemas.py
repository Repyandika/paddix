from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


class NdviBase(BaseModel):
    kecamatan:    str
    periode:      str
    tahun:        int
    bulan:        int
    mean_ndvi:    Optional[Decimal]
    std_ndvi:     Optional[Decimal]
    pixel_count:  Optional[int]
    jumlah_citra: Optional[int]
    kategori:     Optional[str]


class NdviResponse(NdviBase):
    """Schema untuk response satu record NDVI."""
    id:         int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Summary Schemas ──────────────────────────────────────────────────────────

class NdviSummaryKecamatan(BaseModel):
    """Ringkasan statistik NDVI per kecamatan."""
    kecamatan:      str
    avg_ndvi:       Optional[float]
    min_ndvi:       Optional[float]
    max_ndvi:       Optional[float]
    total_records:  int
    kategori_dominan: Optional[str]


class NdviTrendItem(BaseModel):
    """Satu titik data trend NDVI (per periode)."""
    periode:    str
    tahun:      int
    bulan:      int
    mean_ndvi:  Optional[float]
    kategori:   Optional[str]


class NdviKategoriCount(BaseModel):
    """Jumlah data per kategori NDVI."""
    kategori:   Optional[str]
    jumlah:     int
