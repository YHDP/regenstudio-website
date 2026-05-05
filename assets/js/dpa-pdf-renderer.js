/**
 * dpa-pdf-renderer.js — jsPDF native renderer for the DPA AST.
 *
 * Walks the AST produced by RegenMD.parse() and emits a multi-page A4 PDF
 * with selectable text. Replaces the html2pdf raster pipeline (which had a
 * 16384px canvas-height cap and produced non-selectable text — both fatal for
 * binding legal documents).
 *
 * Public API:
 *   RegenPDF.render(ast, opts) → Promise<Blob>
 *
 * opts shape:
 *   {
 *     cover: {
 *       legalName: string,                 // controller legal name
 *       label: string,                     // engagement label
 *       projectEinddatum: string,          // formatted date
 *       bewaarplichtEinddatum: string,     // formatted date
 *       regulatoryLabel: string,
 *     } | null,
 *     signatures: {
 *       processorPng: string|null,         // base64, no data: prefix
 *       controllerPng: string|null,
 *       processorName, processorRole, processorLegalName,
 *       controllerName, controllerRole, controllerLegalName,
 *       signedAt: string,                  // human-readable
 *     } | null,
 *     concept: boolean,                    // adds CONCEPT watermark per page
 *     coverHeroSrc: string,                // path to c11 SVG (default 'Images/dpa-cover-hero-c11.svg')
 *     filename: string,
 *   }
 *
 * Source-of-truth discipline: this file contains ZERO Dutch legal text. All
 * binding text comes from the AST (which itself comes from canonical-NL.md
 * and engagement-specific *.md). Cover labels ("Verwerkersovereenkomst" etc.)
 * are intentional — they're document-structure UI, not binding clauses.
 */

(function (root) {
  'use strict';

  // -------------------------------------------------------------------------
  // Layout constants — A4 portrait, points (1pt = 1/72 inch).
  // -------------------------------------------------------------------------

  const PAGE = {
    width: 595.28,    // 210 mm
    height: 841.89,   // 297 mm
    marginTop: 60,
    marginRight: 50,
    marginBottom: 60,
    marginLeft: 50,
  };
  PAGE.contentWidth = PAGE.width - PAGE.marginLeft - PAGE.marginRight;
  PAGE.contentHeight = PAGE.height - PAGE.marginTop - PAGE.marginBottom;

  const FONT = {
    body: 10,
    bodyLeading: 13.5,
    h1: 20, h1Leading: 26, h1MarginAbove: 18, h1MarginBelow: 12,
    h2: 14, h2Leading: 19, h2MarginAbove: 16, h2MarginBelow: 8,
    h3: 11.5, h3Leading: 15, h3MarginAbove: 12, h3MarginBelow: 6,
    h4: 10.5, h4Leading: 14, h4MarginAbove: 8,  h4MarginBelow: 4,
    code: 9,
    paragraphSpacing: 6,
    listIndent: 16,
    listItemSpacing: 3,
    blockquoteIndent: 18,
  };

  const COLOR = {
    ink: [26, 26, 46],
    muted: [87, 129, 161],
    emerald: [0, 109, 56],
    border: [220, 226, 230],
    plainBg: [250, 246, 236],
    gold: [122, 88, 20],
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function setFontStyle(doc, opts) {
    // opts: {bold, italic, code}
    const family = opts.code ? 'courier' : 'helvetica';
    let style = 'normal';
    if (opts.bold && opts.italic) style = 'bolditalic';
    else if (opts.bold) style = 'bold';
    else if (opts.italic) style = 'italic';
    doc.setFont(family, style);
  }

  function setColor(doc, rgb) {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  }

  function setDraw(doc, rgb) {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }

  function setFill(doc, rgb) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  }

  // Pre-rasterise an SVG (or any image URL) to a PNG data URL via off-screen
  // canvas. The `scale` factor multiplies the image's natural dimensions
  // before drawing — for SVG hero images, scale ≥ 3 is needed so the PDF
  // doesn't show pixelated/low-quality embedding when jsPDF down-scales the
  // PNG into the 495pt content width. Print-quality target is ~300dpi which
  // means the source PNG should be ~2× the target rendered size in pixels.
  async function loadImageAsPng(url, scale) {
    scale = scale || 4;
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          const naturalW = img.naturalWidth || 595;
          const naturalH = img.naturalHeight || 250;
          const canvas = document.createElement('canvas');
          canvas.width = naturalW * scale;
          canvas.height = naturalH * scale;
          const ctx = canvas.getContext('2d');
          // Smooth high-quality scaling (default is browser-dependent).
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) { reject(err); }
      };
      img.onerror = function () { reject(new Error('Failed to load image: ' + url)); };
      img.src = url;
    });
  }

  // -------------------------------------------------------------------------
  // State object — passed through all render functions to track cursor + doc.
  // -------------------------------------------------------------------------

  function newState(doc, opts) {
    return {
      doc: doc,
      opts: opts || {},
      cursorY: PAGE.marginTop,
      pageNumber: 1,
    };
  }

  function pageBreakIfNeeded(state, neededHeight) {
    if (state.cursorY + neededHeight > PAGE.height - PAGE.marginBottom) {
      addPage(state);
    }
  }

  function addPage(state) {
    state.doc.addPage();
    state.pageNumber++;
    state.cursorY = PAGE.marginTop;
    if (state.opts.concept) stampWatermark(state);
  }

  function stampWatermark(state) {
    const doc = state.doc;
    doc.saveGraphicsState && doc.saveGraphicsState();
    setFontStyle(doc, { bold: true });
    doc.setFontSize(56);
    setColor(doc, COLOR.gold);
    if (typeof doc.setGState === 'function' && typeof doc.GState === 'function') {
      try { doc.setGState(new doc.GState({ opacity: 0.10 })); } catch (_) { /* not all jsPDF builds support GState */ }
    }
    doc.text('CONCEPT — NIET ONDERTEKEND', PAGE.width / 2, PAGE.height / 2, {
      align: 'center',
      angle: -30,
    });
    if (typeof doc.setGState === 'function' && typeof doc.GState === 'function') {
      try { doc.setGState(new doc.GState({ opacity: 1 })); } catch (_) {}
    }
    doc.restoreGraphicsState && doc.restoreGraphicsState();
    setColor(doc, COLOR.ink);
  }

  // -------------------------------------------------------------------------
  // Inline-runs renderer — word-by-word layout with style switching.
  //
  // Takes an array of AST runs ({type, text, bold, italic, code} or
  // {type:'link', text, href, bold, italic}) and renders them as flowing text
  // within (PAGE.marginLeft + indent) → (PAGE.marginLeft + indent + maxWidth).
  // Word-wraps at whitespace; advances cursorY when wrapping; page-breaks if
  // wrap exceeds page height.
  //
  // Returns the final cursorY position (caller advances state.cursorY).
  // -------------------------------------------------------------------------

  function renderRuns(state, runs, opts) {
    opts = opts || {};
    const indent = opts.indent || 0;
    const maxWidth = opts.maxWidth || (PAGE.contentWidth - indent);
    const fontSize = opts.fontSize || FONT.body;
    const leading = opts.leading || FONT.bodyLeading;
    const color = opts.color || COLOR.ink;

    const doc = state.doc;
    setColor(doc, color);
    doc.setFontSize(fontSize);

    // Tokenise runs into words preserving style.
    const tokens = [];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const text = run.text || '';
      // Split on whitespace, keeping whitespace as separate tokens.
      const parts = text.split(/(\s+)/);
      for (let j = 0; j < parts.length; j++) {
        if (parts[j] === '') continue;
        tokens.push({
          text: parts[j],
          bold: !!run.bold,
          italic: !!run.italic,
          code: !!run.code,
          isWhitespace: /^\s+$/.test(parts[j]),
        });
      }
    }

    let cursorX = PAGE.marginLeft + indent;
    const lineLeft = PAGE.marginLeft + indent;
    const lineRight = lineLeft + maxWidth;

    pageBreakIfNeeded(state, leading);
    state.cursorY += fontSize; // Move to baseline of first line.

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      setFontStyle(doc, tok);
      doc.setFontSize(tok.code ? FONT.code : fontSize);
      const w = doc.getTextWidth(tok.text);

      // Wrap if word doesn't fit on current line (skip wrap on whitespace).
      if (cursorX + w > lineRight && !tok.isWhitespace && cursorX > lineLeft) {
        cursorX = lineLeft;
        state.cursorY += leading;
        if (state.cursorY > PAGE.height - PAGE.marginBottom) {
          addPage(state);
          state.cursorY += fontSize;
        }
      }

      // Skip leading whitespace at line start.
      if (tok.isWhitespace && cursorX === lineLeft) continue;

      doc.text(tok.text, cursorX, state.cursorY);
      cursorX += w;
    }

    setColor(doc, COLOR.ink);
    setFontStyle(doc, {});
    doc.setFontSize(FONT.body);
  }

  // -------------------------------------------------------------------------
  // Block renderers — one per AST node type.
  // -------------------------------------------------------------------------

  function renderHeading(state, node) {
    const sizes = [
      { size: FONT.h1, leading: FONT.h1Leading, above: FONT.h1MarginAbove, below: FONT.h1MarginBelow },
      { size: FONT.h2, leading: FONT.h2Leading, above: FONT.h2MarginAbove, below: FONT.h2MarginBelow },
      { size: FONT.h3, leading: FONT.h3Leading, above: FONT.h3MarginAbove, below: FONT.h3MarginBelow },
      { size: FONT.h4, leading: FONT.h4Leading, above: FONT.h4MarginAbove, below: FONT.h4MarginBelow },
    ];
    const cfg = sizes[Math.min(node.level - 1, 3)];
    state.cursorY += cfg.above;

    // Bold + emerald color for h1/h2; bold + ink for h3/h4.
    const color = node.level <= 2 ? COLOR.emerald : COLOR.ink;
    // Force-bold on heading runs (override AST's per-run bold).
    const headingRuns = node.runs.map(function (r) {
      return { type: r.type || 'text', text: r.text, href: r.href, bold: true, italic: !!r.italic, code: !!r.code };
    });
    renderRuns(state, headingRuns, { fontSize: cfg.size, leading: cfg.leading, color: color });

    // Underline for h2 (border-bottom equivalent in HTML).
    if (node.level === 2) {
      state.cursorY += 4;
      setDraw(state.doc, COLOR.border);
      state.doc.setLineWidth(0.5);
      state.doc.line(PAGE.marginLeft, state.cursorY, PAGE.marginLeft + PAGE.contentWidth, state.cursorY);
    }
    state.cursorY += cfg.below;
  }

  function renderParagraph(state, node) {
    renderRuns(state, node.runs);
    state.cursorY += FONT.paragraphSpacing;
  }

  function renderList(state, node) {
    const indent = FONT.listIndent;
    const doc = state.doc;
    for (let i = 0; i < node.items.length; i++) {
      pageBreakIfNeeded(state, FONT.bodyLeading);
      // Marker
      const marker = node.ordered ? (i + 1) + '.' : '•';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FONT.body);
      setColor(doc, COLOR.muted);
      doc.text(marker, PAGE.marginLeft + 2, state.cursorY + FONT.body);
      setColor(doc, COLOR.ink);
      // Content
      const beforeY = state.cursorY;
      renderRuns(state, node.items[i], { indent: indent, maxWidth: PAGE.contentWidth - indent });
      state.cursorY += FONT.listItemSpacing;
    }
    state.cursorY += FONT.paragraphSpacing - FONT.listItemSpacing;
  }

  function renderBlockquote(state, node) {
    const indent = FONT.blockquoteIndent;
    const startY = state.cursorY;
    renderRuns(state, node.runs, { indent: indent, maxWidth: PAGE.contentWidth - indent, color: COLOR.muted });
    // Left border
    setDraw(state.doc, COLOR.gold);
    state.doc.setLineWidth(2);
    state.doc.line(PAGE.marginLeft + 4, startY, PAGE.marginLeft + 4, state.cursorY);
    state.cursorY += FONT.paragraphSpacing;
  }

  function renderHr(state) {
    state.cursorY += 8;
    pageBreakIfNeeded(state, 4);
    setDraw(state.doc, COLOR.border);
    state.doc.setLineWidth(0.5);
    state.doc.line(PAGE.marginLeft, state.cursorY, PAGE.marginLeft + PAGE.contentWidth, state.cursorY);
    state.cursorY += 12;
  }

  function renderTable(state, node) {
    const doc = state.doc;
    // Compute true max column count from headers + ALL rows (not just row 0).
    // Defends against ragged tables where some rows have more columns than
    // the header — earlier code allocated weights for `cols` slots but
    // iterated cells past that bound, creating misaligned cells. (Round-1
    // audit: code-quality BLOCK-4 table header bounds.)
    let cols = node.headers ? node.headers.length : 0;
    for (let r = 0; r < node.rows.length; r++) {
      if (node.rows[r] && node.rows[r].length > cols) cols = node.rows[r].length;
    }
    if (cols === 0) {
      console.warn('RegenPDF: empty table node skipped (no headers, no rows). Source markdown likely has a malformed | separator. AST:', node);
      return;
    }

    const cellPadding = 4;
    // Adaptive font size — wide tables (>5 cols) need smaller text to avoid
    // word-breaking pain. Annex A subprocessor table (8 cols) → 7pt; 6-col
    // tables → 8pt; ≤5 cols → 9pt.
    const fontSize = cols > 6 ? 7 : (cols > 5 ? 8 : (FONT.body - 0.5));
    const lineHeight = fontSize + 1.5;

    // Compute proportional column widths from content. Each column gets a
    // weight = max(text-length) across header + all rows. Final width
    // distribution is weighted within PAGE.contentWidth, with floor + ceiling
    // to prevent extreme imbalances (no column < 8% or > 60% of available).
    function cellTextLen(runs) {
      let n = 0;
      for (let i = 0; i < runs.length; i++) n += (runs[i].text || '').length;
      return n;
    }
    const weights = new Array(cols).fill(0);
    if (node.headers) {
      for (let c = 0; c < cols; c++) weights[c] = Math.max(weights[c], cellTextLen(node.headers[c]));
    }
    for (let r = 0; r < node.rows.length; r++) {
      for (let c = 0; c < node.rows[r].length && c < cols; c++) {
        weights[c] = Math.max(weights[c], cellTextLen(node.rows[r][c]));
      }
    }
    const totalWeight = weights.reduce(function (a, b) { return a + b; }, 0) || cols;
    const minW = PAGE.contentWidth * 0.08;
    const maxW = PAGE.contentWidth * 0.60;
    let colWidths = weights.map(function (w) {
      return Math.min(maxW, Math.max(minW, (w / totalWeight) * PAGE.contentWidth));
    });
    // Normalise so widths sum to PAGE.contentWidth exactly.
    const widthSum = colWidths.reduce(function (a, b) { return a + b; }, 0);
    const widthScale = PAGE.contentWidth / widthSum;
    colWidths = colWidths.map(function (w) { return w * widthScale; });

    // X offsets per column.
    const colX = new Array(cols);
    let xAcc = PAGE.marginLeft;
    for (let c = 0; c < cols; c++) { colX[c] = xAcc; xAcc += colWidths[c]; }

    // Break a long word into chunks that fit within maxW. Returns array of
    // chunk strings. Used when a single word is wider than the available
    // column width — without breaking, the word would overflow into the next
    // column. Worst case (URLs, long compound nouns): break at character.
    function breakLongWord(doc, word, maxW) {
      if (doc.getTextWidth(word) <= maxW) return [word];
      const chunks = [];
      let acc = '';
      for (let i = 0; i < word.length; i++) {
        if (doc.getTextWidth(acc + word[i]) > maxW && acc.length > 0) {
          chunks.push(acc);
          acc = word[i];
        } else {
          acc += word[i];
        }
      }
      if (acc) chunks.push(acc);
      return chunks;
    }

    // Render a single cell's runs at (x, y) within (colW), respecting bold/italic.
    // Returns the height consumed.
    function renderCellRuns(runs, x, y, colW, isBold) {
      let curY = y + cellPadding + lineHeight;
      let curX = x + cellPadding;
      const innerW = colW - 2 * cellPadding;
      const innerRight = x + colW - cellPadding;
      let lineCount = 1;

      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const text = run.text || '';
        const tokens = text.split(/(\s+)/);
        for (let t = 0; t < tokens.length; t++) {
          const tok = tokens[t];
          if (tok === '') continue;
          const fontStyle = {
            bold: isBold || !!run.bold,
            italic: !!run.italic,
            code: !!run.code,
          };
          setFontStyle(doc, fontStyle);
          doc.setFontSize(fontStyle.code ? Math.max(6, fontSize - 1) : fontSize);
          const isWs = /^\s+$/.test(tok);
          // Char-break long words that exceed inner width.
          const subTokens = isWs ? [tok] : breakLongWord(doc, tok, innerW);
          for (let s = 0; s < subTokens.length; s++) {
            const sub = subTokens[s];
            const tw = doc.getTextWidth(sub);
            if (curX + tw > innerRight && !isWs && curX > x + cellPadding) {
              curY += lineHeight;
              lineCount++;
              curX = x + cellPadding;
            }
            if (isWs && curX === x + cellPadding) continue;
            doc.text(sub, curX, curY);
            curX += tw;
          }
        }
      }
      return lineCount * lineHeight + 2 * cellPadding;
    }

    // Pre-compute row heights by laying out each cell off-doc.
    function estimateRowHeight(cells, isHeader) {
      let maxH = lineHeight + 2 * cellPadding;
      for (let c = 0; c < cells.length && c < cols; c++) {
        const innerW = colWidths[c] - 2 * cellPadding;
        let lines = 1;
        let curX = 0;
        for (let i = 0; i < cells[c].length; i++) {
          const run = cells[c][i];
          const text = run.text || '';
          const tokens = text.split(/(\s+)/);
          for (let t = 0; t < tokens.length; t++) {
            const tok = tokens[t];
            if (tok === '') continue;
            setFontStyle(doc, { bold: isHeader || !!run.bold, italic: !!run.italic, code: !!run.code });
            doc.setFontSize(run.code ? Math.max(6, fontSize - 1) : fontSize);
            const isWs = /^\s+$/.test(tok);
            const subTokens = isWs ? [tok] : breakLongWord(doc, tok, innerW);
            for (let s = 0; s < subTokens.length; s++) {
              const sub = subTokens[s];
              const tw = doc.getTextWidth(sub);
              if (curX + tw > innerW && !isWs && curX > 0) {
                lines++;
                curX = 0;
              }
              if (isWs && curX === 0) continue;
              curX += tw;
            }
          }
        }
        maxH = Math.max(maxH, lines * lineHeight + 2 * cellPadding);
      }
      return maxH;
    }

    const headerHeight = node.headers ? estimateRowHeight(node.headers, true) : 0;
    const rowHeights = node.rows.map(function (cells) { return estimateRowHeight(cells, false); });
    const totalHeight = headerHeight + rowHeights.reduce(function (a, b) { return a + b; }, 0);

    // Page-break before table if it would split awkwardly AND fits whole-page.
    if (state.cursorY + totalHeight > PAGE.height - PAGE.marginBottom && totalHeight < PAGE.contentHeight) {
      addPage(state);
    }

    let y = state.cursorY;

    function drawHeaderRow() {
      setFill(doc, [240, 244, 247]);
      setDraw(doc, COLOR.border);
      doc.setLineWidth(0.5);
      // Outer cell rects with vertical dividers.
      for (let c = 0; c < cols; c++) {
        doc.rect(colX[c], y, colWidths[c], headerHeight, 'FD');
      }
      setColor(doc, COLOR.ink);
      for (let c = 0; c < node.headers.length && c < cols; c++) {
        renderCellRuns(node.headers[c], colX[c], y, colWidths[c], true);
      }
      y += headerHeight;
    }

    if (node.headers) drawHeaderRow();

    for (let r = 0; r < node.rows.length; r++) {
      const rowH = rowHeights[r];
      if (y + rowH > PAGE.height - PAGE.marginBottom) {
        state.cursorY = y;
        addPage(state);
        y = state.cursorY;
        if (node.headers) drawHeaderRow();
      }
      setFill(doc, r % 2 === 0 ? [255, 255, 255] : [250, 251, 252]);
      setDraw(doc, COLOR.border);
      doc.setLineWidth(0.5);
      for (let c = 0; c < cols; c++) {
        doc.rect(colX[c], y, colWidths[c], rowH, 'FD');
      }
      setColor(doc, COLOR.ink);
      for (let c = 0; c < node.rows[r].length && c < cols; c++) {
        renderCellRuns(node.rows[r][c], colX[c], y, colWidths[c], false);
      }
      y += rowH;
    }

    state.cursorY = y + FONT.paragraphSpacing;
  }

  // -------------------------------------------------------------------------
  // Cover page renderer
  // -------------------------------------------------------------------------

  function renderCover(state, cover, heroPng) {
    const doc = state.doc;

    // Brand strip — chameleon icon placeholder + REGEN STUDIO wordmark.
    // (Logo asset embedding deferred — wordmark text is sufficient for v1.)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    setColor(doc, COLOR.ink);
    doc.text('REGEN', PAGE.marginLeft, PAGE.marginTop + 18);
    doc.setFont('helvetica', 'normal');
    doc.text('STUDIO', PAGE.marginLeft + doc.getTextWidth('REGEN ') + 4, PAGE.marginTop + 18);

    // Hero band
    if (heroPng) {
      try {
        doc.addImage(heroPng, 'PNG', PAGE.marginLeft, PAGE.marginTop + 50, PAGE.contentWidth, 220);
      } catch (err) {
        console.warn('Cover hero render failed (non-fatal):', err);
      }
    }

    // Title block
    let y = PAGE.marginTop + 300;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    setColor(doc, COLOR.ink);
    doc.text('Verwerkersovereenkomst', PAGE.marginLeft, y);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    setColor(doc, COLOR.muted);
    doc.text('onder Artikel 28 AVG · Verordening (EU) 2016/679', PAGE.marginLeft, y);
    y += 28;

    // Parties / engagement table
    const labelW = 140;
    const rows = [
      ['Verantwoordelijke', cover.legalName || '—'],
      ['Verwerker', 'Regen Studio B.V.'],
      ['Engagement', cover.label || '—'],
      ['Project-einddatum', cover.projectEinddatum || '—'],
      ['Bewaarplicht', cover.bewaarplichtEinddatum || '—'],
    ];
    if (cover.regulatoryLabel) rows.push(['Regulatoir kader', cover.regulatoryLabel]);

    setDraw(doc, COLOR.border);
    doc.setLineWidth(0.5);
    doc.setFontSize(10);
    for (let i = 0; i < rows.length; i++) {
      doc.line(PAGE.marginLeft, y - 4, PAGE.marginLeft + PAGE.contentWidth, y - 4);
      doc.setFont('helvetica', 'normal');
      setColor(doc, COLOR.muted);
      doc.text(rows[i][0], PAGE.marginLeft, y + 8);
      doc.setFont('helvetica', 'bold');
      setColor(doc, COLOR.ink);
      const lines = doc.splitTextToSize(rows[i][1], PAGE.contentWidth - labelW);
      for (let l = 0; l < lines.length; l++) {
        doc.text(lines[l], PAGE.marginLeft + labelW, y + 8 + l * 12);
      }
      y += Math.max(20, lines.length * 12 + 6);
    }
    doc.line(PAGE.marginLeft, y - 4, PAGE.marginLeft + PAGE.contentWidth, y - 4);

    // Footer attestation strip
    const stripY = PAGE.height - PAGE.marginBottom - 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, COLOR.muted);
    doc.text('Bilateraal ondertekend met Simple Electronic Signatures · eIDAS Art 25(1)', PAGE.marginLeft, stripY);

    // Triangle marks (4 colors)
    const triColors = [[147, 9, 63], [255, 169, 45], [0, 133, 69], [0, 155, 187]];
    const triSize = 6;
    let tx = PAGE.marginLeft + PAGE.contentWidth - 40;
    for (let t = 0; t < triColors.length; t++) {
      setFill(doc, triColors[t]);
      doc.triangle(tx, stripY - triSize, tx + triSize, stripY - triSize / 2, tx, stripY, 'F');
      tx += triSize + 2;
    }

    // Page break to start canonical body on page 2
    addPage(state);
  }

  // -------------------------------------------------------------------------
  // Bilateral signature block (last page)
  // -------------------------------------------------------------------------

  function renderSignatureBlock(state, sig) {
    const doc = state.doc;
    state.cursorY += 12;
    pageBreakIfNeeded(state, 180);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(doc, COLOR.ink);
    doc.text('Handtekeningen', PAGE.marginLeft, state.cursorY);
    state.cursorY += 14;

    const boxW = (PAGE.contentWidth - 16) / 2;
    const boxH = 95;
    const boxY = state.cursorY;

    // LEFT — Verwerker
    setDraw(doc, COLOR.border);
    setFill(doc, [255, 255, 255]);
    doc.setLineWidth(0.5);
    doc.rect(PAGE.marginLeft, boxY, boxW, boxH, 'FD');
    if (sig.processorPng) {
      try {
        doc.addImage('data:image/png;base64,' + sig.processorPng, 'PNG',
          PAGE.marginLeft + 8, boxY + 8, boxW - 16, boxH - 16, undefined, 'FAST');
      } catch (err) {
        console.warn('Processor signature render failed:', err);
      }
    }
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Verwerker', PAGE.marginLeft, boxY + boxH + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text((sig.processorName || '—') + ' · ' + (sig.processorRole || '—'),
      PAGE.marginLeft, boxY + boxH + 23, { maxWidth: boxW });
    doc.text(sig.processorLegalName || 'Regen Studio B.V.',
      PAGE.marginLeft, boxY + boxH + 32, { maxWidth: boxW });

    // RIGHT — Verantwoordelijke
    const rightX = PAGE.marginLeft + boxW + 16;
    setDraw(doc, COLOR.border);
    setFill(doc, [255, 255, 255]);
    doc.rect(rightX, boxY, boxW, boxH, 'FD');
    if (sig.controllerPng) {
      try {
        doc.addImage('data:image/png;base64,' + sig.controllerPng, 'PNG',
          rightX + 8, boxY + 8, boxW - 16, boxH - 16, undefined, 'FAST');
      } catch (err) {
        console.warn('Controller signature render failed:', err);
      }
    }
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Verantwoordelijke', rightX, boxY + boxH + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text((sig.controllerName || '—') + ' · ' + (sig.controllerRole || '—'),
      rightX, boxY + boxH + 23, { maxWidth: boxW });
    doc.text('namens ' + (sig.controllerLegalName || '—'),
      rightX, boxY + boxH + 32, { maxWidth: boxW });

    state.cursorY = boxY + boxH + 50;

    // Attestation strip
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const attest = 'Visuele bevestiging — de juridische ankers zijn de server-side opgeslagen SHA-256-hash + token-hash + signed_at + IP/UA-hash op de dpa_signatures rij van de Verwerker. Bilateraal ondertekend met Simple Electronic Signatures onder eIDAS Art 25(1) · Verordening (EU) 910/2014. Tijdstip ondertekening (server-vastgelegd): ' + (sig.signedAt || '—') + '.';
    const lines = doc.splitTextToSize(attest, PAGE.contentWidth);
    for (let l = 0; l < lines.length; l++) {
      doc.text(lines[l], PAGE.marginLeft, state.cursorY + l * 9);
    }
    state.cursorY += lines.length * 9 + 8;
    setColor(doc, COLOR.ink);
  }

  // -------------------------------------------------------------------------
  // Public render() entry point
  // -------------------------------------------------------------------------

  async function render(ast, opts) {
    opts = opts || {};
    if (!root.jspdf || !root.jspdf.jsPDF) {
      throw new Error('jsPDF not loaded — required for RegenPDF.render()');
    }
    const jsPDF = root.jspdf.jsPDF;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });

    const state = newState(doc, opts);

    // Stamp watermark on page 1 if concept.
    if (opts.concept) stampWatermark(state);

    // Cover page (optional but expected)
    if (opts.cover) {
      let heroPng = null;
      if (opts.coverHeroSrc !== false) {
        try {
          heroPng = await loadImageAsPng(opts.coverHeroSrc || 'Images/dpa-cover-hero-c11.svg');
        } catch (err) {
          console.warn('Cover hero load failed (rendering without hero):', err.message);
        }
      }
      renderCover(state, opts.cover, heroPng);
    }

    // Walk AST
    for (let i = 0; i < ast.length; i++) {
      const node = ast[i];
      switch (node.type) {
        case 'heading':    renderHeading(state, node);    break;
        case 'paragraph':  renderParagraph(state, node);  break;
        case 'list':       renderList(state, node);       break;
        case 'blockquote': renderBlockquote(state, node); break;
        case 'hr':         renderHr(state);               break;
        case 'table':      renderTable(state, node);      break;
        default:
          console.warn('Unknown AST node type:', node.type);
      }
    }

    // Bilateral signature block (last)
    if (opts.signatures) {
      renderSignatureBlock(state, opts.signatures);
    }

    return doc.output('blob');
  }

  root.RegenPDF = {
    render: render,
    loadImageAsPng: loadImageAsPng,
    PAGE: PAGE,
    FONT: FONT,
  };
})(typeof window !== 'undefined' ? window : this);
