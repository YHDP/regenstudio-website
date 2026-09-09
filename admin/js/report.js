/* Printable per-site analytics report.
 *
 * The dashboard answers questions on screen. This turns the same numbers into a document that
 * carries the SITE's identity rather than Regen's, because an Agrotech report is read by people
 * at Dutch Flow Technology and at the trade mission, not by the person who ran the query.
 *
 * Rendering only. The caller owns the password, the fetches and the window; this file is a pure
 * function from data to an HTML string, so it can be read and checked without a session.
 *
 * Print, don't generate a PDF. The site already vendors jsPDF for the DPA and Scope contracts,
 * where the layout is fixed and the text is known. A report is neither: the table lengths change
 * with the period. Hand-placing that in jsPDF buys a .pdf at the cost of every typographic
 * affordance, so the page is styled for @page A4 and the browser's own Save as PDF finishes it.
 *
 * NOTHING IS INVENTED. A section whose data is empty is dropped, and says so. No metric is
 * derived from another metric unless the arithmetic is exact.
 */
(function () {
  'use strict';

  // ── Per-site identity ──────────────────────────────────────────────────────
  // Poppins is subset to Latin-1 (217 glyphs), which covers every accent PT-BR needs.
  var THEMES = {
    agro: {
      lang: 'pt',
      wordmark: ['Agrotech', 'da Holanda'],
      domain: 'agrotechdaholanda.com.br',
      font: "Poppins, system-ui, sans-serif",
      faces: [400, 600, 700].map(function (w) {
        return "@font-face{font-family:Poppins;src:url(fonts/poppins-" + w +
               ".woff2)format('woff2');font-weight:" + w + ";font-display:swap}";
      }).join(''),
      ink: '#14263C', accent: '#FF914D', second: '#38B6FF',
      paper: '#FBFAF7', muted: '#55677D', rule: '#E8E4DB',
    },
    _default: {
      lang: 'en',
      wordmark: ['Regen', 'Studio'],
      domain: '',
      font: "Inter, system-ui, sans-serif",
      faces: "@font-face{font-family:Inter;src:url(../assets/fonts/inter-latin.woff2)" +
             "format('woff2');font-weight:400 700;font-display:swap}",
      ink: '#1a1a2e', accent: '#008545', second: '#009BBB',
      paper: '#FAFAF7', muted: '#55677D', rule: '#E4E4DE',
    },
  };

  var DOMAINS = {
    www: 'www.regenstudio.world',
    demos: 'demos.regenstudio.world',
    ponte: 'ponte-em-cena.com.br',
    agro: 'agrotechdaholanda.com.br',
  };

  function themeFor(site) {
    var t = THEMES[site] || THEMES._default;
    // Ponte is Brazilian; it gets the Portuguese wording even on the default visual theme.
    if (site === 'ponte') t = assign({}, t, { lang: 'pt', domain: DOMAINS.ponte });
    if (!t.domain && DOMAINS[site]) t = assign({}, t, { domain: DOMAINS[site] });
    return t;
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  // ── Wording ────────────────────────────────────────────────────────────────
  var STRINGS = {
    pt: {
      report: 'Relatório do site', period: 'Período', generated: 'Gerado em',
      summary: 'Resumo', uniques: 'Visitantes únicos', views: 'Páginas vistas',
      depth: 'Páginas por sessão', time: 'Tempo médio na página', bounce: 'Saíram na 1ª página',
      prev: 'vs. anterior', film: 'O filme', filmStarted: 'Começaram a assistir',
      filmComplete: 'Assistiram até o fim', ofStarts: 'de quem começou',
      watched: 'Assistiram',
      pages: 'Páginas mais vistas', page: 'Página', pviews: 'Visualizações',
      puniques: 'Únicos', ptime: 'Tempo médio',
      acq: 'Como chegaram', source: 'Origem', direct: 'acesso direto',
      scroll: 'Profundidade de leitura', reached: 'chegaram a',
      clicks: 'O que clicaram', target: 'Botão ou link', nclicks: 'Cliques',
      empty: 'Sem dados neste período.',
      bots: 'Robôs e rastreadores, contados à parte e fora dos números acima',
      privacy: 'Medição própria, sem cookies. O endereço IP não é guardado e os eventos brutos ' +
               'são apagados depois de 48 horas.',
      noFilm: 'Nenhum vídeo foi iniciado neste período.',
    },
    en: {
      report: 'Site report', period: 'Period', generated: 'Generated',
      summary: 'Summary', uniques: 'Unique visitors', views: 'Page views',
      depth: 'Pages per session', time: 'Average time on page', bounce: 'Left on first page',
      prev: 'vs. previous', film: 'Video', filmStarted: 'Started watching',
      filmComplete: 'Watched to the end', ofStarts: 'of those who started',
      watched: 'Watched',
      pages: 'Most viewed pages', page: 'Page', pviews: 'Views',
      puniques: 'Uniques', ptime: 'Average time',
      acq: 'How they arrived', source: 'Source', direct: 'direct',
      scroll: 'Reading depth', reached: 'reached',
      clicks: 'What they clicked', target: 'Button or link', nclicks: 'Clicks',
      empty: 'No data in this period.',
      bots: 'Bots and crawlers, counted separately and excluded from the figures above',
      privacy: 'First-party measurement, no cookies. The IP address is not stored and raw events ' +
               'are deleted after 48 hours.',
      noFilm: 'No video was started in this period.',
    },
  };

  // ── Formatting ─────────────────────────────────────────────────────────────
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(n, lang) {
    return Number(n || 0).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-GB');
  }

  function dec(n, lang) {
    return Number(n || 0).toFixed(1).replace('.', lang === 'pt' ? ',' : '.');
  }

  function duration(ms, lang) {
    var s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    return m + 'm ' + (s % 60) + 's';
  }

  function pct(part, whole, lang) {
    if (!whole) return null;
    return dec(part / whole * 100, lang) + '%';
  }

  // Period-over-period change. Returns null when there is no previous figure to compare
  // against, rather than the +100% that dividing by zero invites.
  function delta(now, before, lang) {
    if (!before) return null;
    var change = (now - before) / before * 100;
    var sign = change > 0 ? '+' : change < 0 ? '−' : '';
    return sign + dec(Math.abs(change), lang) + '%';
  }

  function dateLabel(iso, lang) {
    var p = String(iso).split('-');
    if (p.length !== 3) return esc(iso);
    return lang === 'pt' ? p[2] + '/' + p[1] + '/' + p[0] : p[2] + '.' + p[1] + '.' + p[0];
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────
  function kpiCard(label, value, sub) {
    return '<div class="kpi"><div class="kpi__v">' + value + '</div>' +
           '<div class="kpi__l">' + esc(label) + '</div>' +
           (sub ? '<div class="kpi__d">' + sub + '</div>' : '') + '</div>';
  }

  function section(title, body) {
    return '<section class="sec"><h2>' + esc(title) + '</h2>' + body + '</section>';
  }

  function table(headers, rows, aligns) {
    var out = '<table><thead><tr>';
    headers.forEach(function (h, i) {
      out += '<th' + (aligns && aligns[i] === 'r' ? ' class="r"' : '') + '>' + esc(h) + '</th>';
    });
    out += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      out += '<tr>';
      r.forEach(function (c, i) {
        out += '<td' + (aligns && aligns[i] === 'r' ? ' class="r"' : '') + '>' + c + '</td>';
      });
      out += '</tr>';
    });
    return out + '</tbody></table>';
  }

  // A labelled proportion bar. `whole` is the denominator the bar is drawn against.
  function bar(label, value, whole, lang, tint) {
    var share = whole ? Math.max(0, Math.min(1, value / whole)) : 0;
    return '<div class="bar">' +
      '<div class="bar__l">' + esc(label) + '</div>' +
      '<div class="bar__t"><div class="bar__f" style="width:' + (share * 100).toFixed(1) + '%' +
        (tint ? ';background:' + tint : '') + '"></div></div>' +
      '<div class="bar__v">' + num(value, lang) +
        (whole ? ' <span class="dim">' + dec(share * 100, lang) + '%</span>' : '') +
      '</div></div>';
  }

  // ── The report ─────────────────────────────────────────────────────────────
  /**
   * ctx = { site, from, to, overview, pages, engagement, acquisition }
   * Any of the four data objects may be null; its section is dropped.
   */
  function render(ctx) {
    var t = themeFor(ctx.site);
    var S = STRINGS[t.lang];
    var lang = t.lang;
    var ov = ctx.overview || {};
    var k = ov.kpis || {};
    var pk = ov.prevKpis || {};

    var body = '';

    // Summary
    body += section(S.summary,
      '<div class="kpis">' +
      kpiCard(S.uniques, num(k.totalUniques, lang), sub(delta(k.totalUniques, pk.totalUniques, lang), S.prev)) +
      kpiCard(S.views, num(k.totalViews, lang), sub(delta(k.totalViews, pk.totalViews, lang), S.prev)) +
      kpiCard(S.depth, dec(k.avgDepth, lang), sub(delta(k.avgDepth, pk.avgDepth, lang), S.prev)) +
      kpiCard(S.time, duration(k.avgTimeMs, lang), sub(delta(k.avgTimeMs, pk.avgTimeMs, lang), S.prev)) +
      kpiCard(S.bounce, dec(k.bounceRate, lang) + '%', sub(delta(k.bounceRate, pk.bounceRate, lang), S.prev)) +
      '</div>' +
      (ov.hasBotData
        ? '<p class="note">' + esc(S.bots) + ': ' + num(ov.botViews, lang) + '.</p>'
        : ''));

    // The film. Only rendered when the site actually emits video events.
    var vd = (ctx.engagement && ctx.engagement.videoDepth) || {};
    var started = vd.video_play || 0;
    if (started > 0) {
      var steps = [
        [S.filmStarted, started],
        [S.watched + ' 25%', vd.video_25 || 0],
        [S.watched + ' 50%', vd.video_50 || 0],
        [S.watched + ' 75%', vd.video_75 || 0],
        [S.filmComplete, vd.video_complete || 0],
      ];
      var bars = steps.map(function (s, i) {
        return bar(s[0], s[1], started, lang, i === steps.length - 1 ? t.accent : null);
      }).join('');
      var finished = pct(vd.video_complete || 0, started, lang);
      body += section(S.film, bars +
        (finished ? '<p class="note">' + esc(S.filmComplete) + ': ' + finished + ' ' +
                    esc(S.ofStarts) + '.</p>' : ''));
    }

    // Pages
    var pageRows = ((ctx.pages && ctx.pages.pages) || []).slice(0, 15).map(function (p) {
      return [esc(p.pathname), num(p.views, lang), num(p.uniques, lang), duration(p.avgTimeMs, lang)];
    });
    body += section(S.pages, pageRows.length
      ? table([S.page, S.pviews, S.puniques, S.ptime], pageRows, ['l', 'r', 'r', 'r'])
      : '<p class="note">' + esc(S.empty) + '</p>');

    // Acquisition
    var refs = (ctx.acquisition && ctx.acquisition.referrers) || {};
    var refRows = Object.keys(refs).sort(function (a, b) { return refs[b] - refs[a]; })
      .slice(0, 12).map(function (r) {
        return [esc(r === 'direct' ? S.direct : r), num(refs[r], lang)];
      });
    body += section(S.acq, refRows.length
      ? table([S.source, S.pviews], refRows, ['l', 'r'])
      : '<p class="note">' + esc(S.empty) + '</p>');

    // Reading depth
    var sd = (ctx.engagement && ctx.engagement.scrollDepth) || {};
    var totalPv = (ctx.engagement && ctx.engagement.totalPageViews) || 0;
    if (totalPv > 0) {
      body += section(S.scroll, [25, 50, 75, 100].map(function (d) {
        return bar(S.reached + ' ' + d + '%', sd['scroll_' + d] || 0, totalPv, lang, t.second);
      }).join(''));
    }

    // Clicks
    var clickAgg = {};
    ((ctx.engagement && ctx.engagement.clicks) || []).forEach(function (c) {
      clickAgg[c.target] = (clickAgg[c.target] || 0) + c.clicks;
    });
    var clickRows = Object.keys(clickAgg).sort(function (a, b) { return clickAgg[b] - clickAgg[a]; })
      .slice(0, 12).map(function (c) { return [esc(c), num(clickAgg[c], lang)]; });
    if (clickRows.length) {
      body += section(S.clicks, table([S.target, S.nclicks], clickRows, ['l', 'r']));
    }

    function sub(d, label) { return d ? d + ' <span class="dim">' + esc(label) + '</span>' : ''; }

    var today = new Date().toISOString().slice(0, 10);
    var title = t.wordmark.join(' ') + ' — ' + S.report;

    return '<!doctype html><html lang="' + (lang === 'pt' ? 'pt-BR' : 'en') + '"><head>' +
      '<meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>' + t.faces + css(t) + '</style></head><body>' +
      '<header class="head">' +
        '<div class="mark"><span>' + esc(t.wordmark[0]) + '</span> ' +
          '<span class="mark__b">' + esc(t.wordmark[1]) + '</span></div>' +
        '<h1>' + esc(S.report) + '</h1>' +
        '<p class="meta">' + esc(S.period) + ' ' + dateLabel(ctx.from, lang) + ' – ' +
          dateLabel(ctx.to, lang) + (t.domain ? ' · ' + esc(t.domain) : '') + '</p>' +
      '</header>' + body +
      '<footer class="foot"><p>' + esc(S.privacy) + '</p>' +
        '<p class="dim">' + esc(S.generated) + ' ' + dateLabel(today, lang) + '</p></footer>' +
      '</body></html>';
  }

  function css(t) {
    return '' +
      '@page{size:A4;margin:16mm 14mm}' +
      '*{box-sizing:border-box}' +
      'body{margin:0;padding:28px 34px;font-family:' + t.font + ';color:' + t.ink +
        ';background:' + t.paper + ';font-size:13px;line-height:1.5;' +
        '-webkit-font-smoothing:antialiased}' +
      '.head{border-bottom:3px solid ' + t.ink + ';padding-bottom:14px;margin-bottom:26px}' +
      '.mark{font-weight:700;font-size:22px;letter-spacing:-.5px}' +
      '.mark__b{color:' + t.accent + '}' +
      'h1{margin:10px 0 2px;font-size:27px;font-weight:700;letter-spacing:-.6px}' +
      'h2{font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;' +
        'color:' + t.muted + ';margin:0 0 12px}' +
      '.meta{margin:0;color:' + t.muted + '}' +
      '.sec{margin:0 0 26px}' +
      'h2{break-after:avoid;page-break-after:avoid}' +
      '.kpis{display:flex;flex-wrap:wrap;gap:10px}' +
      '.kpi{flex:1 1 128px;border:1px solid ' + t.rule + ';border-radius:9px;padding:12px 14px;' +
        'background:#fff}' +
      '.kpi__v{font-size:25px;font-weight:700;letter-spacing:-.7px;line-height:1.1}' +
      '.kpi__l{color:' + t.muted + ';font-size:11.5px;margin-top:3px}' +
      '.kpi__d{font-size:11px;margin-top:5px;font-weight:600}' +
      '.dim{color:' + t.muted + ';font-weight:400}' +
      'table{width:100%;border-collapse:collapse;font-size:12.5px}' +
      'th{text-align:left;font-weight:600;color:' + t.muted + ';border-bottom:1px solid ' + t.ink +
        ';padding:0 8px 6px}' +
      'td{padding:6px 8px;border-bottom:1px solid ' + t.rule + '}' +
      'th.r,td.r{text-align:right;font-variant-numeric:tabular-nums}' +
      '.bar{display:flex;align-items:center;gap:12px;margin:0 0 7px}' +
      '.bar__l{flex:0 0 190px;font-size:12.5px}' +
      '.bar__t{flex:1;height:9px;border-radius:5px;background:' + t.rule + ';overflow:hidden}' +
      '.bar__f{height:100%;border-radius:5px;background:' + t.second + '}' +
      '.bar__v{flex:0 0 118px;text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums}' +
      '.note{color:' + t.muted + ';font-size:12px;margin:10px 0 0}' +
      '.foot{border-top:1px solid ' + t.rule + ';padding-top:12px;margin-top:34px;' +
        'color:' + t.muted + ';font-size:11.5px}' +
      '.foot p{margin:0 0 3px}' +
      'thead{display:table-header-group}' +
      'tr,.bar,.kpi{break-inside:avoid;page-break-inside:avoid}' +
      '@media print{body{background:#fff;padding:0}}';
  }

  window.AnalyticsReport = { render: render, themeFor: themeFor };
})();
