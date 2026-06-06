/**
 * data.js
 * Modul manajemen data: semua fetch ke API backend.
 * Tidak ada logika UI di sini — hanya data access layer.
 */

// [PRODUCTION] API path bersumber dari config.js (selalu '/api').
// Kompatibel dengan Nginx reverse proxy di VPS maupun dev lokal via proxy.
const API = window.APP_CONFIG?.API_BASE || '/api';


// ─── Helpers ──────────────────────────────────────────
function fmt(n, dec = 0) {
  if (n === null || n === undefined || isNaN(n)) return '–';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n);
}

function fmtNdvi(v) {
  if (v === null || v === undefined) return '–';
  return Number(v).toFixed(3);
}

/**
 * Klasifikasi kerapatan vegetasi berdasarkan NDVI (fenologi lahan sawah).
 * @returns {{ label: string, level: 'high'|'med'|'ok'|'low'|'na', desc: string }}
 */
function getRiskInfo(ndvi) {
  if (ndvi === null || ndvi === undefined) return { label: 'Data Tidak Tersedia', level: 'na', desc: 'Tidak ada data NDVI untuk periode ini.' };
  if (ndvi < 0.2)  return { label: 'Kerapatan Sangat Rendah', level: 'high', desc: 'Indikasi fase bera atau penggenangan lahan awal sebelum masa tanam.' };
  if (ndvi < 0.4)  return { label: 'Kerapatan Rendah',        level: 'med',  desc: 'Indikasi masa persemaian atau awal tanam dengan kanopi daun yang masih jarang.' };
  if (ndvi < 0.6)  return { label: 'Kerapatan Sedang',        level: 'ok',   desc: 'Indikasi fase pertumbuhan vegetatif aktif.' };
  return             { label: 'Kerapatan Tinggi',        level: 'low',  desc: 'Indikasi fase vegetatif maksimal atau kerapatan kanopi tertinggi menjelang masa generatif.' };
}

// ─── API Calls ─────────────────────────────────────────

/** Ambil daftar tahun yang tersedia */
async function fetchTahunList() {
  const res = await fetch(`${API}/ndvi/tahun`);
  if (!res.ok) throw new Error('Gagal fetch tahun');
  return res.json(); // number[]
}

/** Ambil daftar kecamatan */
async function fetchKecamatanList() {
  const res = await fetch(`${API}/ndvi/kecamatan`);
  if (!res.ok) throw new Error('Gagal fetch kecamatan');
  return res.json(); // string[]
}

/**
 * GeoJSON batas kecamatan + NDVI + KPI.
 * @param {Object} filters - { tahun?: number, bulan?: number }
 */
async function fetchBatasGeoJSON(filters = {}) {
  const params = new URLSearchParams();
  if (filters.tahun) params.set('tahun', filters.tahun);
  if (filters.bulan) params.set('bulan', filters.bulan);
  const url = `${API}/geo/batas${params.toString() ? '?' + params : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal fetch batas GeoJSON');
  return res.json(); // FeatureCollection
}

/**
 * GeoJSON poligon petak sawah per kecamatan (lazy — hanya saat diklik).
 * Limit default dikurangi agar performa aman; bisa dinaikkan.
 */
async function fetchSawahGeoJSON(kecamatan, limit = 50000, bbox = null, signal = null) {
  const params = new URLSearchParams({ kecamatan, limit, t: Date.now() });
  if (bbox) {
    params.set('min_lng', bbox.min_lng);
    params.set('min_lat', bbox.min_lat);
    params.set('max_lng', bbox.max_lng);
    params.set('max_lat', bbox.max_lat);
  }
  const fetchOpts = signal ? { signal } : {};
  const res = await fetch(`${API}/geo/sawah?${params}`, fetchOpts);
  if (!res.ok) throw new Error(`Gagal fetch sawah GeoJSON: ${kecamatan}`);
  return res.json();
}

/**
 * Tren NDVI bulanan seluruh Karawang (atau per kecamatan).
 * @param {Object} filters - { tahun?, bulan?, kecamatan? }
 */
async function fetchTrendNdvi(filters = {}) {
  // Gunakan endpoint summary atau trend tergantung filter yang dikirim
  if (filters.kecamatan) {
    // tren per kecamatan
    const params = new URLSearchParams();
    if (filters.tahun) params.set('tahun', filters.tahun);
    const res = await fetch(`${API}/ndvi/${encodeURIComponent(filters.kecamatan)}?${params}`);
    if (!res.ok) return [];
    return res.json(); // NdviResponse[]
  } else {
    // tren global
    const params = new URLSearchParams();
    if (filters.tahun) params.set('tahun', filters.tahun);
    if (filters.bulan) params.set('bulan', filters.bulan);
    const res = await fetch(`${API}/ndvi/trend?${params}`);
    if (!res.ok) return [];
    return res.json(); // NdviTrendItem[]
  }
}

/** Distribusi kategori NDVI */
async function fetchKategoriNdvi(filters = {}) {
  const params = new URLSearchParams();
  if (filters.tahun) params.set('tahun', filters.tahun);
  const res = await fetch(`${API}/ndvi/kategori?${params}`);
  if (!res.ok) return [];
  return res.json();
}

/** Summary KPI satu kecamatan */
async function fetchKpiKecamatan(kecamatan) {
  const res = await fetch(`${API}/kpi/${encodeURIComponent(kecamatan)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Summary ringkasan kategori sawah (Kecil/Sedang/Besar + Kec terluas) */
async function fetchSawahSummary() {
  const res = await fetch(`${API}/kpi/sawah/kategori`);
  if (!res.ok) return null;
  return res.json();
}

/** Fetch Luas Sawah per Kecamatan (Horizontal Bar Chart) */
async function fetchLuasSawahRank() {
  const res = await fetch(`${API}/kpi/sawah/luas`);
  if (!res.ok) return [];
  return res.json();
}

/** Fetch data matrix Heatmap (Kecamatan x Bulan) */
async function fetchHeatmap(tahun) {
  const res = await fetch(`${API}/ndvi/dashboard/heatmap?tahun=${tahun}`);
  if (!res.ok) return [];
  return res.json();
}

/** Fetch data YoY Comparison (2023, 2024, 2025) */
async function fetchYoY() {
  const res = await fetch(`${API}/ndvi/dashboard/yoy`);
  if (!res.ok) return [];
  return res.json();
}

// Export agar bisa dipakai modul lain
window.Data = {
  fmt, fmtNdvi, getRiskInfo,
  fetchTahunList, fetchKecamatanList,
  fetchBatasGeoJSON, fetchSawahGeoJSON,
  fetchTrendNdvi, fetchKategoriNdvi,
  fetchKpiKecamatan, fetchSawahSummary,
  fetchLuasSawahRank, fetchHeatmap, fetchYoY
};
