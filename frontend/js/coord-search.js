/**
 * coord-search.js  v3
 * Pencarian koordinat bergaya Google Maps.
 * - Mendukung format desimal & DMS
 * - Terbang langsung ke titik koordinat
 * - Deteksi kecamatan via PostGIS (GET /api/geo/kecamatan-at)
 * - Jika koordinat berada dalam wilayah kecamatan Karawang →
 *   otomatis memuat poligon sawah kecamatan tersebut (sama seperti klik peta)
 * - Reverse geocode nama lokasi via Nominatim (OpenStreetMap)
 *
 * Bergantung pada: MapManager (map.js), window._handleKecamatanClick (app.js)
 * Ekspor: window.CoordSearch
 */

const CoordSearch = (() => {
  // ─── State ───────────────────────────────────────────────────────────────
  let _marker = null;

  // ─── Parser: DMS ─────────────────────────────────────────────────────────
  function _parseDMS(str) {
    const pattern =
      /(\d+)[°\s]+(\d+)?['\s]*(\d+(?:\.\d+)?)?["'']?\s*([NSns])\s+(\d+)[°\s]+(\d+)?['\s]*(\d+(?:\.\d+)?)?["'']?\s*([EWew])/;
    const m = str.match(pattern);
    if (!m) return null;
    const lat = (parseInt(m[1]) + (parseInt(m[2]||0)/60) + (parseFloat(m[3]||0)/3600))
                * (/[Ss]/.test(m[4]) ? -1 : 1);
    const lng = (parseInt(m[5]) + (parseInt(m[6]||0)/60) + (parseFloat(m[7]||0)/3600))
                * (/[Ww]/.test(m[8]) ? -1 : 1);
    return { lat, lng };
  }

  // ─── Parser: Desimal ─────────────────────────────────────────────────────
  function _parseDecimal(str) {
    const clean = str.replace(/[^\d.\-,\s]/g, '').trim();
    const parts  = clean.split(/[\s,]+/).map(Number).filter(v => !isNaN(v) && v !== undefined);
    if (parts.length !== 2) return null;

    const [a, b] = parts;
    const aCanBeLat = a >= -90  && a <= 90;
    const bCanBeLng = b >= -180 && b <= 180;
    const aCanBeLng = a >= -180 && a <= 180;
    const bCanBeLat = b >= -90  && b <= 90;

    if (aCanBeLat && bCanBeLng) return { lat: a, lng: b };
    if (aCanBeLng && bCanBeLat) return { lat: b, lng: a };
    return null;
  }

  function _parseInput(raw) {
    const s = raw.trim();
    if (!s) return null;
    return _parseDMS(s) || _parseDecimal(s);
  }

  // ─── Format koordinat ─────────────────────────────────────────────────────
  function _fmt(n) { return n.toFixed(6); }

  function _toDMS(deg, isLat) {
    const abs = Math.abs(deg);
    const d   = Math.floor(abs);
    const mRaw= (abs - d) * 60;
    const m   = Math.floor(mRaw);
    const s   = ((mRaw - m) * 60).toFixed(1);
    const dir = isLat ? (deg >= 0 ? 'U' : 'S') : (deg >= 0 ? 'T' : 'B');
    return `${d}°${m}'${s}" ${dir}`;
  }

  // ─── UI: Error ────────────────────────────────────────────────────────────
  function _showError(msg) {
    const el = document.getElementById('coordSearchError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function _clearError() {
    const el = document.getElementById('coordSearchError');
    if (el) el.style.display = 'none';
  }

  // ─── UI: Panel Hasil ──────────────────────────────────────────────────────
  function _showResult(lat, lng, label, kecamatan) {
    const panel = document.getElementById('coordResultPanel');
    if (!panel) return;

    document.getElementById('coordResultLat').textContent  = _fmt(lat);
    document.getElementById('coordResultLng').textContent  = _fmt(lng);
    document.getElementById('coordResultDMS').textContent  = `${_toDMS(lat, true)},  ${_toDMS(lng, false)}`;
    document.getElementById('coordResultName').textContent = label || '—';

    // Tampilkan badge kecamatan jika ditemukan
    const badge = document.getElementById('coordResultKec');
    if (badge) {
      if (kecamatan) {
        badge.textContent = `📍 ${kecamatan}`;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    panel.style.display = 'block';
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(6px)';
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    });
  }

  function _hideResult() {
    const panel = document.getElementById('coordResultPanel');
    if (panel) panel.style.display = 'none';
  }

  // ─── Nominatim Reverse Geocode ────────────────────────────────────────────
  async function _reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'id' } });
      if (!res.ok) return null;
      const data = await res.json();
      const a = data.address || {};
      return (
        a.neighbourhood || a.suburb || a.village ||
        a.town || a.municipality || a.city ||
        a.county || a.state || data.display_name?.split(',')[0]
      ) || null;
    } catch { return null; }
  }

  // ─── Algoritma Point-In-Polygon (Client-Side) ───────────────────────────
  function _pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i][0], yi = vs[i][1];
      let xj = vs[j][0], yj = vs[j][1];
      let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function _detectKecamatan(lat, lng) {
    // GeoJSON menggunakan [longitude, latitude]
    const pt = [lng, lat];
    const batasData = window._appState?.batasData;
    
    if (!batasData || !batasData.features) return { found: false };

    for (const feature of batasData.features) {
      const geom = feature.geometry;
      let isInside = false;

      if (geom.type === 'Polygon') {
        isInside = _pointInPolygon(pt, geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        for (let i = 0; i < geom.coordinates.length; i++) {
          if (_pointInPolygon(pt, geom.coordinates[i][0])) {
            isInside = true;
            break;
          }
        }
      }

      if (isInside) {
        return {
          found: true,
          kecamatan: feature.properties.kecamatan,
          properties: feature.properties
        };
      }
    }
    return { found: false };
  }

  // ─── Tempatkan Marker Google Maps Pin ────────────────────────────────────
  function _placeMarker(lat, lng, map) {
    if (_marker) { map.removeLayer(_marker); _marker = null; }

    const pinHTML = `
      <div class="csm-wrap">
        <div class="csm-pin">
          <svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" width="28" height="42">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
                  fill="#ef4444" stroke="#fff" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="5" fill="#fff"/>
          </svg>
        </div>
        <div class="csm-shadow"></div>
      </div>`;

    const icon = L.divIcon({
      className: '',
      html: pinHTML,
      iconSize:   [28, 42],
      iconAnchor: [14, 42],
      popupAnchor:[0, -44],
    });

    _marker = L.marker([lat, lng], { icon }).addTo(map);
  }

  // ─── Aksi Utama: Fly + Deteksi + Muat Sawah ──────────────────────────────
  async function _flyTo(lat, lng, kecResult) {
    const map = MapManager.getMap();
    if (!map) return;

    // 1. Tempatkan marker dan terbang ke koordinat
    _placeMarker(lat, lng, map);
    map.flyTo([lat, lng], 16, { duration: 1.0, easeLinearity: 0.35 });

    // 2. Tampilkan panel hasil sementara
    _showResult(lat, lng, 'Memuat info lokasi...', null);

    // 3. Reverse geocode (async)
    const label = await _reverseGeocode(lat, lng);

    // 4. Perbarui panel hasil dengan info lengkap
    const kecNama = kecResult?.found ? kecResult.kecamatan : null;
    _showResult(lat, lng, label, kecNama);

    // 5. Muat poligon sawah dan cegah map "mental" (preventZoom = true)
    if (kecResult?.found && kecResult.properties && window._handleKecamatanClick) {
      setTimeout(() => {
        // Parameter ke-2 = true berarti "preventZoom" di app.js
        window._handleKecamatanClick(kecResult.properties, true);
      }, 600);
    }
  }

  // ─── Eksekusi Pencarian ───────────────────────────────────────────────────
  function _doSearch() {
    _clearError();
    const raw = (document.getElementById('coordSearchInput')?.value || '').trim();

    if (!raw) { _showError('Masukkan koordinat terlebih dahulu.'); return; }

    const result = _parseInput(raw);
    if (!result) {
      _showError('Format tidak dikenali. Coba: -6.3542, 107.3211');
      return;
    }

    const { lat, lng } = result;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      _showError('Koordinat di luar jangkauan valid (lat: ±90, lng: ±180).');
      return;
    }

    // BATASAN: Hanya bisa mencari di wilayah Karawang
    const kecResult = _detectKecamatan(lat, lng);
    if (!kecResult.found) {
      _showError('Titik koordinat berada di luar wilayah Kabupaten Karawang.');
      return;
    }

    _flyTo(lat, lng, kecResult);
  }

  // ─── Hapus marker & panel ─────────────────────────────────────────────────
  function clearMarker() {
    const map = MapManager.getMap();
    if (_marker && map) { map.removeLayer(_marker); _marker = null; }
    _hideResult();
    const input = document.getElementById('coordSearchInput');
    if (input) input.value = '';
  }

  // ─── Inisialisasi Event ───────────────────────────────────────────────────
  function init() {
    const btn      = document.getElementById('coordSearchBtn');
    const input    = document.getElementById('coordSearchInput');
    const toggle   = document.getElementById('coordSearchToggle');
    const body     = document.getElementById('coordSearchBody');
    const clearBtn = document.getElementById('coordResultClear');

    if (!btn || !input) return;

    btn.addEventListener('click', _doSearch);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _doSearch(); }
    });
    input.addEventListener('input', () => {
      _clearError();
      if (!input.value.trim()) _hideResult();
    });

    if (toggle && body) {
      toggle.addEventListener('click', () => {
        const isHidden = body.classList.toggle('hidden');
        toggle.innerHTML = isHidden
          ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
          : `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
        toggle.title = isHidden ? 'Buka' : 'Tutup';
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', clearMarker);
    }
  }

  return { init, clearMarker };
})();

window.CoordSearch = CoordSearch;
