# Dashboard GIS NDVI Karawang

Dashboard spasial berbasis web untuk analisis dan monitoring kondisi vegetasi lahan sawah di Kabupaten Karawang menggunakan indeks NDVI (Normalized Difference Vegetation Index) dari citra satelit.

## Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Backend  | Python, FastAPI, SQLAlchemy |
| Database | PostgreSQL + PostGIS |
| Frontend | HTML, CSS, JavaScript (Vanilla) |
| Peta     | Leaflet.js, Leaflet-Geoman |
| Grafik   | Chart.js |

## Prasyarat

- **Python** 3.10+
- **PostgreSQL** 14+ dengan ekstensi **PostGIS**
- **pip** (Python package manager)

## Instalasi & Menjalankan

### 1. Persiapan Database

Pastikan PostgreSQL sudah berjalan dan database `bi_gis_karawang` sudah dibuat beserta tabel-tabel spasial (`bataskarawang`, `sawah_karawang`, `ndvi_kecamatan`, `kpi_kecamatan`).

### 2. Konfigurasi

Edit file `backend/.env` sesuai kredensial PostgreSQL Anda:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bi_gis_karawang
DB_USER=postgres
DB_PASSWORD=<password_anda>
```

### 3. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Sinkronisasi Frontend

```bash
# Windows PowerShell
Copy-Item -Path "frontend\*" -Destination "backend\static\" -Recurse -Force
```

### 5. Jalankan Server

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Buka browser di: **http://localhost:8000**

## Akun Default

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | admin123  | Admin |

> Akun admin otomatis dibuat saat server pertama kali dijalankan.

## Fitur

### User Umum
- Visualisasi peta choropleth NDVI per kecamatan
- Klik kecamatan → tampilkan poligon sawah per-petak
- Filter data berdasarkan tahun dan bulan
- Grafik tren NDVI bulanan (time series)
- Peringkat kinerja wilayah (10 besar)
- Statistik luas dan distribusi sawah

### Admin (Fitur Tambahan)
- **Unduh Data** — Export CSV data NDVI per kecamatan
- **Upload Data** — Import CSV batas wilayah administratif (maks 50 MB)
- **Edit Poligon** — Edit bentuk poligon sawah (drag vertex, Leaflet-Geoman)
- **Hapus Poligon** — Hapus poligon sawah dari sistem
- **Kelola Akun** — Tambah/hapus user dan admin

## Struktur Proyek

```
projek dashboard ta/
├── backend/
│   ├── .env                    # Konfigurasi database
│   ├── main.py                 # Entry point FastAPI
│   ├── database.py             # Koneksi database
│   ├── models.py               # Model SQLAlchemy
│   ├── schemas.py              # Pydantic schemas
│   ├── auth_utils.py           # JWT & password hashing
│   ├── requirements.txt        # Dependencies Python
│   ├── routers/
│   │   ├── ndvi.py             # API data NDVI
│   │   ├── geojson.py          # API GeoJSON (batas & sawah)
│   │   ├── kpi.py              # API KPI kecamatan
│   │   ├── auth.py             # API autentikasi
│   │   └── admin.py            # API admin (CRUD, import/export)
│   └── static/                 # Copy dari frontend (auto-served)
├── frontend/
│   ├── index.html              # Halaman utama dashboard
│   ├── login.html              # Halaman login
│   ├── css/style.css           # Stylesheet
│   └── js/
│       ├── app.js              # Controller utama
│       ├── map.js              # Modul peta Leaflet
│       ├── charts.js           # Modul Chart.js
│       ├── data.js             # Data access layer (API calls)
│       ├── admin.js            # Modul fitur admin
│       └── auth.js             # Modul autentikasi
└── README.md                   # Dokumentasi ini
```

## API Documentation

Setelah server berjalan, dokumentasi API interaktif tersedia di:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Catatan Penting

- Pastikan ekstensi PostGIS sudah terinstall di PostgreSQL (`CREATE EXTENSION postgis;`)
- Setelah mengubah file di `frontend/`, jalankan ulang langkah sinkronisasi (langkah 4)
- Untuk mengganti password admin default, login sebagai admin lalu gunakan fitur Kelola Akun

---

© 2026 — Proyek Tugas Akhir D3 Sistem Informasi (Business Intelligence)
