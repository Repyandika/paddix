/**
 * admin.js
 * Modul fitur admin: Unduh/Upload Data, Kelola Akun, Edit Poligon (Geoman).
 */

const Admin = (() => {
  const API = 'http://localhost:8000/api';

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
    try {
      const res = await fetch(`${API}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Download error:', res.status, errText);
        throw new Error(`Server menolak (${res.status}). Pastikan Anda login sebagai admin dan server sudah di-restart.`);
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

  // ── Download 2: Ranking Risiko (CSV) ──
  function handleDownloadRanking() {
    const tahun = document.getElementById('downloadTahun')?.value || '';
    const q = tahun ? `?tahun=${tahun}` : '';
    _fetchAndDownload(`/admin/ranking/export-csv${q}`, `ranking_risiko_${tahun || 'semua'}.csv`);
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
  // KELOLA AKUN
  // ══════════════════════════════════════════════════════
  async function loadUsers() {
    const res = await fetch(`${API}/auth/users`, { headers: Auth.authHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  async function addUser(username, password, role) {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: Auth.authHeaders(),
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal tambah user');
    return data;
  }

  async function deleteUser(userId) {
    const res = await fetch(`${API}/auth/users/${userId}`, {
      method: 'DELETE', headers: Auth.authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal hapus user');
    return data;
  }

  // ══════════════════════════════════════════════════════
  // CRUD POLIGON SAWAH
  // ══════════════════════════════════════════════════════
  async function deleteSawah(ogcFid) {
    const res = await fetch(`${API}/admin/sawah/${ogcFid}`, {
      method: 'DELETE', headers: Auth.authHeaders(),
    });
    if (!res.ok) {
      let errTxt = 'Gagal hapus poligon (' + res.status + ')';
      try { const data = await res.json(); errTxt = data.detail || errTxt; } catch(e){}
      throw new Error(errTxt);
    }
    return res.json();
  }

  async function updateSawahGeometry(ogcFid, geojsonGeometry) {
    const res = await fetch(`${API}/admin/sawah/${ogcFid}`, {
      method: 'PUT', headers: Auth.authHeaders(),
      body: JSON.stringify({ geojson_geometry: geojsonGeometry }),
    });
    if (!res.ok) {
      let errTxt = 'Gagal update geometri (' + res.status + ')';
      try { const data = await res.json(); errTxt = data.detail || errTxt; } catch(e){}
      throw new Error(errTxt);
    }
    return res.json();
  }

  async function createSawah(kecamatan, luasHa, geojsonGeometry) {
    const res = await fetch(`${API}/admin/sawah`, {
      method: 'POST', headers: Auth.authHeaders(),
      body: JSON.stringify({ kecamatan, luas_ha: luasHa, geojson_geometry: geojsonGeometry }),
    });
    if (!res.ok) {
      let errTxt = 'Gagal tambah poligon (' + res.status + ')';
      try { const data = await res.json(); errTxt = data.detail || errTxt; } catch(e){}
      throw new Error(errTxt);
    }
    return res.json();
  }

  // ══════════════════════════════════════════════════════
  // RENDER MODALS
  // ══════════════════════════════════════════════════════
  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  async function renderUserModal() {
    openModal('modalUsers');
    const listEl = document.getElementById('userListBody');
    listEl.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8">Memuat...</td></tr>';
    try {
      const users = await loadUsers();
      if (!users.length) { listEl.innerHTML = '<tr><td colspan="4" style="text-align:center">Tidak ada user.</td></tr>'; return; }
      listEl.innerHTML = users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td><strong>${u.username}</strong></td>
          <td><span class="role-badge role-${u.role}">${u.role}</span></td>
          <td><button class="btn-danger-sm" onclick="Admin.handleDeleteUser(${u.id}, '${u.username}')">Hapus</button></td>
        </tr>
      `).join('');
    } catch (e) {
      listEl.innerHTML = `<tr><td colspan="4" style="color:#dc2626">${e.message}</td></tr>`;
    }
  }

  async function handleDeleteUser(userId, username) {
    if (!confirm(`Yakin ingin menghapus user "${username}"?`)) return;
    try { await deleteUser(userId); renderUserModal(); } catch (e) { alert(e.message); }
  }

  async function handleAddUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    if (!username || !password) { alert('Username dan password wajib diisi'); return; }
    try {
      await addUser(username, password, role);
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      renderUserModal();
    } catch (e) { alert(e.message); }
  }

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
      if (window._reloadSawahLayer) window._reloadSawahLayer();
    }
  }

  // ══════════════════════════════════════════════════════
  // LEAFLET-GEOMAN INTEGRATION
  // ══════════════════════════════════════════════════════

  function initGeoman(map) {
    map.pm.addControls({
      position: 'topleft',
      drawCircle: false,
      drawCircleMarker: false,
      drawMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });

    map.pm.setGlobalOptions({
      pathOptions: {
        color: '#dc2626',
        fillColor: '#dc2626',
        fillOpacity: 0.2,
        weight: 2,
      },
    });

    map.on('pm:create', async (e) => {
      const layer = e.layer;
      const geojson = layer.toGeoJSON().geometry;

      const kecamatan = prompt('Nama Kecamatan untuk poligon baru ini:');
      if (!kecamatan) {
        map.removeLayer(layer);
        return;
      }

      try {
        const result = await createSawah(kecamatan, 0, geojson);
        alert(`Poligon berhasil ditambahkan (ID: ${result.ogc_fid})!\nLuas dihitung otomatis oleh server.`);
        map.removeLayer(layer);
        if (window._reloadSawahLayer) window._reloadSawahLayer();
      } catch (err) {
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

    // Kunci map dragging agar tidak bergeser
    const map = window._map || (window.MapManager && window.MapManager.getMap());
    if (map) map.dragging.disable();

    layer.pm.enable({ allowSelfIntersection: false });
    document.getElementById('geomanEditBar').classList.remove('hidden');
    
    const panel = document.getElementById('fullDashboardPanels');
    if (panel) panel.classList.add('hidden');
  }

  function enableEditMode(map) {
    alert("Untuk mengedit bentuk poligon, silakan klik poligon di peta lalu pilih tombol 'Edit Geometri' di dalam kotak informasi (popup).");
  }

  async function saveAllEdits() {
    if (!window._editingLayer || !window._editingOgcFid) return;

    const geojson = window._editingLayer.toGeoJSON().geometry;
    try {
      await updateSawahGeometry(window._editingOgcFid, geojson);
      alert(`Geometri poligon berhasil diperbarui!`);
      
      window._editingLayer.pm.disable();
      window._editingLayer = null;
      window._editingOgcFid = null;
      document.getElementById('geomanEditBar').classList.add('hidden');
      
      // Buka kunci dragging map
      const map = window._map || (window.MapManager && window.MapManager.getMap());
      if (map) map.dragging.enable();

      const panel = document.getElementById('fullDashboardPanels');
      if (panel) panel.classList.remove('hidden');

      if (window._reloadSawahLayer) window._reloadSawahLayer();
    } catch (e) {
      alert('Gagal menyimpan: ' + e.message);
    }
  }

  function cancelAllEdits() {
    if (window._editingLayer) {
      window._editingLayer.pm.disable();
      window._editingLayer = null;
      window._editingOgcFid = null;
    }
    
    // Buka kunci dragging map
    const map = window._map || (window.MapManager && window.MapManager.getMap());
    if (map) map.dragging.enable();

    document.getElementById('geomanEditBar').classList.add('hidden');
    
    const panel = document.getElementById('fullDashboardPanels');
    if (panel) panel.classList.remove('hidden');

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
        } catch (err) {
          alert('Gagal hapus di server: ' + err.message);
        }
      });
      window._removeListenerAttached = true;
    }

    map.pm.enableGlobalRemovalMode();
  }

  return {
    openDownloadModal, handleDownload, handleDownloadNdvi, handleDownloadRanking, handleDownloadExcel,
    switchDownloadTab,
    importCSV, loadUsers, addUser, deleteUser,
    deleteSawah, updateSawahGeometry, createSawah,
    openModal, closeModal,
    renderUserModal, handleDeleteUser, handleAddUser,
    handleUploadClick, handleUploadSubmit,
    initGeoman, enableEditMode, enableEditModeForLayer, saveAllEdits, cancelAllEdits, enableRemoveMode,
  };
})();

window.Admin = Admin;
