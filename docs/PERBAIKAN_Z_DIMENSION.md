# Perbaikan Error Z Dimension PostGIS

## Masalah
Error saat membuat polygon baru:
```
Column has Z dimension but geometry does not
```

## Root Cause
- GeoJSON dari frontend adalah **2D** (coordinates: [lon, lat])
- Database column `wkb_geometry` adalah **3D** (dengan Z dimension)
- Query SQL di `create_sawah()` tidak menggunakan `ST_Force3D()` untuk menambahkan Z dimension
- Akibatnya: PostGIS menolak insert karena mismatch dimensi

## Solusi
Tambahkan `ST_Force3D()` pada kedua query:

### 1. create_sawah() - Tambah Polygon Baru (Line 95)
```sql
-- SEBELUM (ERROR):
ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))

-- SESUDAH (BENAR):
ST_Multi(ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)))
```

### 2. update_sawah_geometry() - Edit Geometry (Line 144)
```sql
-- SEBELUM (POTENSIAL ERROR):
SET wkb_geometry = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))

-- SESUDAH (BENAR):
SET wkb_geometry = ST_Multi(ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)))
```

## Testing
1. **Restart backend:**
   ```bash
   cd d:\projek dashboard ta\backend
   python main.py
   ```

2. **Clear browser cache** (Ctrl+Shift+Delete)

3. **Test tambah polygon baru:**
   - Login ke dashboard
   - Klik tool draw di peta
   - Buat polygon area sawah
   - Akan diminta nama kecamatan
   - Klik OK
   - **Seharusnya berhasil tanpa error 400**

4. **Check console (F12 → Console):**
   - Harus terlihat log sukses tanpa error

## Technical Explanation

`ST_Force3D()` adalah fungsi PostGIS yang:
- Mengubah 2D geometry menjadi 3D dengan menambahkan Z coordinate (default = 0)
- Diperlukan ketika database column mendefinisikan geometry type dengan dimensi 3D
- Tidak berdampak pada visualisasi peta (Z coordinate tidak terlihat di frontend)

## Files Modified
- `backend/routers/admin.py`
  - Line 95: `create_sawah()` - Added `ST_Force3D()`
  - Line 144: `update_sawah_geometry()` - Added `ST_Force3D()`

## Status
✅ **FIXED** - Kedua fungsi CRUD sekarang properly handle 2D to 3D geometry conversion
