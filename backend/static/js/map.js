/**
 * map.js
 * Modul manajemen peta Leaflet.
 * Mengelola: basemap, layer kecamatan, layer sawah,
 *            mode tampilan (fill/outline), highlight hover, events.
 *
 * Ekspor: window.MapManager
 */

const MapManager = (() => {
  // ─── State internal ───────────────────────────────
  let _map = null;
  let _batasLayer = null;   // layer poligon kecamatan
  let _sawahLayer = null;   // layer poligon petak sawah
  let _activeMode = 'fill'; // 'fill' | 'outline'
  let _fillOpacity = 0.65;
  let _activeLayer = 'kecamatan'; // 'kecamatan' | 'sawah'
  let _highlighted = null;  // layer yang sedang di-hover

  // Callbacks — diisi oleh app.js
  let _onKecamatanClick = null;
  let _onPetakClick = null;

  // ─── Warna NDVI ──────────────────────────────────
  function getNdviColor(v) {
    if (v === null || v === undefined) return '#94a3b8';
    if (v > 0.65) return '#166534';
    if (v > 0.55) return '#16a34a';
    if (v > 0.45) return '#22c55e';
    if (v > 0.35) return '#84cc16';
    if (v > 0.25) return '#eab308';
    if (v > 0.15) return '#f97316';
    return '#dc2626';
  }

  // Warna petak sawah berdasarkan ukuran luas
  function getPetakColor(luas_ha) {
    if (!luas_ha) return '#64748b';
    if (luas_ha <= 0.5)  return '#60a5fa'; // Kecil — biru muda
    if (luas_ha <= 1.0)  return '#2563eb'; // Sedang — biru
    return '#1e3a8a';                       // Besar — biru tua
  }

  // ─── Style factories ─────────────────────────────

  /** Style untuk layer kecamatan (batas wilayah) */
  function kecStyle(feature) {
    const ndvi = feature.properties.avg_ndvi;
    const isFill = _activeMode === 'fill';
    return {
      color: '#ffffff',
      weight: 1.5,
      opacity: 0.9,
      fillColor: getNdviColor(ndvi),
      fillOpacity: isFill ? _fillOpacity : 0,
    };
  }

  /** Style highlight saat hover kecamatan */
  function kecHighlightStyle(feature) {
    return {
      ...kecStyle(feature),
      weight: 3,
      color: '#1e3a8a',
    };
  }

  /** Style untuk layer petak sawah */
  function petakStyle(feature) {
    const luas = feature.properties.luas_ha;
    const isFill = _activeMode === 'fill';
    return {
      color: getPetakColor(luas),
      weight: isFill ? 0.6 : 1.2,
      opacity: 1,
      fillColor: getPetakColor(luas),
      fillOpacity: isFill ? _fillOpacity : 0.01,
    };
  }

  function init() {
    _map = L.map('map', {
      center: [-6.30, 107.30],
      zoom: 10,
      zoomControl: false,
      preferCanvas: true,
      maxBounds: [
        [-6.85, 107.0],
        [-5.8, 107.8]
      ],
      maxBoundsViscosity: 1.0,
      minZoom: 9
    });
    L.control.zoom({ position: 'topleft' }).addTo(_map);

    // Basemap: Google Maps Satellite (gratis tanpa billing)
    L.tileLayer(
      'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      {
        attribution: 'Map data © Google',
        maxZoom: 22,
        maxNativeZoom: 20
      }
    ).addTo(_map);

    // Label overlay agar nama jalan/wilayah tetap terbaca
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        opacity: 0.7,
        maxZoom: 22,
        maxNativeZoom: 18,
        pane: 'overlayPane',
      }
    ).addTo(_map);
  }

  // ─── Batas Kecamatan ─────────────────────────────

  function renderBatas(geojson, onClickCb) {
    _onKecamatanClick = onClickCb;

    if (_batasLayer) _map.removeLayer(_batasLayer);

    _batasLayer = L.geoJSON(geojson, {
      style: kecStyle,
      onEachFeature(feature, layer) {
        // Hover
        layer.on('mouseover', (e) => {
          if (_activeLayer === 'sawah') return;

          if (_highlighted) _highlighted.setStyle(kecStyle(_highlighted.feature));
          _highlighted = layer;
          layer.setStyle(kecHighlightStyle(feature));
          layer.bringToFront();

          const p = feature.properties;
          const ndvi = p.avg_ndvi ? p.avg_ndvi.toFixed(3) : '–';
          layer.bindTooltip(
            `<strong>${p.kecamatan}</strong><br/>NDVI: ${ndvi}<br/>Petak: ${Data.fmt(p.jumlah_petak)}`,
            { sticky: true, className: '' }
          ).openTooltip(e.latlng);
        });

        layer.on('mouseout', () => {
          if (_activeLayer === 'sawah') return;

          if (_highlighted === layer) {
            layer.setStyle(kecStyle(feature));
            _highlighted = null;
          }
        });

        // Click
        layer.on('click', () => {
          if (_onKecamatanClick) _onKecamatanClick(feature.properties);
        });
      },
    }).addTo(_map);

    _map.fitBounds(_batasLayer.getBounds(), { padding: [10, 10] });
  }

  function renderSawah(geojson, onClickCb, skipFitBounds = false) {
    _onPetakClick = onClickCb;
    _activeLayer = 'sawah';

    if (_sawahLayer) _map.removeLayer(_sawahLayer);

    // Redup batas kecamatan
    if (_batasLayer) {
      _batasLayer.setStyle((feature) => ({
        ...kecStyle(feature),
        fillOpacity: 0.05,
        weight: 1,
        color: '#94a3b8',
      }));
    }

    _sawahLayer = L.geoJSON(geojson, {
      style: petakStyle,
      onEachFeature(feature, layer) {
        const p = feature.properties;

        // Hover tooltip
        layer.on('mouseover', (e) => {
          const luas = p.luas_ha ? p.luas_ha.toFixed(3) : '–';
          const ukuran = p.luas_ha <= 0.5 ? 'Kecil' : p.luas_ha <= 1 ? 'Sedang' : 'Besar';
          layer.bindTooltip(
            `<strong>Luas: ${luas} Ha</strong><br/>Ukuran: ${ukuran}<br/>ID: ${p.id_sawah || '–'}`,
            { sticky: true }
          ).openTooltip(e.latlng);
          layer.setStyle({ weight: 2, color: '#facc15' });
        });

        layer.on('mouseout', () => {
          layer.setStyle(petakStyle(feature));
        });

        // Click
        layer.on('click', (e) => {
          L.DomEvent.stop(e);

          // Admin buttons
          const isAdmin = window.Auth && Auth.isAdmin();
          const adminBtns = isAdmin ? `
            <div style="display:flex; gap:6px; margin-top:10px; border-top:1px solid #e2e8f0; padding-top:8px;">
              <button onclick="Admin.enableEditModeForLayer(MapManager.getLayerByOgcFid(${p.ogc_fid}), ${p.ogc_fid}); MapManager.getMap().closePopup();" style="flex:1; height:26px; border:1px solid #93c5fd; border-radius:4px; background:#eff6ff; color:#2563eb; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit;">Edit Geometri</button>
              <button onclick="MapManager.deleteAndRefresh(${p.ogc_fid})" style="flex:1; height:26px; border:1px solid #fca5a5; border-radius:4px; background:#fee2e2; color:#dc2626; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit;">Hapus</button>
            </div>
          ` : '';

          const popupContent = `
            <div style="font-family:'DM Sans', system-ui, sans-serif; font-size:12px; min-width:180px;">
              <h4 style="margin:0 0 8px 0; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">Detail Lahan (ID: ${p.id_sawah || 'NA'})</h4>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                <span style="color:#64748b">Luas:</span> <strong style="color:#2563eb">${p.luas_ha ? p.luas_ha.toFixed(3) + ' Ha' : '–'}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                <span style="color:#64748b">Wilayah:</span> <strong>${p.kecamatan || '–'}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                <span style="color:#64748b">OGC FID:</span> <strong>${p.ogc_fid || '–'}</strong>
              </div>
              ${adminBtns}
            </div>
          `;
          L.popup({ closeButton: true })
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(_map);

          if (_onPetakClick) _onPetakClick(p);
        });
      },
    }).addTo(_map);

    window._sawahLayerRef = _sawahLayer;

    if (!skipFitBounds && _sawahLayer.getBounds().isValid()) {
      _map.fitBounds(_sawahLayer.getBounds(), { padding: [20, 20] });
    }
  }

  function clearSawahLayer() {
    if (_sawahLayer) { _map.removeLayer(_sawahLayer); _sawahLayer = null; }
    window._sawahLayerRef = null;
    _activeLayer = 'kecamatan';
    if (_batasLayer) {
      _batasLayer.eachLayer((layer) => {
        layer.setStyle(kecStyle(layer.feature));
      });
      _map.fitBounds(_batasLayer.getBounds(), { padding: [10, 10] });
    }
  }

  // ─── Mode Tampilan ────────────────────────────────

  function setMode(mode) {
    _activeMode = mode;
    _applyStyles();
  }

  function setOpacity(v) {
    _fillOpacity = v;
    _applyStyles();
  }

  function _applyStyles() {
    if (_batasLayer && _activeLayer === 'kecamatan') {
      _batasLayer.setStyle(kecStyle);
    }
    if (_sawahLayer && _activeLayer === 'sawah') {
      _sawahLayer.setStyle(petakStyle);
      if (_batasLayer) {
        _batasLayer.setStyle((feature) => ({
          ...kecStyle(feature), fillOpacity: 0.05, weight: 1, color: '#94a3b8',
        }));
      }
    }
  }

  function fitBatas() {
    if (_batasLayer) _map.fitBounds(_batasLayer.getBounds(), { padding: [10, 10] });
  }

  function getMap() { return _map; }

  function getLayerByOgcFid(ogcFid) {
    let target = null;
    if (_sawahLayer) {
      _sawahLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties.ogc_fid === ogcFid) target = layer;
      });
    }
    return target;
  }

  async function deleteAndRefresh(ogcFid) {
    if (!confirm(`Yakin ingin menghapus poligon #${ogcFid}? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await Admin.deleteSawah(ogcFid);
      _map.closePopup();
      alert(`Poligon #${ogcFid} berhasil dihapus.`);
      if (window._reloadSawahLayer) window._reloadSawahLayer();
    } catch (e) {
      alert('Gagal menghapus: ' + e.message);
    }
  }

  return {
    init, renderBatas, renderSawah, clearSawahLayer,
    setMode, setOpacity, fitBatas, getMap, getNdviColor,
    getLayerByOgcFid, deleteAndRefresh,
  };
})();

window.MapManager = MapManager;
