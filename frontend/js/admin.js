/**
 * admin.js
 * Modul fitur admin: Unduh/Upload Data, Kelola Akun, Edit Poligon (Geoman).
 */

const Admin = (() => {
  // [PRODUCTION] API path bersumber dari config.js (selalu '/api').
  // Kompatibel dengan Nginx reverse proxy di VPS maupun dev lokal via proxy.
  const API = window.APP_CONFIG?.API_BASE || '/api';

  const AUTH_USERS_URL = window.APP_CONFIG?.endpoints?.authUsers || `${API}/auth/users`;
  const AUTH_REGISTER_URL = window.APP_CONFIG?.endpoints?.authRegister || `${API}/auth/register`;

  // ══════════════════════════════════════════════════════
  // UNDUH DATA — MULTI-FORMAT
  // ══════════════════════════════════════════════════════
  function openDownloadModal() {
    openModal('modalDownload');
    const src = document.getElementById('filterTahun');
    const dstTahun = document.getElementById('downloadTahun');
    const dstKec = document.getElementById('downloadKecamatan');
    if (src && dstTahun) {
      dstTahun.innerHTML = '<option value="">Semua Tahun</option>';
      Array.from(src.options).forEach(opt => {
        if (opt.value) dstTahun.insertAdjacentHTML('beforeend', `<option value="${opt.value}">${opt.textContent}</option>`);
      });
    }
    if (dstKec) {
      const srcKec = document.getElementById('filterKecamatan');
      dstKec.innerHTML = '<option value="">Semua Kecamatan</option>';
      if (srcKec) {
        Array.from(srcKec.options).forEach(opt => {
          if (opt.value) dstKec.insertAdjacentHTML('beforeend', `<option value="${opt.value}">${opt.textContent}</option>`);
        });
      }
    }
    switchDownloadTab('ndvi');
  }

  function switchDownloadTab(tab) {
    // Reset semua tab buttons
    document.querySelectorAll('.dl-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.style.background = 'transparent';
      b.style.color = 'var(--text-muted)';
    });
    // Reset semua tab content
    document.querySelectorAll('.dl-tab-content').forEach(c => c.classList.add('hidden'));

    // Aktifkan tab terpilih
    const btn = document.querySelector(`.dl-tab-btn[data-tab="${tab}"]`);
    const content = document.getElementById(`dlTab_${tab}`);
    if (btn) {
      btn.classList.add('active');
      btn.style.background = 'var(--forest)';
      btn.style.color = '#fff';
    }
    if (content) content.classList.remove('hidden');
  }

  // ── Helper: Download file dari API ──
  async function _fetchAndDownload(endpoint, filename) {
    const token = Auth.getToken();
    const headers = { 'Accept': '*/*' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    console.log('[Download] Endpoint:', endpoint);
    console.log('[Download] Token ada:', !!token, '| Role:', Auth.getUser()?.role);
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: 'GET',
        headers: headers,
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('[Download] Error', res.status, errText);
        if (res.status === 401) {
          alert('Sesi Anda telah berakhir. Silakan login ulang.');
          Auth.logout();
          return;
        }
        throw new Error(`Server menolak (${res.status}): ${errText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      closeModal('modalDownload');
    } catch (e) {
      alert('Gagal mengunduh: ' + e.message);
    }
  }

  // ── Download 1: Data NDVI Terfilter (CSV) ──
  function handleDownloadNdvi() {
    const tahun = document.getElementById('downloadTahun')?.value || '';
    const bulan = document.getElementById('downloadBulan')?.value || '';
    const kecamatan = document.getElementById('downloadKecamatan')?.value || '';
    const params = new URLSearchParams();
    if (tahun) params.set('tahun', tahun);
    if (bulan) params.set('bulan', bulan);
    if (kecamatan) params.set('kecamatan', kecamatan);
    const q = params.toString() ? '?' + params.toString() : '';
    _fetchAndDownload(`/admin/ndvi/export-filtered${q}`, `ndvi_data_${tahun || 'semua'}.csv`);
  }

  // ── Download 2: Ranking Kerapatan Vegetasi (CSV) ──
  function handleDownloadRanking() {
    const tahun = document.getElementById('downloadTahun')?.value || '';
    const q = tahun ? `?tahun=${tahun}` : '';
    _fetchAndDownload(`/admin/ranking/export-csv${q}`, `kerapatan_vegetasi_${tahun || 'semua'}.csv`);
  }

  // ── Download 3: Laporan Analitik (Excel) ──
  function handleDownloadExcel() {
    const tahun = document.getElementById('downloadTahun')?.value || '';
    const q = tahun ? `?tahun=${tahun}` : '';
    _fetchAndDownload(`/admin/report/export-xlsx${q}`, `laporan_analitik_paddix_${tahun || 'semua'}.xlsx`);
  }

  // Legacy
  function handleDownload() { handleDownloadNdvi(); }

  // ══════════════════════════════════════════════════════
  // UPLOAD CSV
  // ══════════════════════════════════════════════════════
  async function importCSV(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/admin/ndvi/import-csv`, {
        method: 'POST',
        headers: Auth.authHeadersMultipart(),
        body: formData,
      });
      
      if (res.status === 401) {
        Auth.handle401Error('Token expired saat import CSV');
        return false;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload gagal');
      alert(data.detail + (data.errors?.length ? `\n\nError:\n${data.errors.join('\n')}` : ''));
      return true;
    } catch (e) {
      alert('Upload CSV gagal: ' + e.message);
      return false;
    }
  }



  // ══════════════════════════════════════════════════════
  // CRUD POLIGON SAWAH
  // ══════════════════════════════════════════════════════
  async function deleteSawah(ogcFid) {
    console.log('[API] DELETE /admin/sawah/' + ogcFid);
    const res = await fetch(`${API}/admin/sawah/${ogcFid}`, {
      method: 'DELETE', 
      headers: Auth.authHeaders(),
    });
    console.log('[API] Response status:', res.status);
    
    if (res.status === 401) {
      Auth.handle401Error('Token expired atau invalid saat menghapus polygon');
      throw new Error('Session expired. Silakan login ulang.');
    }
    
    if (!res.ok) {
      let errTxt = 'Gagal hapus poligon (' + res.status + ')';
      try { 
        const data = await res.json(); 
        errTxt = data.detail || errTxt;
        console.error('[API] Error detail:', data);
      } catch(e){}
      throw new Error(errTxt);
    }
    const data = await res.json();
    console.log('[API] Success response:', data);
    return data;
  }

  async function updateSawahGeometry(ogcFid, geojsonGeometry) {
    const token = Auth.getToken();
    console.log('[API] Token available:', !!token);
    if (token) {
      console.log('[API] Token preview:', token.substring(0, 20) + '...');
    }
    console.log('[API] PUT /admin/sawah/' + ogcFid);
    
    const headers = Auth.authHeaders();
    console.log('[API] Authorization header:', headers['Authorization'] ? 'Set' : 'NOT SET');
    
    const res = await fetch(`${API}/admin/sawah/${ogcFid}`, {
      method: 'PUT', 
      headers: headers,
      body: JSON.stringify({ geojson_geometry: geojsonGeometry }),
    });
    console.log('[API] Response status:', res.status);
    
    if (res.status === 401) {
      Auth.handle401Error('Token expired atau invalid saat update geometri');
      throw new Error('Session expired. Silakan login ulang.');
    }
    
    if (!res.ok) {
      let errTxt = 'Gagal update geometri (' + res.status + ')';
      try { 
        const data = await res.json(); 
        errTxt = data.detail || errTxt;
        console.error('[API] Error detail:', data);
      } catch(e){}
      throw new Error(errTxt);
    }
    const data = await res.json();
    console.log('[API] Success response:', data);
    return data;
  }

  async function createSawah(kecamatan, luasHa, geojsonGeometry) {
    console.log('[API] POST /admin/sawah - Kecamatan:', kecamatan);
    console.log('[API] Geometry:', geojsonGeometry);
    
    const res = await fetch(`${API}/admin/sawah`, {
      method: 'POST', 
      headers: Auth.authHeaders(),
      body: JSON.stringify({ kecamatan, luas_ha: luasHa, geojson_geometry: geojsonGeometry }),
    });
    console.log('[API] Response status:', res.status);
    
    if (res.status === 401) {
      Auth.handle401Error('Token expired atau invalid saat membuat polygon');
      throw new Error('Session expired. Silakan login ulang.');
    }
    
    if (!res.ok) {
      let errTxt = 'Gagal tambah poligon (' + res.status + ')';
      try { 
        const data = await res.json(); 
        errTxt = data.detail || errTxt;
        console.error('[API] Error detail:', data);
      } catch(e){}
      throw new Error(errTxt);
    }
    const data = await res.json();
    console.log('[API] Success response:', data);
    return data;
  }

  // ══════════════════════════════════════════════════════
  // RENDER MODALS
  // ══════════════════════════════════════════════════════
  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }



  function handleUploadClick() { openModal('modalImport'); }

  async function handleUploadSubmit() {
    const fileInput = document.getElementById('csvFileInput');
    if (!fileInput.files.length) { alert('Pilih file CSV terlebih dahulu'); return; }
    
    const file = fileInput.files[0];
    if (file.size > 50 * 1024 * 1024) {
      alert('Peringatan: Ukuran file melebihi 50 MB.');
      return;
    }

    const success = await importCSV(file);
    if (success) {
      closeModal('modalImport');
      fileInput.value = '';
      // Reload halaman agar dropdown filter (tahun, kecamatan, dll) terupdate
      setTimeout(() => window.location.reload(), 500);
    }
  }

  // ══════════════════════════════════════════════════════
  // LEAFLET-GEOMAN INTEGRATION
  // ══════════════════════════════════════════════════════

  function initGeoman(map) {
    // KITA MATIKAN NATIVE GEOMAN TOOLBAR AGAR TIDAK MUNCUL DI KIRI MAP
    // map.pm.addControls({...});

    // Binding tombol custom di Digitasi Toolbar
    const btnDigiAdd = document.getElementById('btnDigiAdd');
    if (btnDigiAdd) btnDigiAdd.addEventListener('click', () => {
      map.pm.enableDraw('Polygon', { allowSelfIntersection: false });
    });

    const btnDigiCancelDraw = document.getElementById('btnDigiCancelDraw');
    if (btnDigiCancelDraw) btnDigiCancelDraw.addEventListener('click', () => {
      map.pm.disableDraw();
    });

    const btnDigiExit = document.getElementById('btnDigiExit');
    if (btnDigiExit) btnDigiExit.addEventListener('click', () => {
      exitDigitasiMode(map);
    });

    map.pm.setGlobalOptions({
      pathOptions: {
        color: '#dc2626',
        fillColor: '#dc2626',
        fillOpacity: 0.2,
        weight: 2,
      },
      // ALLOW UNLIMITED POLYGON POINTS - no restriction on vertex count
      minPolygonPoints: 3,
    });

    // ── Nonaktifkan hover tooltip saat mode Draw atau Edit Geoman aktif ──
    // pm:globaldrawmodetoggled: langsung fire saat tombol draw di toolbar diklik
    map.on('pm:globaldrawmodetoggled', (e) => {
      if (window.MapManager) MapManager.setEditingMode(e.enabled);
      
      const btnAdd = document.getElementById('btnDigiAdd');
      const btnCancel = document.getElementById('btnDigiCancelDraw');
      if (e.enabled) {
         if (btnAdd) btnAdd.classList.add('hidden');
         if (btnCancel) btnCancel.classList.remove('hidden');
      } else {
         if (btnAdd) btnAdd.classList.remove('hidden');
         if (btnCancel) btnCancel.classList.add('hidden');
      }
    });
    // pm:globaleditmodetoggled: langsung fire saat tombol edit vertex di toolbar diklik
    map.on('pm:globaleditmodetoggled', (e) => {
      if (window.MapManager) MapManager.setEditingMode(e.enabled);
    });

    map.on('pm:create', async (e) => {
      // Mode draw sudah selesai, hover akan aktif kembali setelah selesai proses
      const layer = e.layer;
      const geojson = layer.toGeoJSON().geometry;

      const activeKec = (window._appState && window._appState.selectedKecamatan) || '';
      let kecamatanInput = prompt('Konfirmasi Nama Kecamatan untuk poligon baru ini:', activeKec);
      
      if (!kecamatanInput) {
        if (window.MapManager) MapManager.setEditingMode(false);
        map.removeLayer(layer);
        return;
      }
      
      const kecamatan = kecamatanInput.trim();
      console.log('[Geoman] Menambah poligon baru:', { kecamatan, activeKec, geojson });


      try {
        const result = await createSawah(kecamatan, 0, geojson);
        alert(`Poligon berhasil ditambahkan (ID: ${result.ogc_fid})!\nLuas dihitung otomatis oleh server.`);
        map.removeLayer(layer);
        if (window.MapManager) MapManager.setEditingMode(false);
        
        // Pastikan dropdown state terupdate jika menggambar di kecamatan lain
        if (window._appState) {
          window._appState.selectedKecamatan = kecamatan;
          const dd = document.getElementById('filterKecamatan');
          if (dd) dd.value = kecamatan;
        }

        if (window._reloadSawahLayer) window._reloadSawahLayer();
      } catch (err) {
        if (window.MapManager) MapManager.setEditingMode(false);
        alert('Gagal menyimpan: ' + err.message);
        map.removeLayer(layer);
      }
    });
  }

  function enableEditModeForLayer(layer, ogcFid) {
    if (window._editingLayer) {
      window._editingLayer.pm.disable();
    }
    window._editingLayer = layer;
    window._editingOgcFid = ogcFid;

    // Nonaktifkan hover tooltip selama mode edit
    if (window.MapManager) MapManager.setEditingMode(true);

    // Kunci map dragging agar tidak bergeser
    const map = window._map || (window.MapManager && window.MapManager.getMap());
    if (map) map.dragging.disable();

    layer.pm.enable({ allowSelfIntersection: false });
    // Tampilkan tombol "Selesai Edit"
    const btnFinish = document.getElementById('btnDigiFinishEdit');
    if (btnFinish) btnFinish.classList.remove('hidden');
  }

  function enableEditMode(map) {
    alert("Untuk mengedit bentuk poligon, silakan klik poligon di peta lalu pilih tombol 'Edit Geometri' di dalam kotak informasi (popup).");
  }

  async function saveAllEdits() {
    if (!window._editingLayer || !window._editingOgcFid) return;

    const geojson = window._editingLayer.toGeoJSON().geometry;
    console.log('[Geoman] Menyimpan update geometri untuk OGC FID:', window._editingOgcFid);
    console.log('[Geoman] Geometry data:', geojson);
    console.log('[Geoman] Coordinate length:', geojson.coordinates[0].length);
    
    try {
      const result = await updateSawahGeometry(window._editingOgcFid, geojson);
      console.log('[Admin] Save result:', result);
      alert(`Geometri poligon berhasil diperbarui!`);
      
      window._editingLayer.pm.disable();
      window._editingLayer = null;
      window._editingOgcFid = null;
      const btnFinish = document.getElementById('btnDigiFinishEdit');
      if (btnFinish) btnFinish.classList.add('hidden');
      
      // Aktifkan kembali hover tooltip
      if (window.MapManager) MapManager.setEditingMode(false);

      // Buka kunci dragging map
      const map = window._map || (window.MapManager && window.MapManager.getMap());
      if (map) map.dragging.enable();

      if (window._reloadSawahLayer) window._reloadSawahLayer();
    } catch (e) {
      console.error('[Admin] Error saat menyimpan:', e);
      alert('Gagal menyimpan: ' + e.message);
    }
  }

  function cancelAllEdits() {
    if (window._editingLayer) {
      window._editingLayer.pm.disable();
      window._editingLayer = null;
      window._editingOgcFid = null;
    }
    
    // Aktifkan kembali hover tooltip
    if (window.MapManager) MapManager.setEditingMode(false);

    // Buka kunci dragging map
    const map = window._map || (window.MapManager && window.MapManager.getMap());
    if (map) map.dragging.enable();

    const btnFinish = document.getElementById('btnDigiFinishEdit');
    if (btnFinish) btnFinish.classList.add('hidden');

    if (window._reloadSawahLayer) window._reloadSawahLayer();
  }

  function enableRemoveMode(map) {
    if (!window._sawahLayerRef) {
      alert('Tampilkan poligon sawah terlebih dahulu.');
      return;
    }

    if (!window._removeListenerAttached) {
      map.on('pm:remove', async (e) => {
        const ogcFid = e.layer.feature?.properties?.ogc_fid;
        if (!ogcFid) return;
        try {
          await deleteSawah(ogcFid);
          // WAJIB panggil reload agar poligon hilang sepenuhnya & KPI update
          if (window._reloadSawahLayer) window._reloadSawahLayer();
        } catch (err) {
          alert('Gagal hapus di server: ' + err.message);
          // Jika gagal hapus, render ulang untuk mengembalikan poligon yang dihapus Geoman
          if (window._reloadSawahLayer) window._reloadSawahLayer();
        }
      });
      window._removeListenerAttached = true;
    }

    map.pm.enableGlobalRemovalMode();
  }

  // Handle auto-save dari map.js
  async function handlePolygonUpdate(ogcFid, geojson) {
    console.log('[Geoman] Auto-saving geometri untuk OGC FID:', ogcFid);
    try {
      await updateSawahGeometry(ogcFid, geojson);
      console.log(`[Admin] Berhasil menyimpan OGC FID ${ogcFid}`);
      if (window._reloadSawahLayer) window._reloadSawahLayer();
    } catch (e) {
      console.error('[Admin] Error auto-save:', e);
      alert('Gagal menyimpan otomatis: ' + e.message);
    }
  }

  let _previousBasemap = null;
  let _digitasiModeActive = false;

  function isDigitasiModeActive() {
    return _digitasiModeActive;
  }

  function enterDigitasiMode(map) {
    if (!window._sawahLayerRef) {
      alert("Silakan pilih kecamatan dan tampilkan layer Polygon Lahan Sawah terlebih dahulu!");
      return;
    }

    _digitasiModeActive = true;
    document.getElementById('digitasiToolbar').classList.remove('hidden');

    if (window.MapManager) {
      _previousBasemap = window.MapManager.getCurrentBasemap ? window.MapManager.getCurrentBasemap() : 'satelit';
      window.MapManager.setBasemap('satelit');
    }

    const fsBtn = document.getElementById('btnFullscreenMap');
    if (fsBtn && !document.querySelector('.map-container-wrapper').classList.contains('fullscreen-mode')) {
      fsBtn.click();
    }
  }

  function exitDigitasiMode(map) {
    _digitasiModeActive = false;
    if (!map) map = window._map || (window.MapManager && window.MapManager.getMap());
    if (map && map.pm) {
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalRemovalMode();
    }
    
    cancelAllEdits();

    document.getElementById('digitasiToolbar').classList.add('hidden');

    if (window.MapManager && _previousBasemap) {
      window.MapManager.setBasemap(_previousBasemap);
    }

    const fsBtn = document.getElementById('btnFullscreenMap');
    if (fsBtn && document.querySelector('.map-container-wrapper').classList.contains('fullscreen-mode')) {
      fsBtn.click();
    }

    if (window.MapManager) MapManager.setEditingMode(false);
  }

  return {
    openDownloadModal, handleDownload, handleDownloadNdvi, handleDownloadRanking, handleDownloadExcel,
    switchDownloadTab,
    importCSV,
    deleteSawah, updateSawahGeometry, createSawah,
    openModal, closeModal,
    handleUploadClick, handleUploadSubmit,
    initGeoman, enableEditMode, enableEditModeForLayer, saveAllEdits, cancelAllEdits, enableRemoveMode,
    handlePolygonUpdate, enterDigitasiMode, exitDigitasiMode, isDigitasiModeActive
  };
})();

window.Admin = Admin;
