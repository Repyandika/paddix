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
  };
  window._appState = state;
  let _sawahAbortController = null;

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
      document.getElementById('btnModeDigitasi').addEventListener('click', () => Admin.enterDigitasiMode(MapManager.getMap()));
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

  // ══════════════════════════════════════════════════════
  // RENDER PENGATURAN INFORMASI (BAWAH)
  // ══════════════════════════════════════════════════════
  function renderRankingTable() {
    if (!state.batasData || !state.batasData.features) return;
    const cat = document.getElementById('rankingKategori').value;
    
    // Update dynamic title based on filter
    const titles = {
      terluas: "Peringkat Luas Lahan Sawah",
      kepadatan: "Peringkat Kepadatan Lahan Sawah",
      ndvi_best: "Peringkat Kerapatan Vegetasi Tertinggi",
      ndvi_worst: "Peringkat Kerapatan Vegetasi Terendah"
    };
    const titleEl = document.getElementById('rankingTitleText');
    if (titleEl) {
      titleEl.textContent = titles[cat] || "Peringkat Wilayah Kecamatan";
    }

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
      titleHtml = p => `Indeks: ${Data.fmtNdvi(p.avg_ndvi)} — Fase Vegetatif Maksimal`;
    } else if (cat === 'ndvi_worst') {
      sorted = validKec.filter(p => typeof p.avg_ndvi === 'number').sort((a,b) => a.avg_ndvi - b.avg_ndvi);
      titleHtml = p => `Indeks: ${Data.fmtNdvi(p.avg_ndvi)} — Fase Awal Tanam / Bera`;
    }

    const top5 = sorted.slice(0, 5);
    if (!top5.length) {
      document.getElementById('rankingTableBody').innerHTML = `<tr><td colspan="2" class="text-center" style="color:#94a3b8">Data tidak cukup</td></tr>`;
      return;
    }

    const html = top5.map((p, idx) => `
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

    document.getElementById('localNdviTitle').textContent = `Kerapatan Vegetasi di ${props.kecamatan}`;
    let desc = risk.desc || '';
    if (desc) {
      desc = `[${risk.label}] ${desc}`;
    } else {
      desc = `Kondisi vegetasi persawahan di ${props.kecamatan} terpantau dalam kondisi baik.`;
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

    // Update badge wilayah pada panel Time Series
    const badge = document.getElementById('trendWilayahBadge');
    if (badge) badge.textContent = wilayahName ? `Kec. ${wilayahName}` : 'Semua Kecamatan (Global)';

    // Update dynamic temporal insight
    const insightTitleEl = document.getElementById('ndviInsightWilayahTitle');
    const insightTextEl = document.getElementById('ndviInsightText');
    
    if (insightTitleEl && insightTextEl) {
      const regionName = wilayahName ? `Kecamatan ${wilayahName}` : 'Seluruh Kab. Karawang';
      insightTitleEl.textContent = regionName;
      
      if (!trendData || !trendData.length) {
        insightTextEl.innerHTML = `Data NDVI bulanan tidak tersedia untuk periode filter di <strong>${regionName}</strong>.`;
      } else {
        let maxNdvi = -1, minNdvi = 2, latestNdvi = null;
        let maxPeriod = '', minPeriod = '';
        const bulanNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        
        const validTrend = trendData.filter(d => d.mean_ndvi !== null && d.mean_ndvi !== undefined);
        
        if (validTrend.length > 0) {
          validTrend.forEach(d => {
            const val = Number(d.mean_ndvi);
            if (val > maxNdvi) { maxNdvi = val; maxPeriod = `${bulanNames[d.bulan]} ${d.tahun}`; }
            if (val < minNdvi) { minNdvi = val; minPeriod = `${bulanNames[d.bulan]} ${d.tahun}`; }
          });
          latestNdvi = validTrend[validTrend.length - 1];
        }
        
        if (latestNdvi) {
          const latVal = Number(latestNdvi.mean_ndvi);
          const latPeriod = `${bulanNames[latestNdvi.bulan]} ${latestNdvi.tahun}`;
          let statusPadi = 'Kerapatan Tinggi (Fase Vegetatif Maksimal / Panen)';
          if (latVal < 0.2) statusPadi = 'Kerapatan Sangat Rendah (Fase Bera / Penggenangan Lahan)';
          else if (latVal < 0.4) statusPadi = 'Kerapatan Rendah (Fase Persemaian / Persiapan Lahan)';
          else if (latVal < 0.6) statusPadi = 'Kerapatan Sedang (Fase Vegetatif Aktif)';
          
          let trendDirection = '';
          if (validTrend.length > 1) {
            const prevVal = Number(validTrend[validTrend.length - 2].mean_ndvi);
            const diff = latVal - prevVal;
            if (Math.abs(diff) > 0.04) {
              trendDirection = diff > 0 ? 'mengalami **peningkatan indeks** (tanaman memasuki fase tumbuh subur)' : 'mengalami **penurunan indeks** (lahan memasuki fase panen atau persiapan bera)';
            } else {
              trendDirection = 'berada dalam kondisi **stabil** dibanding bulan sebelumnya';
            }
          }
          
          // Ganti format markdown ** ke <strong>
          trendDirection = trendDirection.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          
          insightTextEl.innerHTML = `Pada periode rekaman terakhir (<strong>${latPeriod}</strong>), nilai indeks vegetasi di <strong>${regionName}</strong> tercatat sebesar <strong>${latVal.toFixed(3)}</strong>, yang menunjukkan indikasi <strong>${statusPadi}</strong>. Tren pergerakan bulanan terpantau ${trendDirection}. Secara historis, tingkat kesuburan tertinggi dicapai pada <strong>${maxPeriod}</strong> dengan nilai NDVI <strong>${Number(maxNdvi).toFixed(3)}</strong>, sedangkan titik terendah terjadi pada <strong>${minPeriod}</strong> dengan nilai NDVI <strong>${Number(minNdvi).toFixed(3)}</strong>.`;
        } else {
          insightTextEl.innerHTML = `Belum ada data pencatatan NDVI yang valid untuk membuat analisis tren di <strong>${regionName}</strong>.`;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // EVENT: MAP CLICKS
  // ══════════════════════════════════════════════════════
  // Muat SEMUA poligon sawah untuk kecamatan (tanpa BBox) — dipanggil saat klik kecamatan
  window._loadAllSawah = async function(kecName) {
    const kec = kecName || state.selectedKecamatan;
    if (!kec) return;

    const warningEl = document.getElementById('sawahZoomWarning');
    if (warningEl) warningEl.classList.add('hidden');

    // Abort request sebelumnya jika masih berjalan
    if (_sawahAbortController) _sawahAbortController.abort();
    _sawahAbortController = new AbortController();
    const signal = _sawahAbortController.signal;

    setMapLoader(true, `Memuat petak sawah ${kec}...`);
    try {
      // Tidak pakai BBox — ambil SEMUA poligon kecamatan sekaligus
      const sawahGeo = await Data.fetchSawahGeoJSON(kec, 120000, null, signal);
      if (state.selectedKecamatan === kec) {
        MapManager.renderSawah(sawahGeo, showPetakInfo, true);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Gagal memuat petak sawah:', e);
    } finally {
      if (!_sawahAbortController || _sawahAbortController.signal === signal) setMapLoader(false);
    }
  };

  // Refresh poligon sawah saat pan/zoom (gunakan BBox untuk efisiensi)
  // KARENA kita sudah memuat SEMUA poligon di _loadAllSawah, kita tidak perlu
  // melakukan fetch ulang saat peta digeser. Ini menghemat performa dan 
  // mencegah munculnya loading screen terus menerus.
  window._triggerSawahLoad = async function() {
    // Tidak melakukan apa-apa lagi karena poligon sudah dimuat semua di _loadAllSawah.
    return;
  };

  async function handleKecamatanClick(props, preventZoom = false) {
    state.selectedKecamatan = props.kecamatan;

    // Auto-sync dropdown wilayah di topbar
    const dd = document.getElementById('filterKecamatan');
    if (dd && dd.value !== props.kecamatan) {
      dd.value = props.kecamatan;
      state.filters.kecamatan = props.kecamatan;
    }

    setActiveLayerBtn('sawah');

    try {
      // Jalankan info + chart secara paralel dengan load poligon sawah
      const [,] = await Promise.all([
        showKecamatanInfo(props),
        loadNdviCharts({ ...state.filters, kecamatan: props.kecamatan }, props.kecamatan),
      ]);
      updateBiSummary(props.kecamatan);

      // Zoom ke kecamatan lalu muat SEMUA poligon (tanpa BBox agar tidak ada yang terpotong)
      if (!preventZoom) {
        MapManager.zoomToKecamatan(props.kecamatan);
      }
      window._loadAllSawah(props.kecamatan);
    } catch (e) {
      console.error(e);
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

  function updateBiSummary(kecamatanName = null) {
    if (!state.batasData || !state.batasData.features) return;

    let sumNdvi = 0, cNdvi = 0;
    let lowest = { val: 1, kec: '' };
    let highest = { val: -1, kec: '' };
    let badKecamatan = [];

    state.batasData.features.forEach(f => {
      const p = f.properties;
      if (p.avg_ndvi !== null) {
        sumNdvi += p.avg_ndvi;
        cNdvi++;
        if (p.avg_ndvi < lowest.val) { lowest.val = p.avg_ndvi; lowest.kec = p.kecamatan; }
        if (p.avg_ndvi > highest.val) { highest.val = p.avg_ndvi; highest.kec = p.kecamatan; }
        if (p.avg_ndvi < 0.2) badKecamatan.push({ nama: p.kecamatan, val: p.avg_ndvi });
      }
    });
    badKecamatan.sort((a,b) => a.val - b.val);

    const globalAvg = cNdvi ? (sumNdvi / cNdvi) : 0;

    let timeframeStr = '(Semua Tahun)';
    if (state.filters.tahun) {
      timeframeStr = state.filters.bulan ? `Bulan ${state.filters.bulan} Tahun ${state.filters.tahun}` : `Tahun ${state.filters.tahun}`;
    }

    let trendText = "";
    let phaseHighlight = "";
    let recomText = "";

    if (!kecamatanName) {
      // ── GLOBAL SUMMARY (All Kecamatan) ──
      let overallStatus = "Moderat (Didominasi Vegetatif Aktif/Awal Tanam)";
      let statusColor = "var(--sage)";
      if (globalAvg >= 0.5) {
        overallStatus = "Sangat Baik (Didominasi Vegetatif Maksimal/Subur)";
        statusColor = "#166534";
      } else if (globalAvg < 0.3) {
        overallStatus = "Rendah (Didominasi Fase Bera/Penggenangan)";
        statusColor = "#b45309";
      }

      trendText = `Analisis spasial pada periode <strong>${timeframeStr}</strong> menunjukkan rata-rata indeks kerapatan vegetasi (NDVI) Kabupaten Karawang berada di angka <strong>${globalAvg.toFixed(3)}</strong>, mengindikasikan status umum vegetasi yang <strong style="color:${statusColor}">${overallStatus}</strong>. Sebagian besar lahan pertanian terpantau stabil dalam siklus pertumbuhannya.`;

      if (badKecamatan.length > 0) {
        let kecNames = badKecamatan.slice(0, 2).map(k => `<strong>${k.nama}</strong> (${k.val.toFixed(3)})`);
        phaseHighlight = `Terdeteksi <strong>${badKecamatan.length} kecamatan</strong> dengan indeks Kerapatan Sangat Rendah (NDVI &lt; 0.2), dipimpin oleh ${kecNames.join(' dan ')}. Ini mengindikasikan lahan sedang dalam fase penggenangan air atau bera pasca-panen.`;
        recomText = `Untuk wilayah dengan indeks rendah seperti <strong>${badKecamatan.slice(0, 2).map(k => k.nama).join(', ')}</strong>, disarankan untuk memantau pasokan saluran irigasi guna mempercepat transisi ke fase persemaian/penanaman berikutnya secara serempak.`;
      } else {
        phaseHighlight = `Kondisi lahan terpantau sangat stabil. Tidak ada kecamatan dengan indeks di bawah 0.2. Nilai indeks terendah saat ini berada di <strong>${lowest.kec}</strong> (${lowest.val.toFixed(3)}), yang merupakan batas wajar persiapan tanam awal.`;
        recomText = `Rekomendasi saat ini adalah mempertahankan manajemen pengairan dan distribusi pupuk secara merata di seluruh wilayah, mengingat mayoritas wilayah Karawang sedang berada dalam fase tumbuh aktif.`;
      }
    } else {
      // ── LOCAL SUMMARY (Specific Kecamatan) ──
      const feat = state.batasData.features.find(f => f.properties.kecamatan === kecamatanName);
      if (!feat) return;

      const p = feat.properties;
      const kecAvg = p.avg_ndvi;

      if (kecAvg === null || kecAvg === undefined) {
        trendText = `Data NDVI untuk Kecamatan <strong>${kecamatanName}</strong> pada periode <strong>${timeframeStr}</strong> tidak tersedia atau tidak mencukupi untuk dianalisis.`;
        phaseHighlight = "Tidak ada informasi fenologi yang dapat disimpulkan.";
        recomText = "Disarankan melakukan sinkronisasi data satelit terbaru untuk wilayah ini.";
      } else {
        const diff = kecAvg - globalAvg;
        const diffStr = Math.abs(diff).toFixed(3);
        const compStr = diff >= 0 
          ? `lebih tinggi <strong>${diffStr}</strong> dibanding rata-rata Kabupaten (${globalAvg.toFixed(3)})` 
          : `lebih rendah <strong>${diffStr}</strong> dibanding rata-rata Kabupaten (${globalAvg.toFixed(3)})`;

        let phase = "";
        let statusColor = "";
        let details = "";
        let recommendation = "";

        if (kecAvg < 0.2) {
          phase = "Fase Bera / Penggenangan Lahan";
          statusColor = "#b45309";
          details = `Nilai NDVI rata-rata <strong>${kecAvg.toFixed(3)}</strong> menunjukkan indeks kerapatan sangat rendah. Hal ini menandakan lahan sawah di ${kecamatanName} sebagian besar sedang kosong (pasca-panen) atau digenangi air untuk persiapan masa tanam berikutnya.`;
          recommendation = `Fokuskan pada pembersihan saluran irigasi tersier dan persiapan aplikasi pupuk organik/dasar sebelum persemaian dimulai.`;
        } else if (kecAvg < 0.4) {
          phase = "Fase Persemaian / Awal Tanam";
          statusColor = "#f97316";
          details = `Nilai NDVI rata-rata <strong>${kecAvg.toFixed(3)}</strong> mengindikasikan tingkat kerapatan vegetasi rendah. Kondisi ini mencerminkan fase pembibitan atau awal tanam di mana bibit padi baru dipindahkan ke petak sawah.`;
          recommendation = `Pertahankan tinggi genangan air dangkal (1-3 cm) untuk merangsang pertumbuhan akar bibit muda dan lakukan pemupukan NPK dosis awal.`;
        } else if (kecAvg < 0.6) {
          phase = "Fase Vegetatif Aktif";
          statusColor = "var(--sage)";
          details = `Nilai NDVI rata-rata <strong>${kecAvg.toFixed(3)}</strong> mengindikasikan kerapatan sedang. Tanaman padi di wilayah ini sedang tumbuh aktif dengan pembentukan anakan yang cepat.`;
          recommendation = `Terapkan sistem pengairan berselang (intermittent irrigation) untuk meningkatkan pasokan oksigen ke akar dan kurangi risiko penyakit blas, serta aplikasikan pupuk susulan kedua.`;
        } else {
          phase = "Fase Vegetatif Maksimal / Generatif";
          statusColor = "#166534";
          details = `Nilai NDVI rata-rata <strong>${kecAvg.toFixed(3)}</strong> menunjukkan kerapatan vegetasi tinggi. Kanopi tanaman telah menutupi tanah secara maksimal dan memasuki fase pembungaan/pengisian bulir padi yang subur.`;
          recommendation = `Lakukan monitoring berkala terhadap hama wereng coklat dan tikus, pastikan pengairan mencukupi selama pengisian bulir, dan kurangi air secara bertahap 10 hari menjelang panen.`;
        }

        trendText = `Analisis spasial pada periode <strong>${timeframeStr}</strong> menunjukkan rata-rata indeks kerapatan vegetasi (NDVI) di Kecamatan <strong>${kecamatanName}</strong> berada di angka <strong>${kecAvg.toFixed(3)}</strong>, yang ${compStr}.`;
        phaseHighlight = `Wilayah ini diidentifikasi berada dalam <strong style="color:${statusColor}">${phase}</strong>. ${details}`;
        recomText = `<strong>Rekomendasi Agronomis:</strong> ${recommendation}`;
      }
    }

    const biText = `
      <div style="display: grid; grid-template-columns: 1fr; gap: 14px; width: 100%;">
        <div>
          <span style="display:inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--forest); margin-bottom: 4px; letter-spacing:0.05em;">📈 Ringkasan Tren Utama ${kecamatanName ? `(Kec. ${kecamatanName})` : '(Global)'}</span>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-primary);">${trendText}</p>
        </div>
        <div style="border-top: 1px solid var(--sage-border); padding-top: 12px; display: grid; grid-template-columns: 1fr; gap: 14px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #ea580c; letter-spacing:0.05em;">📍 Sorotan Wilayah & Fenologi</span>
            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-secondary);">${phaseHighlight}</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('biSummaryText').innerHTML = biText;
  }

  async function loadGlobalDashboard() {
    setMapLoader(true, "Menganalisa Data Satelit Seluruh Wilayah...");
    setStatus("Sedang Berjalan", "ok");

    try {
      state.batasData = await Data.fetchBatasGeoJSON(state.filters);
      MapManager.renderBatas(state.batasData, handleKecamatanClick);
      
      _refreshGlobalKpi();
      updateBiSummary(state.filters.kecamatan);

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
  // Expose handleKecamatanClick agar dapat dipanggil dari modul eksternal
  // (misal: coord-search.js setelah deteksi point-in-polygon)
  window._handleKecamatanClick = handleKecamatanClick;

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
        updateBiSummary(state.selectedKecamatan);
        renderRankingTable();
      }

      // Render ulang poligon sawah 
      await window._loadAllSawah();
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
      const dd = document.getElementById('filterKecamatan');
      if (dd) {
        dd.value = "";
        state.filters.kecamatan = null;
      }
      showDefaultInfo();
      updateBiSummary(null);
      loadNdviCharts(state.filters, state.filters.kecamatan);
    });
    
    document.getElementById('btnLayerSawah').addEventListener('click', async () => {
      if(!state.selectedKecamatan) {
        alert("Silakan pilih salah satu kecamatan dari dropdown filter wilayah terlebih dahulu untuk memuat Polygon Lahan Sawah. Data polygon terlalu besar untuk dirender seluruh kabupaten sekaligus.");
        return;
      }
      setActiveLayerBtn('sawah');
      window._loadAllSawah();
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

    // Catatan: filter Time Series kecamatan dikendalikan melalui klik peta, bukan dropdown.

    // 4. Filter (Otomatis saat dropdown diganti)
    const onFilterChange = async () => {
      // Baca nilai baru dari semua dropdown
      const newTahun     = document.getElementById('filterTahun').value    || null;
      const newBulan     = document.getElementById('filterBulan').value    || null;
      const newKecamatan = document.getElementById('filterKecamatan').value || null;

      // Deteksi apakah yang berubah adalah filter WILAYAH atau hanya waktu (tahun/bulan)
      const kecamatanChanged = (newKecamatan !== state.filters.kecamatan);
      const activeKec        = state.selectedKecamatan; // simpan sebelum state diubah

      // Terapkan semua nilai filter baru ke state
      state.filters.tahun     = newTahun;
      state.filters.bulan     = newBulan;
      state.filters.kecamatan = newKecamatan;

      if (kecamatanChanged) {
        // ── Kecamatan berubah: reset penuh lalu zoom ke kecamatan baru ──
        showDefaultInfo();
        setActiveLayerBtn('kecamatan');
        MapManager.clearSawahLayer();
        state.selectedKecamatan = null;

        await loadGlobalDashboard();

        if (state.filters.kecamatan) {
          const feat = state.batasData?.features?.find(
            f => f.properties.kecamatan === state.filters.kecamatan
          );
          if (feat) await handleKecamatanClick(feat.properties);
        }

      } else if (activeKec) {
        // ── Hanya tahun/bulan berubah DAN ada kecamatan aktif ──
        // Refresh peta choropleth (warna berdasarkan filter waktu baru) tanpa reset chart
        setMapLoader(true, `Memperbarui data ${activeKec}...`);
        try {
          state.batasData = await Data.fetchBatasGeoJSON(state.filters);
          MapManager.renderBatas(state.batasData, handleKecamatanClick);
          _refreshGlobalKpi();

          // Cari properties kecamatan yang aktif dari data terbaru
          const feat = state.batasData?.features?.find(
            f => f.properties.kecamatan === activeKec
          );
          if (feat) {
            // Update panel info dengan NDVI terbaru untuk kecamatan + filter waktu baru
            await showKecamatanInfo(feat.properties);
            updateBiSummary(activeKec);
          }

          // Muat ulang chart tren HANYA untuk kecamatan aktif dengan filter waktu baru
          await loadNdviCharts({ ...state.filters, kecamatan: activeKec }, activeKec);

          setStatus("Data Termutakhirkan", "ok");
        } catch(e) {
          setStatus("Gagal memperbarui data", "error");
          console.error(e);
        } finally {
          setMapLoader(false);
        }

      } else {
        // ── Hanya tahun/bulan berubah, tidak ada kecamatan aktif → refresh global ──
        await loadGlobalDashboard();
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
          let bg = '#166534'; // Kerapatan Tinggi — hijau tua
          if(v < 0.2)       bg = '#b45309'; // Kerapatan Sangat Rendah — coklat
          else if(v < 0.4)  bg = '#f97316'; // Kerapatan Rendah — oranye
          else if(v < 0.6)  bg = '#4ade80'; // Kerapatan Sedang — hijau muda

          const desc = v < 0.2 ? 'Bera/Penggenangan' : v < 0.4 ? 'Persemaian/Awal Tanam' : v < 0.6 ? 'Vegetatif Aktif' : 'Vegetatif Maksimal';
          html += `<td class="heatmap-cell" style="background-color: ${bg};" title="${k.kecamatan} (Bulan ${i})\nNDVI: ${v.toFixed(3)} — ${desc}">${v.toFixed(2)}</td>`;
        }
      }
      
      // Render kolom Rata-rata
      let st = '#166534';
      if(k._avg < 0.2)       st = '#b45309';
      else if(k._avg < 0.4)  st = '#f97316';
      else if(k._avg < 0.6)  st = '#4ade80';
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
    MapManager.setMode('fill');
    CoordSearch.init(); // ← Inisialisasi widget pencarian koordinat
    
    setupUserUI();
    domEvents();
    await setupDropdowns();

    // Load Ranking Sawah
    Data.fetchLuasSawahRank().then(res => {
      Charts.renderHorizontalBarSawah('chartSawah', res);
    });

    // Event & Load YOY 
    let currentYoy = null;
    const loadYoY = () => {
      if (!currentYoy) return;
      
      let isObj = !Array.isArray(currentYoy) && currentYoy.data;
      let dataArr = isObj ? currentYoy.data : currentYoy;
      let yrs = isObj ? currentYoy.years : ['2023', '2024', '2025'];

      if (!dataArr || !dataArr.length) return;
      
      const isLimit = document.getElementById('filterYoySort')?.value === '15';
      const toRenderData = isLimit && dataArr.length ? dataArr.slice(0, 15) : dataArr;
      
      const wr = document.getElementById('wrapperYoy');
      if(wr) wr.style.width = isLimit ? '100%' : '1400px';

      Charts.renderYoy('chartYoy', { years: yrs, data: toRenderData });
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
