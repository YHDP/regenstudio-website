/**
 * Admin Analytics Dashboard — Combined (www + demos)
 * - Password auth (SHA-256 client-side → Bearer token)
 * - Site filter (all / www / demos)
 * - View switching, date range picker
 * - Chart.js rendering for all views
 * - CSV export, period comparison, scroll funnel, heatmap, realtime
 */
(function () {
  'use strict';

  var API_URL = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/admin-analytics';

  // Chart palette
  var COLORS = ['#008545', '#009BBB', '#6366F1', '#FFA92D', '#93093F'];
  var COLORS_LIGHT = ['rgba(0,145,75,0.15)', 'rgba(0,155,187,0.15)', 'rgba(99,102,241,0.15)', 'rgba(255,169,45,0.15)', 'rgba(147,9,63,0.15)'];

  var token = null;
  var charts = {};
  var currentView = 'overview';
  var lastViewData = null; // For CSV export

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
  var exportBtn = document.getElementById('exportCsv');

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

  // ── Error banner ──
  function showError(msg) {
    var el = document.getElementById('adminError');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adminError';
      el.style.cssText = 'background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:10px 16px;border-radius:8px;font-size:0.85rem;margin-bottom:16px;display:none;';
      var main = document.querySelector('.admin-main');
      if (main) main.insertBefore(el, main.querySelector('.admin-topbar').nextSibling);
    }
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
  }

  // ── Loading state ──
  function setLoading(viewId, loading) {
    var panel = document.getElementById('view-' + viewId);
    if (!panel) return;
    var existing = panel.querySelector('.admin-loading');
    if (loading && !existing) {
      var div = document.createElement('div');
      div.className = 'admin-loading';
      div.textContent = 'Loading\u2026';
      panel.insertBefore(div, panel.firstChild);
    } else if (!loading && existing) {
      existing.remove();
    }
  }

  // ── Fetch helper ──
  function fetchView(view, callback) {
    var range = getDateRange();
    var url = API_URL + '?view=' + view + '&from=' + range.from + '&to=' + range.to + '&site=' + getSite();
    showError('');
    setLoading(view, true);
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
      if (!r.ok) throw new Error('Server returned ' + r.status);
      return r.json();
    })
    .then(function (data) {
      setLoading(view, false);
      if (data) {
        lastViewData = { view: view, data: data };
        callback(data);
      }
    })
    .catch(function (err) {
      setLoading(view, false);
      showError('Failed to load ' + view + ' data. Check your connection and try again.');
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

  // ── Delta formatting ──
  function setDelta(elId, current, previous, invertColors) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!previous || previous === 0) {
      el.textContent = '';
      el.className = 'admin-kpi__delta';
      return;
    }
    var pct = ((current - previous) / previous * 100).toFixed(0);
    var sign = pct > 0 ? '+' : '';
    el.textContent = sign + pct + '%';
    var isUp = pct > 0;
    if (invertColors) isUp = !isUp; // For bounce rate, up is bad
    el.className = 'admin-kpi__delta ' + (pct == 0 ? 'admin-kpi__delta--neutral' : isUp ? 'admin-kpi__delta--up' : 'admin-kpi__delta--down');
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

  // ── CSV export ──
  function exportCsv() {
    if (!lastViewData) return;
    var rows = [];
    var d = lastViewData.data;
    var v = lastViewData.view;

    if (v === 'quality') {
      var q = d.q || {};
      rows.push(['Metric', 'Value']);
      rows.push(['Human Visitors', q.humanUniques || 0]);
      rows.push(['Bot Visitors', q.botUniques || 0]);
      rows.push(['Human %', (q.humanPct || 0) + '%']);
      rows.push(['Engaged Avg Time (ms)', q.engagedAvgTime || 0]);
      rows.push(['Total Unique Visitors', d.totalUniques || 0]);
      rows.push(['Data Source', q.isEstimate ? 'Behavioral estimate' : 'Bot detection']);
      rows.push([]);
      rows.push(['Signal', 'Percentage']);
      rows.push(['Time >10s', (q.timeQ || 0) + '%']);
      rows.push(['Scrolled 25%+', (q.scrollQ || 0) + '%']);
      rows.push(['Multi-page', (q.depthQ || 0) + '%']);
    } else if (v === 'overview') {
      rows.push(['Date', 'Views', 'Uniques']);
      var dates = Object.keys(d.dailyViews || {}).sort();
      dates.forEach(function (dt) {
        rows.push([dt, d.dailyViews[dt] || 0, d.dailyUniques[dt] || 0]);
      });
    } else if (v === 'pages') {
      rows.push(['Page', 'Views', 'Uniques', 'Avg Time (s)', 'Exit %']);
      (d.pages || []).forEach(function (p) {
        rows.push([p.pathname, p.views, p.uniques, Math.round((p.avgTimeMs || 0) / 1000), p.exitRate || 0]);
      });
    } else if (v === 'navigation') {
      rows.push(['From', 'To', 'Count']);
      (d.flows || []).forEach(function (f) { rows.push([f.from_page, f.to_page, f.count]); });
    } else if (v === 'engagement') {
      rows.push(['Metric', 'Value']);
      ['scroll_25', 'scroll_50', 'scroll_75', 'scroll_100'].forEach(function (k) {
        rows.push([k, d.scrollDepth[k] || 0]);
      });
      rows.push([]);
      rows.push(['Time Bucket', 'Count']);
      Object.keys(d.timeBuckets || {}).forEach(function (k) { rows.push([k, d.timeBuckets[k]]); });
    } else if (v === 'acquisition') {
      rows.push(['Referrer', 'Views']);
      Object.keys(d.referrers || {}).sort(function (a, b) { return d.referrers[b] - d.referrers[a]; }).forEach(function (k) {
        rows.push([k, d.referrers[k]]);
      });
      rows.push([]);
      rows.push(['Country', 'Unique Visitors']);
      Object.keys(d.countries || {}).sort(function (a, b) { return d.countries[b] - d.countries[a]; }).forEach(function (k) {
        rows.push([k, d.countries[k]]);
      });
      if (d.referrerQuality) {
        rows.push([]);
        rows.push(['Source', 'Sessions', 'Avg Depth', 'Avg Time (s)', 'Bounce %']);
        d.referrerQuality.forEach(function (r) {
          rows.push([r.referrer, r.sessions, r.avgDepth, Math.round(r.avgTimeMs / 1000), r.bounceRate]);
        });
      }
    } else if (v === 'hourly') {
      var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      rows.push(['Day/Hour'].concat(Array.from({ length: 24 }, function (_, i) { return String(i); })));
      (d.matrix || []).forEach(function (row, i) {
        rows.push([dayNames[i]].concat(row));
      });
    } else if (v === 'realtime') {
      rows.push(['Time', 'Event', 'Page', 'Country', 'Device', 'Referrer']);
      (d.events || []).forEach(function (e) {
        rows.push([e.created_at, e.event_type, e.pathname, e.country, e.device_type, e.referrer]);
      });
    } else if (v === 'funnel') {
      rows.push(['Step', 'Name', 'Visitors']);
      (d.funnel || []).forEach(function (s) { rows.push([s.step, s.name, s.visitors]); });
    }

    if (rows.length === 0) return;

    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return s.indexOf(',') >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'analytics-' + v + '-' + getDateRange().from + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Site label helpers
  var SITE_LABELS = { www: 'www', demos: 'demos' };

  function showSiteColumn() {
    return getSite() === 'all';
  }

  // ═══════════════════════════════════════════════
  // View renderers
  // ═══════════════════════════════════════════════

  function renderOverviewFromData(d) {
    var k = d.kpis;
    document.getElementById('kpiViews').textContent = fmtNum(k.totalViews);
    document.getElementById('kpiUniques').textContent = fmtNum(k.totalUniques);
    document.getElementById('kpiBounce').textContent = k.bounceRate + '%';
    document.getElementById('kpiDepth').textContent = k.avgDepth || '—';
    document.getElementById('kpiTime').textContent = fmtTime(k.avgTimeMs);

    // Period-over-period deltas
    if (d.prevKpis) {
      var p = d.prevKpis;
      setDelta('kpiViewsDelta', k.totalViews, p.totalViews);
      setDelta('kpiUniquesDelta', k.totalUniques, p.totalUniques);
      setDelta('kpiBounceDelta', k.bounceRate, p.bounceRate, true); // inverted: lower bounce = better
      setDelta('kpiDepthDelta', k.avgDepth, p.avgDepth);
      setDelta('kpiTimeDelta', k.avgTimeMs, p.avgTimeMs);
    }

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

  function renderOverview() {
    fetchView('overview', renderOverviewFromData);
  }

  function renderPages() {
    var showSite = showSiteColumn();
    thSite.style.display = showSite ? '' : 'none';

    fetchView('pages', function (d) {
      var rows = (d.pages || []).map(function (p) {
        var row = [];
        if (showSite) row.push(SITE_LABELS[p.site] || p.site);
        row.push(p.pathname, p.views, p.uniques, fmtTime(p.avgTimeMs), p.exitRate + '%');
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
      // Scroll depth as funnel (percentage of page views)
      var scrollLabels = ['scroll_25', 'scroll_50', 'scroll_75', 'scroll_100'];
      var base = d.totalPageViews || 1;
      var scrollValues = scrollLabels.map(function (k) { return d.scrollDepth[k] || 0; });
      var scrollPct = scrollValues.map(function (v) { return +(v / base * 100).toFixed(1); });
      var scrollDisplay = ['25%', '50%', '75%', '100%'];

      makeChart('chartScroll', {
        type: 'bar',
        data: {
          labels: scrollDisplay,
          datasets: [{
            label: '% of visitors',
            data: scrollPct,
            backgroundColor: [COLORS[0], COLORS[1], COLORS[2], COLORS[3]]
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { callback: function (v) { return v + '%'; } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ctx.parsed.y + '% (' + scrollValues[ctx.dataIndex] + ' events)';
                }
              }
            }
          }
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

      // Countries bar (unique visitors)
      var countryLabels = Object.keys(d.countries || {}).sort(function (a, b) {
        return (d.countries[b] || 0) - (d.countries[a] || 0);
      }).slice(0, 10);
      var countryValues = countryLabels.map(function (k) { return d.countries[k]; });

      makeChart('chartCountries', {
        type: 'bar',
        data: {
          labels: countryLabels,
          datasets: [{
            label: 'Unique Visitors',
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

      // Referrer quality table
      var rqRows = (d.referrerQuality || []).map(function (r) {
        return [r.referrer, r.sessions, r.avgDepth, fmtTime(r.avgTimeMs), r.bounceRate + '%'];
      });
      fillTable('tableRefQuality', rqRows);
    });
  }

  function renderHourly() {
    fetchView('hourly', function (d) {
      var matrix = d.matrix || [];
      var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var container = document.getElementById('heatmapContainer');
      if (!container) return;

      // Find max value for color scaling
      var maxVal = 0;
      matrix.forEach(function (row) {
        row.forEach(function (v) { if (v > maxVal) maxVal = v; });
      });

      var html = '<table><thead><tr><th></th>';
      for (var h = 0; h < 24; h++) {
        html += '<th>' + h + '</th>';
      }
      html += '</tr></thead><tbody>';

      for (var dow = 0; dow < 7; dow++) {
        html += '<tr><th>' + dayNames[dow] + '</th>';
        for (var hr = 0; hr < 24; hr++) {
          var val = (matrix[dow] && matrix[dow][hr]) || 0;
          var level = maxVal > 0 ? Math.ceil(val / maxVal * 5) : 0;
          if (val === 0) level = 0;
          html += '<td class="hm-' + level + '" title="' + dayNames[dow] + ' ' + hr + ':00 UTC — ' + val + ' views">' + (val || '') + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      container.innerHTML = html;
    });
  }

  function renderRealtime() {
    fetchView('realtime', function (d) {
      var rows = (d.events || []).map(function (e) {
        var time = e.created_at ? e.created_at.replace('T', ' ').slice(0, 19) : '—';
        return [time, e.event_type, e.pathname, e.country || 'XX', e.device_type || '—', e.referrer || 'direct'];
      });
      fillTable('tableRealtime', rows);
    });
  }

  function renderFunnel() {
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

  // ── Quality: compute behavioral estimate from engagement data ──
  function computeBehavioralEstimate(tb, sd, totalPV, bounceRate, totalUniques) {
    var totalTimed = 0;
    var engagedTimed = 0;
    ['0-10s', '10-30s', '30s-1m', '1-3m', '3m+'].forEach(function (b) {
      var v = tb[b] || 0;
      totalTimed += v;
      if (b !== '0-10s') engagedTimed += v;
    });
    var timeQ = totalTimed > 0 ? engagedTimed / totalTimed : 0;
    var scrollQ = totalPV > 0 ? (sd.scroll_25 || 0) / totalPV : 0;
    var depthQ = 1 - bounceRate / 100;
    var score = timeQ * 0.4 + scrollQ * 0.3 + depthQ * 0.3;

    var engagedBucketMs = { '10-30s': 20000, '30s-1m': 45000, '1-3m': 120000, '3m+': 300000 };
    var wt = 0;
    Object.keys(engagedBucketMs).forEach(function (b) { wt += (tb[b] || 0) * engagedBucketMs[b]; });
    var engagedAvgTime = engagedTimed > 0 ? Math.round(wt / engagedTimed) : 0;

    return {
      humanUniques: Math.round(totalUniques * score), botUniques: totalUniques - Math.round(totalUniques * score),
      humanPct: Math.round(score * 100), engagedAvgTime: engagedAvgTime,
      timeQ: Math.round(timeQ * 100), scrollQ: Math.round(scrollQ * 100), depthQ: Math.round(depthQ * 100),
      isEstimate: true
    };
  }

  // ── Quality: render everything from computed values ──
  function renderQualityCharts(d, q, dates) {
    // KPIs
    var prefix = q.isEstimate ? '~' : '';
    document.getElementById('kpiHumanVisitors').textContent = prefix + fmtNum(q.humanUniques);
    document.getElementById('kpiBotVisitors').textContent = prefix + fmtNum(q.botUniques);
    document.getElementById('kpiHumanPct').textContent = q.humanPct + '%';
    document.getElementById('kpiEngagedTime').textContent = fmtTime(q.engagedAvgTime);

    // Daily trend (stacked area: human + bot)
    if (dates && dates.length > 0) {
      var labels = dates.map(function (dt) { return dt.slice(5); });
      var humanDaily = dates.map(function (dt) {
        return Math.max(0, (d.dailyViews[dt] || 0) - (d.dailyBotViews ? (d.dailyBotViews[dt] || 0) : 0));
      });
      var botDaily = dates.map(function (dt) {
        return d.dailyBotViews ? (d.dailyBotViews[dt] || 0) : 0;
      });

      makeChart('chartQualityTrend', {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Human',
              data: humanDaily,
              borderColor: COLORS[0],
              backgroundColor: COLORS_LIGHT[0],
              fill: true,
              tension: 0.3,
              pointRadius: 2
            },
            {
              label: 'Bot',
              data: botDaily,
              borderColor: '#9B9B9B',
              backgroundColor: 'rgba(155,155,155,0.15)',
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
            y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
          },
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    // Doughnut: Human vs Bot
    var humanLabel = q.isEstimate ? 'Est. Human' : 'Human';
    var botLabel = q.isEstimate ? 'Est. Bot' : 'Bot';
    makeChart('chartQualitySplit', {
      type: 'doughnut',
      data: {
        labels: [humanLabel, botLabel],
        datasets: [{
          data: [q.humanUniques, q.botUniques],
          backgroundColor: [COLORS[0], '#E4E2E2']
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var total = q.humanUniques + q.botUniques;
                var pct = total > 0 ? Math.round(ctx.raw / total * 100) : 0;
                return ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });

    // Behavioral signals bar
    makeChart('chartQualitySignals', {
      type: 'bar',
      data: {
        labels: ['Time >10s', 'Scrolled 25%+', 'Multi-page'],
        datasets: [
          { label: 'Engaged', data: [q.timeQ, q.scrollQ, q.depthQ], backgroundColor: COLORS[0] },
          { label: 'Not engaged', data: [100 - q.timeQ, 100 - q.scrollQ, 100 - q.depthQ], backgroundColor: '#E4E2E2' }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        scales: {
          x: { stacked: true, max: 100, ticks: { callback: function (v) { return v + '%'; } } },
          y: { stacked: true }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + ctx.raw + '%'; } } }
        }
      }
    });

    // Methodology note
    var methodEl = document.getElementById('qualityMethodology');
    if (methodEl) {
      var source = q.isEstimate
        ? '<p><strong>Data source:</strong> Behavioral estimate — bot tagging is not yet active for this period. ' +
          'Numbers are approximate. Once the Edge Function is deployed and data accumulates, this view will show exact counts.</p>'
        : '<p><strong>Data source:</strong> Real bot detection — bots are tagged by User-Agent pattern matching (client + server). ' +
          'The daily trend shows actual detected bot vs human traffic.</p>';
      methodEl.innerHTML =
        '<h3>How this works</h3>' +
        source +
        '<p>Behavioral signals provide additional quality validation:</p>' +
        '<ul>' +
        '<li><strong>Time engagement (' + q.timeQ + '%)</strong> — Visitors who spent more than 10 seconds.</li>' +
        '<li><strong>Scroll engagement (' + q.scrollQ + '%)</strong> — Visitors who scrolled at least 25%.</li>' +
        '<li><strong>Session depth (' + q.depthQ + '%)</strong> — Visitors who viewed more than one page.</li>' +
        '</ul>';
    }
  }

  function renderQuality() {
    var range = getDateRange();
    var site = getSite();
    showError('');
    setLoading('quality', true);

    var headers = { 'Authorization': 'Bearer ' + token };
    var base = API_URL + '?from=' + range.from + '&to=' + range.to + '&site=' + site;

    // Try the quality endpoint (requires updated Edge Function)
    fetch(base + '&view=quality', { headers: headers })
      .then(function (r) {
        if (r.status === 401) { gate.style.display = ''; dashboard.style.display = 'none'; return null; }
        if (!r.ok) throw new Error('quality endpoint unavailable');
        return r.json();
      })
      .then(function (d) {
        setLoading('quality', false);
        if (!d) return;

        var dates = Object.keys(d.dailyViews || {}).sort();
        var totalUniques = d.totalUniques || 0;
        var tb = d.timeBuckets || {};
        var sd = d.scrollDepth || {};
        var totalPV = d.totalPageViews || 1;
        var bounceRate = d.bounceRate || 0;

        // Behavioral signals (always computed for the signals chart)
        var behavioral = computeBehavioralEstimate(tb, sd, totalPV, bounceRate, totalUniques);

        var q;
        if (d.hasBotData) {
          // Use real bot detection data
          var humanPct = totalUniques > 0 ? Math.round((d.humanUniques || 0) / totalUniques * 100) : 0;
          q = {
            humanUniques: d.humanUniques || 0,
            botUniques: d.botUniques || 0,
            humanPct: humanPct,
            engagedAvgTime: behavioral.engagedAvgTime,
            timeQ: behavioral.timeQ, scrollQ: behavioral.scrollQ, depthQ: behavioral.depthQ,
            isEstimate: false
          };
        } else {
          q = behavioral;
        }

        lastViewData = { view: 'quality', data: { q: q, totalUniques: totalUniques } };
        renderQualityCharts(d, q, dates);
      })
      .catch(function () {
        // Fallback: quality endpoint not deployed yet, use overview + engagement
        Promise.all([
          fetch(base + '&view=overview', { headers: headers }).then(function (r) { return r.json(); }),
          fetch(base + '&view=engagement', { headers: headers }).then(function (r) { return r.json(); })
        ]).then(function (results) {
          setLoading('quality', false);
          var overview = results[0];
          var engagement = results[1];
          if (!overview || !engagement) return;

          var k = overview.kpis || {};
          var totalUniques = k.totalUniques || 0;
          var tb = engagement.timeBuckets || {};
          var sd = engagement.scrollDepth || {};
          var totalPV = engagement.totalPageViews || 1;
          var bounceRate = k.bounceRate || 0;
          var dates = Object.keys(overview.dailyViews || {}).sort();

          var q = computeBehavioralEstimate(tb, sd, totalPV, bounceRate, totalUniques);
          var d = { dailyViews: overview.dailyViews || {}, dailyBotViews: null };

          lastViewData = { view: 'quality', data: { q: q, totalUniques: totalUniques } };
          renderQualityCharts(d, q, dates);
        }).catch(function (err) {
          setLoading('quality', false);
          showError('Failed to load quality data.');
          console.error('Quality fetch error:', err);
        });
      });
  }

  var viewRenderers = {
    overview: renderOverview,
    quality: renderQuality,
    pages: renderPages,
    navigation: renderNavigation,
    engagement: renderEngagement,
    acquisition: renderAcquisition,
    hourly: renderHourly,
    funnel: renderFunnel,
    realtime: renderRealtime
  };

  var viewTitles = {
    overview: 'Overview',
    quality: 'Traffic Quality',
    pages: 'Pages',
    navigation: 'Navigation',
    engagement: 'Engagement',
    acquisition: 'Acquisition',
    hourly: 'Hourly Activity',
    funnel: 'Funnel',
    realtime: 'Realtime'
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
          lastViewData = { view: 'overview', data: data };
          renderOverviewFromData(data);
        });
      });
    }).catch(function () {
      gateError.textContent = 'Connection error. Please try again.';
    });
  });

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

  // ── CSV export ──
  exportBtn.addEventListener('click', exportCsv);

})();
