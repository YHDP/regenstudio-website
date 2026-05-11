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

  // Loaded-version banner so we can verify cache freshness in DevTools console.
  console.log('[pdf-rendering] renderer v2026-05-05h loaded — full-width justify (no cap) + 14pt paragraph spacing');

  // -------------------------------------------------------------------------
  // Layout constants — A4 portrait, points (1pt = 1/72 inch).
  // -------------------------------------------------------------------------

  const PAGE = {
    width: 595.28,    // 210 mm
    height: 841.89,   // 297 mm
    marginTop: 70,
    marginRight: 70,
    marginBottom: 70,
    marginLeft: 70,
  };
  PAGE.contentWidth = PAGE.width - PAGE.marginLeft - PAGE.marginRight;
  PAGE.contentHeight = PAGE.height - PAGE.marginTop - PAGE.marginBottom;

  // Typography per references/typography-system.md (legal-typography 2026 spec).
  // Density-tuned 2026-05-05 to fit ~33-34 pages instead of 40 while staying
  // within the 1.45× leading minimum (Dorian Law / GoConstellation 2026).
  const FONT = {
    body: 11,
    bodyLeading: 16,           // 1.45× — at the lower end of legal-spec, still readable
    h1: 18, h1Leading: 23, h1MarginAbove: 16, h1MarginBelow: 10,
    h2: 14, h2Leading: 19, h2MarginAbove: 18, h2MarginBelow: 8,
    h3: 12, h3Leading: 16, h3MarginAbove: 12, h3MarginBelow: 6,
    h4: 10.5, h4Leading: 14, h4MarginAbove: 10, h4MarginBelow: 5,
    code: 10,                  // Closer to body 11pt to minimize baseline-jump on inline code tokens
    caption: 8,
    coverTitle: 32,
    paragraphSpacing: 14,      // 2x earlier value — Yvo flagged 7pt too tight
    listIndent: 16,
    listItemSpacing: 3,
    blockquoteIndent: 18,
  };

  // Brand-font registration. Reads optional window globals (set by lazy-loaded
  // base64 font modules in assets/fonts/jspdf/) and registers them with the
  // current jsPDF doc. Falls back gracefully to helvetica/courier if a font
  // module isn't loaded — that's the "Path 1 default" mode.
  function registerBrandFonts(doc) {
    const vfsCache = {};
    const reg = (vfsName, base64, family, style) => {
      if (!base64) return false;
      try {
        if (!vfsCache[vfsName]) {
          doc.addFileToVFS(vfsName, base64);
          vfsCache[vfsName] = true;
        }
        doc.addFont(vfsName, family, style);
        return true;
      } catch (err) {
        console.warn('Font registration failed for ' + family + ' ' + style, err);
        return false;
      }
    };
    const flags = {
      koho: reg('KoHo-Bold.ttf', window.KOHO_BOLD, 'KoHo', 'bold')
            && reg('KoHo-Regular.ttf', window.KOHO_REGULAR, 'KoHo', 'normal')
            && reg('KoHo-Light.ttf', window.KOHO_LIGHT, 'KoHo-Light', 'normal'),
      lora: reg('Lora-Regular.ttf', window.LORA_REGULAR, 'Lora', 'normal')
            && reg('Lora-Bold.ttf', window.LORA_BOLD, 'Lora', 'bold')
            // Italics fall back to regular (no separate Lora-Italic shipped).
            // jsPDF uses the same regular glyphs when style='italic' is requested —
            // visually no distinction, but better than mixed-font fallback.
            && reg('Lora-Regular.ttf', window.LORA_REGULAR, 'Lora', 'italic')
            && reg('Lora-Bold.ttf', window.LORA_BOLD, 'Lora', 'bolditalic'),
      inter: reg('Inter-Regular.ttf', window.INTER_REGULAR, 'Inter', 'normal')
             && reg('Inter-Medium.ttf', window.INTER_MEDIUM, 'Inter-Medium', 'normal')
             && reg('Inter-SemiBold.ttf', window.INTER_SEMIBOLD, 'Inter-SemiBold', 'normal')
             && reg('Inter-Bold.ttf', window.INTER_BOLD, 'Inter', 'bold'),
      jetbrains: reg('JetBrainsMono-Regular.ttf', window.JETBRAINS_MONO_REGULAR, 'JetBrainsMono', 'normal'),
    };
    doc._regenFonts = flags;
    return flags;
  }

  // Font-role lookup: maps semantic role to (family, style). Falls back to
  // helvetica/courier when a brand font isn't registered.
  function fontFor(doc, role) {
    const f = doc._regenFonts || {};
    switch (role) {
      case 'cover-title':       return f.koho      ? ['KoHo', 'bold']            : ['helvetica', 'bold'];
      case 'cover-wordmark':    return f.koho      ? ['KoHo', 'bold']            : ['helvetica', 'bold'];
      case 'cover-subtitle':    return f.inter     ? ['Inter', 'normal']         : ['helvetica', 'normal'];
      case 'h1':                return f.inter     ? ['Inter-SemiBold', 'normal']: ['helvetica', 'bold'];
      case 'h2':                return f.inter     ? ['Inter-SemiBold', 'normal']: ['helvetica', 'bold'];
      case 'h3':                return f.inter     ? ['Inter-Medium', 'normal']  : ['helvetica', 'bold'];
      case 'h4':                return f.inter     ? ['Inter-Medium', 'normal']  : ['helvetica', 'bold'];
      // Body: Inter Regular — sans-serif, modern, scant compacter dan Lora
      // serif. Legal-typography 2026 increasingly accepts sans-serif body
      // (Stripe Atlas, modern fintech docs). Switch made 2026-05-05 after
      // 40-page DPA round-trip showed Lora-driven density was too sparse.
      // Italics fall back to Inter Regular (no separate Inter-Italic shipped).
      // Blockquotes keep Lora Italic for visual+brand distinction (see fontFor 'blockquote').
      case 'body':              return f.inter     ? ['Inter', 'normal']         : ['helvetica', 'normal'];
      // body-bold uses SemiBold (600) instead of Bold (700) so emphasis reads
      // as "noticeable" rather than "shouting" — important on definition-style
      // paragraphs with many bolded terms in a row.
      case 'body-bold':         return f.inter     ? ['Inter-SemiBold', 'normal']: ['helvetica', 'bold'];
      case 'body-italic':       return f.inter     ? ['Inter', 'normal']         : ['helvetica', 'italic'];
      case 'body-bolditalic':   return f.inter     ? ['Inter-SemiBold', 'normal']: ['helvetica', 'bolditalic'];
      case 'blockquote':        return f.lora      ? ['Lora', 'italic']          : ['helvetica', 'italic'];
      case 'code':              return f.jetbrains ? ['JetBrainsMono', 'normal'] : ['courier', 'normal'];
      case 'caption':           return f.inter     ? ['Inter', 'normal']         : ['helvetica', 'normal'];
      case 'caption-bold':      return f.inter     ? ['Inter-SemiBold', 'normal']: ['helvetica', 'bold'];
      case 'tagline':           return f.inter     ? ['Inter-SemiBold', 'normal']: ['helvetica', 'bold'];
      default:                  return ['helvetica', 'normal'];
    }
  }

  function setFontByRole(doc, role) {
    const [family, style] = fontFor(doc, role);
    doc.setFont(family, style);
  }

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

  // jsPDF's built-in helvetica/courier use WinAnsi encoding which does NOT
  // include common Unicode characters used in legal prose: arrows (→ ←),
  // ellipsis (…), and certain dashes/quotes can render as garbled bytes.
  // Map those to WinAnsi-safe equivalents before doc.text().
  const PDF_TEXT_REPLACEMENTS = [
    [/→/g, '->'],     // → rightwards arrow
    [/←/g, '<-'],     // ← leftwards arrow
    [/↔/g, '<->'],    // ↔ left-right arrow
    [/⇒/g, '=>'],     // ⇒ rightwards double arrow
    [/⇐/g, '<='],     // ⇐ leftwards double arrow
    [/…/g, '...'],    // … horizontal ellipsis (WinAnsi has it but
                            //   helvetica often falls back; safer to expand)
    [/ /g, ' '],      //   non-breaking space → regular space
    [/ /g, ' '],      //   narrow no-break space
    [/​/g, ''],       //   zero-width space (defensive)
    [/•/g, '•'], // • bullet (WinAnsi has it; pass through)
  ];

  function pdfSafeText(s) {
    if (typeof s !== 'string') return s;
    let out = s;
    for (let k = 0; k < PDF_TEXT_REPLACEMENTS.length; k++) {
      out = out.replace(PDF_TEXT_REPLACEMENTS[k][0], PDF_TEXT_REPLACEMENTS[k][1]);
    }
    return out;
  }

  // Break a long word into chunks that fit within maxW. Returns array of
  // chunk strings. Used when a single word is wider than the available
  // line/column width — without breaking, the word would overflow.
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

  function setFontStyle(doc, opts) {
    // opts: {bold, italic, code, role?}
    // Body-text default uses Lora (or helvetica fallback). Code uses JetBrainsMono.
    // Optional role override lets headings/captions pick their brand font.
    if (opts.role) {
      // Apply emphasis modifiers to the role's base font
      let role = opts.role;
      if (opts.bold && (role === 'body')) role = 'body-bold';
      if (opts.italic && (role === 'body')) role = 'body-italic';
      if (opts.bold && opts.italic && (role === 'body')) role = 'body-bolditalic';
      setFontByRole(doc, role);
      return;
    }
    if (opts.code) {
      setFontByRole(doc, 'code');
      return;
    }
    let role = 'body';
    if (opts.bold && opts.italic) role = 'body-bolditalic';
    else if (opts.bold) role = 'body-bold';
    else if (opts.italic) role = 'body-italic';
    setFontByRole(doc, role);
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
      // Internal-link infrastructure: anchorMap[slug] = {page, y} captured
      // when a heading is rendered; linkRequests collects §X.Y reference
      // bboxes during body render. Resolved at end of render().
      anchorMap: {},
      linkRequests: [],
    };
  }

  // Section-id pattern: 5.4, 5.4.1, B.6bis, C.4, etc. Matches both
  // numbered (X.Y) and Annex-letter (A.X) sections.
  const SECTION_ID_RE = /^(?:\d+\.\d+(?:\.\d+)?(?:bis)?|[A-Z]\.\d+(?:bis)?)$/;

  function pageBreakIfNeeded(state, neededHeight) {
    if (state.cursorY + neededHeight > PAGE.height - PAGE.marginBottom) {
      addPage(state);
    }
  }

  function addPage(state) {
    // Stamp footer on the OUTGOING page before adding a new one (covers
    // the body-pages flow). Cover page already renders its own footer.
    if (state.pageNumber >= 2) renderPageFooter(state);
    state.doc.addPage();
    state.pageNumber++;
    state.cursorY = PAGE.marginTop;
    if (state.opts.concept) stampWatermark(state);
  }

  // Footer rendered on every body page: "Pagina N" + 4 brand-colored
  // triangle arrows. Cover (page 1) handles its own footer.
  function renderPageFooter(state) {
    const doc = state.doc;
    const footY = PAGE.height - 30;

    setFontByRole(doc, 'caption');
    doc.setFontSize(FONT.caption);
    setColor(doc, COLOR.muted);
    doc.text('Pagina ' + state.pageNumber, PAGE.marginLeft, footY);

    const triColors = [[147, 9, 63], [255, 169, 45], [0, 133, 69], [0, 155, 187]];
    const triSize = 8;
    const triGap = 4;
    let tx = PAGE.width - PAGE.marginRight - (triColors.length * (triSize + triGap));
    for (let t = 0; t < triColors.length; t++) {
      setFill(doc, triColors[t]);
      doc.triangle(tx, footY - triSize / 2 - 2, tx + triSize, footY - 2, tx, footY + triSize / 2 - 2, 'F');
      tx += triSize + triGap;
    }
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
    const role = opts.role || null;
    // Default body text is justified for legal-doc polish; headings + captions
    // use natural left alignment (justify on short lines looks weird).
    const justify = (opts.justify !== undefined)
      ? opts.justify
      : (!role || role === 'body');

    const doc = state.doc;
    setColor(doc, color);
    doc.setFontSize(fontSize);

    // Tokenise runs into words preserving style.
    let tokens = [];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const text = run.text || '';
      const parts = text.split(/(\s+)/);
      for (let j = 0; j < parts.length; j++) {
        if (parts[j] === '') continue;
        // Pre-measure each token with the right font/size so line-fit is exact
        const tokRole = role;
        setFontStyle(doc, { bold: !!run.bold, italic: !!run.italic, code: !!run.code, role: tokRole });
        doc.setFontSize(run.code ? FONT.code : fontSize);
        const safeText = pdfSafeText(parts[j]);
        tokens.push({
          text: safeText,
          bold: !!run.bold,
          italic: !!run.italic,
          code: !!run.code,
          isWhitespace: /^\s+$/.test(parts[j]),
          width: doc.getTextWidth(safeText),
        });
      }
    }

    // Merge "§ X.Y" / "§ X" / "Annex X" patterns into single linked tokens.
    // Body text wraps refs with surrounding punctuation: "(§ 5.4)", "§ 1;",
    // "Annex B." etc. The detection handles: leading "(" glued to "§" or
    // "Annex", trailing punct on the section-id, and stand-alone refs.
    // Only fire on body text — heading rendering doesn't need self-references.
    if (!role || role === 'body') {
      // Section-id group: \d+ (1, 11) | \d+.\d+ (5.4) | \d+.\d+.\d+ (5.3.1) | with bis | [A-Z].\d+ (B.6) | [A-Z] (A, B) — Annex letter alone
      const SECTION_ID_GROUP = '(\\d+(?:\\.\\d+(?:\\.\\d+)?)?(?:bis)?|[A-Z](?:\\.\\d+(?:bis)?)?)';
      const TRAILING_PUNCT = '([\\)\\],;.:!?]*)';
      const SECTION_RE = new RegExp('^([(\\[]*)§$');                       // "§" or "(§" or "[§"
      const ANNEX_RE = new RegExp('^([(\\[]*)[Aa]nnex$');                  // "Annex" or "(Annex"
      const ID_RE = new RegExp('^' + SECTION_ID_GROUP + TRAILING_PUNCT + '$');

      const merged = [];
      let i = 0;
      while (i < tokens.length) {
        const t0 = tokens[i];
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];

        let f0 = t0.text.match(SECTION_RE);
        let isAnnex = false;
        if (!f0) {
          f0 = t0.text.match(ANNEX_RE);
          if (f0) isAnnex = true;
        }
        const f2 = t2 && ID_RE.exec(t2.text);

        if (f0 && t1 && t1.isWhitespace && f2) {
          // f0[1] = leading punct, f2[1] = id (e.g. "5.4" or "1" or "B"), f2[2] = trailing punct
          setFontStyle(doc, t0);
          doc.setFontSize(t0.code ? FONT.code : fontSize);
          const prefix = (f0[1] || '') + (isAnnex ? 'Annex ' : '§ ');
          const combinedText = prefix + f2[1] + (f2[2] || '');
          // Slug: for §-refs use the id directly; for Annex refs prefix with "Annex-"
          const slug = isAnnex ? ('Annex-' + f2[1]) : f2[1];
          merged.push({
            text: combinedText,
            bold: t0.bold, italic: t0.italic, code: t0.code,
            isWhitespace: false,
            width: doc.getTextWidth(combinedText),
            linkTarget: slug,
          });
          i += 3;
        } else {
          merged.push(t0);
          i++;
        }
      }
      tokens = merged;
    }

    const lineLeft = PAGE.marginLeft + indent;
    const lineRight = lineLeft + maxWidth;

    // Build LINES: greedy-fit tokens until next would overflow.
    // Each line = { tokens[], totalWordWidth, totalSpaceWidth, isLastLine }
    const lines = [];
    let curLine = { tokens: [], wordW: 0, spaceW: 0 };
    let curW = 0;

    function pushLine(isParagraphEnd) {
      if (curLine.tokens.length === 0) return;
      // Strip trailing whitespace from the line
      while (curLine.tokens.length > 0 && curLine.tokens[curLine.tokens.length - 1].isWhitespace) {
        const t = curLine.tokens.pop();
        curLine.spaceW -= t.width;
      }
      curLine.isLastLine = !!isParagraphEnd;
      lines.push(curLine);
      curLine = { tokens: [], wordW: 0, spaceW: 0 };
      curW = 0;
    }

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      // Char-break overlong non-whitespace tokens
      if (!tok.isWhitespace && tok.width > maxWidth) {
        // Push current line first
        pushLine(false);
        // Char-break and feed back as multiple tokens
        setFontStyle(doc, tok);
        doc.setFontSize(tok.code ? FONT.code : fontSize);
        const subs = breakLongWord(doc, tok.text, maxWidth);
        for (let s = 0; s < subs.length; s++) {
          const sw = doc.getTextWidth(subs[s]);
          const t2 = Object.assign({}, tok, { text: subs[s], width: sw });
          curLine.tokens.push(t2);
          curLine.wordW += sw;
          curW += sw;
          // Each char-break sub goes on its own line if it fills width
          if (s < subs.length - 1) pushLine(false);
        }
        continue;
      }

      // Skip leading whitespace at line start
      if (tok.isWhitespace && curLine.tokens.length === 0) continue;

      // Will it fit?
      if (curW + tok.width > maxWidth && !tok.isWhitespace) {
        pushLine(false);
      }

      curLine.tokens.push(tok);
      if (tok.isWhitespace) curLine.spaceW += tok.width;
      else curLine.wordW += tok.width;
      curW += tok.width;
    }
    pushLine(true);

    // Now render each line. Justify all but the last line of a paragraph
    // (and lines that contain ≤1 space — justifying those distorts).
    pageBreakIfNeeded(state, leading);
    state.cursorY += fontSize;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lineUsed = line.wordW + line.spaceW;
      const slack = maxWidth - lineUsed;

      // Number of inter-word spaces eligible for distribution
      const wsCount = line.tokens.filter(t => t.isWhitespace).length;

      // Full-width justify (per Yvo's design preference): distribute all slack
      // equally across word-spaces. No cap, no threshold — even loose lines
      // stay full-width. Last-line of paragraph stays ragged (justifying a
      // 2-word last line would spread the words to absurd distance).
      const doJustify = justify && !line.isLastLine && wsCount > 0 && slack > 0;
      const extraPerSpace = doJustify ? slack / wsCount : 0;

      let cursorX = lineLeft;
      for (let ti = 0; ti < line.tokens.length; ti++) {
        const tok = line.tokens[ti];
        setFontStyle(doc, tok);
        doc.setFontSize(tok.code ? FONT.code : fontSize);
        if (tok.isWhitespace) {
          cursorX += tok.width + extraPerSpace;
        } else {
          if (tok.linkTarget) {
            // Visually mark the link with an emerald color so Yvo can confirm
            // detection independent of click-through.
            const prevTextColor = COLOR.ink;
            setColor(doc, COLOR.emerald);
            doc.text(tok.text, cursorX, state.cursorY);
            // Underline (subtle) — y offset ~2pt below baseline
            setDraw(doc, COLOR.emerald);
            doc.setLineWidth(0.4);
            doc.line(cursorX, state.cursorY + 1.5, cursorX + tok.width, state.cursorY + 1.5);
            setColor(doc, prevTextColor);
            // Capture link bbox. We pass y=BOTTOM and h=NEGATIVE so jsPDF's
            // y-flip emits a properly-oriented /Rect [xLL yLL xUR yUR] in the
            // PDF. (Default jsPDF behavior emits an inverted /Rect that some
            // browser-embed PDF viewers fail to normalize, breaking clicks.)
            state.linkRequests.push({
              srcPage: state.pageNumber,
              x: cursorX,
              y: state.cursorY + 2,            // bottom in screen-coords
              w: tok.width,
              h: -(fontSize + 4),              // negative height so /Rect ends up right-side-up in PDF
              targetSlug: tok.linkTarget,
            });
          } else {
            doc.text(tok.text, cursorX, state.cursorY);
          }
          cursorX += tok.width;
        }
      }

      // Move to next line (skip if last line of last block)
      if (li < lines.length - 1) {
        state.cursorY += leading;
        if (state.cursorY > PAGE.height - PAGE.marginBottom) {
          addPage(state);
          state.cursorY += fontSize;
        }
      }
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

    // Orphan-heading guard: never leave a heading at the bottom of a page
    // without body text below it. Required headroom = above-margin + heading
    // line height + below-margin + ~2.5 body lines (so at least 2 full lines
    // of paragraph text follow before the next page-break).
    const minBodyLeadAfter = FONT.bodyLeading * 2.5;
    const headingTotal = cfg.above + cfg.leading + cfg.below + minBodyLeadAfter;
    if (state.cursorY + headingTotal > PAGE.height - PAGE.marginBottom) {
      addPage(state);
    }

    state.cursorY += cfg.above;

    // Bold + emerald color for h1/h2; bold + ink for h3/h4.
    const color = node.level <= 2 ? COLOR.emerald : COLOR.ink;
    // Force-bold on heading runs (override AST's per-run bold).
    // Auto-prefix with § for numbered sections (e.g. "5.4 AI..." → "§ 5.4 AI...")
    // and Annex letters with section.subsection (e.g. "C.4 Paste-..." → "§ C.4 Paste-...").
    // Skip top-level "## 11. Handtekeningen" pattern (level 2 + just "Nr. Title") because
    // the integer-dot is the document's own clause numbering convention.
    const headingRuns = node.runs.map(function (r) {
      let text = r.text || '';
      // First run only: prepend § if numbered subsection (X.Y or X.Y.Z or A.X)
      // and we're inside h2/h3/h4 (not h1 which is the doc title).
      return { type: r.type || 'text', text: text, href: r.href, bold: true, italic: !!r.italic, code: !!r.code };
    });
    // Apply § prefix to the first text-run if heading starts with section pattern.
    // Capture the slug as anchor target for §-references in body text.
    // Patterns covered:
    //   - "5.4 Heading" or "5.3.1 Heading" or "5.4bis Heading"  → slug "5.4" / "5.3.1" / "5.4bis"
    //   - "B.6 Heading" or "B.6bis Heading"                      → slug "B.6" / "B.6bis"
    //   - "1. Partijen" or "11. Handtekeningen" (h2 top-level)   → slug "1" / "11"
    //   - "Annex A — Lijst..." or "Annex B" (h1)                 → slug "Annex-A" / "Annex-B"
    let anchorSlug = null;
    let prefixForRender = null;
    if (headingRuns.length > 0 && headingRuns[0].text) {
      const firstText = headingRuns[0].text;
      // Subsection: "5.4" or "B.6"
      let m = firstText.match(/^(\d+\.\d+(?:\.\d+)?(?:bis)?|[A-Z]\.\d+(?:bis)?)(\s|$)/);
      if (m) {
        anchorSlug = m[1];
        prefixForRender = '§ ';
      }
      // Top-level numbered: "1. Partijen" → slug "1"
      if (!anchorSlug) {
        m = firstText.match(/^(\d+)\.(\s|$)/);
        if (m) {
          anchorSlug = m[1];
          // No § prefix for top-level — they already have natural numbering "1. ..."
        }
      }
      // Annex: "Annex A — ..." → slug "Annex-A"
      if (!anchorSlug) {
        m = firstText.match(/^Annex\s+([A-Z])(\s|—|$)/);
        if (m) {
          anchorSlug = 'Annex-' + m[1];
          // No prefix change — "Annex A" already natural
        }
      }
      if (prefixForRender) {
        headingRuns[0] = Object.assign({}, headingRuns[0], { text: prefixForRender + firstText });
      }
    }
    // Capture anchor BEFORE rendering, so internal links land at the heading's
    // top-of-line position (state.cursorY at this point is the line-start Y for
    // the heading, before fontSize is added in renderRuns).
    if (anchorSlug) {
      state.anchorMap[anchorSlug] = { page: state.pageNumber, y: state.cursorY };
    }
    // Heading font role: h1/h2 → Inter SemiBold, h3/h4 → Inter Medium
    const headingRole = ['h1', 'h2', 'h3', 'h4'][Math.min(node.level - 1, 3)];
    renderRuns(state, headingRuns, { fontSize: cfg.size, leading: cfg.leading, color: color, role: headingRole });

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
    // Blockquote uses Lora Italic for visual + brand distinction from body Inter.
    renderRuns(state, node.runs, { indent: indent, maxWidth: PAGE.contentWidth - indent, color: COLOR.muted, role: 'blockquote' });
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

    // breakLongWord is now defined at module scope (above) for shared use
    // across paragraph and table rendering.

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
            const safeSub = pdfSafeText(sub);
            const tw = doc.getTextWidth(safeSub);
            if (curX + tw > innerRight && !isWs && curX > x + cellPadding) {
              curY += lineHeight;
              lineCount++;
              curX = x + cellPadding;
            }
            if (isWs && curX === x + cellPadding) continue;
            doc.text(safeSub, curX, curY);
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
              const tw = doc.getTextWidth(pdfSafeText(sub));
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

  function renderCover(state, cover, heroPng, logoPng) {
    const doc = state.doc;

    // ----- Hero watercolor at TOP of page (full bleed left-to-right) -----
    // c11 SVG is 595×250; place from y=0 to y=180 to leave room for content below.
    if (heroPng) {
      try {
        doc.addImage(heroPng, 'PNG', 0, 0, PAGE.width, 200);
      } catch (err) {
        console.warn('Cover hero render failed (non-fatal):', err);
      }
    }

    // ----- Brand-anchor: chameleon icon + REGEN STUDIO wordmark, centered below hero
    // Brand convention (codified 2026-05-05): wordmark is "REGEN" in KoHo Bold
    // followed by "STUDIO" in KoHo Light. The contrast is part of the mark.
    let y = 222;
    const fontSize = 17;
    const f = doc._regenFonts || {};
    const hasKohoLight = f.koho;  // Light is part of the koho registration

    // Pre-measure with the right fonts
    setColor(doc, COLOR.ink);
    doc.setFontSize(fontSize);
    if (hasKohoLight) doc.setFont('KoHo', 'bold'); else doc.setFont('helvetica', 'bold');
    const regenW = doc.getTextWidth('REGEN');
    const spaceW = doc.getTextWidth(' ');
    if (hasKohoLight) doc.setFont('KoHo-Light', 'normal'); else doc.setFont('helvetica', 'normal');
    const studioW = doc.getTextWidth('STUDIO');
    const wordW = regenW + spaceW + studioW;

    if (logoPng) {
      try {
        const iconH = 30;
        const iconW = 30;
        const totalW = iconW + 8 + wordW;
        const startX = (PAGE.width - totalW) / 2;
        doc.addImage(logoPng, 'PNG', startX, y - iconH + 8, iconW, iconH);
        // REGEN — bold
        if (hasKohoLight) doc.setFont('KoHo', 'bold'); else doc.setFont('helvetica', 'bold');
        doc.text('REGEN', startX + iconW + 8, y);
        // STUDIO — light
        if (hasKohoLight) doc.setFont('KoHo-Light', 'normal'); else doc.setFont('helvetica', 'normal');
        doc.text('STUDIO', startX + iconW + 8 + regenW + spaceW, y);
      } catch (err) {
        // Fallback: wordmark only, no icon
        const startX = (PAGE.width - wordW) / 2;
        if (hasKohoLight) doc.setFont('KoHo', 'bold'); else doc.setFont('helvetica', 'bold');
        doc.text('REGEN', startX, y);
        if (hasKohoLight) doc.setFont('KoHo-Light', 'normal'); else doc.setFont('helvetica', 'normal');
        doc.text('STUDIO', startX + regenW + spaceW, y);
      }
    } else {
      const startX = (PAGE.width - wordW) / 2;
      if (hasKohoLight) doc.setFont('KoHo', 'bold'); else doc.setFont('helvetica', 'bold');
      doc.text('REGEN', startX, y);
      if (hasKohoLight) doc.setFont('KoHo-Light', 'normal'); else doc.setFont('helvetica', 'normal');
      doc.text('STUDIO', startX + regenW + spaceW, y);
    }

    // ----- Phase H-bis cover canonicalisation -----
    // cover.metadata (when present) drives: header subtitle, title, parties
    // line, mid-section table, signature box. Source = YAML frontmatter on
    // the canonical .md, parsed at the Edge Function and ferried via
    // window.__dpaCoverMetadata. Single edit on the canonical → both HTML
    // and PDF covers update together. cover.metadata === null → legacy
    // hardcoded Dutch voucher cover (the 5 KvW3 voucher engagements
    // pre-frontmatter migration).
    const meta = cover.metadata || null;

    // ----- Subtle divider + small subtitle line below brand -----
    y += 22;
    setFontByRole(doc, 'cover-subtitle');
    doc.setFontSize(8.5);
    setColor(doc, COLOR.muted);
    const headerSubtitle = (meta && meta.variant && meta.variant !== 'voucher')
      ? 'Sub-processor DPA · GDPR Art 28(3) · Regulation (EU) 2016/679'
      : 'verwerkersovereenkomst · GDPR Art 28 · Verordening (EU) 2016/679';
    const subW = doc.getTextWidth(headerSubtitle);
    doc.text(headerSubtitle, (PAGE.width - subW) / 2, y);

    // ----- Title block (push down for breathing room) -----
    y += 56;
    setFontByRole(doc, 'cover-title');
    doc.setFontSize(FONT.coverTitle);
    setColor(doc, COLOR.ink);
    const coverTitle = (meta && meta.document_title) ? meta.document_title : 'Verwerkersovereenkomst';
    doc.text(pdfSafeText(coverTitle), PAGE.marginLeft, y);

    // Variant subtitle (multi-line) OR legacy "tussen X en Regen Studio B.V."
    y += 22;
    setFontByRole(doc, 'cover-subtitle');
    doc.setFontSize(11);
    setColor(doc, COLOR.muted);
    if (meta && meta.subtitle) {
      const subLines = doc.splitTextToSize(pdfSafeText(meta.subtitle), PAGE.contentWidth);
      for (let l = 0; l < subLines.length; l++) {
        doc.text(subLines[l], PAGE.marginLeft, y + l * 13);
      }
      y += (subLines.length - 1) * 13;
    } else {
      const partiesLine = 'tussen ' + (cover.legalName || '—') + ' en Regen Studio B.V.';
      doc.text(pdfSafeText(partiesLine), PAGE.marginLeft, y);
    }

    // ----- Gold engagement-key tagline (uppercase, letter-spaced) -----
    y += 20;
    setFontByRole(doc, 'tagline');
    doc.setFontSize(8.5);
    setColor(doc, COLOR.gold);
    const tagline = (cover.taglineLabel || cover.label || 'ENGAGEMENT').toUpperCase();
    doc.text(pdfSafeText(tagline), PAGE.marginLeft, y, { charSpace: 1.2 });

    // ----- Thin divider line under title block -----
    y += 12;
    setDraw(doc, COLOR.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE.marginLeft, y, PAGE.marginLeft + 80, y);

    // ----- Mid-section: parties table (variant) OR Engagement summary (voucher) -----
    y += 30;
    if (meta && Array.isArray(meta.parties) && meta.parties.length) {
      // Variant cover — render parties as a clean table; suppress voucher
      // summary panel.
      setFontByRole(doc, 'h3');
      doc.setFontSize(11);
      setColor(doc, COLOR.emerald);
      doc.text('Parties', PAGE.marginLeft, y);
      y += 14;
      const labelWv = 110;
      doc.setFontSize(9.5);
      for (let i = 0; i < meta.parties.length; i++) {
        const row = meta.parties[i];
        if (!row || row.length < 2) continue;
        setFontByRole(doc, 'caption');
        setColor(doc, COLOR.muted);
        doc.text(pdfSafeText(String(row[0])), PAGE.marginLeft, y + 9);

        setFontByRole(doc, 'body');
        setColor(doc, COLOR.ink);
        const vlines = doc.splitTextToSize(pdfSafeText(String(row[1])), PAGE.contentWidth - labelWv);
        for (let l = 0; l < vlines.length; l++) {
          doc.text(vlines[l], PAGE.marginLeft + labelWv, y + 9 + l * 12);
        }
        const rowHv = Math.max(22, vlines.length * 12 + 8);
        setDraw(doc, COLOR.border);
        doc.setLineWidth(0.4);
        doc.line(PAGE.marginLeft, y + rowHv, PAGE.marginLeft + PAGE.contentWidth, y + rowHv);
        y += rowHv;
      }
    } else if (!(meta && meta.show_summary_card === false)) {
      // Legacy voucher cover — Engagement summary panel.
      setFontByRole(doc, 'h3');
      doc.setFontSize(11);
      setColor(doc, COLOR.emerald);
      doc.text('Engagement', PAGE.marginLeft, y);
      y += 14;
      const labelW = 145;
      const rows = [
        ['Project', cover.label || '—'],
        ['Toepasselijk recht', cover.applicableLaw || 'Nederlands recht; AVG (Verordening (EU) 2016/679) — Verwerker-rol onder Artikel 28'],
        ['Aard van verwerking', cover.aardVanVerwerking || '—'],
        ['Project-einddatum', cover.projectEinddatum || '—'],
        ['Bewaarplicht t/m', cover.bewaarplichtEinddatum || '—'],
      ];
      doc.setFontSize(9.5);
      for (let i = 0; i < rows.length; i++) {
        setFontByRole(doc, 'caption');
        setColor(doc, COLOR.muted);
        doc.text(pdfSafeText(rows[i][0]), PAGE.marginLeft, y + 9);

        setFontByRole(doc, 'body');
        setColor(doc, COLOR.ink);
        const lines = doc.splitTextToSize(pdfSafeText(rows[i][1]), PAGE.contentWidth - labelW);
        for (let l = 0; l < lines.length; l++) {
          doc.text(lines[l], PAGE.marginLeft + labelW, y + 9 + l * 12);
        }

        const rowH = Math.max(22, lines.length * 12 + 8);
        setDraw(doc, COLOR.border);
        doc.setLineWidth(0.4);
        doc.line(PAGE.marginLeft, y + rowH, PAGE.marginLeft + PAGE.contentWidth, y + rowH);
        y += rowH;
      }
    }

    // ----- Bottom: green-bordered bilateral-signature box -----
    const boxH = 64;
    const boxY = PAGE.height - PAGE.marginBottom - boxH - 24;
    setDraw(doc, COLOR.emerald);
    doc.setLineWidth(0.8);
    doc.rect(PAGE.marginLeft, boxY, PAGE.contentWidth, boxH);

    const sigBox = (meta && meta.signature_box) ? meta.signature_box : null;
    const sigBoxTitle = sigBox && sigBox.title ? sigBox.title : 'Ondertekend bilateraal';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setColor(doc, COLOR.emerald);
    doc.text(pdfSafeText(sigBoxTitle), PAGE.marginLeft + 12, boxY + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(doc, COLOR.ink);

    let sigLine1, sigLine2, sigLine3, sigLine4;
    if (sigBox) {
      // Variant signature lines: Party A (pre-drawn Regen) first, Party B
      // (counter-signing recipient) second.
      const partyARole = sigBox.party_a_role || 'Party A — Regen Studio B.V.';
      const partyBRole = sigBox.party_b_role || ('Party B — ' + (cover.legalName || '—'));
      sigLine1 = partyARole + ': ' + (cover.processorSignerName || 'Yvo Hunink') +
        ' (' + (cover.processorSignerRole || 'Bestuurder') + ') — pre-drawn mandate signature';
      sigLine2 = partyBRole + ': ' + (cover.controllerSignerName || '—') +
        ' (' + (cover.controllerSignerRole || '—') + ') — counter-signed';
      sigLine3 = 'Date countersigned: ' + (cover.signedAtDisplay || cover.signedAt || '—');
      sigLine4 = 'Simple Electronic Signatures under eIDAS Art 25(1) · Regulation (EU) 910/2014. Full evidentiary components in §13.';
    } else {
      // Legacy voucher signature lines (Dutch).
      sigLine1 = 'Verantwoordelijke: ' + (cover.controllerSignerName || '—') +
        ' (' + (cover.controllerSignerRole || '—') + ') namens ' + (cover.legalName || '—');
      sigLine2 = 'Verwerker: ' + (cover.processorSignerName || 'Yvo Hunink') +
        ' (' + (cover.processorSignerRole || 'Directeur') + ') namens Regen Studio B.V. — vooraf-getekende mandaat-handtekening';
      sigLine3 = 'Datum counter-ondertekening: ' + (cover.signedAtDisplay || cover.signedAt || '—');
      sigLine4 = 'Simple Electronic Signatures onder eIDAS Art 25(1) · Verordening (EU) 910/2014. Volledige bewijscomponenten in §17.';
    }

    doc.text(pdfSafeText(sigLine1), PAGE.marginLeft + 12, boxY + 28, { maxWidth: PAGE.contentWidth - 24 });
    doc.text(pdfSafeText(sigLine2), PAGE.marginLeft + 12, boxY + 39, { maxWidth: PAGE.contentWidth - 24 });
    setColor(doc, COLOR.muted);
    doc.text(pdfSafeText(sigLine3), PAGE.marginLeft + 12, boxY + 51, { maxWidth: PAGE.contentWidth - 24 });
    doc.setFontSize(7.5);
    doc.text(pdfSafeText(sigLine4), PAGE.marginLeft + 12, boxY + 60, { maxWidth: PAGE.contentWidth - 24 });

    // ----- Footer: page number left + 4 colored triangle arrows right -----
    const footY = PAGE.height - 30;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, COLOR.muted);
    doc.text('Pagina 1', PAGE.marginLeft, footY);

    // Triangle arrows pointing right, 4 brand colors
    const triColors = [[147, 9, 63], [255, 169, 45], [0, 133, 69], [0, 155, 187]];
    const triSize = 8;
    const triGap = 4;
    let tx = PAGE.width - PAGE.marginRight - (triColors.length * (triSize + triGap));
    for (let t = 0; t < triColors.length; t++) {
      setFill(doc, triColors[t]);
      // Right-pointing triangle
      doc.triangle(tx, footY - triSize / 2 - 2, tx + triSize, footY - 2, tx, footY + triSize / 2 - 2, 'F');
      tx += triSize + triGap;
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
    doc.text(pdfSafeText((sig.processorName || '—') + ' · ' + (sig.processorRole || '—')),
      PAGE.marginLeft, boxY + boxH + 23, { maxWidth: boxW });
    doc.text(pdfSafeText(sig.processorLegalName || 'Regen Studio B.V.'),
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
    doc.text(pdfSafeText((sig.controllerName || '—') + ' · ' + (sig.controllerRole || '—')),
      rightX, boxY + boxH + 23, { maxWidth: boxW });
    doc.text(pdfSafeText('namens ' + (sig.controllerLegalName || '—')),
      rightX, boxY + boxH + 32, { maxWidth: boxW });

    state.cursorY = boxY + boxH + 50;

    // Attestation strip
    setColor(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const attest = 'Visuele bevestiging — de juridische ankers zijn de server-side opgeslagen SHA-256-hash + token-hash + signed_at + IP/UA-hash in de interne signing-event-registry van de Verwerker. Bilateraal ondertekend met Simple Electronic Signatures onder eIDAS Art 25(1) · Verordening (EU) 910/2014. Tijdstip ondertekening (server-vastgelegd): ' + (sig.signedAt || '—') + '.';
    const lines = doc.splitTextToSize(pdfSafeText(attest), PAGE.contentWidth);
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

    // Register brand fonts (KoHo / Lora / Inter / JetBrainsMono). Modules
    // are window globals set by lazy-loaded base64 modules in
    // assets/fonts/jspdf/. If absent, registerBrandFonts is a no-op and the
    // renderer falls back to helvetica/courier per role-mapping defaults.
    registerBrandFonts(doc);

    const state = newState(doc, opts);

    // Stamp watermark on page 1 if concept.
    if (opts.concept) stampWatermark(state);

    // Cover page (optional but expected)
    if (opts.cover) {
      let heroPng = null;
      let logoPng = null;
      if (opts.coverHeroSrc !== false) {
        try {
          heroPng = await loadImageAsPng(opts.coverHeroSrc || 'Images/dpa-cover-hero-c11.svg', 4);
        } catch (err) {
          console.warn('Cover hero load failed (rendering without hero):', err.message);
        }
      }
      if (opts.coverLogoSrc !== false) {
        try {
          logoPng = await loadImageAsPng(opts.coverLogoSrc || 'Images/logo-icon.svg', 4);
        } catch (err) {
          console.warn('Cover logo load failed (rendering without icon):', err.message);
        }
      }
      renderCover(state, opts.cover, heroPng, logoPng);
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

    // Final page footer (every body page; cover page renders its own).
    if (state.pageNumber >= 2) renderPageFooter(state);

    // Resolve internal §X.Y links: walk every queued reference and turn it
    // into a PDF link annotation pointing to the heading's page+y.
    const lastPage = state.pageNumber;
    let resolvedCount = 0, unresolvedCount = 0;
    const unresolvedSlugs = [];
    for (let i = 0; i < state.linkRequests.length; i++) {
      const req = state.linkRequests[i];
      const target = state.anchorMap[req.targetSlug];
      if (!target) {
        unresolvedCount++;
        unresolvedSlugs.push(req.targetSlug);
        continue;
      }
      try {
        doc.setPage(req.srcPage);
        doc.link(req.x, req.y, req.w, req.h, {
          pageNumber: target.page,
          top: Math.max(0, target.y - 20),
        });
        resolvedCount++;
      } catch (err) {
        console.warn('[pdf-rendering] link resolve failed for §' + req.targetSlug, err);
      }
    }
    // Single summary line. Verbose breakdown only fires if there are unresolved
    // slugs (signals a real problem worth investigating).
    console.log('[pdf-rendering] §-links: ' + resolvedCount + ' resolved · ' + unresolvedCount + ' unresolved · '
                + Object.keys(state.anchorMap).length + ' anchors');
    if (unresolvedSlugs.length > 0) {
      console.log('[pdf-rendering] unresolved targets:', [...new Set(unresolvedSlugs)].join(', '));
    }
    // Restore current page to the last
    doc.setPage(lastPage);

    return doc.output('blob');
  }

  root.RegenPDF = {
    render: render,
    loadImageAsPng: loadImageAsPng,
    PAGE: PAGE,
    FONT: FONT,
  };
})(typeof window !== 'undefined' ? window : this);
