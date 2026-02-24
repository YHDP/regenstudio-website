/**
 * Admin Analytics Dashboard — Combined (www + demos)
 * - Password auth (SHA-256 client-side → Bearer token)
 * - Site filter (all / www / demos)
 * - View switching, date range picker
 * - Chart.js rendering for all 6 views
 */
(function () {
  'use strict';

  var API_URL = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/admin-analytics';

  // Chart palette
  var COLORS = ['#00914B', '#009BBB', '#6366F1', '#FFA92D', '#93093F'];
  var COLORS_LIGHT = ['rgba(0,145,75,0.15)', 'rgba(0,155,187,0.15)', 'rgba(99,102,241,0.15)', 'rgba(255,169,45,0.15)', 'rgba(147,9,63,0.15)'];

  var token = null;
  var charts = {};
  var currentView = 'overview';

  // DOM refs
  var gate = document.getElementById('gate');
  var dashboard = document.getElementById('dashboard');
  var gateForm = document.getElementById('gateForm');
  var gatePassword = document.getElementById('gatePassword');
  var gateError = document.getElementById('gateError');
  var viewTitle = document.getElementById('viewTitle');
  var dateRange = document.getElementById('dateRange');
  var customRange = document.getElementById('customRange');
  var dateFrom = document.getElementById('dateFrom');
  var dateTo = document.getElementById('dateTo');
  var applyRange = document.getElementById('applyRange');
  var siteFilter = document.getElementById('siteFilter');
  var thSite = document.getElementById('thSite');
  var funnelNote = document.getElementById('funnelNote');

  // ── SHA-256 helper ──
  function sha256(str) {
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  // ── Date range ──
  function getDateRange() {
    var val = dateRange.value;
    if (val === 'custom') {
      return { from: dateFrom.value, to: dateTo.value };
    }
    var days = parseInt(val);
    var to = new Date();
    var from = new Date(to.getTime() - days * 86400000);
    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    };
  }

  function getSite() {
    return siteFilter.value;
  }

  // ── Fetch helper ──
  function fetchView(view, callback) {
    var range = getDateRange();
    var url = API_URL + '?view=' + view + '&from=' + range.from + '&to=' + range.to + '&site=' + getSite();
    fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function (r) {
      if (r.status === 401) {
        gate.style.display = '';
        dashboard.style.display = 'none';
        gateError.textContent = 'Session expired. Please sign in again.';
        token = null;
        return null;
      }
      return r.json();
    })
    .then(function (data) {
      if (data) callback(data);
    })
    .catch(function (err) {
      console.error('Fetch error:', err);
    });
  }

  // ── Format helpers ──
  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function fmtTime(ms) {
    if (ms < 1000) return '0s';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    return m + 'm ' + (s % 60) + 's';
  }

  // ── Destroy chart before recreating ──
  function makeChart(id, config) {
    if (charts[id]) charts[id].destroy();
    var ctx = document.getElementById(id);
    if (!ctx) return null;
    charts[id] = new Chart(ctx, config);
    return charts[id];
  }

  // ── Fill table ──
  function fillTable(tableId, rows) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(function (cells) {
      var tr = document.createElement('tr');
      cells.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    if (rows.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 10;
      td.textContent = 'No data for this period.';
      td.style.textAlign = 'center';
      td.style.color = '#9B9B9B';
      td.style.padding = '24px';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  // Site label helpers
  var SITE_LABELS = { www: 'www', demos: 'demos' };

  function showSiteColumn() {
    return getSite() === 'all';
  }

  // ═══════════════════════════════════════════════
  // View renderers
  // ═══════════════════════════════════════════════

  function renderOverview() {
    fetchView('overview', function (d) {
      document.getElementById('kpiViews').textContent = fmtNum(d.kpis.totalViews);
      document.getElementById('kpiUniques').textContent = fmtNum(d.kpis.totalUniques);
      document.getElementById('kpiDepth').textContent = d.kpis.avgDepth || '—';
      document.getElementById('kpiTime').textContent = fmtTime(d.kpis.avgTimeMs);

      // Daily trend line chart
      var dates = Object.keys(d.dailyViews).sort();
      var viewValues = dates.map(function (dt) { return d.dailyViews[dt] || 0; });
      var uniqueValues = dates.map(function (dt) { return d.dailyUniques[dt] || 0; });
      var labels = dates.map(function (dt) { return dt.slice(5); }); // MM-DD

      makeChart('chartOverviewTrend', {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Views',
              data: viewValues,
              borderColor: COLORS[0],
              backgroundColor: COLORS_LIGHT[0],
              fill: true,
              tension: 0.3,
              pointRadius: 2
            },
            {
              label: 'Uniques',
              data: uniqueValues,
              borderColor: COLORS[1],
              backgroundColor: COLORS_LIGHT[1],
              fill: true,
              tension: 0.3,
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }
          },
          plugins: { legend: { position: 'bottom' } }
        }
      });
    });
  }

  function renderPages() {
    // Show/hide Site column header
    var showSite = showSiteColumn();
    thSite.style.display = showSite ? '' : 'none';

    fetchView('pages', function (d) {
      var rows = (d.pages || []).map(function (p) {
        var row = [];
        if (showSite) row.push(SITE_LABELS[p.site] || p.site);
        row.push(p.pathname, p.views, p.uniques, fmtTime(p.avgTimeMs));
        return row;
      });
      fillTable('tablePages', rows);
    });
  }

  function renderNavigation() {
    fetchView('navigation', function (d) {
      var flowRows = (d.flows || []).map(function (f) {
        return [f.from_page, f.to_page, f.count];
      });
      fillTable('tableFlows', flowRows);

      var entryRows = (d.entryPages || []).map(function (e) {
        return [e.page, e.count];
      });
      fillTable('tableEntry', entryRows);

      var exitRows = (d.exitPages || []).map(function (e) {
        return [e.page, e.count];
      });
      fillTable('tableExit', exitRows);
    });
  }

  function renderEngagement() {
    fetchView('engagement', function (d) {
      // Scroll depth bar chart
      var scrollLabels = ['scroll_25', 'scroll_50', 'scroll_75', 'scroll_100'];
      var scrollValues = scrollLabels.map(function (k) { return d.scrollDepth[k] || 0; });
      var scrollDisplay = ['25%', '50%', '75%', '100%'];

      makeChart('chartScroll', {
        type: 'bar',
        data: {
          labels: scrollDisplay,
          datasets: [{
            label: 'Sessions',
            data: scrollValues,
            backgroundColor: [COLORS[0], COLORS[1], COLORS[2], COLORS[3]]
          }]
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: false } }
        }
      });

      // Time distribution bar chart
      var timeBucketOrder = ['0-10s', '10-30s', '30s-1m', '1-3m', '3m+'];
      var timeValues = timeBucketOrder.map(function (k) { return d.timeBuckets[k] || 0; });

      makeChart('chartTime', {
        type: 'bar',
        data: {
          labels: timeBucketOrder,
          datasets: [{
            label: 'Sessions',
            data: timeValues,
            backgroundColor: [COLORS[0], COLORS[1], COLORS[2], COLORS[3], COLORS[4]]
          }]
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: false } }
        }
      });

      // Click targets table
      var clickRows = (d.clicks || []).map(function (c) {
        return [c.pathname, c.target, c.section || '—', c.clicks];
      });
      fillTable('tableClicks', clickRows);
    });
  }

  function renderAcquisition() {
    fetchView('acquisition', function (d) {
      // Referrers doughnut
      var refLabels = Object.keys(d.referrers || {}).sort(function (a, b) {
        return (d.referrers[b] || 0) - (d.referrers[a] || 0);
      }).slice(0, 8);
      var refValues = refLabels.map(function (k) { return d.referrers[k]; });

      makeChart('chartReferrers', {
        type: 'doughnut',
        data: {
          labels: refLabels,
          datasets: [{
            data: refValues,
            backgroundColor: COLORS.concat(COLORS)
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'right' } }
        }
      });

      // Countries bar
      var countryLabels = Object.keys(d.countries || {}).sort(function (a, b) {
        return (d.countries[b] || 0) - (d.countries[a] || 0);
      }).slice(0, 10);
      var countryValues = countryLabels.map(function (k) { return d.countries[k]; });

      makeChart('chartCountries', {
        type: 'bar',
        data: {
          labels: countryLabels,
          datasets: [{
            label: 'Views',
            data: countryValues,
            backgroundColor: COLORS[1]
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: false } }
        }
      });

      // Devices doughnut
      var devLabels = Object.keys(d.devices || {});
      var devValues = devLabels.map(function (k) { return d.devices[k]; });

      makeChart('chartDevices', {
        type: 'doughnut',
        data: {
          labels: devLabels,
          datasets: [{
            data: devValues,
            backgroundColor: [COLORS[0], COLORS[1], COLORS[2]]
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'right' } }
        }
      });

      // Browsers doughnut
      var browLabels = Object.keys(d.browsers || {}).sort(function (a, b) {
        return (d.browsers[b] || 0) - (d.browsers[a] || 0);
      });
      var browValues = browLabels.map(function (k) { return d.browsers[k]; });

      makeChart('chartBrowsers', {
        type: 'doughnut',
        data: {
          labels: browLabels,
          datasets: [{
            data: browValues,
            backgroundColor: COLORS.concat(COLORS)
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'right' } }
        }
      });
    });
  }

  function renderFunnel() {
    // Show note when filtered to www-only
    var site = getSite();
    funnelNote.style.display = (site === 'www') ? '' : 'none';

    fetchView('funnel', function (d) {
      var steps = d.funnel || [];
      var labels = steps.map(function (s) { return s.name; });
      var values = steps.map(function (s) { return s.visitors; });

      makeChart('chartFunnel', {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Visitors',
            data: values,
            backgroundColor: [COLORS[0], COLORS[1], COLORS[2], COLORS[3]]
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: false } }
        }
      });
    });
  }

  var viewRenderers = {
    overview: renderOverview,
    pages: renderPages,
    navigation: renderNavigation,
    engagement: renderEngagement,
    acquisition: renderAcquisition,
    funnel: renderFunnel
  };

  var viewTitles = {
    overview: 'Overview',
    pages: 'Pages',
    navigation: 'Navigation',
    engagement: 'Engagement',
    acquisition: 'Acquisition',
    funnel: 'Funnel'
  };

  // ── Switch view ──
  function switchView(view) {
    currentView = view;
    viewTitle.textContent = viewTitles[view] || view;

    // Toggle active nav button
    document.querySelectorAll('.admin-nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });

    // Toggle view panels
    document.querySelectorAll('.admin-view').forEach(function (el) {
      el.classList.toggle('active', el.id === 'view-' + view);
    });

    // Render
    if (viewRenderers[view]) viewRenderers[view]();
  }

  // ── Auth ──
  gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    gateError.textContent = '';

    var pw = gatePassword.value;
    if (!pw) return;

    sha256(pw).then(function (hash) {
      // Test against API
      var range = getDateRange();
      var site = getSite();
      return fetch(API_URL + '?view=overview&from=' + range.from + '&to=' + range.to + '&site=' + site, {
        headers: { 'Authorization': 'Bearer ' + hash }
      }).then(function (r) {
        if (r.status === 401) {
          gateError.textContent = 'Incorrect password.';
          return;
        }
        return r.json().then(function (data) {
          token = hash;
          gate.style.display = 'none';
          dashboard.style.display = '';
          // Render initial overview from the data we already have
          renderOverviewFromData(data);
        });
      });
    }).catch(function () {
      gateError.textContent = 'Connection error. Please try again.';
    });
  });

  function renderOverviewFromData(d) {
    document.getElementById('kpiViews').textContent = fmtNum(d.kpis.totalViews);
    document.getElementById('kpiUniques').textContent = fmtNum(d.kpis.totalUniques);
    document.getElementById('kpiDepth').textContent = d.kpis.avgDepth || '—';
    document.getElementById('kpiTime').textContent = fmtTime(d.kpis.avgTimeMs);

    var dates = Object.keys(d.dailyViews).sort();
    var viewValues = dates.map(function (dt) { return d.dailyViews[dt] || 0; });
    var uniqueValues = dates.map(function (dt) { return d.dailyUniques[dt] || 0; });
    var labels = dates.map(function (dt) { return dt.slice(5); });

    makeChart('chartOverviewTrend', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Views',
            data: viewValues,
            borderColor: COLORS[0],
            backgroundColor: COLORS_LIGHT[0],
            fill: true,
            tension: 0.3,
            pointRadius: 2
          },
          {
            label: 'Uniques',
            data: uniqueValues,
            borderColor: COLORS[1],
            backgroundColor: COLORS_LIGHT[1],
            fill: true,
            tension: 0.3,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // ── Sidebar nav ──
  document.querySelectorAll('.admin-nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchView(this.getAttribute('data-view'));
    });
  });

  // ── Date range controls ──
  dateRange.addEventListener('change', function () {
    if (this.value === 'custom') {
      customRange.style.display = '';
    } else {
      customRange.style.display = 'none';
      if (token) switchView(currentView);
    }
  });

  applyRange.addEventListener('click', function () {
    if (token && dateFrom.value && dateTo.value) {
      switchView(currentView);
    }
  });

  // ── Site filter ──
  siteFilter.addEventListener('change', function () {
    if (token) switchView(currentView);
  });

})();
