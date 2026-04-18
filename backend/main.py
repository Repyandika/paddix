from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from contextlib import asynccontextmanager

from database import engine, SessionLocal
from models import Base, User
from auth_utils import hash_password
from routers import ndvi, geojson, kpi, auth, admin


# ──────────────────────────────────────────────────────────────────────────────
# Lifespan — menggantikan @app.on_event("startup") yang sudah deprecated
# ──────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed akun admin default saat aplikasi pertama kali berjalan."""
    Base.metadata.create_all(bind=engine, tables=[User.__table__], checkfirst=True)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if not existing:
            admin_user = User(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin",
            )
            db.add(admin_user)
            db.commit()
            print("[OK] Akun admin default berhasil dibuat (admin / admin123)")
        else:
            print("[INFO] Akun admin sudah ada, skip seeding.")
    finally:
        db.close()

    yield  # Aplikasi berjalan di sini


# ──────────────────────────────────────────────────────────────────────────────
# Inisialisasi FastAPI
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="GIS Dashboard NDVI Karawang — API",
    description=(
        "Backend API untuk Dashboard Analisis dan Monitoring Sawah di Karawang, Jawa Barat. "
        "Menyediakan data NDVI per kecamatan berbasis citra satelit selama dua tahun terakhir."
    ),
    version="2.0.0",
    contact={
        "name": "Proyek TA — D3 Sistem Informasi (Business Intelligence)",
    },
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ──────────────────────────────────────────────────────────────────────────────
# CORS Middleware
# ──────────────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# Include Routers
# ──────────────────────────────────────────────────────────────────────────────
app.include_router(ndvi.router)
app.include_router(geojson.router)
app.include_router(kpi.router)
app.include_router(auth.router)
app.include_router(admin.router)


# ──────────────────────────────────────────────────────────────────────────────
# Static Files & Dashboard
# ──────────────────────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", tags=["Dashboard"])
def redirect_to_dashboard():
    return RedirectResponse(url="/static/index.html")

# ──────────────────────────────────────────────────────────────────────────────
# Root API Status
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/api", tags=["API Root"])
def api_root():
    return {
        "status": "ok",
        "message": "API Backend NDVI Karawang aktif.",
        "version": "2.0.0",
        "docs": "/docs",
    }
