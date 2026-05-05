/**
 * dpa-pdf-builder.js
 *
 * Programmatic vector PDF authoring for signed Verwerkersovereenkomsten.
 * Uses jsPDF directly (assets/js/vendor/jspdf.umd.min.js — pre-loaded by
 * dpa-contract.html). Produces a Regen Studio-branded A4 document with
 * selectable text, sharp typography at any zoom, ~150-400 KB file size.
 *
 * Replaces the previous html2pdf+html2canvas screenshot pipeline that
 * suffered from scroll-offset bugs, 16k canvas-limit truncation, and a
 * literal print-of-the-page aesthetic.
 *
 * Public entry point:
 *   window.buildSignedDpaPdf({ engagement, controller, processor,
 *                              toggles, aiProcessingConsent, signature })
 *     → Promise<Blob>  (PDF bytes)
 *
 * Triangle chique × pragmatic: subtle triangle accent in running header +
 * cover, generous whitespace, structured tables, plain-Dutch summaries
 * per §. Cover renders engagement metadata (legalName, KVK, contact,
 * project KvW3 number, scope). Integrity anchor is the SHA-256 of the
 * PDF bytes recorded server-side in dpa_signatures at sign time —
 * visible-body SHA stamping was removed per Audit B5 fix (see L1134).
 *
 * Per-engagement optimisation: the `engagement.regulatoryRegime` field
 * (`dsr` / `espr` / `espr_textiles` / etc.) selects regime-specific copy
 * for §3 work-package descriptions, §10 transfer cites, Schedule §B.9
 * scope notes. Default text covers the AVG core unchanged across regimes.
 */

(function (root) {
  'use strict';

  // -------------------------------------------------------------------------
  // Brand constants
  // -------------------------------------------------------------------------
  const BRAND = {
    emerald: [0, 109, 56],       // #006d38 — primary (accessible variant)
    teal:    [0, 114, 139],      // #00728b
    gold:    [122, 88, 20],      // #7a5814
    // Phase F: full Regen brand palette for multi-color triangle compositions.
    // These are the "vibrant" tier — used decoratively (band, motif accents),
    // not for body text (where contrast variants above are used). Source:
    // CLAUDE.md § Color contrast table.
    accentGreen: [101, 221, 53], // #65DD35 — vibrant green (decorative only)
    orange:      [255, 169, 45], // #FFA92D — warm contrast
    magenta:     [147, 9, 63],   // #93093F — alert / warning anchor
    blueLink:    [0, 119, 182],  // #0077B6 — informational link tier
    // Body / meta / structural
    ink:     [26, 26, 46],       // #1a1a2e — body text
    muted:   [91, 100, 112],     // #5b6470 — meta text
    border:  [216, 219, 224],    // #d8dbe0 — table rules
    plain:   [255, 250, 235],    // #fffaeb — klare-taal box bg
    plainBd: [240, 193, 75],     // #f0c14b — klare-taal box border
  };

  // CANONICAL 4-color Regen signature triangle palette — matches the
  // proton-send "classic" signature mark used site-wide (style.css L6228:
  // ".thankyou-page__icon--triangles .tri--{1..4}"). Order is fixed:
  // magenta → orange → emerald → teal. Vibrant tier (NOT accessible
  // variants) because these are decorative, not body text. EVERY 4-triangle
  // motif in the PDF + lander HTML uses THIS sequence — single source of
  // truth for "the signature".
  const REGEN_4 = [
    [147, 9, 63],    // #93093F — magenta
    [255, 169, 45],  // #FFA92D — orange
    [0, 133, 69],    // #008545 — emerald (vibrant)
    [0, 155, 187],   // #009BBB — teal (vibrant)
  ];

  // Lora (OFL, Google Fonts) — embedded TTF, replaces jsPDF built-in
  // Helvetica/Times whose AFM-metric rendering felt "wanky" per Yvo's
  // 2026-05-02 review. Georgia license (Microsoft proprietary) forbids
  // embedding; Lora is the closest open-source serif.
  // Fetched lazily via loadLoraFonts() before first PDF render; cached on
  // window.__loraFontCache. Falls back to 'times' on network failure.
  // FONT_DEFAULT: jsPDF built-in fallback when Lora load fails. Dual-write:
  // resolved name is canonical on state.font inside loadLoraFonts, then
  // copied to doc.__regenFont (per-doc) at L1241. setFont() reads
  // doc.__regenFont || FONT_DEFAULT — never state.font directly — so
  // concurrent buildSignedDpaPdf() calls cannot race on shared state.
  const FONT_DEFAULT = 'times';

  // Default processor identity (Regen Studio B.V.). Single source of truth
  // for processor identity across:
  //   · dpa-contract.html — counterparty's PDF builder call (relies on
  //     defaults silently — does NOT pass processor explicitly today)
  //   · dpa/ops/index.html — admin tool's Preview call (passes a partial
  //     override; merges over these defaults)
  //   · Any future automation that calls buildSignedDpaPdf
  // Audit Phase D D4 fix: when this changes (new bestuurder, address move,
  // KvK/VAT change), update HERE — both call sites pick it up automatically.
  const DEFAULT_PROCESSOR = {
    legalName: 'Regen Studio B.V.',
    address: 'Stollenbergweg 43, 6571 AB, Berg en Dal',
    kvk: '90337948',
    btw: 'NL865282377B01',
    repName: 'Yvo Hunink',
    repRole: 'Directeur',
    repEmail: 'info@regenstudio.world',
  };

  function arrayBufferToB64(buf) {
    const bytes = new Uint8Array(buf);
    const chunkSize = 32768;
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(bin);
  }

  async function loadLoraFonts(state) {
    const doc = state.doc;
    // Default fallback per-doc; flipped to 'Lora' on success.
    state.font = FONT_DEFAULT;
    try {
      if (!root.__loraFontCache) {
        const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), 5000) : null;
        const fetchOpts = ctl ? { signal: ctl.signal } : {};
        try {
          const [regResp, boldResp] = await Promise.all([
            fetch('/assets/fonts/lora/Lora-Regular.ttf', fetchOpts), // absolute same-origin (works from /dpa/ops/ ops tool too — relative would 404)
            fetch('/assets/fonts/lora/Lora-Bold.ttf', fetchOpts), // absolute same-origin
          ]);
          if (!regResp.ok || !boldResp.ok) throw new Error('Lora fetch failed');
          const [regBuf, boldBuf] = await Promise.all([regResp.arrayBuffer(), boldResp.arrayBuffer()]);
          root.__loraFontCache = {
            regular: arrayBufferToB64(regBuf),
            bold:    arrayBufferToB64(boldBuf),
          };
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      doc.addFileToVFS('Lora-Regular.ttf', root.__loraFontCache.regular);
      doc.addFont('Lora-Regular.ttf', 'Lora', 'normal');
      doc.addFileToVFS('Lora-Bold.ttf', root.__loraFontCache.bold);
      doc.addFont('Lora-Bold.ttf', 'Lora', 'bold');
      state.font = 'Lora';
      return true;
    } catch (err) {
      console.warn('Lora font load failed; falling back to', state.font, err);
      return false;
    }
  }
  const PAGE = {
    width:  595.28, // A4 portrait pt
    height: 841.89,
    marginTop:    50,
    marginBottom: 60,
    marginLeft:   50,
    marginRight:  50,
  };
  PAGE.contentWidth  = PAGE.width  - PAGE.marginLeft - PAGE.marginRight;
  PAGE.contentBottom = PAGE.height - PAGE.marginBottom;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function setColor(doc, rgb)     { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
  function setDraw(doc, rgb)      { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
  function setFill(doc, rgb)      { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function setFont(doc, style)    { doc.setFont((doc.__regenFont) || FONT_DEFAULT, style || 'normal'); }

  /** Reserve vertical space; if remaining < requested, addPage() and reset y. */
  function ensureSpace(state, needed) {
    if (state.y + needed > PAGE.contentBottom) {
      addPage(state);
    }
  }

  function addPage(state) {
    state.doc.addPage();
    state.pageNumber += 1;
    drawRunningHeader(state);
    state.y = PAGE.marginTop + 30; // leave room for header
  }

  /** Tiny equilateral triangle (apex up).
   *  @reserved — kept for future section-divider use; no current caller
   *  as of design-refresh r3 (every brand triangle now goes through
   *  drawRightTriangle / drawTrianglesAccent, and the cover band uses
   *  doc.triangle directly). */
  function drawTriangle(doc, cx, cy, size, fillRgb, opacity) {
    const half = size / 2;
    const h = size * 0.866; // equilateral height
    setFill(doc, fillRgb);
    if (opacity != null) doc.setGState(new (doc.GState || function(){})({ opacity }));
    doc.triangle(cx - half, cy + h * 0.5, cx + half, cy + h * 0.5, cx, cy - h * 0.5, 'F');
    if (opacity != null && doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /** Right-pointing isoceles triangle. Apex on right, vertically centered.
   *  (x,y) is the top-left corner of the bounding box. */
  function drawRightTriangle(doc, x, y, size, fillRgb, opacity) {
    setFill(doc, fillRgb);
    if (opacity != null && doc.GState) doc.setGState(new doc.GState({ opacity }));
    doc.triangle(x, y, x, y + size, x + size, y + size / 2, 'F');
    if (opacity != null && doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /** Yvo's signature 4-triangles-pointing-right motif — used as cover
   *  accent, running-header brand mark, and section divider. Phase F:
   *  defaults to the canonical 4-color Regen palette (REGEN_4) at full
   *  opacity for actual brand presence; legacy single-color + opacity-
   *  ladder still available by passing fillRgb (e.g., when the motif sits
   *  on a colored background where contrast matters more than brand colors).
   *  Returns total drawn width in pt. */
  function drawTrianglesAccent(doc, x, y, size, gap, fillRgb) {
    size = size || 8;
    gap  = (gap != null) ? gap : 3;
    if (fillRgb) {
      // Legacy single-color + opacity ladder (used on dark backgrounds)
      const opacities = [1.0, 0.78, 0.55, 0.32];
      for (let i = 0; i < 4; i++) {
        drawRightTriangle(doc, x + i * (size + gap), y, size, fillRgb, opacities[i]);
      }
    } else {
      // Default — Regen 4-color palette, full opacity (cover, header)
      for (let i = 0; i < 4; i++) {
        drawRightTriangle(doc, x + i * (size + gap), y, size, REGEN_4[i]);
      }
    }
    return 4 * size + 3 * gap;
  }

  /** Process inline processor signature (base64 PNG, no data: prefix).
   *  Used by:
   *   · dpa-contract.html — receives signature from dpa-verify-token response
   *     (env var DPA_PROCESSOR_SIG_B64, env-gated server-side delivery,
   *     released only after token verification — never world-readable).
   *   · dpa/ops/index.html — admin tool reads from localStorage so Preview
   *     PDFs render bilaterally without requiring a server round-trip.
   *
   *  Phase D Path A (audit D1 fix): static-asset path was REMOVED. Putting
   *  Yvo's signature image at /assets/signatures/regen-studio-processor.png
   *  would have made it world-curl-able from GitHub Pages — a forgery
   *  primitive. Path A delivers the signature only to authenticated
   *  controller sessions via the dpa-verify-token Edge Function response.
   *
   *  Returns { dataUrl, aspect } resolved synchronously — no fetch. Aspect
   *  is computed from the inline image once an Image() loads it. */
  async function resolveInlineProcessorSig(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    try {
      const dataUrl = 'data:image/png;base64,' + b64;
      const img = new Image();
      await new Promise(function (res, rej) {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const aspect = (img.height / img.width) || 0.4;
      return { dataUrl: dataUrl, aspect: aspect };
    } catch (err) {
      console.warn('Processor signature decode failed (fallback: single-sig PDF):', err && err.message ? err.message : err);
      return null;
    }
  }

  /** Lazy-load the combined brand mark (chameleon icon + KoHo two-tone
   *  wordmark "REGEN STUDIO" side-by-side). Source SVG embeds the KoHo
   *  font subset as base64 TTF inside <style>, so canvas rasterisation
   *  produces a single clean PNG with both brand elements rendered.
   *  Same security invariant as loadLogoPng — see that doc-comment.
   *  Phase E (Regen sauce): used on cover (large) + running header (small).
   *  Returns { dataUrl, aspect } cached on window.__regenCombinedMark, or
   *  null on 404/network failure (cover/header gracefully degrades to the
   *  text-only wordmark + chameleon-only icon path). */
  async function loadCombinedMarkPng() {
    if (root.__regenCombinedMark) return root.__regenCombinedMark;
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const tmo = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
      const resp = await fetch('/Images/Logo-Text-on-the-sideAtivo%202.svg', ctrl ? { signal: ctrl.signal } : undefined); // same-origin asset
      if (tmo) clearTimeout(tmo);
      if (!resp.ok) throw new Error('combined mark fetch ' + resp.status);
      const svgText = await resp.text();
      const svgB64 = btoa(unescape(encodeURIComponent(svgText)));
      const dataUrl = 'data:image/svg+xml;base64,' + svgB64;
      const img = new Image();
      await new Promise(function (res, rej) {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const aspect = (img.height / img.width) || 0.27; // 98.15/367.81 ≈ 0.27
      const renderW = 1080; // ~6× the largest target (180pt cover) for retina sharpness
      const renderH = Math.round(renderW * aspect);
      const canvas = document.createElement('canvas');
      canvas.width = renderW; canvas.height = renderH;
      const ctx = canvas.getContext('2d');
      // Wait one frame so the embedded @font-face has time to apply before
      // rasterisation — canvas snapshots otherwise occasionally render with
      // fallback fonts on the first paint of an SVG-with-embedded-font.
      await new Promise(function (res) { setTimeout(res, 50); });
      ctx.drawImage(img, 0, 0, renderW, renderH);
      root.__regenCombinedMark = {
        dataUrl: canvas.toDataURL('image/png'),
        aspect: aspect,
      };
      return root.__regenCombinedMark;
    } catch (err) {
      console.warn('Regen combined mark load failed:', err && err.message ? err.message : err);
      return null;
    }
  }

  /** Lazy-load the c11 watercolor-sails cover hero — fetch SVG, rasterise
   *  to high-DPI PNG via canvas, cache on window.__regenHeroC11. Locked
   *  from design-lab Round 3 (2026-05-04). Same security invariant as
   *  loadLogoPng — same-origin SVG via <img> only. Returns { dataUrl,
   *  aspect } or null on 404/network failure (drawCover gracefully
   *  degrades to a blank hero zone in that case — title still renders). */
  async function loadHeroC11Png() {
    if (root.__regenHeroC11) return root.__regenHeroC11;
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const tmo = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
      const resp = await fetch('/Images/dpa-cover-hero-c11.svg', ctrl ? { signal: ctrl.signal } : undefined); // same-origin asset
      if (tmo) clearTimeout(tmo);
      if (!resp.ok) throw new Error('hero-c11 fetch ' + resp.status);
      const svgText = await resp.text();
      const svgB64 = btoa(unescape(encodeURIComponent(svgText)));
      const dataUrl = 'data:image/svg+xml;base64,' + svgB64;
      const img = new Image();
      await new Promise(function (res, rej) {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const aspect = (img.height / img.width) || (250 / 595);
      // 4× scale for retina sharpness at A4 print resolution
      const renderW = 2380;  // 595 × 4
      const renderH = Math.round(renderW * aspect);
      const canvas = document.createElement('canvas');
      canvas.width = renderW; canvas.height = renderH;
      const ctx = canvas.getContext('2d');
      // Brief delay so embedded SVG gradients/masks fully resolve before snapshot
      await new Promise(function (res) { setTimeout(res, 50); });
      ctx.drawImage(img, 0, 0, renderW, renderH);
      root.__regenHeroC11 = {
        dataUrl: canvas.toDataURL('image/png'),
        aspect: aspect,
      };
      return root.__regenHeroC11;
    } catch (err) {
      console.warn('Hero c11 load failed (cover degrades to blank hero):', err && err.message ? err.message : err);
      return null;
    }
  }

  /** Lazy-load the chameleon brand mark — fetch SVG, rasterise to high-DPI
   *  PNG via canvas, cache on window.__regenLogoPng. Same pattern as
   *  loadLoraFonts. Returns { dataUrl, w, h } or null on failure.
   *
   *  Security invariant: same-origin SVG loaded via <img> only. The browser
   *  blocks <script> execution inside SVGs rendered through <img>. DO NOT
   *  switch to <object>, <iframe>, or <embed> — those re-enable embedded
   *  script execution and would silently void this defense. Per OWASP SVG
   *  XSS guidance + ~/.claude/skills/security/SKILL.md §SVG-loading. */
  async function loadLogoPng() {
    if (root.__regenLogoPng) return root.__regenLogoPng;
    try {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const tmo = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
      const resp = await fetch('/Images/logo-icon.svg', ctrl ? { signal: ctrl.signal } : undefined); // same-origin asset
      if (tmo) clearTimeout(tmo);
      if (!resp.ok) throw new Error('logo fetch ' + resp.status);
      const svgText = await resp.text();
      const svgB64 = btoa(unescape(encodeURIComponent(svgText)));
      const dataUrl = 'data:image/svg+xml;base64,' + svgB64;
      const img = new Image();
      await new Promise(function (res, rej) {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const aspect = img.height / img.width || 1;
      const renderW = 480; // ~6x display target (≈80pt cover) for high-DPI sharpness
      const renderH = Math.round(renderW * aspect);
      const canvas = document.createElement('canvas');
      canvas.width = renderW; canvas.height = renderH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, renderW, renderH);
      root.__regenLogoPng = {
        dataUrl: canvas.toDataURL('image/png'),
        aspect: aspect,
      };
      return root.__regenLogoPng;
    } catch (err) {
      console.warn('Regen logo load failed:', err);
      return null;
    }
  }

  /** Page header (skipped on cover). Phase E rebuild: combined-mark left
   *  (icon + KoHo two-tone wordmark), document subtitle right, 4-triangles
   *  motif as right-edge accent. Footer: brand line "Regen Studio B.V. ·
   *  KvK 90337948" left, page number right, faint divider above. */
  function drawRunningHeader(state) {
    const { doc, engagement, combinedMark, logoPng } = state;
    if (state.pageNumber === 1) return;

    // -----------------------------------------------------------------------
    // Top header: combined-mark + subtitle
    // -----------------------------------------------------------------------
    const headerY = PAGE.marginTop * 0.55;
    let textStartX = PAGE.marginLeft;
    if (combinedMark && combinedMark.dataUrl) {
      try {
        const markH = 18;
        const markW = markH / (combinedMark.aspect || 0.27);
        doc.addImage(combinedMark.dataUrl, 'PNG',
          PAGE.marginLeft, headerY - markH * 0.7, markW, markH, undefined, 'FAST');
        textStartX = PAGE.marginLeft + markW + 14;
      } catch (e) { console.warn('Header combined-mark render failed:', e); }
    } else if (logoPng && logoPng.dataUrl) {
      // Fallback: chameleon icon + text wordmark
      try {
        const iconSize = 16;
        doc.addImage(logoPng.dataUrl, 'PNG',
          PAGE.marginLeft, headerY - iconSize * 0.7, iconSize,
          iconSize * (logoPng.aspect || 1), undefined, 'FAST');
        setColor(doc, BRAND.emerald);
        setFont(doc, 'bold');
        doc.setFontSize(8);
        doc.text('REGEN STUDIO', PAGE.marginLeft + iconSize + 4, headerY);
        textStartX = PAGE.marginLeft + iconSize + 4 + 50;
      } catch (e) { /* keep textStartX as marginLeft */ }
    }

    // Subtitle right of brand mark
    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(8);
    doc.text(
      `Verwerkersovereenkomst — ${engagement.legalName} × Regen Studio B.V.`,
      textStartX, headerY,
      { maxWidth: PAGE.width - PAGE.marginRight - textStartX - 35 }
    );

    // 4-triangles signature accent — top-right (Regen 4-color, matches cover)
    drawTrianglesAccent(doc,
      PAGE.width - PAGE.marginRight - 30,
      headerY - 6, 5, 2);

    // -----------------------------------------------------------------------
    // Bottom footer: brand line + page number + divider
    // -----------------------------------------------------------------------
    const footRuleY = PAGE.height - PAGE.marginBottom * 0.7;
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.4);
    doc.line(PAGE.marginLeft, footRuleY,
             PAGE.width - PAGE.marginRight, footRuleY);
    setFont(doc, 'normal');
    doc.setFontSize(7);
    setColor(doc, BRAND.muted);
    // Brand line bottom-left — replaces the previous unbranded footer
    doc.text(
      'Regen Studio B.V. · KvK 90337948 · Stollenbergweg 43, 6571 AB Berg en Dal',
      PAGE.marginLeft, PAGE.height - PAGE.marginBottom * 0.45);
    doc.setFontSize(8);
    doc.text(
      `Pagina ${state.pageNumber}`,
      PAGE.width - PAGE.marginRight,
      PAGE.height - PAGE.marginBottom * 0.45,
      { align: 'right' }
    );
  }

  /** Wrap-and-write a paragraph at current y; advance y. */
  function writeParagraph(state, text, opts) {
    opts = opts || {};
    const { doc } = state;
    const fontSize = opts.fontSize || 10;
    const lineGap  = opts.lineGap  || fontSize * 1.45;
    const color    = opts.color    || BRAND.ink;
    const style    = opts.style    || 'normal';
    const indent   = opts.indent   || 0;
    const width    = (opts.width != null) ? opts.width : (PAGE.contentWidth - indent);
    setFont(doc, style);
    doc.setFontSize(fontSize);
    setColor(doc, color);
    const lines = doc.splitTextToSize(text, width);
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(state, lineGap);
      doc.text(lines[i], PAGE.marginLeft + indent, state.y);
      state.y += lineGap;
    }
    state.y += (opts.spaceAfter != null) ? opts.spaceAfter : 4;
  }

  /** H2-style section heading with emerald rule underneath. */
  function writeSectionHeading(state, label) {
    const { doc } = state;
    ensureSpace(state, 40);
    state.y += 8;
    setFont(doc, 'bold');
    doc.setFontSize(13);
    setColor(doc, BRAND.emerald);
    doc.text(label, PAGE.marginLeft, state.y);
    state.y += 4;
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE.marginLeft, state.y, PAGE.marginLeft + PAGE.contentWidth, state.y);
    state.y += 10;
  }

  /** H3-style sub-heading. */
  function writeSubheading(state, label) {
    ensureSpace(state, 20);
    state.y += 4;
    setFont(state.doc, 'bold');
    state.doc.setFontSize(10.5);
    setColor(state.doc, BRAND.ink);
    state.doc.text(label, PAGE.marginLeft, state.y);
    state.y += 13;
  }

  /** Klare-taal callout box (yellow-tinted). Audit R10 — fixed height calc:
   *  total = padY (top) + label (11) + label-gap (4) + N*lineGap + padY (bot). */
  function writePlainBox(state, label, body) {
    const { doc } = state;
    const padX = 10, padY = 8;
    setFont(doc, 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(body, PAGE.contentWidth - 2 * padX - 4);
    const lineGap = 13;
    const boxHeight = padY + 11 + 4 + (lines.length * lineGap) + padY;
    ensureSpace(state, boxHeight + 12);
    setFill(doc, BRAND.plain);
    setDraw(doc, BRAND.plainBd);
    doc.setLineWidth(0.6);
    doc.rect(PAGE.marginLeft, state.y, PAGE.contentWidth, boxHeight, 'FD');
    // Left accent bar
    setFill(doc, BRAND.plainBd);
    doc.rect(PAGE.marginLeft, state.y, 3, boxHeight, 'F');
    let cy = state.y + padY + 8;
    setFont(doc, 'bold');
    doc.setFontSize(7.5);
    setColor(doc, BRAND.gold);
    doc.text((label || 'IN KLARE TAAL').toUpperCase(), PAGE.marginLeft + padX + 4, cy);
    cy += 11;
    setFont(doc, 'normal');
    doc.setFontSize(9.5);
    setColor(doc, BRAND.ink);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], PAGE.marginLeft + padX + 4, cy);
      cy += lineGap;
    }
    state.y += boxHeight + 12;
  }

  /** Two-column key-value table (party identity, summary fields). */
  function writeKVTable(state, rows, opts) {
    opts = opts || {};
    const { doc } = state;
    const labelW = opts.labelWidth || (PAGE.contentWidth * 0.34);
    const valueW = PAGE.contentWidth - labelW;
    const padY = 6;
    const lineGap = 12;
    setFont(doc, 'normal');
    doc.setFontSize(9.5);
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.4);

    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i];
      const valueLines = doc.splitTextToSize(String(value || ''), valueW - 12);
      const rowH = padY * 2 + Math.max(1, valueLines.length) * lineGap;
      ensureSpace(state, rowH + 2);

      setColor(doc, BRAND.muted);
      setFont(doc, 'normal');
      doc.text(label, PAGE.marginLeft + 6, state.y + padY + 8);

      setColor(doc, BRAND.ink);
      setFont(doc, 'normal');
      for (let j = 0; j < valueLines.length; j++) {
        doc.text(valueLines[j], PAGE.marginLeft + labelW + 6, state.y + padY + 8 + j * lineGap);
      }

      // bottom rule
      doc.line(PAGE.marginLeft, state.y + rowH,
               PAGE.marginLeft + PAGE.contentWidth, state.y + rowH);
      state.y += rowH;
    }
    state.y += 8;
  }

  /** Multi-column data table with header row. */
  function writeDataTable(state, headers, rows, colWidths) {
    const { doc } = state;
    const padX = 6, padY = 5;
    const lineGap = 11;
    if (!colWidths) {
      const n = headers.length;
      colWidths = new Array(n).fill(PAGE.contentWidth / n);
    }

    function drawRow(cells, isHeader) {
      // Compute row height based on tallest wrapped cell
      const wrappedCells = cells.map((c, i) =>
        doc.splitTextToSize(String(c || ''), colWidths[i] - 2 * padX)
      );
      const maxLines = Math.max(1, ...wrappedCells.map(l => l.length));
      const rowH = padY * 2 + maxLines * lineGap;
      ensureSpace(state, rowH + 2);

      if (isHeader) {
        setFill(doc, BRAND.emerald);
        doc.rect(PAGE.marginLeft, state.y, PAGE.contentWidth, rowH, 'F');
        setColor(doc, [255, 255, 255]);
        setFont(doc, 'bold');
      } else {
        setColor(doc, BRAND.ink);
        setFont(doc, 'normal');
      }
      doc.setFontSize(9);

      let x = PAGE.marginLeft;
      for (let i = 0; i < cells.length; i++) {
        const lines = wrappedCells[i];
        for (let j = 0; j < lines.length; j++) {
          doc.text(lines[j], x + padX, state.y + padY + 8 + j * lineGap);
        }
        x += colWidths[i];
      }

      // bottom rule (skip after header — visual separator is the fill)
      if (!isHeader) {
        setDraw(doc, BRAND.border);
        doc.setLineWidth(0.3);
        doc.line(PAGE.marginLeft, state.y + rowH,
                 PAGE.marginLeft + PAGE.contentWidth, state.y + rowH);
      }
      state.y += rowH;
    }

    drawRow(headers, true);
    for (let r = 0; r < rows.length; r++) drawRow(rows[r], false);
    state.y += 6;
  }

  // -------------------------------------------------------------------------
  // c11 watercolor-sails hero helpers (locked from design-lab Round 3 —
  // "Watercolor sails on layered waves" — 2026-05-04)
  // -------------------------------------------------------------------------

  /** Draw a Bezier wave from x=0 to x=PAGE.width, fill from wave down to
   *  bottomY. n = number of wave segments (peaks + troughs). Color is RGB
   *  array; alpha 0-1 via GState. Mirrors the lab's wavePath() output. */
  function drawWaveBand(doc, y0, amp, n, fillRgb, alpha, bottomY) {
    const span = PAGE.width / n;
    // doc.lines() takes RELATIVE coordinates per segment, starting from (x, y).
    // Each cubic Bezier: [cp1dx, cp1dy, cp2dx, cp2dy, endX, endY]
    const segments = [];
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      // Control points relative to current position (start of this segment)
      segments.push([span * 0.3, -amp * dir,
                     span * 0.7, -amp * dir,
                     span,        0]);
    }
    // Close: line down to bottomY, then back across, then close to start
    const finalX = n * span;
    segments.push([0, bottomY - y0]);
    segments.push([-finalX, 0]);

    if (doc.GState && alpha != null) doc.setGState(new doc.GState({ opacity: alpha }));
    setFill(doc, fillRgb);
    doc.lines(segments, 0, y0, [1, 1], 'F', true);
    if (doc.GState && alpha != null) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /** Approximate a watercolor radial-gradient triangle using nested layered
   *  triangles at decreasing size + alpha, slightly shifted toward the apex
   *  (right). Cumulative alpha builds saturation at the apex while the base
   *  stays light — same effect as the lab's c9/c11 SVG radialGradient. */
  function drawWatercolorTriangle(doc, cx, cy, size, fillRgb) {
    const layers = 7;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);              // 0 → 1
      const layerSize = size * (1 - t * 0.55); // 100% → 45% size
      const layerAlpha = 0.13 - t * 0.008;     // 0.13 → ~0.08 (cumulative ~0.85 at apex)
      const apexShift = t * size * 0.20;       // shift right toward apex
      const lcx = cx + apexShift;
      const half = layerSize / 2;
      if (doc.GState) doc.setGState(new doc.GState({ opacity: layerAlpha }));
      setFill(doc, fillRgb);
      doc.triangle(
        lcx - half, cy - half,
        lcx - half, cy + half,
        lcx + half, cy,
        'F'
      );
    }
    if (doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /** Simulate a vertical opacity-fade-to-white via stacked thin white rects
   *  with alpha ramping 0→0.95 from yStart→yEnd. Approximates the SVG mask
   *  used in the lab without needing jsPDF gradient/mask support. */
  function drawBottomFade(doc, yStart, yEnd) {
    const slices = 16;
    const sliceH = (yEnd - yStart) / slices;
    setFill(doc, [255, 255, 255]);
    for (let i = 0; i < slices; i++) {
      const t = i / (slices - 1);
      const alpha = Math.pow(t, 1.4) * 0.95;  // ease-in for smoother feel
      if (doc.GState) doc.setGState(new doc.GState({ opacity: alpha }));
      doc.rect(0, yStart + i * sliceH, PAGE.width, sliceH + 0.6, 'F');
    }
    if (doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  // -------------------------------------------------------------------------
  // Cover page
  // -------------------------------------------------------------------------
  function drawCover(state) {
    const { doc, engagement, controller, processor, signature, logoPng, combinedMark, heroC11 } = state;

    // -----------------------------------------------------------------------
    // c11 watercolor-sails hero — locked from design-lab Round 3 (Yvo verdict
    // 2026-05-04: "Let's take this as the design, really nice!"). Phase G
    // initial implementation used vector approximations (drawWaveBand +
    // drawWatercolorTriangle + drawBottomFade) but watercolor-gradient
    // effect didn't survive the small triangle sizes — landed as flat fills
    // with visible bottom-fade banding. Switched to PNG approach (Phase H):
    // pre-rendered SVG (Images/dpa-cover-hero-c11.svg) is fetched +
    // canvas-rasterised at 4× retina scale by loadHeroC11Png() — composition
    // matches the design-lab pixel-for-pixel.
    // -----------------------------------------------------------------------
    const HERO_BOTTOM = 240;

    if (heroC11 && heroC11.dataUrl) {
      try {
        const heroH = PAGE.width * (heroC11.aspect || (250 / 595));
        doc.addImage(heroC11.dataUrl, 'PNG',
          0, 0, PAGE.width, heroH, undefined, 'FAST');
      } catch (e) { console.warn('Hero c11 render failed:', e); }
    }
    // (No vector fallback drawn — if the load fails, hero zone is blank.
    // Title block + KV table + signature attestation still render.)

    // Combined mark — centred below the hero composition (matches lab c11)
    const brandY = 215;
    if (combinedMark && combinedMark.dataUrl) {
      try {
        const markW = 150;
        const markH = markW * (combinedMark.aspect || 0.27);
        doc.addImage(combinedMark.dataUrl, 'PNG',
          (PAGE.width - markW) / 2, brandY,
          markW, markH, undefined, 'FAST');
      } catch (e) { console.warn('c11 combined-mark render failed:', e); }
    } else if (logoPng && logoPng.dataUrl) {
      try {
        const iconSize = 32;
        doc.addImage(logoPng.dataUrl, 'PNG',
          (PAGE.width - iconSize) / 2, brandY,
          iconSize, iconSize * (logoPng.aspect || 1), undefined, 'FAST');
      } catch (e) { /* skip */ }
    }

    // Tagline below combined mark
    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(8.5);
    doc.text('verwerkersovereenkomst · GDPR Art 28 · Verordening (EU) 2016/679',
             PAGE.width / 2, brandY + 60, { align: 'center' });

    // Faint full-width divider below brand zone
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.4);
    doc.line(PAGE.marginLeft, brandY + 78,
             PAGE.width - PAGE.marginRight, brandY + 78);

    // Title block (mid page) — pushed down to accommodate the taller c11 hero
    const titleY = brandY + 105;
    setColor(doc, BRAND.ink);
    setFont(doc, 'bold');
    doc.setFontSize(28);
    doc.text('Verwerkersovereenkomst', PAGE.marginLeft, titleY);

    setFont(doc, 'normal');
    doc.setFontSize(13);
    setColor(doc, BRAND.muted);
    const subtitle = `tussen ${controller.legalName} en Regen Studio B.V.`;
    doc.text(subtitle, PAGE.marginLeft, titleY + 22);

    // Engagement label + key — small caps style
    setFont(doc, 'bold');
    doc.setFontSize(8.5);
    setColor(doc, BRAND.gold);
    doc.text((engagement.label || engagement.key || '').toUpperCase(),
             PAGE.marginLeft, titleY + 42, { maxWidth: PAGE.contentWidth });

    // Mid-page horizontal rule
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE.marginLeft, titleY + 60, PAGE.marginLeft + 180, titleY + 60);

    // Engagement metadata block
    const metaY = titleY + 90;
    state.y = metaY;
    setFont(doc, 'bold');
    doc.setFontSize(10);
    setColor(doc, BRAND.emerald);
    doc.text('Engagement', PAGE.marginLeft, state.y);
    state.y += 16;

    // Audit Round-4 follow-up (Yvo direction 2026-05-02): cover meta block
    // strips contract economics (subsidie + expert-uren) — those are
    // commercial details, not Art 28(3) GDPR-required elements. Reframes
    // the "regulatoir kader" line to make explicit:
    //   · OUR grondslag voor verwerken = AVG Art 28 (verwerker-rol op
    //     instructie van Verantwoordelijke); we hebben geen zelfstandige
    //     Art 6-grondslag.
    //   · The project-domain regulation (DSR / ESPR / etc) is ABOUT what
    //     the Verantwoordelijke prepares for, not what governs our data
    //     processing of personal data in this DPA.
    const metaRows = [];
    if (engagement.label)               metaRows.push(['Project',                 engagement.label]);
    metaRows.push(['Toepasselijk recht',     'Nederlands recht; AVG (Verordening (EU) 2016/679) — Verwerker-rol onder Artikel 28']);
    if (engagement.regulatoryLabel)     metaRows.push(['Aard van verwerking',     `DPP-advisory ter voorbereiding op ${engagement.regulatoryLabel}`]);
    if (engagement.projectEinddatum)    metaRows.push(['Project-einddatum',       engagement.projectEinddatum]);
    if (engagement.bewaarplichtEinddatum) metaRows.push(['Bewaarplicht t/m',      engagement.bewaarplichtEinddatum]);
    writeKVTable(state, metaRows);

    // Bottom block: bilateral signature attestation strip — Phase F fix
    // (was controller-only, pre-bilateral legacy). Now lists BOTH parties
    // so the cover accurately reflects the §17 bilateral binding.
    const footerY = PAGE.height - 130;
    setFill(doc, [241, 250, 244]); // light emerald tint
    doc.rect(PAGE.marginLeft, footerY, PAGE.contentWidth, 80, 'F');
    setDraw(doc, BRAND.emerald);
    doc.setLineWidth(1.2);
    doc.line(PAGE.marginLeft, footerY, PAGE.marginLeft, footerY + 80);

    setColor(doc, BRAND.emerald);
    setFont(doc, 'bold');
    doc.setFontSize(10);
    doc.text('Ondertekend bilateraal', PAGE.marginLeft + 14, footerY + 18);

    // Audit Round-3 ux: format ISO timestamp in human Dutch locale on cover
    let coverSignedAt = signature.signedAt;
    try {
      const d = new Date(signature.signedAt);
      if (!Number.isNaN(d.getTime())) {
        coverSignedAt = d.toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' });
      }
    } catch (e) { /* keep ISO fallback */ }

    setColor(doc, BRAND.ink);
    setFont(doc, 'normal');
    doc.setFontSize(9);
    // Verantwoordelijke (controller — counter-signed at this moment)
    doc.text(`Verantwoordelijke: ${controller.repName || '—'} (${controller.repRole || '—'}) namens ${controller.legalName}`,
             PAGE.marginLeft + 14, footerY + 32, { maxWidth: PAGE.contentWidth - 28 });
    // Verwerker (processor — pre-stamped mandaat-handtekening)
    doc.text(`Verwerker: ${processor.repName || '—'} (${processor.repRole || '—'}) namens ${processor.legalName} — vooraf-getekende mandaat-handtekening`,
             PAGE.marginLeft + 14, footerY + 45, { maxWidth: PAGE.contentWidth - 28 });
    // Datum
    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(8.5);
    doc.text(`Datum counter-ondertekening: ${coverSignedAt}`,
             PAGE.marginLeft + 14, footerY + 58);
    doc.setFontSize(7.5);
    doc.text('Simple Electronic Signatures onder eIDAS Art 25(1) · Verordening (EU) 910/2014. Volledige bewijscomponenten in §17.',
             PAGE.marginLeft + 14, footerY + 70, { maxWidth: PAGE.contentWidth - 28 });

    // Bottom-right page mark — 4-triangles signature accent in Regen colors.
    drawTrianglesAccent(doc, PAGE.width - 70, PAGE.height - 38, 7, 3);
    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(7);
    doc.text('Pagina 1', PAGE.marginLeft, PAGE.height - 35);
  }

  // -------------------------------------------------------------------------
  // Parties page
  // -------------------------------------------------------------------------
  function drawPartiesPage(state) {
    const { doc, controller, processor } = state;
    addPage(state);
    writeSectionHeading(state, '§ 1 · Partijen');

    writeParagraph(state,
      'Deze Verwerkersovereenkomst (hierna: "Overeenkomst") is gesloten tussen de volgende Partijen:',
      { spaceAfter: 8 });

    writeSubheading(state, 'De Verwerker');
    writeKVTable(state, [
      ['Naam rechtspersoon',     processor.legalName],
      ['Vestigingsadres',        processor.address],
      ['KvK-nummer',             processor.kvk],
      ['BTW-nummer',             processor.btw],
      ['Bevoegd vertegenwoordiger', processor.repName],
      ['Contact-e-mail',         processor.repEmail],
    ]);

    writeSubheading(state, 'De Verantwoordelijke');
    writeKVTable(state, [
      ['Naam rechtspersoon',        controller.legalName],
      ['Rechtsvorm',                controller.legalForm],
      ['Adres',                     controller.address],
      ['Land van oprichting',       controller.country],
      ['KvK-nummer',                controller.kvk],
      ['Bevoegd vertegenwoordiger', controller.repName],
      ['Functie',                   controller.repRole],
      ['Contact-e-mail',            controller.repEmail],
      ['Telefoon (optioneel)',      controller.repPhone || '—'],
    ]);

    writeParagraph(state,
      'De vertegenwoordiger van de Verantwoordelijke verklaart dat hij/zij bevoegd is om de Verantwoordelijke aan deze Overeenkomst te binden.',
      { fontSize: 9.5, color: BRAND.muted });
  }

  // -------------------------------------------------------------------------
  // Body sections (per-engagement-aware)
  // -------------------------------------------------------------------------
  /** Normalise regulatory-regime enum to internal key. Accepts: 'dsr',
   *  'espr', 'espr_textiles', 'cpr', 'batteries', 'eudr', plus the longer
   *  forms emitted by the intake form (DSR-2026-405, ESPR-DA-textiles, etc). */
  function normaliseRegime(regime) {
    if (!regime) return 'espr';
    const r = String(regime).toLowerCase();
    if (r.includes('dsr')) return 'dsr';
    if (r.includes('textile') || r.includes('apparel')) return 'espr_textiles';
    if (r.includes('cpr')) return 'cpr';
    if (r.includes('batter')) return 'batteries';
    if (r.includes('eudr')) return 'eudr';
    if (r.includes('espr')) return 'espr';
    return 'espr';
  }

  /** Path A v0.2 — generic work-package reference. The detailed per-engagement
   *  work-packages (WP titles, hour-budgets, regime-specific deliverables) live
   *  in the Engagement-contract / Offerte and in Schedule § B.2 — NOT in the
   *  DPA itself, which is the privacy-coverage agreement. Round-2 audit B4
   *  flagged the previous regime-specific WP library as engagement-economics
   *  exposure that doesn't belong in a public DPA template. */
  function regimeWorkPackages(_regime) {
    return [
      { title: 'Werkpakketten — zie Engagement-contract', body: 'De concrete werkpakketten (titels, urenbegroting, planning, deliverables) zijn opgenomen in de Offerte / het Engagement-contract van de Verwerker en in Schedule § B.2. Deze DPA regelt de privacy-aspecten van het werk dat in die Offerte / Schedule wordt beschreven.' },
    ];
  }

  /** Engagement profile registry — Path A v0.2 refactor 2026-05-04.
   *  No more hardcoded client library here (the previous list of 5 voucher
   *  clients moved server-side into the dpa-verify-token Edge Function so
   *  no client identifier ever ships in the public regenstudio-website repo).
   *  Profile data is now INJECTED by the calling page (dpa-contract.html)
   *  via window.DPA_PROFILE_LIBRARY, populated before pdf-builder is invoked.
   *  The caller obtains the profile from the dpa-verify-token Edge Function
   *  using the magic-link token, then registers it under engagement_key. */
  // Audit Round-1 R5 fix: use a getter (function) instead of a captured const,
  // because dpa-contract.html populates window.DPA_PROFILE_LIBRARY AFTER this
  // module loads (script order in HTML). A captured `const ENGAGEMENT_PROFILES`
  // would freeze {} at load time and miss the later assignment, breaking the
  // entire signing flow. The getter reads window.* lazily at resolve time.
  function getEngagementProfiles() {
    return (typeof window !== 'undefined' && window.DPA_PROFILE_LIBRARY) || {};
  }

  function resolveEngagement(callerEngagement) {
    const lib = getEngagementProfiles();
    const profile = lib[callerEngagement.key];
    if (!profile) {
      throw new Error(
        `resolveEngagement: no engagement profile available for key '${callerEngagement.key}'. ` +
        `The calling page (e.g. dpa-contract.html) must register the profile via ` +
        `window.DPA_PROFILE_LIBRARY[<key>] = <profile> before invoking pdf-builder. ` +
        `The profile is obtained from the dpa-verify-token Edge Function on token verification.`
      );
    }
    // Audit Round-3 logic-ver fix: nullish-aware merge so caller-side
    // `undefined` doesn't silently overwrite authoritative profile fields.
    const merged = Object.assign({}, profile);
    for (const k of Object.keys(callerEngagement)) {
      if (callerEngagement[k] != null) merged[k] = callerEngagement[k];
    }
    merged.regulatoryRegime = normaliseRegime(merged.regulatoryRegime);
    return merged;
  }

  function drawDefinitions(state) {
    addPage(state);
    writeSectionHeading(state, '§ 2 · Definities');
    writeParagraph(state,
      'De termen persoonsgegevens, verwerking, verantwoordelijke, verwerker, subverwerker, betrokkene, inbreuk in verband met persoonsgegevens, en toezichthoudende autoriteit hebben de betekenis die hieraan is gegeven in Artikel 4 AVG.');
    writeParagraph(state,
      '"AVG" verwijst naar Verordening (EU) 2016/679 (General Data Protection Regulation). Verwijzingen naar AVG-Artikelen zijn naar die Verordening. "Engagement" duidt het in §3 beschreven samenwerkingsverband tussen Partijen aan. "Engagement-Scope" duidt de in §3 + §4 (Categorieën persoonsgegevens) afgebakende verzameling persoonsgegevens en verwerkingsdoelen aan.');
    writePlainBox(state, 'In klare taal',
      'De woorden uit de AVG (zoals "persoonsgegevens" en "verwerking") betekenen hier hetzelfde als wat de wet zegt — geen aparte interpretaties. "Engagement" is dit specifieke project en "Engagement-Scope" is wat dit project precies omvat.');
  }

  function drawSubjectAndScope(state) {
    const { engagement } = state;
    addPage(state);
    writeSectionHeading(state, '§ 3 · Onderwerp van de overeenkomst');

    writeParagraph(state,
      `De Verwerker levert in opdracht van de Verantwoordelijke de Diensten zoals beschreven in de Offerte voor ${engagement.label}. De werkzaamheden bestaan uit drie werkpakketten:`);

    const wps = regimeWorkPackages(engagement.regulatoryRegime);
    state.y += 4;
    for (let i = 0; i < wps.length; i++) {
      // Hanging-indent bullet: bold title + body on same line, wrapping
      // continues at the indent. Audit Round-3 logic-ver fix: instead of
      // slicing the original bodyText by firstLine.length (which doesn't
      // match jsPDF's whitespace-trimming wrap), wrap the FULL body at
      // hanging-indent width and re-wrap only the first line at the
      // narrower title-row width. Reconstruct remainder from index in the
      // already-wrapped lines array, not from raw character offsets.
      ensureSpace(state, 30);
      const { doc } = state;
      doc.setFontSize(9.5);
      setColor(doc, BRAND.ink);
      setFont(doc, 'normal');
      doc.text('•', PAGE.marginLeft + 4, state.y);
      setFont(doc, 'bold');
      doc.text(wps[i].title, PAGE.marginLeft + 14, state.y);
      const titleW = doc.getTextWidth(wps[i].title + ' ');
      setFont(doc, 'normal');
      const lineGap = 13.5;
      const bodyText = wps[i].body;
      const firstLineMaxW = PAGE.contentWidth - 14 - titleW;
      // Edge case: very long titles leave too little room on the title row;
      // fall back to title-on-its-own-line then full-width body wrap.
      if (firstLineMaxW < 60) {
        state.y += lineGap;
        const allLines = doc.splitTextToSize(bodyText, PAGE.contentWidth - 14);
        for (let j = 0; j < allLines.length; j++) {
          ensureSpace(state, lineGap);
          doc.text(allLines[j], PAGE.marginLeft + 14, state.y);
          state.y += lineGap;
        }
      } else {
        // Wrap full body at hanging-indent width once.
        const allLines = doc.splitTextToSize(bodyText, PAGE.contentWidth - 14);
        // Determine how much of the FIRST wrapped line fits on the title row.
        const firstWrapped = allLines[0] || '';
        const firstFit = doc.splitTextToSize(firstWrapped, firstLineMaxW);
        const firstFitLine = firstFit[0] || '';
        // Remainder = whatever didn't fit on the title row + the rest of
        // the original wrapped lines, joined back and re-wrapped at full width.
        const overflow = firstWrapped.slice(firstFitLine.length).replace(/^\s+/, '');
        const tail = allLines.slice(1).join(' ');
        const remainderText = overflow + (overflow && tail ? ' ' : '') + tail;
        const remainderLines = remainderText ? doc.splitTextToSize(remainderText, PAGE.contentWidth - 14) : [];
        doc.text(firstFitLine, PAGE.marginLeft + 14 + titleW, state.y);
        state.y += lineGap;
        for (let j = 0; j < remainderLines.length; j++) {
          ensureSpace(state, lineGap);
          doc.text(remainderLines[j], PAGE.marginLeft + 14, state.y);
          state.y += lineGap;
        }
      }
      state.y += 4;
    }

    writeParagraph(state,
      `Doel: de Verantwoordelijke voorbereiden op het ${engagement.regulatoryLabel || 'DPP'}-regime${engagement.regulatoryDppDeadline ? ' per ' + engagement.regulatoryDppDeadline : ''}, het op niveau brengen van datagovernance, en het identificeren van waarde door het DPP bovenop wettelijke compliance.`,
      { spaceAfter: 8 });

    writePlainBox(state, 'In klare taal',
      'Drie blokken werk: routekaart richting DPP-compliance, datagovernance op orde brengen, en verkennen wat extra waarde een DPP u kan opleveren.');

    writeSectionHeading(state, '§ 4 · Categorieën persoonsgegevens en betrokkenen');
    writeParagraph(state,
      'De Verwerker verwerkt namens de Verantwoordelijke onder deze Overeenkomst de volgende categorieën persoonsgegevens:');
    [
      'direct contactgegevens van de bevoegd vertegenwoordiger en personeelsleden van de Verantwoordelijke;',
      'direct contactgegevens van leveranciers en hun vertegenwoordigers, en supply-chain-individuen voor zover identificeerbaar;',
      'economic-operator-identifiers bestemd voor publieke openbaarmaking onder DPP-regelgeving;',
      'correspondentie-inhoud (e-mails, chat) en vergader-metadata;',
      'audio-opnames en transcripten van bilaterale gesprekken (alleen mits opname-toestemming onder het transcript-toestemmings-protocol);',
      'product-, materiaal- en supply-chain-data voor DPP-advisory-werk (BoM, leveranciers-identifiers, conformiteits­beoordelings-documentatie, milieu-indicatoren) — voor zover gekoppeld aan natuurlijke-persoon-economic-operators of supply-chain-individuen;',
      'operator-authored notities, minutes en samenvattingen.',
    ].forEach(b => writeParagraph(state, '• ' + b, { fontSize: 9.5, indent: 8, spaceAfter: 4 }));

    writeParagraph(state,
      'Geen bijzondere categorieën persoonsgegevens in de zin van Art 9 AVG vallen onder de scope van deze Overeenkomst.',
      { fontSize: 9.5, style: 'italic', color: BRAND.muted });

    writePlainBox(state, 'In klare taal',
      'Vooral namen + e-mails van u, uw personeel en uw leveranciers. E-mails, vergader-notities en (met opname-toestemming) audio-opnames. Géén medische, religieuze of politieke gegevens.');
  }

  function drawDurationAndRetention(state) {
    const { engagement } = state;
    writeSectionHeading(state, '§ 5 · Looptijd en bewaartermijn');
    writeParagraph(state,
      `Deze Overeenkomst treedt in werking op de datum van de laatste handtekening en blijft van kracht voor de duur van de Engagement (project-einddatum ${engagement.projectEinddatum || '—'} + aansluitende vaststellings- en bezwaartermijnen), plus de wettelijke bewaartermijnen.`);
    writeParagraph(state,
      `Bewaarplicht voor de projectadministratie: tot en met ${engagement.bewaarplichtEinddatum || '31 december 2035'}, gebaseerd op het langste van: (i) 5 jaar Vo (EU) 2021/1060 Art 82(1) cohesion-fund-bewaarplicht, (ii) 10 jaar Vo (EU) 2023/2831 de-minimis-bewaarplicht, (iii) 7 jaar Art 52(4) Algemene Wet inzake Rijksbelastingen (factuur-bewaarplicht), en (iv) Handboek EFRO 2021–2027 v2 administratieve marge.`);
    writeSubheading(state, 'Carve-out — publiek DPP-register');
    writeParagraph(state,
      'Waar persoonsgegevens een economic operator identificeren in de zin van het toepasselijke DPP-regime — typische lex-specialis-grondslagen, in alfabetische volgorde: Batterijenverordening (EU) 2023/1542; CPR 2024/3110; DSR Verordening (EU) 2026/405 Art 21–22 + Annex VI; ESPR (EU) 2024/1781 Art 7 + Art 8; EUDR 2023/1115 — en zijn opgenomen in een publiek DPP-register, strekt de verwijderingsplicht onder § 7 zich niet uit tot (a) het gepubliceerde DPP-record zelf en (b) audit-trail-entries die noodzakelijk zijn ter onderbouwing van conformiteits­beoordelings-lineage. Bij verzoeken die persoonsgegevens betreffen die de Verantwoordelijke heeft laten publiceren, verwijst de Verwerker naar het regulatoire kader dat register-rectificatie beheerst.',
      { fontSize: 9.5 });
    writePlainBox(state, 'In klare taal',
      `Project loopt tot ${engagement.projectEinddatum || '—'}. Daarna moet de boekhouding 10 jaar bewaard blijven (EU-subsidieregel) — niet de gewone correspondentie.`);
  }

  function drawProcessorObligations(state) {
    writeSectionHeading(state, '§ 7 · Verplichtingen van de Verwerker (Art 28(3) AVG)');
    writeSubheading(state, 'Vertrouwelijkheid + beveiliging');
    writeParagraph(state,
      'Personen die bevoegd zijn de persoonsgegevens te verwerken zijn tot vertrouwelijkheid verbonden (Art 28(3)(b)). Technische en organisatorische maatregelen overeenkomstig Art 32 AVG; zie § 14.');
    writeSubheading(state, 'Bijstand bij betrokkenenrechten');
    writeParagraph(state,
      'De Verwerker ondersteunt de Verantwoordelijke met passende technische en organisatorische maatregelen bij verzoeken van betrokkenen onder Art 12–22 AVG (Art 28(3)(e)). Bevestigt door de Verantwoordelijke doorgestuurde verzoeken binnen vijf (5) werkdagen en levert binnen vijftien (15) kalenderdagen de informatie nodig voor een inhoudelijk antwoord.');
    writeSubheading(state, 'Datalek-melding');
    writeParagraph(state,
      'Bij een inbreuk in verband met persoonsgegevens binnen de Engagement-scope meldt de Verwerker dit aan de Verantwoordelijke binnen achtenveertig (48) uur na bekend worden, met de informatie vereist onder Art 33(3) voor zover op dat moment beschikbaar (sneller dan de Art-33-72-uurs-norm).');
    writeSubheading(state, 'Teruggave of verwijdering');
    writeParagraph(state,
      'Bij beëindiging van de Engagement: crypto-shred van de per-betrokkene Data Encryption Key (DEK) maakt alle opgeslagen ciphertext mathematisch onherstelbaar. Streefwaarde: 72 uur na DGA-goedkeuring (worst-case 144 uur incl. 72-uurs evaluatie-venster).');
    writePlainBox(state, 'In klare taal',
      'Vertrouwelijkheid, technische beveiliging, hulp bij AVG-rechten van betrokkenen, snelle melding bij datalek (binnen 48 uur), en alles weg binnen 72 uur aan einde Engagement (behalve wat de wet vereist te bewaren).');
  }

  function drawAiSection(state) {
    const eng = (state && state.engagement) || {};
    const exclusionNarrative = eng.sensitiveDataExclusionNarrativeNl || 'bedrijfsgevoelige IP en propriëtaire data';
    writeSectionHeading(state, '§ 8 · AI-ondersteunde verwerking');
    writeParagraph(state,
      'De Verwerker zet Anthropic PBC (Claude API) in als subverwerker voor AI-ondersteunde drafting, analyse, structurering en samenvatting binnen de Engagement, onder voorwaarden:');
    [
      'AI-ondersteunde verwerking van persoonsgegevens vindt alleen plaats waar de betreffende betrokkene expliciete `ai_processing`-toestemming heeft verleend, of waar de Verantwoordelijke een alternatieve grondslag onder Art 6 AVG heeft gedocumenteerd;',
      'paste-alias-shield vervangt directe identifiers door interne aliassen vóór elke prompt waar mogelijk;',
      exclusionNarrative + ' zijn altijd uitgesloten van AI-verwerking;',
      'data wordt door Anthropic gewist conform het op het moment van ondertekening geldende Anthropic Commercial-Terms-retentiebeleid (op deze datum: 7 dagen standaard); niet gebruikt voor het trainen van modellen. Het actuele beleid is opvraagbaar bij Regen Studio en wordt bij wijziging gepubliceerd in de privacy-policy van regenstudio.world.',
    ].forEach(b => writeParagraph(state, '• ' + b, { fontSize: 9.5, indent: 8, spaceAfter: 4 }));

    writeSubheading(state, 'Werknemers van de Verantwoordelijke');
    writeParagraph(state,
      'Door ondertekening geeft de Verantwoordelijke (als werkgever) schriftelijke instructie aan de Verwerker om persoonsgegevens van werknemers te verwerken voor de in deze Overeenkomst beschreven doelen. De Verantwoordelijke verklaart hiervoor een geldige grondslag onder Art 6 AVG te hebben (typisch Art 6(1)(b), (c) of (f) afhankelijk van de aard van de instructie en de organisatie van de Verantwoordelijke), en dat hij de transparantie-informatie onder Art 13 AVG aan zijn werknemers heeft verstrekt.');
    writeParagraph(state,
      'Werknemers behouden hun AVG-rechten — waaronder het Art 21-bezwaarrecht — en oefenen deze rechtstreeks uit bij de Verantwoordelijke. Als operationele ondersteuning biedt de Verwerker opt-out (geen AI) of alias-toepassing (gefingeerde naam in alle Anthropic-prompts) binnen vijf (5) werkdagen na verzoek per e-mail.',
      { fontSize: 9.5 });

    writeSubheading(state, 'Per-categorie toestemming');
    writeParagraph(state,
      'Per documenttype heeft de Verantwoordelijke aangegeven welke categorieën AI-ondersteund mogen worden verwerkt — zie de toestemmings-matrix op de volgende pagina.');
    writePlainBox(state, 'In klare taal',
      'Regen werkt met Claude (Anthropic AI). Werknemers kunnen via e-mail kiezen voor opt-out (geen AI) of alias (Claude ziet een verzonnen naam). Patronen die op BSN, paspoort of medische gegevens lijken worden hard geweigerd. Categorisch uitgesloten van AI-verwerking is: ' + exclusionNarrative + '.');
  }

  function drawSubprocessors(state) {
    writeSectionHeading(state, '§ 9 · Subverwerkers');
    writeParagraph(state,
      'De Verantwoordelijke verleent algemene schriftelijke toestemming voor inschakeling van onderstaande subverwerkers (Art 28(2)). De Verwerker informeert de Verantwoordelijke ten minste 30 kalenderdagen vooraf over wijzigingen (45 dagen voor materiële wijzigingen). Bezwaar-procedure binnen 15 kalenderdagen. De Verwerker blijft volledig aansprakelijk voor nakoming door subverwerkers (Art 28(4)).');
    writeParagraph(state,
      'Per-Engagement scope. Onderstaande tabel toont de subverwerkers die voor deze Engagement in scope zijn. Regen Studio\'s volledige Annex A (Regen-Studio-wide) telt tevens Exact Online (Exact Group B.V., NL — boekhoudsoftware) en Mollie B.V. (NL — payment-processor, zelfstandig-verantwoordelijke voor publieke CPR-tracker-koop-flow); deze zijn niet in scope voor deze Engagement.',
      { fontSize: 9, color: BRAND.muted, style: 'italic' });

    state.y += 4;
    writeDataTable(state,
      ['Subverwerker', 'Rol', 'Land · Doorgifte'],
      [
        ['Supabase Inc.',     'Database, opslag, Edge Functions, Auth', 'EU (Frankfurt – AWS) · DPA v250314'],
        ['Anthropic PBC',     'Claude API — alleen op ai_processing-grondslag', 'VS · SCCs Modules 2 + 3 · 7-dagen retentie'],
        ['Lettermint B.V.',   'E-mailbezorging',                        'NL · DPA lettermint.co/dpa'],
        ['Proton AG',         'Proton Mail / Drive / Meet / Calendar', 'CH · EU-CH-adequacy · E2EE'],
        ['GitHub, Inc.',      'Statische hosting + demo-hosting',       'VS · MS Customer Agreement SCCs Module 2'],
      ],
      [PAGE.contentWidth * 0.27, PAGE.contentWidth * 0.40, PAGE.contentWidth * 0.33]
    );
  }

  function drawTransfersAndLiability(state) {
    writeSectionHeading(state, '§ 10 · Internationale doorgiften');
    writeParagraph(state,
      'Voor doorgiften naar derde landen baseert de Verwerker zich primair op de Standard Contractual Clauses uit Uitvoeringsbesluit (EU) 2021/914. Voor de doorgifte naar Anthropic in de VS gelden zowel Module 2 als Module 3, beide geïncorporeerd in Anthropic Commercial Terms. Een Transfer Impact Assessment conform Schrems II + EDPB Recommendations 01/2020 is gedocumenteerd en op verzoek beschikbaar.');

    writeSectionHeading(state, '§ 11 · Aansprakelijkheid');
    writeParagraph(state,
      'Aansprakelijkheid voor AVG-schendingen wordt toegedeeld overeenkomstig Art 82 AVG. De totale aansprakelijkheid van elke Partij is beperkt tot het grootste van (i) de vergoedingen onder de Engagement gedurende de twaalf (12) maanden voorafgaand aan het schadeveroorzakende voorval, en (ii) €25.000, behoudens aansprakelijkheid die niet rechtmatig kan worden beperkt. Niets beperkt de blootstelling aan administratieve boetes onder Art 83 AVG of de rechten van betrokkenen onder Art 82(1).');
  }

  function drawTOMs(state) {
    writeSectionHeading(state, '§ 14 · Technische en organisatorische maatregelen');
    writeParagraph(state, 'De Verwerker handhaaft de volgende maatregelen ter waarborging van Art 32 AVG:');
    [
      ['Versleuteling at-rest', 'Per-betrokkene Data Encryption Key (DEK) — random 256-bit sleutelmateriaal — gewikkeld door een master Key Encryption Key (KEK) gehouden in Supabase Vault (pgsodium-backed). PII-velden versleuteld via pgcrypto.pgp_sym_encrypt_bytea (OpenPGP symmetric, AES-onderlaag) met ingebouwde integriteits-check; veld-tag prefix beschermt tegen cross-field swap (audit A1).'],
      ['Versleuteling in transit', 'TLS 1.2+ op elke endpoint.'],
      ['Pseudonimisering', 'Alias-eerst-identiteits-model; identifiers opgeslagen als ciphertext gekoppeld aan de per-betrokkene-DEK; HMAC-SHA-256 fingerprints voor lookup zonder ontsleuteling.'],
      ['Paste-alias-shield (AI-subverwerker)', 'Identifiers in operator-workflows worden gealiased vóór elke Anthropic-prompt; sensitivity-marker-detectie op patronen die op beschermde data lijken (BSN, paspoort, medisch).'],
      ['Row-Level Security', 'Elke tabel met persoonsgegevens heeft RLS aan; Edge Functions opereren uitsluitend via de service-role-key; anonieme en authenticated-rollen hebben geen toegang.'],
      ['Append-only audit-keten', 'SHA-256 hash-chain in consent_audit_log; UPDATE/DELETE/TRUNCATE ingetrokken op GRANT-niveau.'],
      ['KEK-rotatie + herstel', 'Master KEK wordt per kwartaal geroteerd; herstel-runbook gedocumenteerd; per kwartaal restore-drills.'],
      ['Back-up + PITR-propagatie', 'Supabase point-in-time recovery binnen EU-regio; crypto-shred-verwijdering propageert naar back-ups binnen het rotatie-venster (7d PITR / 30d snapshots).'],
      ['Anti-bot + rate-limiting', 'Honeypot-veld, minimum-tijd-drempel, visuele uitdaging, computationele proof-of-work, en per-IP rate-limit op elk publiek inzendings-endpoint.'],
      ['Inbreuk-detectie + incident-response', 'Log-gebaseerd anomaly-review op Edge-Function-uitvoering; per kwartaal externe surface-attack-review. SLA: melding aan Verantwoordelijke binnen 48 uur (canonical § 5.6); de daaropvolgende Art 33 AVG-melding aan de Autoriteit Persoonsgegevens binnen 72 uur is een verplichting van de Verantwoordelijke waarbij de Verwerker desgevraagd ondersteuning levert.'],
      ['Personeel', 'Eenpersoons-firma; toekomstig personeel ondertekent vertrouwelijkheidsverklaring vóór toegang; least-privilege-principe op alle systemen.'],
    ].forEach(([head, body]) => {
      writeSubheading(state, head);
      writeParagraph(state, body, { fontSize: 9.5 });
    });
  }

  function drawInstructionsAndFlexibility(state) {
    writeSectionHeading(state, '§ 6 · Instructies van de Verantwoordelijke');
    writeParagraph(state,
      'De Verwerker verwerkt persoonsgegevens uitsluitend op grond van schriftelijke instructies van de Verantwoordelijke (Art 28(3)(a) AVG), tenzij Unie- of lidstatelijk recht hem daartoe verplicht — in welk geval de Verwerker de Verantwoordelijke vooraf informeert tenzij dit recht dit verbiedt op gewichtige gronden van algemeen belang.');
    writeParagraph(state,
      'Deze Overeenkomst, in samenhang met latere schriftelijke communicatie tussen Partijen, vormt de schriftelijke instructies van de Verantwoordelijke. De Verantwoordelijke verklaart een geldige grondslag onder Art 6 AVG (en, waar van toepassing, Art 9 AVG) te hebben voor de Verwerking, en de transparantie-informatie onder Art 13–14 AVG aan betrokkenen te hebben verstrekt.');
    writeSubheading(state, 'Flexibiliteits-clausule (DPP novel-field)');
    writeParagraph(state,
      'Gegeven de onzekerheid en snelheid van ontwikkeling in het DPP-veld kan de Verantwoordelijke gedurende de Engagement op ad-hoc basis aanvullende documenten, data of informatie aan de Verwerkings-scope toevoegen door per e-mail aan de Verwerker de betreffende stukken aan te leveren. Een dergelijke e-mail van de bevoegd vertegenwoordiger geldt als schriftelijke verlenging van de instructies onder deze §. De Verwerker bevestigt de ontvangst binnen vijf (5) werkdagen per retour-e-mail en logt de wijziging in een scope-amendment-log in het projectdossier.');
  }

  function drawTermination(state) {
    writeSectionHeading(state, '§ 12 · Beëindiging');
    writeParagraph(state,
      'Elke Partij kan deze Overeenkomst beëindigen op dezelfde gronden en met dezelfde opzeg-termijn als het onderliggende Engagement-contract toelaat. § 7 (verwijdering / crypto-shred) en § 7 (audit), en bepalingen die naar hun aard moeten voortduren, blijven van kracht na beëindiging. Indien enige bepaling ongeldig of niet-uitvoerbaar wordt verklaard, blijft de rest onverminderd van kracht.');
    writeParagraph(state,
      'Bij conflict tussen deze Overeenkomst en het onderliggende Engagement-contract prevaleert deze Overeenkomst voor zover het persoonsgegevens-bescherming betreft.');
  }

  function drawVoucherAdministration(state) {
    if (!state.engagement.hasVoucherAnnexes) return;
    writeSectionHeading(state, '§ 13 · Voucher-projectadministratie (KvW3-context)');
    writeParagraph(state,
      'De Verwerker voert de projectadministratie uit ten behoeve van de EFRO-subsidie. De volgende data-categorieën zijn uitgesloten van AI-ondersteunde verwerking en worden uitsluitend in een afgeschermde subfolder bewaard:');
    [
      'MKB-verklaringen met omzet/balans-cijfers;',
      'De-minimis-verklaringen met historisch steun-overzicht;',
      'Bankafschriften en rekeningafschriften;',
      'Werknemers-PII anders dan reguliere project-contactgegevens (BSN, salaris-details, paspoort-kopieën);',
      'Trade secrets en commercieel-vertrouwelijke leveranciers-overeenkomsten met monetaire bedragen;',
      'Niet-voucher-relevante interne beleids-deliberaties.',
    ].forEach(b => writeParagraph(state, '• ' + b, { fontSize: 9.5, indent: 8, spaceAfter: 4 }));
    writeParagraph(state,
      'Daarnaast verwerkt de Verwerker — expliciet in scope — de productdata die noodzakelijk zijn voor het DPP-advisory-werk: stuklijst (BoM), leveranciers-identiteit en metadata, productieproces-metadata, conformiteits­beoordelings-documentatie, unieke product-identifiers, milieu-indicatoren, supply-chain audit-resultaten, en concept-DPP-records.',
      { fontSize: 9.5 });
  }

  function drawAudit(state) {
    writeSectionHeading(state, '§ 7.bis · Audit en inspectie (Art 28(3)(h) AVG)');
    writeParagraph(state,
      'De Verwerker stelt aan de Verantwoordelijke alle informatie ter beschikking nodig om naleving van § 7 en Art 28 AVG aan te tonen, en faciliteert audits door de Verantwoordelijke of een door haar gemandateerde auditor.');
    writeParagraph(state,
      'Audit-modaliteiten: on-site of remote document-gebaseerd, met redelijke voorafgaande kennisgeving (gebruikelijk 30 dagen voor reguliere audits; 5 werkdagen voor incident-driven, toezichthouder-driven of EFRO-controle-driven audits — zie side-letter §6). Een door de Verantwoordelijke gemandateerde derde-auditor ondertekent vóór de audit een schriftelijke vertrouwelijkheidsverklaring jegens de Verwerker en is geen concurrent van de Verwerker.',
      { fontSize: 9.5 });
    writeParagraph(state,
      'De Verwerker informeert de Verantwoordelijke onmiddellijk indien een instructie naar zijn mening inbreuk maakt op de AVG of andere relevante gegevensbeschermings-bepalingen.',
      { fontSize: 9.5 });
  }

  function drawAuditAccess(state) {
    if (!state.engagement.hasVoucherAnnexes) return;
    writeSectionHeading(state, '§ 15 · Toegang voor controlerende instanties (KvW3)');
    writeParagraph(state,
      'De technische afscherming onder § 13 vormt geen toegangsbarrière voor menselijke auditoren namens de bij Handboek EFRO 2021–2027 aangewezen controlerende instanties: Beheerautoriteit, Auditautoriteit EFRO, Europese Commissie (incl. DG REGIO), Europese Rekenkamer, Algemene Rekenkamer, Programmamanager Kansen voor West III, en overige bij wet of verordening aangewezen instanties.');
    writeParagraph(state,
      'Toegangsmodi: on-site inspectie (read-only Proton Drive of fysiek dossier), remote (versleutelde share-link of door auditor aangewezen kanaal, levering binnen 5 werkdagen), of ad-hoc informatieverzoeken per e-mail. De Verwerker logt elk audit-toegangsverzoek in administratie/00-grant/correspondentie/audit-log.md.',
      { fontSize: 9.5 });
  }

  function drawJurisdiction(state) {
    writeSectionHeading(state, '§ 16 · Toepasselijk recht en bevoegde rechter');
    writeParagraph(state,
      'Op deze Overeenkomst is Nederlands recht van toepassing. Bevoegd is de Rechtbank Den Haag, onverminderd de bevoegdheids-regels onder de AVG en het toepasselijke Unie-recht ten aanzien van betrokkenen­vorderingen.');
  }

  function drawSideLetter(state) {
    if (!state.engagement.hasSideLetter) return;
    addPage(state);
    writeSectionHeading(state, '§ 17a · Side-letter (zakelijke voorwaarden)');
    writeParagraph(state,
      'Deze side-letter wordt mede-ondertekend met de hoofdovereenkomst en legt zes zakelijke kennisnemingen vast.',
      { style: 'italic', color: BRAND.muted });

    [
      ['§1 — Aansprakelijkheids-cap',
        'De totale aansprakelijkheid van elke Partij is beperkt tot het grootste van (i) de fees onder de Engagement gedurende de twaalf (12) maanden voorafgaand aan het schadeveroorzakende voorval, en (ii) €25.000, behoudens aansprakelijkheid die niet rechtmatig kan worden beperkt: Art 82 AVG-schadevergoedingen aan betrokkenen, opzet en grove schuld; het regres-recht onder Art 82(5) AVG blijft onbeperkt; administratieve boetes onder Art 83 AVG blijven onbeperkt.'],
      ['§2 — Datalek-melding-vensters',
        'De Verwerker meldt een datalek aan de Verantwoordelijke binnen 48 uur na bekend worden in de zin van EDPB Guidelines 9/2022 § 14. De Verantwoordelijke beschikt vanaf ontvangst van de melding in het slechtste geval nog over ongeveer 24 uur om de eigen Art 33 AVG-melding aan de Autoriteit Persoonsgegevens binnen de 72-uurs-termijn te voltooien (Art 33 is een controller-verplichting; de Verwerker assisteert). Beide Partijen werken te goeder trouw samen om incident-informatie zo vroeg mogelijk te delen, ook mondeling/per telefoon vooruitlopend op de formele schriftelijke melding.'],
      ['§3 — Beroepsaansprakelijkheids-verzekering',
        'De Verwerker bevestigt expliciet dat hij op de datum van ondertekening geen beroepsaansprakelijkheids-verzekering (PI-polis) draagt en geen toezegging doet tot het afsluiten van een dergelijke polis binnen een vastgelegde termijn. Indien de Verwerker in de toekomst een polis afsluit, informeert hij de Verantwoordelijke daarover. De Verantwoordelijke neemt hier expliciet kennis van.'],
      ['§4 — Scope-amendment-via-e-mail',
        'Per § 6 kan de Verwerkings-scope per e-mail worden uitgebreid of beperkt. De Verwerker bevestigt elke wijziging binnen vijf (5) werkdagen + logt in een scope-amendment-log in het projectdossier.'],
      ['§5 — Audit-notice voor incident-driven audits',
        'De gewone audit-notice-termijn van 30 dagen wordt verkort tot vijf (5) werkdagen indien de audit voortvloeit uit een gemeld of vermoed datalek, een instructie van de AP of een EFRO-controle-procedure.'],
      ['§6 — Externe juridische audit — kennisneming en commitment',
        'De Partijen erkennen dat deze Overeenkomst, de DPIA en deze side-letter geen juridische audit door een onafhankelijke externe partij hebben ondergaan. De Verwerker spreekt de intentie uit binnen redelijke termijn een externe juridische audit te organiseren; de Verantwoordelijke kan op elk moment per e-mail aan info@regenstudio.world om een dergelijke audit verzoeken. Mocht een dergelijke audit hiaten of fouten aan het licht brengen die niet in lijn zijn met de geest van de samenwerking of met AVG Art 28, dan spant de Verwerker zich volledig in om deze te herstellen en de Verantwoordelijke binnen redelijke termijn een herziene Verwerkersovereenkomst voor te leggen.'],
    ].forEach(([head, body]) => {
      writeSubheading(state, head);
      writeParagraph(state, body, { fontSize: 9.5 });
    });
  }

  // -------------------------------------------------------------------------
  // Toggles + AI consent summary
  // -------------------------------------------------------------------------
  const DOC_TOGGLE_LABELS = {
    doc_bom: 'BoM en productsamenstelling',
    doc_suppliers: 'Leveranciers-overzichten + metadata',
    doc_conformity: 'Conformiteitsbeoordeling-stukken',
    doc_indicators: 'Milieu-indicator-rapporten (LCA / Annex II)',
    doc_supplychain: 'Supply-chain audit-resultaten',
    doc_ufi: 'UFI-koppeling-data',
    doc_dpprecord: 'Concept-DPP-records',
    doc_formulation_cat: 'Formulering-data op categorie-niveau',
    doc_email: 'E-mail-correspondentie binnen project',
    doc_meetings: 'Vergader-notities en agenda\'s',
    doc_audio: 'Audio-opnames + transcripten',
    doc_progress: 'Voortgangs-rapportages',
    doc_final: 'Eindrapportage en prestatieverklaringen',
    doc_comms: 'Communicatie-uitingen',
    doc_legal: 'Wetgevings-documenten (Batterijen / CLP / CPR / DSR / ESPR / EUDR / PCN)',
    doc_branche: 'Branche-publicaties',
    doc_research: 'Onderzoeksbronnen en literatuur',
    doc_competitors: 'Concurrent- en marktvergelijkingen',
  };

  function drawTogglesAndConsent(state) {
    const { toggles, aiProcessingConsent, controller } = state;
    addPage(state);
    writeSectionHeading(state, '§ 8.2 · Toestemmings-matrix per documentcategorie');
    writeParagraph(state,
      'Per documenttype heeft de Verantwoordelijke aangegeven welke categorieën AI-ondersteund mogen worden verwerkt. "Aan" = paste-alias-shield + Anthropic-prompt toegestaan met aliasing. "Uit" = hard-refuse: geen prompts naar Anthropic met inhoud uit die categorie.');

    const onItems = [];
    const offItems = [];
    // Audit Round-4 logic-ver fix: opt-IN by default (was opt-out). AI consent
    // requires explicit positive choice per AVG Art 6/7 — absent keys default
    // to OFF (hard-refuse), not ON. The intake form must emit `true` only for
    // categories the controller explicitly ticked.
    Object.entries(DOC_TOGGLE_LABELS).forEach(([id, label]) => {
      const checked = !!(toggles && toggles[id] === true);
      (checked ? onItems : offItems).push(label);
    });

    if (onItems.length) {
      writeSubheading(state, 'Aan (AI-ondersteund met alias)');
      writeParagraph(state, onItems.join(' · '), { fontSize: 9, color: BRAND.ink });
    }
    if (offItems.length) {
      writeSubheading(state, 'Uit (hard-refuse)');
      writeParagraph(state, offItems.join(' · '), { fontSize: 9, color: [201, 42, 42] });
    }

    writeSubheading(state, 'AI-toestemming voor de eigen persoonsgegevens van de tekenbevoegde');
    writeParagraph(state, aiProcessingConsent
      ? `Toestemming verleend: ${controller.repName || '—'} stemt in met AI-verwerking van zijn/haar eigen persoonsgegevens. AI-verwerking van Engagement-documenten verloopt zoals aangegeven in de toestemmings-matrix hierboven.`
      : `Toestemming geweigerd: ${controller.repName || '—'} stemt NIET in met AI-verwerking van zijn/haar eigen persoonsgegevens. AI-verwerking van Engagement-documenten verloopt zoals aangegeven in de toestemmings-matrix hierboven; alleen de eigen persoonsgegevens van de tekenende blijven uitgesloten via alias-shield + opt-in voor werknemers.`,
      { fontSize: 9.5 });
  }

  // -------------------------------------------------------------------------
  // Signature evidence (last page)
  // -------------------------------------------------------------------------
  function drawSignatureEvidence(state) {
    const { signature, controller, processor, processorSig } = state;
    addPage(state);
    writeSectionHeading(state, '§ 17 · Handtekening en bewijs van ondertekening');

    writeParagraph(state,
      'Deze Overeenkomst is bilateraal ondertekend met Simple Electronic Signatures (SES) in de zin van Artikel 3(10) van Verordening (EU) 910/2014 (eIDAS): door de Verwerker (Regen Studio B.V.) via een vooraf-getekende mandaat-handtekening van de bestuurder, en door de Verantwoordelijke via een eenmalige magic-link-click-to-sign-flow geëxploiteerd door de Verwerker. De juridische binding ontstaat op het moment van counter-ondertekening door de Verantwoordelijke.');

    writeParagraph(state,
      'Onder Artikel 25(1) eIDAS kan een elektronische handtekening niet enkel op grond van haar elektronische vorm of niet-QES-status rechtsgevolg en bewijswaarde worden ontzegd. Partijen komen overeen dat een SES uitgevoerd onder deze § voldoende is voor de toepassing van deze Overeenkomst.');

    state.y += 8;

    // Bilateral signature blocks (P1 design — sign-once-per-template for
    // processor; per-engagement for controller). Layout: two side-by-side
    // bordered boxes, each ~240×95pt. Graceful degrade per side: if either
    // PNG is missing, that box renders empty with caption only.
    const hasProcessorSig = !!(processorSig && processorSig.dataUrl);
    const hasControllerSig = !!signature.handDrawnPng;
    if (hasProcessorSig || hasControllerSig) {
      writeSubheading(state, 'Handtekeningen');
      ensureSpace(state, 145);
      const gap = 16;
      const totalW = PAGE.contentWidth;
      const sigBoxW = (totalW - gap) / 2;
      const sigBoxH = 95;
      const sigY = state.y;

      // LEFT — Verwerker (processor / Regen Studio)
      const leftX = PAGE.marginLeft;
      setDraw(state.doc, BRAND.border);
      setFill(state.doc, [255, 255, 255]);
      state.doc.setLineWidth(0.5);
      state.doc.rect(leftX, sigY, sigBoxW, sigBoxH, 'FD');
      if (hasProcessorSig) {
        try {
          const padX = 8, padY = 8;
          const innerW = sigBoxW - padX * 2;
          const innerH = sigBoxH - padY * 2;
          const sigW = Math.min(innerW, innerH / Math.max(processorSig.aspect, 0.05));
          const sigH = sigW * processorSig.aspect;
          state.doc.addImage(processorSig.dataUrl, 'PNG',
            leftX + (sigBoxW - sigW) / 2,
            sigY + (sigBoxH - sigH) / 2,
            sigW, sigH, undefined, 'FAST');
        } catch (e) {
          console.warn('Processor signature render failed:', e);
        }
      }
      setColor(state.doc, BRAND.muted);
      setFont(state.doc, 'bold');
      state.doc.setFontSize(8);
      state.doc.text('Verwerker', leftX, sigY + sigBoxH + 12);
      setFont(state.doc, 'normal');
      state.doc.setFontSize(7.5);
      state.doc.text(`${processor.repName || '—'} · ${processor.repRole || '—'}`,
        leftX, sigY + sigBoxH + 23, { maxWidth: sigBoxW });
      state.doc.text(processor.legalName,
        leftX, sigY + sigBoxH + 32, { maxWidth: sigBoxW });
      if (!hasProcessorSig) {
        setColor(state.doc, BRAND.plainBd);
        state.doc.text('(handtekening niet geladen — DPA_PROCESSOR_SIG_B64 env var niet gezet op de Supabase-project)',
          leftX, sigY + sigBoxH + 42, { maxWidth: sigBoxW });
        setColor(state.doc, BRAND.muted);
      }

      // RIGHT — Verantwoordelijke (controller / counterparty)
      const rightX = leftX + sigBoxW + gap;
      setDraw(state.doc, BRAND.border);
      setFill(state.doc, [255, 255, 255]);
      state.doc.setLineWidth(0.5);
      state.doc.rect(rightX, sigY, sigBoxW, sigBoxH, 'FD');
      if (hasControllerSig) {
        try {
          const pngData = 'data:image/png;base64,' + signature.handDrawnPng;
          state.doc.addImage(pngData, 'PNG', rightX + 8, sigY + 8, sigBoxW - 16, sigBoxH - 16, undefined, 'FAST');
        } catch (e) {
          console.warn('Controller signature PNG render failed:', e);
        }
      }
      setColor(state.doc, BRAND.muted);
      setFont(state.doc, 'bold');
      state.doc.setFontSize(8);
      state.doc.text('Verantwoordelijke', rightX, sigY + sigBoxH + 12);
      setFont(state.doc, 'normal');
      state.doc.setFontSize(7.5);
      state.doc.text(`${controller.repName || '—'} · ${controller.repRole || '—'}`,
        rightX, sigY + sigBoxH + 23, { maxWidth: sigBoxW });
      state.doc.text(`namens ${controller.legalName || '—'}`,
        rightX, sigY + sigBoxH + 32, { maxWidth: sigBoxW });

      state.y += sigBoxH + 48;

      // Cross-sig disclaimer (audit adversary REVIEW: drawn images alone
      // have no independent bewijswaarde — binding anchors are server-side).
      setColor(state.doc, BRAND.muted);
      setFont(state.doc, 'normal');
      state.doc.setFontSize(7);
      state.doc.text(
        'Visuele bevestiging — de juridische ankers zijn de server-side opgeslagen SHA-256-hash + token-hash + signed_at + IP/UA-hash op de dpa_signatures rij van de Verwerker.',
        PAGE.marginLeft, state.y, { maxWidth: totalW });
      state.y += 16;
    }

    writeSubheading(state, 'Bewijsbestanddelen');
    // Audit B5 fix: do NOT print signed_pdf_sha into the visible body
    // (chicken-and-egg — including it would change the bytes whose hash
    // we'd be claiming). snapshot_sha is safe to include — computed over
    // the canonical legal text + engagement metadata, stable before the
    // signature image is stamped — but Phase A.2 architectural fix needed
    // before client builds carry that value cleanly. Reference the
    // database row instead.
    // Audit B6 fix: signedAt is the controller's local clock at draft-render
    // moment; the server stamps the canonical signed_at on the dpa_signatures
    // row. Show the local-clock value as "ondertekend op" with a note that
    // the server-recorded timestamp prevails on disputes.
    writeKVTable(state, [
      ['Verwerker',                `${processor.repName || '—'} (${processor.repRole || '—'}) namens ${processor.legalName} — vooraf-getekende mandaat-handtekening`],
      ['Verantwoordelijke',        `${controller.repName || '—'} (${controller.repRole || '—'}) namens ${controller.legalName}`],
      ['Tijdstip ondertekening (browser)', signature.signedAt || '—'],
      ['Token-mechanisme',         'magic-link, eenmalig gebruik, 7-dagen-geldig, hash-opgeslagen'],
      ['Bewijs-anker (server-side)', 'dpa_signatures.signed_pdf_sha + signed_at + ip_hash + ua_hash, opgeslagen in de database van de Verwerker'],
    ]);

    writeParagraph(state,
      'De integriteit van het getekende document wordt geborgd door de SHA-256-hash van de PDF-bytes, opgeslagen in dpa_signatures van de Verwerker bij de bevestiging van ondertekening. De server-vastgelegde signed_at-timestamp prevaleert in geval van geschil over het tijdstip. Een rechercheerbare audit-trail is beschikbaar in consent_audit_log met een append-only hash-chain.',
      { fontSize: 9, color: BRAND.muted });

    state.y += 12;
    writeSubheading(state, 'Contact');
    writeParagraph(state,
      'Voor vragen over deze Overeenkomst, betrokkenenrechten of incident-meldingen: info@regenstudio.world. Voor klachten kunt u zich richten tot de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).',
      { fontSize: 9.5 });
  }

  // -------------------------------------------------------------------------
  // Closing note — emotional-trust anchor (audit ux-empath B2 fix)
  // -------------------------------------------------------------------------
  function drawClosingNote(state) {
    state.y += 12;
    writePlainBox(state, 'Wat nu?',
      'U hoeft nu niets te doen. Bewaar dit PDF in uw eigen administratie — wij hebben u hiervan ook een kopie per e-mail gestuurd. Heeft u later vragen over deze Overeenkomst, of wilt u uw toestemming aanpassen of intrekken? Mail dan info@regenstudio.world; Regen Studio antwoordt binnen 2 werkdagen. Voor klachten over gegevensverwerking kunt u zich (zonder voorafgaand overleg met ons) richten tot de Autoriteit Persoonsgegevens — autoriteitpersoonsgegevens.nl.');
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------
  async function buildSignedDpaPdf(args) {
    if (!root.jspdf || !root.jspdf.jsPDF) {
      throw new Error('jsPDF not loaded — ensure assets/js/vendor/jspdf.umd.min.js is included before this module.');
    }
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });

    // Audit Round-2 fix: fail-loud on missing engagement key/label rather
    // than silently shipping a TEST-stamped PDF as a real signed artefact.
    if (!args.engagement || !args.engagement.key || !args.engagement.label) {
      throw new Error('buildSignedDpaPdf: engagement.key and engagement.label are required (no test-defaults in production path).');
    }
    if (!args.controller || !args.controller.legalName || !args.controller.repName) {
      throw new Error('buildSignedDpaPdf: controller.legalName and controller.repName are required.');
    }

    const state = {
      doc,
      pageNumber: 1,
      y: PAGE.marginTop,
      // Audit Round-4 follow-up: do NOT pre-seed engagement defaults here —
      // they leak through resolveEngagement's caller-merge and overwrite the
      // ENGAGEMENT_PROFILES authoritative values (e.g. cover would show ESPR
      // for a DSR-regime engagement). Profile is the source of truth.
      engagement: Object.assign({}, args.engagement),
      controller: Object.assign({
        legalName: '—',
        legalForm: '—',
        address: '—',
        country: 'Nederland',
        kvk: '—',
        repName: '—',
        repRole: '—',
        repEmail: '—',
        repPhone: '',
      }, args.controller || {}),
      // Audit Phase D D4 fix: extracted to DEFAULT_PROCESSOR (top of file)
      // so dpa-contract.html (counterparty path) and dpa/ops/ (admin path)
      // share one source of truth for processor identity. Both call sites
      // currently rely on these defaults silently — see DEFAULT_PROCESSOR
      // doc-comment for the coupling registry.
      processor: Object.assign({}, DEFAULT_PROCESSOR, args.processor || {}),
      toggles: args.toggles || {},
      aiProcessingConsent: !!args.aiProcessingConsent,
      signature: Object.assign({
        signedAt: new Date().toISOString(),
        snapshotSha: '—',
        requestId: '—',
        ipHash: '—',
        uaHash: '—',
      }, args.signature || {}),
    };

    // Resolve engagement profile (lookup hardcoded registry by key, merge
    // with caller-provided overrides). Audit B1 fix.
    state.engagement = resolveEngagement(state.engagement);

    // Load Lora + chameleon + combined-mark + cover hero c11 + processor
    // signature in parallel. All same-origin static assets; null fallbacks
    // render gracefully. Phase D — processor sig delivered inline via
    // signature.processorPng. Phase E — combined mark (icon + KoHo wordmark)
    // used on cover + header. Phase G — c11 watercolor-sails hero (locked).
    const [, logoPng, combinedMark, heroC11, processorSig] = await Promise.all([
      loadLoraFonts(state),
      loadLogoPng(),
      loadCombinedMarkPng(),
      loadHeroC11Png(),
      resolveInlineProcessorSig(state.signature.processorPng),
    ]);
    state.logoPng = logoPng;
    state.combinedMark = combinedMark;
    state.heroC11 = heroC11;
    state.processorSig = processorSig;
    doc.__regenFont = state.font;
    doc.setFont(state.font, 'normal');

    // Cover page
    drawCover(state);

    // Body — Audit Round-2 fixes:
    //  · drawAudit() unconditional (Art 28(3)(h) applies to ALL engagements,
    //    not only voucher; drawAuditAccess remains as voucher-additive layer)
    //  · drawSignatureEvidence rendered BEFORE drawSideLetter so §17 precedes
    //    §17a (no more 17 → 17a → 17 visual anomaly)
    drawPartiesPage(state);
    drawDefinitions(state);
    drawSubjectAndScope(state);
    drawDurationAndRetention(state);
    drawInstructionsAndFlexibility(state);
    drawProcessorObligations(state);
    drawAudit(state);
    drawAiSection(state);
    drawTogglesAndConsent(state);
    drawSubprocessors(state);
    drawTransfersAndLiability(state);
    drawTermination(state);
    drawVoucherAdministration(state);
    drawTOMs(state);
    drawAuditAccess(state);
    drawJurisdiction(state);
    // Audit Round-4 ux-empath fix: side-letter BEFORE signature evidence so
    // material commercial terms (€25k cap, 48h breach window, no-PI) are
    // surfaced pre-signature, not appended post-hoc.
    drawSideLetter(state);
    drawSignatureEvidence(state);
    drawClosingNote(state);

    return doc.output('blob');
  }

  // Expose
  root.buildSignedDpaPdf = buildSignedDpaPdf;
})(typeof window !== 'undefined' ? window : globalThis);
