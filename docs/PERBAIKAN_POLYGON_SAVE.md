# Perbaikan Bug Penyimpanan Polygon/Geometri

## Masalah yang Ditemukan
Data polygon dan geometri tidak tersimpan saat user melakukan edit atau add geometri di dashboard.

## Root Cause
### Bug Kritikal di `backend/routers/admin.py`

**Pada fungsi `create_sawah()` (Line 78):**
```python
# SEBELUM (BUG):
result = db.execute(sql, {...})
db.commit()  # <-- Session ditutup di sini
new_id = result.fetchone()[0]  # <-- Hasil ini None, menyebabkan IndexError!
```

Masalah: Setelah `db.commit()`, SQLAlchemy menutup result set. Memanggil `fetchone()` setelah commit akan mengembalikan `None`, kemudian `None[0]` menyebabkan error yang tidak ditangani dengan baik.

## Solusi yang Diterapkan

### 1. Backend (admin.py)

#### A. Fix `create_sawah()`
```python
# SESUDAH (BENAR):
result = db.execute(sql, {...})
new_id = result.fetchone()[0]  # <-- Fetch SEBELUM commit
db.commit()  # <-- Commit setelah fetch
```

#### B. Add Error Handling di `update_sawah_geometry()`
- Wrap dalam try-catch block
- Rollback on error
- Return error message yang jelas ke frontend

#### C. Add Error Handling di `delete_sawah()`
- Wrap dalam try-catch block
- Rollback on error

#### D. Add Error Handling di `_refresh_kpi()`
- Wrap dalam try-catch
- Print error logs untuk debugging
- Rollback on failure

### 2. Frontend Enhancements (admin.js & static/js/admin.js)

#### A. Enhanced `saveAllEdits()`
- Added console.log untuk track OGC FID dan geometry object
- Better error handling dan logging
- Terbaca di browser DevTools untuk debugging

#### B. Enhanced `updateSawahGeometry()`
- Log API endpoint dan response status
- Log error detail dari server response
- Better error messages

#### C. Enhanced `createSawah()`
- Log kecamatan dan geometry saat create
- Log response status dan result
- Better error handling

#### D. Enhanced `deleteSawah()`
- Log delete request
- Log response status
- Better error handling

## Testing Instructions

### 1. Buka Browser DevTools
- F12 atau Ctrl+Shift+I
- Buka tab "Console"

### 2. Test Edit Polygon
1. Login ke dashboard
2. Klik kecamatan untuk tampilkan poligon
3. Klik poligon dan pilih "Edit Geometri"
4. Edit bentuk poligon
5. Klik "Simpan Semua Perubahan"
6. **Lihat Console** - seharusnya muncul log:
   ```
   [Admin] Menyimpan geometri untuk OGC FID: 123
   [Admin] Geometry object: {...}
   [API] PUT /admin/sawah/123
   [API] Response status: 200
   [API] Success response: {detail: "..."}
   [Admin] Save result: {...}
   ```

### 3. Test Add Polygon (jika tersedia)
1. Di peta, gunakan tool draw/add polygon
2. Setelah geometri selesai, akan diminta nama kecamatan
3. **Lihat Console** - seharusnya muncul log:
   ```
   [API] POST /admin/sawah - Kecamatan: NamaKecamatan
   [API] Geometry: {...}
   [API] Response status: 200
   [API] Success response: {detail: "...", ogc_fid: 456}
   ```

## Jika Masih Ada Error

### Di Console, akan terlihat error detail seperti:
```
[API] Response status: 400
[API] Error detail: {detail: "Gagal update geometri: ..."}
```

Atau:
```
[Admin] Error saat menyimpan: Error: Gagal update geometri (...)
```

### Solusi Troubleshooting:

1. **"Poligon dengan ogc_fid=X tidak ditemukan"**
   - Polygon mungkin sudah dihapus
   - Refresh halaman dan coba lagi

2. **"Gagal update geometri: ..."**
   - Ada error di database atau PostGIS
   - Lihat error message lengkap di console
   - Periksa geometry format (harus valid GeoJSON)

3. **Response 401 (Unauthorized)**
   - Session login expired
   - Refresh halaman dan login ulang

4. **Response 403 (Forbidden)**
   - User bukan admin
   - Hanya admin yang bisa edit/add/delete polygon

## Files yang Dimodifikasi

1. `backend/routers/admin.py`
   - `create_sawah()`: Fixed fetchone after commit
   - `update_sawah_geometry()`: Added error handling
   - `delete_sawah()`: Added error handling
   - `_refresh_kpi()`: Added error handling

2. `frontend/js/admin.js`
   - `saveAllEdits()`: Added logging
   - `updateSawahGeometry()`: Added logging
   - `createSawah()`: Added logging
   - `deleteSawah()`: Added logging

3. `backend/static/js/admin.js`
   - Synchronized dengan frontend/js/admin.js

## Deployment Steps

1. **Restart backend service:**
   ```bash
   cd backend
   python main.py
   ```

2. **Clear browser cache** (Ctrl+Shift+Delete)

3. **Test di browser baru** untuk ensure tidak ada cached JS

4. **Verify database connection** di `.env`:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME= bi_gis_karawang
   DB_USER=postgres
   DB_PASSWORD=srd2209
   ```

## Notes

- Perbaikan ini memastikan bahwa geometry data tersimpan ke database dengan benar
- Error handling yang lebih baik akan memudahkan debugging jika ada masalah lain
- Logging di frontend membantu user dan developer melihat apa yang terjadi

## Maintenance

Jika ada error baru yang muncul:
1. Lihat error message di browser Console
2. Log akan show detail tentang apa yang gagal
3. Gunakan error message untuk debugging lebih lanjut
