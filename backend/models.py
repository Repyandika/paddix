from sqlalchemy import Column, Integer, BigInteger, String, Numeric, DateTime
from sqlalchemy.sql import func
from database import Base


class NdviKecamatan(Base):
    """Model SQLAlchemy yang memetakan tabel ndvi_kecamatan di PostgreSQL."""
    __tablename__ = "ndvi_kecamatan"

    id            = Column(Integer, primary_key=True, index=True)
    kecamatan     = Column(String(100), nullable=False, index=True)
    periode       = Column(String(7), nullable=False, index=True)
    tahun         = Column(Integer, nullable=False, index=True)
    bulan         = Column(Integer, nullable=False)
    mean_ndvi     = Column(Numeric(10, 6))
    std_ndvi      = Column(Numeric(10, 6))
    pixel_count   = Column(BigInteger)
    jumlah_citra  = Column(Integer)
    kategori      = Column(String(50), index=True)
    created_at    = Column(DateTime, server_default=func.now())


class User(Base):
    """Model untuk autentikasi pengguna dashboard."""
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), nullable=False, default="user")  # 'admin' atau 'user'
    created_at    = Column(DateTime, server_default=func.now())
