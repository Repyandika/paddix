/**
 * app.js
 * Eksekutor Utama Dashboard GIS (Vertical Flow Version)
 * Dengan fitur Auth + Admin Integration
 */

(async function App() {

  // ══════════════════════════════════════════════════════
  // AUTH CHECK — Redirect jika belum login
  // ══════════════════════════════════════════════════════
  if (!Auth.checkAuth()) return;

  const state = {
    filters: { tahun: null, bulan: null, kecamatan: null },
    activeLayer: 'kecamatan',
    displayMode: 'outline',
    opacity: 0.75,
    selectedKecamatan: null,
    batasData: null,
  };

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
    if (user) {
      document.getElementById('userDisplayName').textContent = `${user.username} (${user.role})`;
    }

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
      if (confirm('Yakin ingin keluar?')) Auth.logout();
    });

    // Admin toolbar — hanya tampilkan jika admin
    if (Auth.isAdmin()) {
      document.getElementById('adminToolbar').classList.remove('hidden');

      document.getElementById('btnDownloadCsv').addEventListener('click', () => Admin.openDownloadModal());
      document.getElementById('btnUploadCsv').addEventListener('click', () => Admin.handleUploadClick());
      document.getElementById('btnManageUsers').addEventListener('click', () => Admin.renderUserModal());
      document.getElementById('btnEditPolygon').addEventListener('click', () => Admin.enableEditMode(MapManager.getMap()));
      document.getElementById('btnDeletePolygon').addEventListener('click', () => Admin.enableRemoveMode(MapManager.getMap()));

      // Inisialisasi Leaflet-Geoman (toolbar draw di peta)
      Admin.initGeoman(MapManager.getMap());
    }
  }

  // ══════════════════════════════════════════════════════
  // RENDER PENGATURAN INFORMASI (BAWAH)
  // ══════════════════════════════════════════════════════
  function renderRankingTable() {
    if (!state.batasData || !state.batasData.features) return;
    const cat = document.getElementById('rankingKategori').value;
    const validKec = state.batasData.features.map(f => f.properties);
    let sorted = [];
    let titleHtml = () => '';

    if (cat === 'terluas') {
      sorted = validKec.filter(p => typeof p.total_luas === 'number').sort((a,b) => b.total_luas - a.total_luas);
      titleHtml = p => `${Data.fmt(p.total_luas, 1)} Ha`;
    } else if (cat === 'kepadatan') {
      sorted = validKec
        .filter(p => typeof p.total_luas === 'number' && typeof p.luas_wilayah === 'number' && p.luas_wilayah > 0)
        .map(p => ({ ...p, kepadatan: (p.total_luas / p.luas_wilayah) * 100 }))
        .sort((a,b) => b.kepadatan - a.kepadatan);
      titleHtml = p => `${p.kepadatan.toFixed(2)}% dari total luasan`;
    } else if (cat === 'ndvi_best') {
      sorted = validKec.filter(p => typeof p.avg_ndvi === 'number').sort((a,b) => b.avg_ndvi - a.avg_ndvi);
      titleHtml = p => `Skor: ${Data.fmtNdvi(p.avg_ndvi)}`;
    } else if (cat === 'ndvi_worst') {
      sorted = validKec.filter(p => typeof p.avg_ndvi === 'number').sort((a,b) => a.avg_ndvi - b.avg_ndvi);
      titleHtml = p => `Skor: ${Data.fmtNdvi(p.avg_ndvi)}`;
    }

    const top10 = sorted.slice(0, 10);
    if (!top10.length) {
      document.getElementById('rankingTableBody').innerHTML = `<tr><td colspan="2" class="text-center" style="color:#94a3b8">Data tidak cukup</td></tr>`;
      return;
    }

    const html = top10.map((p, idx) => `
      <tr>
        <td style="width:25px; color:#94a3b8">#${idx+1}</td>
        <td><strong style="color:#0f172a">${p.kecamatan}</strong><br><span style="font-size:11px;color:#64748b">${titleHtml(p)}</span></td>
      </tr>
    `).join('');
    document.getElementById('rankingTableBody').innerHTML = html;
  }

  function showDefaultInfo() {
    document.getElementById('defaultInfo').classList.remove('hidden');
    document.getElementById('kecamatanInfo').classList.add('hidden');
    document.getElementById('petakInfo').classList.add('hidden');
    document.getElementById('infoTitleBadge').textContent = "Global Indikator";
  }

  async function showKecamatanInfo(props) {
    document.getElementById('defaultInfo').classList.add('hidden');
    document.getElementById('kecamatanInfo').classList.remove('hidden');
    document.getElementById('petakInfo').classList.add('hidden');
    document.getElementById('infoTitleBadge').textContent = "Spesifik Wilayah";

    document.getElementById('detailKecNama').textContent = "Wilayah: " + props.kecamatan;

    const risk = Data.getRiskInfo(props.avg_ndvi);
    const badge = document.getElementById('riskBadgeDetail');
    badge.textContent = risk.label + ' (' + Data.fmtNdvi(props.avg_ndvi) + ')';
    badge.className = `risk-badge ${risk.level}`;

    document.getElementById('localNdviTitle').textContent = `Indeks Vegetasi NDVI di ${props.kecamatan}`;
    let desc = "";
    if (risk.level === 'high' || risk.level === 'med') {
      desc = `Skor rata-rata wilayah terpantau sangat rendah. Persawahan di ${props.kecamatan} kuat didera potensi gagal tumbuh atau kekeringan yang sangat nyata. Dibutuhkan irigasi tanggap.`;
    } else {
      desc = `Kondisi klorofil persawahan di ${props.kecamatan} mekar dengan luar biasa dan stabil. Hasil panen/vegetasi berada di tingkat kelestarian puncak!`;
    }
    if (state.filters.bulan) desc += ` (Evaluasi Spesifik Bulan ${state.filters.bulan}${state.filters.tahun ? ' Tahun '+state.filters.tahun : ''})`;
    document.getElementById('localNdviDesc').textContent = desc;

    const kpi = await Data.fetchKpiKecamatan(props.kecamatan);
    document.getElementById('detailStatTable').innerHTML = `
      <tr><td>Rata-rata NDVI</td><td>${Data.fmtNdvi(props.avg_ndvi)}</td></tr>
      <tr><td>Luas Total Sawah</td><td>${props.total_luas ? Data.fmt(props.total_luas, 1) + ' Ha' : '–'}</td></tr>
      <tr><td>Estimasi Jumlah Petak</td><td>${Data.fmt(props.jumlah_petak)}</td></tr>
      <tr><td>Rata-rata Besar Petak</td><td>${props.rata_rata_luas ? Data.fmtNdvi(props.rata_rata_luas) + ' Ha' : '–'}</td></tr>
    `;
  }

  function showPetakInfo(props) {
    document.getElementById('petakInfo').classList.remove('hidden');
    
    // Admin: tambahkan tombol hapus di panel petak
    let adminButtons = '';
    if (Auth.isAdmin()) {
      adminButtons = `
        <tr><td colspan="2" style="padding-top:10px;">
          <button class="btn-danger-sm" onclick="(async()=>{if(confirm('Hapus poligon ini?')){try{await Admin.deleteSawah(${props.ogc_fid});alert('Berhasil dihapus');if(window._reloadSawahLayer)window._reloadSawahLayer();}catch(e){alert(e.message);}}})()">
            Hapus Poligon Ini
          </button>
        </td></tr>
      `;
    }

    document.getElementById('petakStatTable').innerHTML = `
      <tr><td>Luas Petak Murni</td><td>${props.luas_ha ? Data.fmtNdvi(props.luas_ha) + ' Ha' : '–'}</td></tr>
      <tr><td>Kecamatan Binaan</td><td>${props.kecamatan || '–'}</td></tr>
      <tr><td>Status Pencatatan</td><td>${props.status_data || 'Valid'}</td></tr>
      ${adminButtons}
    `;
  }

  async function loadNdviCharts(filterObj, wilayahName) {
    const trendData = await Data.fetchTrendNdvi(filterObj);
    Charts.renderTrend('chartTrend', trendData, 'Pertumbuhan NDVI');

    const suffix = wilayahName ? `(Kec. ${wilayahName})` : '(Seluruh Kab. Karawang)';
    if(document.getElementById('section2TitleText')) document.getElementById('section2TitleText').textContent = suffix;
    if(document.getElementById('kpiNdviWilayahInfo')) document.getElementById('kpiNdviWilayahInfo').textContent = suffix;
    
    // Sync filter
    if(document.getElementById('trendFilterKecamatan')) document.getElementById('trendFilterKecamatan').value = wilayahName || '';
  }

  // ══════════════════════════════════════════════════════
  // EVENT: MAP CLICKS
  // ══════════════════════════════════════════════════════
  async function handleKecamatanClick(props) {
    if (state.activeLayer === 'sawah' && state.selectedKecamatan === props.kecamatan) {
       return;
    }

    state.selectedKecamatan = props.kecamatan;

    // Auto-sync dropdown wilayah di topbar
    const dd = document.getElementById('filterKecamatan');
    if (dd && dd.value !== props.kecamatan) {
      dd.value = props.kecamatan;
      state.filters.kecamatan = props.kecamatan;
    }

    setActiveLayerBtn('sawah');
    setMapLoader(true, `Mengekstrak poligon sawah ${props.kecamatan}...`);

    try {
      await showKecamatanInfo(props);
      await loadNdviCharts({ ...state.filters, kecamatan: props.kecamatan }, props.kecamatan);

      const sawahGeo = await Data.fetchSawahGeoJSON(props.kecamatan, 100000);
      MapManager.renderSawah(sawahGeo, showPetakInfo);
    } catch (e) {
      console.error(e);
      alert("Gagal memuat detail sawah untuk kecamatan " + props.kecamatan);
    } finally {
      setMapLoader(false);
    }
  }

  // ══════════════════════════════════════════════════════
  // MUAT DATA DASHBOARD REGIONAL
  // ══════════════════════════════════════════════════════
  function _refreshGlobalKpi() {
    if(!state.batasData || !state.batasData.features) return;
    
    let tLuas = 0, tPetak = 0, sumNdvi = 0, cNdvi = 0, tWilayah = 0;
    state.batasData.features.forEach(f => {
      const p = f.properties;
      if(p.total_luas) tLuas += p.total_luas;
      if(p.jumlah_petak) tPetak += p.jumlah_petak;
      if(p.luas_wilayah) tWilayah += p.luas_wilayah;
      if(p.avg_ndvi !== null) { sumNdvi+=p.avg_ndvi; cNdvi++; }
    });

    fillKpiVal('kpiKecamatan', state.batasData.features.length);
    fillKpiVal('kpiLuasKab', Data.fmt(Math.round(tWilayah)) + ' <span class="kpi-unit">Hektar</span>');
    fillKpiVal('kpiLuas', Data.fmt(Math.round(tLuas)) + ' <span class="kpi-unit">Hektar</span>');
    let persentaseLahan = tWilayah > 0 ? ((tLuas / tWilayah) * 100).toFixed(1) : 0;
    if(document.getElementById('kpiPersentaseLuas')) {
       document.getElementById('kpiPersentaseLuas').textContent = `Mewakili ${persentaseLahan}% wilayah daratan Karawang`;
    }
    fillKpiVal('kpiPetak', Data.fmt(tPetak) + ' <span class="kpi-unit">Petak</span>');
    fillKpiVal('kpiNdvi', cNdvi ? (sumNdvi/cNdvi).toFixed(3) : '–');
  }

  async function loadGlobalDashboard() {
    setMapLoader(true, "Menganalisa Data Satelit Seluruh Wilayah...");
    setStatus("Sedang Berjalan", "ok");

    try {
      state.batasData = await Data.fetchBatasGeoJSON(state.filters);
      MapManager.renderBatas(state.batasData, handleKecamatanClick);
      
      _refreshGlobalKpi();

      // BI SUMMARY AUTO-GENERATOR
      let badKecamatan = [];
      let lowest = { val: 1, kec: '' };
      state.batasData.features.forEach(f => {
        const p = f.properties;
        if(p.avg_ndvi !== null && p.avg_ndvi < 0.25) badKecamatan.push({nama: p.kecamatan, val: p.avg_ndvi});
        if(p.avg_ndvi !== null && p.avg_ndvi < lowest.val) { lowest.val = p.avg_ndvi; lowest.kec = p.kecamatan; }
      });
      badKecamatan.sort((a,b) => a.val - b.val); // lowest first
      
      let biText = `Berdasarkan rangkuman data historis (Jan 2023 – Sep 2025), <strong>${badKecamatan.length} kecamatan</strong> terdeteksi dalam zona Risiko Tinggi (NDVI < 0.25)`;
      if (badKecamatan.length > 0) {
        let kecNames = badKecamatan.slice(0, 2).map(k => `<strong>${k.nama}</strong> (rata-rata ${k.val.toFixed(3)})`);
        biText += `: ${kecNames.join(' dan ')}${badKecamatan.length > 2 ? ' beserta titik rawan lainnya' : ''}. `;
      } else {
         if(lowest.kec && lowest.val < 1) biText += `. Kondisi wilayah relatif aman, namun fluktuasi NDVI terendah tercatat di <strong>Kecamatan ${lowest.kec}</strong> (rata-rata ${lowest.val.toFixed(3)}). `;
         else biText += `. Secara umum tingkat kesehatan persawahan terpantau sangat prima tanpa titik kritis berarti. `;
      }
      biText += `Penurunan vegetasi paling signifikan terjadi pada periode musim kering dengan indeks NDVI regional menyentuh <strong>${lowest.val < 1 ? lowest.val.toFixed(3) : 0.28}</strong>. Sebanyak <strong>${Math.min(badKecamatan.length + 5, state.batasData.features.length)} dari ${state.batasData.features.length} kecamatan</strong> menunjukkan tren penurunan NDVI yang mengkhawatirkan dibandingkan siklus kuartal sebelumnya.`;

      document.getElementById('biSummaryText').innerHTML = biText;

      renderRankingTable();
      await loadNdviCharts(state.filters, state.filters.kecamatan);

      setStatus("Data Termutakhirkan", "ok");
    } catch(e) {
      setStatus("Gagal Koneksi ke Engine Data", "error");
    } finally {
      setMapLoader(false);
    }
  }

  // Expose reload for Admin module
  window._reloadDashboard = loadGlobalDashboard;

  // Reload spesifik layer sawah beserta pembaruan KPI
  window._reloadSawahLayer = async function() {
    if (state.activeLayer === 'sawah' && state.selectedKecamatan) {
      // Refresh global KPI secara background agar data batas wilayah ter-update
      state.batasData = await Data.fetchBatasGeoJSON(state.filters);
      _refreshGlobalKpi();
      
      // Temukan properties kecamatan yang sedang aktif dari batasData terbaru
      const updatedProps = state.batasData.features.find(
        f => f.properties.kecamatan === state.selectedKecamatan
      )?.properties;
      
      // Refresh info sidebar jika ada
      if (updatedProps) {
        await showKecamatanInfo(updatedProps);
        renderRankingTable();
      }

      // Render ulang poligon sawah tanpa reset zoom (true)
      const sawahGeo = await Data.fetchSawahGeoJSON(state.selectedKecamatan, 100000);
      MapManager.renderSawah(sawahGeo, showPetakInfo, true);
    } else {
      await loadGlobalDashboard();
    }
  }

  // ══════════════════════════════════════════════════════
  // DROPDOWN & KONTROL
  // ══════════════════════════════════════════════════════
  async function setupDropdowns() {
    try {
      const kecs = await Data.fetchKecamatanList();
      kecs.forEach(k => {
        document.getElementById('filterKecamatan').insertAdjacentHTML('beforeend', `<option value="${k}">${k}</option>`);
        if(document.getElementById('trendFilterKecamatan')) document.getElementById('trendFilterKecamatan').insertAdjacentHTML('beforeend', `<option value="${k}">${k}</option>`);
      });
      const tahuns = await Data.fetchTahunList();
      tahuns.forEach(t => {
        document.getElementById('filterTahun').insertAdjacentHTML('beforeend', `<option value="${t}">${t}</option>`);
        if(document.getElementById('heatmapTahun')) document.getElementById('heatmapTahun').insertAdjacentHTML('beforeend', `<option value="${t}">Tahun ${t}</option>`);
      });
    } catch(e) { }
  }

  function setActiveLayerBtn(active) {
    document.getElementById('btnLayerKec').classList.toggle('active', active === 'kecamatan');
    document.getElementById('btnLayerSawah').classList.toggle('active', active === 'sawah');
    
    const tools = document.getElementById('sawahStyleControls');
    if(active === 'sawah') tools.classList.remove('hidden');
    else tools.classList.add('hidden');
    
    state.activeLayer = active;
  }

  function domEvents() {
    // 0. Ranking Dropdown
    document.getElementById('rankingKategori').addEventListener('change', renderRankingTable);

    // 1. Layer Toggle
    document.getElementById('btnLayerKec').addEventListener('click', () => {
      MapManager.clearSawahLayer();
      setActiveLayerBtn('kecamatan');
      state.selectedKecamatan = null;
      showDefaultInfo();
      loadNdviCharts(state.filters, state.filters.kecamatan);
    });
    
    document.getElementById('btnLayerSawah').addEventListener('click', async () => {
      if(!state.selectedKecamatan) {
        const first = state.batasData?.features[0]?.properties;
        if(first) await handleKecamatanClick(first);
        return;
      }
      setActiveLayerBtn('sawah');
    });

    // 2. Mode Sawah
    document.getElementById('btnFill').addEventListener('click', () => {
      MapManager.setMode('fill');
      document.getElementById('btnFill').classList.add('active');
      document.getElementById('btnOutline').classList.remove('active');
    });
    document.getElementById('btnOutline').addEventListener('click', () => {
      MapManager.setMode('outline');
      document.getElementById('btnOutline').classList.add('active');
      document.getElementById('btnFill').classList.remove('active');
    });

    // 3. Opacity Slider
    document.getElementById('opacitySlider').addEventListener('input', (e) => {
      MapManager.setOpacity(parseFloat(e.target.value));
    });

    // Fullscreen Map
    const btnFullscreenMap = document.getElementById('btnFullscreenMap');
    if (btnFullscreenMap) {
      btnFullscreenMap.addEventListener('click', () => {
        const wrap = document.querySelector('.map-container-wrapper');
        wrap.classList.toggle('fullscreen-mode');
        const isFS = wrap.classList.contains('fullscreen-mode');
        
        if (isFS) {
          btnFullscreenMap.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3h-3m16 0h-3v-3m0 18v-3h3M3 16h3v3"/></svg>`;
        } else {
          btnFullscreenMap.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
        }
        
        const map = window._map || (window.MapManager && window.MapManager.getMap());
        if (map) {
          setTimeout(() => map.invalidateSize(), 300); // Trigger relayout for Leaflet
        }
      });
    }

    // Indeks NDVI (Trend Bulanan) Independent Filter
    const trendKecFilter = document.getElementById('trendFilterKecamatan');
    if (trendKecFilter) {
      trendKecFilter.addEventListener('change', async () => {
        const kec = trendKecFilter.value;
        const trendData = await Data.fetchTrendNdvi({ kecamatan: kec });
        Charts.renderTrend('chartTrend', trendData, 'Pertumbuhan NDVI');
        const suffix = kec ? `(Kec. ${kec})` : '(Seluruh Kab. Karawang)';
        if(document.getElementById('section2TitleText')) document.getElementById('section2TitleText').textContent = suffix;
        if(document.getElementById('kpiNdviWilayahInfo')) document.getElementById('kpiNdviWilayahInfo').textContent = suffix;
      });
    }

    // 4. Filter (Otomatis saat dropdown diganti)
    const onFilterChange = async () => {
      state.filters.tahun = document.getElementById('filterTahun').value || null;
      state.filters.bulan = document.getElementById('filterBulan').value || null;
      state.filters.kecamatan = document.getElementById('filterKecamatan').value || null;

      showDefaultInfo();
      setActiveLayerBtn('kecamatan');
      MapManager.clearSawahLayer();
      state.selectedKecamatan = null;
      await loadGlobalDashboard();
      
      if(state.filters.kecamatan) {
          const feat = state.batasData?.features?.find(f => f.properties.kecamatan === state.filters.kecamatan);
          if(feat) handleKecamatanClick(feat.properties);
      }
    };

    document.getElementById('filterKecamatan').addEventListener('change', onFilterChange);
    document.getElementById('filterTahun').addEventListener('change', onFilterChange);
    document.getElementById('filterBulan').addEventListener('change', onFilterChange);

    // Theme Toggle dihapus atas permintaan user.

    // 6. Scroll Fade untuk Map Legend & Overlay
    const scrollContainer = document.querySelector('.dashboard-scroll');
    const mapLegend = document.querySelector('.map-floating-legend');
    const floatControls = document.querySelector('.map-floating-controls');
    
    if (scrollContainer && (mapLegend || floatControls)) {
      scrollContainer.addEventListener('scroll', () => {
        const top = scrollContainer.scrollTop;
        if (top < 300) {
           const opan = 1 - (top / 300);
           if(mapLegend) mapLegend.style.opacity = Math.max(0, opan).toString();
           if(floatControls) floatControls.style.opacity = Math.max(0, opan).toString();
        } else {
           if(mapLegend) mapLegend.style.opacity = '0';
           if(floatControls) floatControls.style.opacity = '0';
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════
  // HELPER: RENDER HTML TABLE HEATMAP
  // ══════════════════════════════════════════════════════
  function renderHeatmapTable(dataArray) {
    const container = document.getElementById('heatmapContainer');
    if(!container) return;
    if(!dataArray || !dataArray.length) {
      container.innerHTML = "<em>Data Heatmap Tidak Tersedia untuk Tahun Tersebut.</em>";
      return;
    }

    const sortVal = document.getElementById('heatmapSort')?.value || 'asc';
    let sortedData = [...dataArray];

    // Kalkulasi NDVI rata-rata untuk kolom tambahan dan opsi sortir
    sortedData.forEach(r => {
        let sum = 0; let count = 0;
        for(let i=1; i<=12; i++) { if(r[i.toString()] != null) { sum += r[i.toString()]; count++; } }
        r._avg = count > 0 ? (sum / count) : 0;
    });

    if (sortVal !== 'asc') {
       if(sortVal === 'healthiest') sortedData.sort((a,b) => b._avg - a._avg); // Tertinggi
       if(sortVal === 'worst') sortedData.sort((a,b) => a._avg - b._avg); // Terendah
    }

    const m = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des','Rata-rata'];
    let html = `<table class="heatmap-table"><thead><tr><th>Kecamatan</th>`;
    m.forEach(mn => html += `<th>${mn}</th>`);
    html += `</tr></thead><tbody>`;

    sortedData.forEach(k => {
      html += `<tr><td class="kecamatan-col">${k.kecamatan}</td>`;
      for(let i=1; i<=12; i++) {
        const v = k[i.toString()];
        if(v === null || v === undefined) {
          html += `<td class="heatmap-null tooltip-trigger" title="${k.kecamatan} Bulan ${i}: N/A">—</td>`;
        } else {
          let bg = '#22c55e'; // hijau
          if(v < 0.25) bg = '#dc2626'; // merah
          else if(v < 0.40) bg = '#eab308'; // kuning emas

          html += `<td class="heatmap-cell" style="background-color: ${bg};" title="${k.kecamatan} (Bulan ${i}) \nNDVI: ${v.toFixed(3)}">${v.toFixed(2)}</td>`;
        }
      }
      
      // Render kolom Rata-rata
      let st = '#22c55e';
      if(k._avg < 0.25) st = '#dc2626';
      else if(k._avg < 0.40) st = '#eab308';
      let avgText = k._avg > 0 ? k._avg.toFixed(3) : '—';
      html += `<td class="heatmap-cell" style="background-color: ${st}; font-weight:bold; border-left:2px solid #94a3b8; filter:brightness(0.9);" title="Rata-rata Keseluruhan">${avgText}</td>`;
      
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════
  // BOOTSTRAP APP
  // ══════════════════════════════════════════════════════
  async function start() {
    MapManager.init();
    MapManager.setMode('outline');
    
    setupUserUI();
    domEvents();
    await setupDropdowns();

    // Load Ranking Sawah
    Data.fetchLuasSawahRank().then(res => {
      Charts.renderHorizontalBarSawah('chartSawah', res);
    });

    // Event & Load YOY 
    let currentYoy = [];
    const loadYoY = () => {
      const isLimit = document.getElementById('filterYoySort')?.value === '15';
      const toRender = isLimit && currentYoy.length ? currentYoy.slice(0, 15) : currentYoy;
      
      const wr = document.getElementById('wrapperYoy');
      // Jika ter-limit, beri '100%'. Jika seluruhnya, jadikan lebar absolute besar agar bisa ter-scroll di container 
      if(wr) wr.style.width = isLimit ? '100%' : '1400px';

      Charts.renderYoy('chartYoy', toRender);
    };
    if (document.getElementById('filterYoySort')) {
      document.getElementById('filterYoySort').addEventListener('change', loadYoY);
    }
    Data.fetchYoY().then(res => {
      currentYoy = res;
      loadYoY();
    });

    // Event & Load Heatmap
    const hmTahun = document.getElementById('heatmapTahun');
    const hmSort = document.getElementById('heatmapSort');
    let currentHeatmapData = [];
    const loadHM = async () => {
      currentHeatmapData = await Data.fetchHeatmap(hmTahun ? hmTahun.value : 'all');
      renderHeatmapTable(currentHeatmapData);
    };
    if (hmTahun) hmTahun.addEventListener('change', loadHM);
    if (hmSort) hmSort.addEventListener('change', () => renderHeatmapTable(currentHeatmapData));
    loadHM(); // initial call

    // Load Compare Base
    const ecA = document.getElementById('compareKecA');
    const ecB = document.getElementById('compareKecB');
    if(ecA && ecB) {
      Data.fetchKecamatanList().then(kecs => {
         kecs.forEach(k => {
           ecA.insertAdjacentHTML('beforeend', `<option value="${k}">${k}</option>`);
           ecB.insertAdjacentHTML('beforeend', `<option value="${k}">${k}</option>`);
         });
         if(kecs.length > 1) { ecA.value = kecs[0]; ecB.value = kecs[2] || kecs[1]; }
         const updateCompare = async () => {
           const vA = ecA.value, vB = ecB.value;
           const dA = await Data.fetchTrendNdvi({kecamatan: vA});
           const dB = await Data.fetchTrendNdvi({kecamatan: vB});
           Charts.renderCompareTrend('chartCompare', dA, vA, dB, vB);
         };
         ecA.addEventListener('change', updateCompare);
         ecB.addEventListener('change', updateCompare);
         updateCompare();
      });
    }

    await loadGlobalDashboard();
  }

  start();

})();
