/**
 * admin.js
 * Modul fitur admin: Unduh/Upload CSV, Kelola Akun, Edit Poligon (Geoman).
 */

const Admin = (() => {
  const API = 'http://localhost:8000/api';

  // ══════════════════════════════════════════════════════
  // UNDUH CSV (NDVI per Kecamatan)
  // ══════════════════════════════════════════════════════
  function openDownloadModal() {
    openModal('modalDownload');
    // Populate tahun dropdown dari filter yang sudah ada
    const src = document.getElementById('filterTahun');
    const dst = document.getElementById('downloadTahun');
    if (src && dst) {
      dst.innerHTML = '<option value="">Semua Tahun</option>';
      Array.from(src.options).forEach(opt => {
        if (opt.value) dst.insertAdjacentHTML('beforeend', `<option value="${opt.value}">${opt.textContent}</option>`);
      });
    }
  }

  async function handleDownload() {
    const tahun = document.getElementById('downloadTahun').value;
    const q = tahun ? `?tahun=${tahun}` : '';
    try {
      const res = await fetch(`${API}/admin/ndvi/export-csv${q}`, {
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      });
      if (!res.ok) throw new Error('Gagal mengunduh');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tahun ? `ndvi_karawang_${tahun}.csv` : 'ndvi_karawang_semua.csv';
      a.click();
      URL.revokeObjectURL(url);
      closeModal('modalDownload');
    } catch (e) {
      alert('Gagal mengunduh: ' + e.message);
    }
  }

  // ══════════════════════════════════════════════════════
  // UPLOAD CSV
  // ══════════════════════════════════════════════════════
  async function importCSV(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/admin/batas/import-csv`, {
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal hapus poligon');
    return data;
  }

  async function updateSawahGeometry(ogcFid, geojsonGeometry) {
    const res = await fetch(`${API}/admin/sawah/${ogcFid}`, {
      method: 'PUT', headers: Auth.authHeaders(),
      body: JSON.stringify({ geojson_geometry: geojsonGeometry }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal update geometri');
    return data;
  }

  async function createSawah(kecamatan, luasHa, geojsonGeometry) {
    const res = await fetch(`${API}/admin/sawah`, {
      method: 'POST', headers: Auth.authHeaders(),
      body: JSON.stringify({ kecamatan, luas_ha: luasHa, geojson_geometry: geojsonGeometry }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal tambah poligon');
    return data;
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
      alert('Peringatan: Ukuran file melebihi 50 MB. Silakan pecah koordinat batas wilayah Anda (split).');
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
  // LEAFLET-GEOMAN INTEGRATION (QGIS-like editing)
  // ══════════════════════════════════════════════════════

  /**
   * Inisialisasi Leaflet-Geoman pada peta.
   * Toolbar draw/edit/delete muncul di peta persis seperti QGIS.
   */
  function initGeoman(map) {
    // Tambahkan toolbar Geoman ke peta
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

    // Styling default untuk poligon baru
    map.pm.setGlobalOptions({
      pathOptions: {
        color: '#dc2626',
        fillColor: '#dc2626',
        fillOpacity: 0.2,
        weight: 2,
      },
    });

    // ── Event: Selesai gambar poligon baru ──
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

  /**
   * Aktifkan mode edit pada SATU poligon spesifik.
   */
  function enableEditModeForLayer(layer, ogcFid) {
    if (window._editingLayer) {
      window._editingLayer.pm.disable();
    }
    window._editingLayer = layer;
    window._editingOgcFid = ogcFid;

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
      
      // Clean up
      window._editingLayer.pm.disable();
      window._editingLayer = null;
      window._editingOgcFid = null;
      document.getElementById('geomanEditBar').classList.add('hidden');
      
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
    document.getElementById('geomanEditBar').classList.add('hidden');
    
    const panel = document.getElementById('fullDashboardPanels');
    if (panel) panel.classList.remove('hidden');

    if (window._reloadSawahLayer) window._reloadSawahLayer();
  }

  /**
   * Aktifkan mode hapus — klik poligon untuk menghapus.
   */
  function enableRemoveMode(map) {
    if (!window._sawahLayerRef) {
      alert('Tampilkan poligon sawah terlebih dahulu.');
      return;
    }

    // Pasang listener remove sekali
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

    // Toggle remove mode
    map.pm.enableGlobalRemovalMode();
  }

  return {
    openDownloadModal, handleDownload,
    importCSV, loadUsers, addUser, deleteUser,
    deleteSawah, updateSawahGeometry, createSawah,
    openModal, closeModal,
    renderUserModal, handleDeleteUser, handleAddUser,
    handleUploadClick, handleUploadSubmit,
    initGeoman, enableEditMode, enableEditModeForLayer, saveAllEdits, cancelAllEdits, enableRemoveMode,
  };
})();

window.Admin = Admin;
