/**
 * app.js
 * Eksekutor Utama Dashboard GIS (Vertical Flow Version)
 * Dengan fitur Auth + Admin Integration
 */

(async function App() {

  // Tidak ada login gate — dashboard bersifat publik
  // Fitur admin hanya aktif saat login sebagai admin

  const state = {
    filters: { tahun: null, bulan: null, kecamatan: null },
    activeLayer: 'kecamatan',
    displayMode: 'outline',
    opacity: 0.75,
    selectedKecamatan: null,
    batasData: null,
    sawahLoadedFor: null,
  };
  window._appState = state;
  let _sawahAbortController = null;
  let _sawahLoadInProgress = false;

  // ══════════════════════════════════════════════════════
  // UI CONTROLLER
  // ══════════════════════════════════════════════════════
  function setStatus(text, type = 'ok') {
    document.getElementById('statusText').textContent = text;
    document.getElementById('statusDot').className = 'status-dot ' + type;
  }

  function setMapLoader(show, text = 'Memuat...') {
    const loader = document.getElementById('mapLoader');
    if (show) {
      document.getElementById('mapLoaderText').textContent = text;
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }

  function fillKpiVal(id, val) {
    document.getElementById(id).innerHTML = val;
  }

  // ══════════════════════════════════════════════════════
  // SETUP USER INFO & ADMIN TOOLBAR
  // ══════════════════════════════════════════════════════
  function setupUserUI() {
    const user = Auth.getUser();
    const isAdmin = Auth.isAdmin();

    // Elemen UI
    const btnAdminLogin  = document.getElementById('btnAdminLogin');
    const userDisplayName = document.getElementById('userDisplayName');
    const btnLogout      = document.getElementById('btnLogout');

    if (isAdmin && user) {
      // ── Mode Admin: sembunyikan tombol login, tampilkan nama + logout ──
      if (btnAdminLogin)   btnAdminLogin.style.display  = 'none';
      if (userDisplayName) { userDisplayName.style.display = 'inline'; userDisplayName.textContent = `${user.username} (${user.role})`; }
      if (btnLogout)       { btnLogout.style.display = 'inline-flex'; btnLogout.addEventListener('click', () => { if (confirm('Yakin ingin keluar?')) Auth.logout(); }); }

      // Admin toolbar
      document.getElementById('adminToolbar').classList.remove('hidden');
      document.getElementById('btnDownloadCsv').addEventListener('click', () => Admin.openDownloadModal());
      document.getElementById('btnUploadCsv').addEventListener('click',   () => Admin.handleUploadClick());
      document.getElementById('btnManageUsers').addEventListener('click',  () => Admin.renderUserModal());
      document.getElementById('btnEditPolygon').addEventListener('click',  () => Admin.enableEditMode(MapManager.getMap()));
      document.getElementById('btnDeletePolygon').addEventListener('click',() => Admin.enableRemoveMode(MapManager.getMap()));
      Admin.initGeoman(MapManager.getMap());

      // Sembunyikan tombol download publik di atas, karena admin sudah ada tombol di toolbar
      const btnPublicDownload = document.getElementById('btnPublicDownload');
      if (btnPublicDownload) btnPublicDownload.style.display = 'none';
    } else {
      // ── Mode Publik: tampilkan tombol Login Admin, sembunyikan logout ──
      if (btnAdminLogin)   btnAdminLogin.style.display   = 'inline-flex';
      if (userDisplayName) userDisplayName.style.display = 'none';
      if (btnLogout)       btnLogout.style.display       = 'none';
    }

    // Tombol download publik (tampil untuk semua non-admin)
    const btnPublicDownload = document.getElementById('btnPublicDownload');
    if (btnPublicDownload && !(isAdmin && user)) {
      btnPublicDownload.addEventListener('click', () => Admin.openDownloadModal());
    }
  }
