/**
 * charts.js
 * Modul manajemen Chart.js.
 * Semua chart dikelola dari sini: init, update, destroy.
 *
 * Ekspor: window.Charts
 */

const Charts = (() => {
  // Simpan instance agar bisa di-destroy sebelum re-render
  const _instances = {};

  // ─── Default Chart Options ─────────────────────────
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#475569';
  Chart.defaults.borderColor = '#e4e8ef';

  const BASE_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.85)',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        padding: 10,
        cornerRadius: 6,
      },
    },
  };

  function _destroy(id) {
    if (_instances[id]) {
      _instances[id].destroy();
      delete _instances[id];
    }
  }

  function _create(id, config) {
    _destroy(id);
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    _instances[id] = new Chart(canvas.getContext('2d'), config);
    return _instances[id];
  }

  // ─── Chart: Tren NDVI Bulanan (Line) ──────────────
  /**
   * @param {string} canvasId
   * @param {Array} data - [{ periode, mean_ndvi }]
   * @param {string} label
   */
  function renderTrend(canvasId, data, label = 'NDVI Rata-rata') {
    if (!data || !data.length) {
      _destroy(canvasId);
      return;
    }

    // Buat label bulan yang informatif (misal: Jan 2023)
    const labels = data.map((d) => {
      if (d.tahun && d.bulan) {
        const bulanNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                             'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${bulanNames[d.bulan]} ${d.tahun}`;
      }
      return d.periode || '–';
    });

    const values = data.map((d) => d.mean_ndvi ?? null);

    // Garis warning di 0.25 (ambang risiko tinggi → sedang)
    const warningLine = {
      id: 'warningLine',
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const y = scales.y.getPixelForValue(0.25);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.strokeStyle = 'rgba(239,68,68,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      },
    };

    return _create(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          borderWidth: 2,
          // Highlight anomali: merah & besar jika NDVI < 0.25
          pointRadius: (ctx) => { const v = ctx.parsed.y; return (v !== null && v < 0.25) ? 6 : 3; },
          pointHoverRadius: (ctx) => { const v = ctx.parsed.y; return (v !== null && v < 0.25) ? 8 : 5; },
          pointBackgroundColor: (ctx) => { const v = ctx.parsed.y; return (v !== null && v < 0.25) ? '#dc2626' : '#2563eb'; },
          fill: true,
          tension: 0.35,
          spanGaps: false, // JEDA TERLIHAT JIKA DATA NULL
        }],
      },
      options: {
        ...BASE_OPTIONS,
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, maxTicksLimit: 8, font: { size: 10 } },
          },
          y: {
            min: 0, max: 0.8,
            grid: { color: '#f1f5f9' },
            ticks: { callback: (v) => v.toFixed(2), font: { size: 10 } },
          },
        },
        plugins: {
          ...BASE_OPTIONS.plugins,
          legend: {
            display: true, position: 'top',
            labels: { boxWidth: 10, font: { size: 10 }, color: '#475569' },
          },
          tooltip: {
            ...BASE_OPTIONS.plugins.tooltip,
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                if (v === null || isNaN(v)) return ' Data Tidak Tersedia (Gap)';
                let st = 'Aman';
                if (v < 0.25) st = 'Kritis/Gagal Panen';
                else if (v < 0.4) st = 'Waspada';
                return ` NDVI: ${v.toFixed(3)} (${st})`;
              },
            },
          },
        },
      },
      plugins: [warningLine],
    });
  }

  // ─── Chart: Distribusi Kategori NDVI (Doughnut) ───
  /**
   * @param {Array} data - [{ kategori, jumlah }]
   */
  function renderKategori(canvasId, data) {
    if (!data || !data.length) return;

    const colorMap = {
      'risiko_tinggi': '#dc2626',    // Merah
      'risiko_sedang': '#f97316',    // Oranye
      'normal_/_aman': '#22c55e',    // Hijau
      'data_tidak_tersedia': '#94a3b8'
    };

    const labels = data.map((d) => d.kategori || 'N/A');
    const values = data.map((d) => d.jumlah);
    const colors = labels.map((k) => colorMap[k?.toLowerCase().replace(/ /g, '_')] || '#94a3b8');

    return _create(canvasId, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }],
      },
      options: {
        ...BASE_OPTIONS,
        cutout: '60%',
        plugins: {
          ...BASE_OPTIONS.plugins,
          legend: {
            display: true,
            position: 'right',
            labels: { boxWidth: 10, font: { size: 10 } },
          },
          tooltip: {
            ...BASE_OPTIONS.plugins.tooltip,
            callbacks: {
              label: (ctx) => ` ${new Intl.NumberFormat('id-ID').format(ctx.parsed)} Hektare Lahan`,
            },
          },
        },
      },
    });
  }

  // ─── Chart: Luas Sawah Horizontal (Bar) ─────────
  function renderHorizontalBarSawah(canvasId, dataList) {
    if (!dataList || !dataList.length) return;
    
    // Potong top 15 saja agar tidak sesak jika data terlalu banyak
    const topData = dataList.slice(0, 15);
    const labels = topData.map(d => d.kecamatan);
    const values = topData.map(d => d.luas_ha);

    return _create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Luas Sawah (Ha)',
          data: values,
          backgroundColor: 'rgba(95, 162, 114, 0.8)', // Sage green
          borderColor: '#4a7c59',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        ...BASE_OPTIONS,
        indexAxis: 'y', // Horizontal
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
        plugins: {
          ...BASE_OPTIONS.plugins,
          tooltip: {
            ...BASE_OPTIONS.plugins.tooltip,
            callbacks: {
              label: (ctx) => ` ${new Intl.NumberFormat('id-ID').format(ctx.parsed.x)} Hektar`,
            },
          },
        },
      },
    });
  }

  // ─── Chart: Year-over-Year (Grouped Bar) ─────────
  function renderYoy(canvasId, dataList) {
    if (!dataList || !dataList.length) return;
    
    const labels = dataList.map(d => d.kecamatan);
    const val23 = dataList.map(d => d['2023']);
    const val24 = dataList.map(d => d['2024']);
    const val25 = dataList.map(d => d['2025']);

    return _create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '2023', data: val23, backgroundColor: '#94a3b8' },
          { label: '2024', data: val24, backgroundColor: '#60a5fa' },
          { label: '2025', data: val25, backgroundColor: '#1d4ed8' },
        ],
      },
      options: {
        ...BASE_OPTIONS,
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45, maxTicksLimit: 12, font: { size: 9 } } },
          y: { min: 0, max: 0.8, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        },
        plugins: {
          ...BASE_OPTIONS.plugins,
          legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
        },
      },
    });
  }

  // ─── Chart: Side-by-side Compare Trend ─────────
  function renderCompareTrend(canvasId, dataA, nameA, dataB, nameB) {
    if ((!dataA || !dataA.length) && (!dataB || !dataB.length)) return;

    // Kumpulkan label (Bulan Tahun) dari A dan B
    const mapLabs = new Map();
    const bulanNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    
    const fillMap = (list) => {
      (list || []).forEach(d => {
        if (d.tahun && d.bulan) {
          const key = `${d.tahun}-${d.bulan.toString().padStart(2, '0')}`; // sortable
          const lab = `${bulanNames[d.bulan]} ${d.tahun}`;
          mapLabs.set(key, lab);
        }
      });
    };
    fillMap(dataA); fillMap(dataB);

    // Urutkan label temporal
    const sortedKeys = Array.from(mapLabs.keys()).sort();
    const labels = sortedKeys.map(k => mapLabs.get(k));

    // Petakan nilai ke posisinya
    const getVals = (list) => {
      const arr = new Array(sortedKeys.length).fill(null);
      (list || []).forEach(d => {
        if (d.tahun && d.bulan) {
          const key = `${d.tahun}-${d.bulan.toString().padStart(2, '0')}`;
          const idx = sortedKeys.indexOf(key);
          if (idx !== -1) arr[idx] = d.mean_ndvi;
        }
      });
      return arr;
    };

    const valA = getVals(dataA);
    const valB = getVals(dataB);

    return _create(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: nameA || 'Wilayah A',
            data: valA,
            borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)',
            borderWidth: 2, pointRadius: 3, fill: true, tension: 0.35, spanGaps: false
          },
          {
            label: nameB || 'Wilayah B',
            data: valB,
            borderColor: '#ea580c', backgroundColor: 'rgba(234,88,12,0.1)',
            borderWidth: 2, pointRadius: 3, fill: true, tension: 0.35, spanGaps: false
          }
        ],
      },
      options: {
        ...BASE_OPTIONS,
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45, maxTicksLimit: 10, font: { size: 10 } } },
          y: { min: 0, max: 0.8, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        },
        plugins: {
          ...BASE_OPTIONS.plugins,
          legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
        },
      },
    });
  }

  // ─── Chart: Tren per Kecamatan (Bar bulanan) ──────
  function renderDetailTrend(canvasId, data) {
    if (!data || !data.length) return;

    const bulanNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
                         'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    const labels = data.map((d) => {
      if (d.tahun && d.bulan) return `${bulanNames[d.bulan]} ${d.tahun}`;
      return d.periode || '–';
    });
    const values = data.map((d) => d.mean_ndvi ?? null);

    // Warnai bar berdasarkan nilai NDVI
    const colors = values.map((v) => {
      if (!v) return '#94a3b8';
      if (v < 0.25) return '#dc2626';
      if (v < 0.40) return '#f97316';
      return '#22c55e';
    });

    return _create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'NDVI',
          data: values,
          backgroundColor: colors,
          borderRadius: 3,
        }],
      },
      options: {
        ...BASE_OPTIONS,
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, font: { size: 9 }, maxTicksLimit: 12 },
          },
          y: {
            min: 0, max: 0.8,
            grid: { color: '#f1f5f9' },
            ticks: { callback: (v) => v.toFixed(1), font: { size: 10 } },
          },
        },
      },
    });
  }

  // Public API
  return {
    renderTrend,
    renderKategori,
    renderHorizontalBarSawah,
    renderYoy,
    renderCompareTrend,
    renderDetailTrend,
    destroy: _destroy,
  };
})();

window.Charts = Charts;
