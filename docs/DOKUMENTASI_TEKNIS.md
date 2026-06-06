# PADDIX — Dokumentasi Teknis Proyek

> **PADDIX** (*Paddy Dashboard Integrated eXplorer*)
> Dashboard Analisis & Monitoring Sawah Kabupaten Karawang
> Proyek Tugas Akhir — D3 Sistem Informasi (Business Intelligence)

---

## 1. Ringkasan Proyek

PADDIX adalah dashboard GIS berbasis web yang menyajikan data vegetasi NDVI (Normalized Difference Vegetation Index) untuk pemantauan kesehatan persawahan di wilayah Kabupaten Karawang, Jawa Barat. Dashboard ini menggabungkan visualisasi peta interaktif, grafik analitik, dan manajemen data spasial dalam satu antarmuka.

### Fitur Utama
- **Peta Interaktif**: Choropleth NDVI per kecamatan & visualisasi petak sawah
- **Grafik Analitik**: Tren NDVI bulanan, perbandingan YoY, distribusi kategori
- **KPI Dashboard**: Ringkasan statistik kesehatan vegetasi secara real-time
- **Manajemen Poligon**: Tambah, edit, dan hapus geometri petak sawah (admin)
- **Import/Export Data**: Upload CSV NDVI & download data dalam format CSV/Excel
- **Multi-User Auth**: Sistem login dengan role `admin` dan `user`

---

## 2. Struktur Folder Proyek

```
projek dashboard ta/
├── frontend/                  ← SOURCE utama aset web (HTML/CSS/JS)
│   ├── index.html             ← Halaman utama dashboard
│   ├── login.html             ← Halaman login
│   ├── css/
│   │   └── style.css          ← Stylesheet utama (33 KB)
│   ├── js/
│   │   ├── auth.js            ← Modul autentikasi (token, session)
│   │   ├── data.js            ← Modul fetching data API
│   │   ├── map.js             ← Modul peta Leaflet (render, style, hover)
│   │   ├── charts.js          ← Modul grafik Chart.js
│   │   ├── admin.js           ← Modul fitur admin (Geoman, CRUD, download)
│   │   └── app.js             ← Eksekutor utama & state management
│   ├── img/
│   │   └── logo.png           ← Logo di dalam dashboard
│   ├── paddyx_logo.png        ← Logo branding utama
│   ├── paddix_startup_logo.png
│   └── paddix_logo_user.jpg
│
├── backend/                   ← Server FastAPI (Python)
│   ├── main.py                ← Entry point aplikasi FastAPI
│   ├── database.py            ← Koneksi database PostgreSQL/PostGIS
│   ├── models.py              ← SQLAlchemy ORM models
│   ├── schemas.py             ← Pydantic response schemas
│   ├── auth_utils.py          ← Utilitas JWT & password hashing
│   ├── routers/               ← API route handlers
│   │   ├── __init__.py
│   │   ├── ndvi.py            ← Endpoint data NDVI (trend, summary, YoY)
│   │   ├── geojson.py         ← Endpoint GeoJSON (batas kecamatan, sawah)
│   │   ├── kpi.py             ← Endpoint KPI statistik
│   │   ├── auth.py            ← Endpoint autentikasi (login, register)
│   │   └── admin.py           ← Endpoint admin (CRUD poligon, import CSV, export)
│   ├── static/                ← MIRROR dari frontend/ (untuk local dev server)
│   │   └── (salinan identik dari frontend/)
│   └── .env                   ← Konfigurasi database (TIDAK di-commit)
│
├── docs/                      ← Dokumentasi teknis tambahan
│   ├── PERBAIKAN_POLYGON_SAVE.md
│   ├── PERBAIKAN_Z_DIMENSION.md
│   └── TUTORIAL_DRAW_POLYGON.md
│
├── .gitignore                 ← Rule pengecualian Git
├── requirements.txt           ← Dependensi Python
├── sync_static.ps1            ← Script sinkronisasi frontend → backend/static
└── README.md                  ← README proyek
```

### Catatan Penting tentang Duplikasi `frontend/` dan `backend/static/`

| Konteks | Folder yang Digunakan |
|---|---|
| **Development lokal** (`python main.py`) | `backend/static/` — FastAPI menyajikan file dari sini |

⚠️ **Anda harus selalu mengedit file di `frontend/`**, lalu jalankan `.\sync_static.ps1` untuk menyinkronkan ke `backend/static/`. Jangan pernah mengedit `backend/static/` secara langsung.

---

## 3. Teknologi yang Digunakan

### Backend
| Komponen | Teknologi | Versi |
|---|---|---|
| Framework | FastAPI | 0.109.2 |
| Server | Uvicorn | 0.27.0 |
| ORM | SQLAlchemy | 2.0.25 |
| Database | PostgreSQL + PostGIS | — |
| Driver DB | psycopg2-binary | 2.9.9 |
| Autentikasi | JWT (python-jose) | 3.3.0 |
| Hashing | bcrypt | 4.1.2 |
| Excel Export | openpyxl | 3.1.2 |

### Frontend
| Komponen | Teknologi | Versi |
|---|---|---|
| Peta | Leaflet.js | 1.9.4 |
| Gambar Poligon | Leaflet-Geoman Free | 2.19.2 |
| Grafik | Chart.js | 4.x (CDN) |
| Basemap | Google Satellite + CARTO Labels | — |
| Font | DM Sans, DM Mono, Outfit | Google Fonts |
| Styling | Vanilla CSS (custom design system) | — |

---

## 4. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER (Client)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ auth.js  │  │ map.js   │  │charts.js │  │  admin.js  │  │
│  │ (Token)  │  │(Leaflet) │  │(Chart.js)│  │ (Geoman)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │             │              │          │
│       └──────────────┴──────┬──────┴──────────────┘          │
│                         data.js                              │
│                     (API Fetcher)                             │
│                         app.js                               │
│                    (State Manager)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP REST (JSON)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    FastAPI Server (Python)                    │
│  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌──────┐ ┌───────────┐  │
│  │ ndvi.py │ │geojson.py│ │kpi.py │ │auth.py│ │ admin.py  │  │
│  └────┬────┘ └────┬─────┘ └──┬────┘ └──┬───┘ └─────┬─────┘  │
│       └───────────┴──────────┴─────────┴───────────┘         │
│                      SQLAlchemy ORM                           │
└──────────────────────────┬───────────────────────────────────┘
                           │ SQL
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              PostgreSQL + PostGIS Database                    │
│  ┌────────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │ ndvi_kecamatan │  │sawah_karawang │  │ bataskarawang   │  │
│  │ (data NDVI)    │  │ (petak sawah) │  │ (batas wilayah) │  │
│  └────────────────┘  └───────────────┘  └─────────────────┘  │
│  ┌────────────────┐  ┌───────────────┐                       │
│  │ kpi_kecamatan  │  │    users      │                       │
│  │ (statistik)    │  │ (autentikasi) │                       │
│  └────────────────┘  └───────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Daftar Tabel Database

### `ndvi_kecamatan`
Data NDVI bulanan per kecamatan (sumber: citra satelit).

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INTEGER (PK) | Auto-increment |
| kecamatan | VARCHAR(100) | Nama kecamatan |
| periode | VARCHAR(7) | Format "YYYY-MM" |
| tahun | INTEGER | Tahun data |
| bulan | INTEGER | Bulan data (1-12) |
| mean_ndvi | NUMERIC(10,6) | Rata-rata NDVI |
| std_ndvi | NUMERIC(10,6) | Standar deviasi |
| pixel_count | BIGINT | Jumlah piksel citra |
| jumlah_citra | INTEGER | Jumlah citra yang diproses |
| kategori | VARCHAR(50) | Klasifikasi vegetasi |
| created_at | TIMESTAMP | Waktu import |

### `sawah_karawang`
Geometri petak sawah (poligon PostGIS).

| Kolom | Tipe | Keterangan |
|---|---|---|
| ogc_fid | INTEGER (PK) | Auto-increment |
| kecamatan | VARCHAR | Nama kecamatan |
| luas_ha | FLOAT | Luas dalam hektar |
| id_sawah | FLOAT | ID identifikasi sawah |
| status_data | VARCHAR | Status validitas |
| wkb_geometry | GEOMETRY(MultiPolygonZ, 4326) | Geometri PostGIS 3D |

### `bataskarawang`
Geometri batas wilayah kecamatan.

| Kolom | Tipe | Keterangan |
|---|---|---|
| ogc_fid | INTEGER (PK) | Auto-increment |
| name_3 | VARCHAR | Nama kecamatan |
| wkb_geometry | GEOMETRY | Geometri batas wilayah |

### `kpi_kecamatan`
Statistik pre-calculated per kecamatan.

| Kolom | Tipe | Keterangan |
|---|---|---|
| fid | INTEGER (PK) | ID |
| kecamatan | VARCHAR | Nama kecamatan |
| count | INTEGER | Jumlah petak |
| sum | NUMERIC | Total luas |
| mean | NUMERIC | Rata-rata luas |
| median | NUMERIC | Median luas |
| stddev | NUMERIC | Standar deviasi |
| min | NUMERIC | Luas minimum |
| max | NUMERIC | Luas maksimum |

### `users`
Akun pengguna dashboard.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | INTEGER (PK) | Auto-increment |
| username | VARCHAR(50) | Username (unik) |
| password_hash | VARCHAR(255) | Hash bcrypt |
| role | VARCHAR(20) | "admin" atau "user" |
| created_at | TIMESTAMP | Waktu pembuatan |

---

## 6. Daftar Endpoint API

### Autentikasi (`/api/auth/`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login dan dapatkan JWT token |
| POST | `/api/auth/register` | Registrasi user baru (admin only) |

### Data NDVI (`/api/ndvi/`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/ndvi/summary` | Ringkasan NDVI per kecamatan |
| GET | `/api/ndvi/trend` | Tren NDVI bulanan global |
| GET | `/api/ndvi/{kecamatan}` | Data NDVI per kecamatan |
| GET | `/api/ndvi/yoy` | Perbandingan Year-over-Year |

### GeoJSON (`/api/geo/`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/geo/batas` | GeoJSON batas kecamatan + NDVI |
| GET | `/api/geo/sawah` | GeoJSON poligon sawah per kecamatan |

### KPI (`/api/kpi/`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/kpi/{kecamatan}` | Statistik KPI per kecamatan |

### Admin (`/api/admin/`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/api/admin/sawah` | Tambah poligon sawah baru |
| PUT | `/api/admin/sawah/{ogc_fid}` | Edit geometri poligon |
| DELETE | `/api/admin/sawah/{ogc_fid}` | Hapus poligon |
| POST | `/api/admin/ndvi/import-csv` | Import data NDVI dari CSV |
| GET | `/api/admin/ndvi/export-filtered` | Export data NDVI (CSV) |
| GET | `/api/admin/ranking/export-csv` | Export ranking risiko (CSV) |
| GET | `/api/admin/report/export-xlsx` | Export laporan analitik (Excel) |

---

## 7. Autentikasi & Keamanan

- **JWT Token** dengan masa aktif **7 hari (168 jam)**
- **bcrypt** untuk hashing password
- **Role-based access**: Fitur admin dilindungi oleh middleware `require_admin`
- **CORS** dikonfigurasi untuk localhost development
- **Akun default**: `admin` / `admin123` (auto-seed saat pertama kali)

> ⚠️ **PENTING**: Segera ganti password admin default setelah deploy ke production!

---

## 8. Mekanisme Penting

### Cache Busting
Setiap file JS/CSS di `index.html` memiliki parameter versi (`?v=v17`). Naikkan angka versi ini setiap kali ada perubahan kode agar browser memuat file terbaru.

### Anomaly Filtering
Saat import CSV, nilai NDVI `-9999` otomatis ditolak dan dikonversi menjadi `NULL` oleh backend.

### Dimensi Geometri (Z-Axis)
Kolom `wkb_geometry` di `sawah_karawang` bertipe **MultiPolygonZ** (3 dimensi). Semua operasi INSERT/UPDATE menggunakan `ST_Force3D()` untuk memastikan kompatibilitas.

### Hover Tooltip Suppression
Saat mode Draw atau Edit Geoman aktif, semua hover tooltip di peta otomatis dinonaktifkan melalui pengecekan `_isGeomanActive()` yang membaca state Geoman API secara real-time.

---

## 9. Deployment

### Lokal (Development)
```bash
cd backend
python main.py
# Server berjalan di http://localhost:8000
# Dashboard di http://localhost:8000/static/index.html
```

### Environment Variables (`.env`)
```ini
DB_HOST=localhost
DB_PORT=5432
DB_NAME= bi_gis_karawang
DB_USER=postgres
DB_PASSWORD=<password>
```

---

## 10. Panduan Maintenance

### Menambah Data NDVI Baru
1. Login sebagai admin
2. Klik ikon **Upload** di toolbar admin
3. Pilih file CSV dengan format kolom: `kecamatan, periode, tahun, bulan, mean_ndvi, std_ndvi, pixel_count, jumlah_citra, kategori`
4. Sistem otomatis memvalidasi dan memfilter nilai anomali

### Mengedit File Frontend
1. Edit file di folder `frontend/`
2. Naikkan versi cache di `index.html` (misal: `?v=v18`)
3. Jalankan `.\sync_static.ps1` untuk sinkronisasi ke `backend/static/`
4. Restart server (`python main.py`)

### Troubleshooting Umum
| Gejala | Solusi |
|---|---|
| Perubahan JS tidak muncul | Tekan Ctrl+F5, naikkan versi cache |
| Error 401 Unauthorized | Logout → Login ulang (token expired) |
| Error 500 saat tambah poligon | Periksa log server, pastikan PostGIS aktif |
| Grafik YoY kosong | Periksa data di `ndvi_kecamatan` (harus ada kolom `tahun`) |
| Tooltip muncul saat edit | Pastikan `map.js` terbaru sudah di-sync |

---

*Dokumen ini terakhir diperbarui pada: 27 April 2026*
*Versi Dashboard: 2.0.0*
