/**
 * dpa-md-render.js — Minimal markdown parser tailored to canonical-NL.md.
 *
 * Pipeline (post Phase-1 refactor):
 *
 *   markdown source ──► RegenMD.parse(md, vars) ──► AST nodes ──► RegenMD.astToHtml(ast) ──► HTML string
 *                                                            └──► RegenPDF.render(ast, opts) ──► jsPDF native PDF
 *
 * The AST is the single load-bearing intermediate format. Both the browser
 * HTML view and the PDF renderer consume the SAME parsed AST — making text
 * drift between browser-render and PDF-render mechanically impossible.
 *
 * AST node types (all blocks have a single `type` discriminator):
 *   {type: 'heading',    level: 1-6, runs: [Run]}
 *   {type: 'paragraph',  runs: [Run]}
 *   {type: 'list',       ordered: bool, items: [[Run]]}
 *   {type: 'table',      headers: [[Run]] | null, rows: [[[Run]]]}
 *   {type: 'blockquote', runs: [Run]}
 *   {type: 'hr'}
 *
 * Run types (inline formatting within a block):
 *   {type: 'text', text: string, bold: bool, italic: bool, code: bool}
 *   {type: 'link', text: string, href: string, bold: bool, italic: bool}
 *
 * Public API:
 *   RegenMD.parse(md, vars)         → AST[]      (canonical primary path)
 *   RegenMD.astToHtml(ast)          → string     (browser DOM injection)
 *   RegenMD.render(md, vars)        → string     (backward-compat wrapper)
 *
 * Note: prior versions exposed fetchAndRender / fetchAndParse helpers for
 * same-origin markdown loading. These were removed in the EF-arch refactor
 * (2026-05-05) — markdown content is now delivered by dpa-verify-token Edge
 * Function and parsed in-memory; no client-side fetch path remains.
 *   RegenMD.escapeHtml, .stripFrontmatter, .substituteVars  (preserved utilities)
 */

(function (root) {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function stripFrontmatter(md) {
    if (!md.startsWith('---\n')) return md;
    const end = md.indexOf('\n---\n', 4);
    if (end === -1) return md;
    return md.slice(end + 5).replace(/^\n+/, '');
  }

  // Unicode-strict sanitiser. Strips characters that could be used to:
  //   - bypass syntax-character detection (zero-width joiners, BOMs)
  //   - reverse displayed text direction (RTL/LTR overrides — visual spoofing)
  //   - smuggle protocol prefixes (javascript:, data:, vbscript:)
  //   - inject markdown active syntax ([], <>, {}, ` , linebreaks)
  //   - inject PDF-stream keywords (<<, >>, stream, endstream, obj)
  //   - present full-width / homoglyph variants of structural ASCII chars
  // Applied to ALL substituted variable values + (separately) to controller
  // names rendered into the bilateral signature block. Codified after Round-2
  // audit (prompt-injection attacker BLOCK-1/2/3 + Unicode/RTL bypass).
  function sanitiseUserText(raw) {
    if (raw == null) return '';
    let s = String(raw);
    // 1. Unicode normalize (NFC) so combining marks fold into base chars.
    try { s = s.normalize('NFC'); } catch (_) { /* old browsers: skip */ }
    // 2. Strip invisible / directional control chars.
    //    U+200B-U+200D zero-width, U+200E/U+200F LRM/RLM, U+202A-U+202E
    //    embedding/override, U+2066-U+2069 isolates, U+FEFF BOM.
    s = s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
    // 3. Fold full-width brackets/punctuation to ASCII so they hit the
    //    same strip rules below. Covers homoglyph attacks via U+FF3B etc.
    s = s.replace(/[［｛﹛【]/g, '(')   // [ { 〔 【  → (
         .replace(/[］｝﹜】]/g, ')')   // ] } 〕 】  → )
         .replace(/[＜〈〈]/g, '<')         // ＜ ⟨ 〈     → <
         .replace(/[＞〉〉]/g, '>')         // ＞ ⟩ 〉     → >
         .replace(/[｀‘’]/g, "'")         // ｀ ' '       → '
         .replace(/[＂“”]/g, '"');        // ＂ " "       → "
    // 4. Strip dangerous URL-protocol prefixes (case + whitespace insensitive).
    s = s.replace(/(javascript|vbscript|data|file)\s*:/gi, '');
    // 5. Strip PDF stream keywords (defense-in-depth; jsPDF generally
    //    escapes parens/backslashes itself).
    s = s.replace(/\b(stream|endstream|endobj|xref|trailer)\b/gi, '');
    s = s.replace(/<</g, '').replace(/>>/g, '');
    // 6. Strip remaining markdown-active + HTML-active chars; convert
    //    bracket variants to parens so visible meaning survives.
    s = s.replace(/[<>{}`]/g, '')
         .replace(/\[/g, '(')
         .replace(/\]/g, ')');
    // 7. Collapse linebreaks + double-whitespace.
    s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  function substituteVars(md, vars) {
    if (!vars) return md;
    // Match both legacy CAPS placeholders ({{KVW_NUMMER}}) and dotted-path
    // placeholders ({{cp.legal_name}}, {{engagement.start_date}},
    // {{system.processor_signed_at}}). Dotted paths are looked up as flat
    // keys in the vars map (vars['cp.legal_name']) — caller pre-flattens.
    //
    // All substituted values pass through sanitiseUserText (above) for
    // defense-in-depth. Engagement profile fields originate from
    // dpa-verify-token Edge Function but treating them as untrusted here
    // mitigates the case where Edge Function code is later compromised
    // or the profile data is sourced from a less-trusted boundary.
    return md.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g, function (full, key) {
      if (vars[key] == null || vars[key] === '') return full;
      const sanitised = sanitiseUserText(vars[key]);
      return sanitised || full;
    });
  }

  // -------------------------------------------------------------------------
  // Inline run parser — converts a string with markdown inline formatting
  // into a flat array of typed runs. Handles non-nested **bold**, *italic*,
  // `code`, and [link](url). Nested formatting is rendered as plain text
  // inside the outer wrap (DPA legal text doesn't use nested formatting in
  // practice — verified across canonical-NL.md + annex sources).
  // -------------------------------------------------------------------------

  function parseInlineRuns(text) {
    const runs = [];
    let i = 0;
    let plainBuf = '';

    function flushPlain() {
      if (plainBuf) {
        runs.push({ type: 'text', text: plainBuf, bold: false, italic: false, code: false });
        plainBuf = '';
      }
    }

    while (i < text.length) {
      const ch = text[i];

      // Inline code: `...`
      if (ch === '`') {
        const close = text.indexOf('`', i + 1);
        if (close > i) {
          flushPlain();
          runs.push({ type: 'text', text: text.slice(i + 1, close), bold: false, italic: false, code: true });
          i = close + 1;
          continue;
        }
      }

      // Bold: **...**  (handled before single-* italic to avoid mis-bind)
      if (ch === '*' && text[i + 1] === '*') {
        const close = text.indexOf('**', i + 2);
        if (close > i + 1) {
          flushPlain();
          runs.push({ type: 'text', text: text.slice(i + 2, close), bold: true, italic: false, code: false });
          i = close + 2;
          continue;
        }
      }

      // Italic: *...*  (single asterisks; require non-space adjacent on inner side)
      if (ch === '*' && text[i + 1] !== '*' && text[i + 1] !== ' ' && text[i + 1] !== undefined) {
        const close = text.indexOf('*', i + 1);
        if (close > i && text[close - 1] !== ' ' && text[close + 1] !== '*') {
          flushPlain();
          runs.push({ type: 'text', text: text.slice(i + 1, close), bold: false, italic: true, code: false });
          i = close + 1;
          continue;
        }
      }

      // Link: [text](href)
      if (ch === '[') {
        const closeText = text.indexOf(']', i + 1);
        if (closeText > i && text[closeText + 1] === '(') {
          const closeHref = text.indexOf(')', closeText + 2);
          if (closeHref > closeText + 1) {
            flushPlain();
            const linkText = text.slice(i + 1, closeText);
            const href = text.slice(closeText + 2, closeHref).trim();
            runs.push({ type: 'link', text: linkText, href: href, bold: false, italic: false });
            i = closeHref + 1;
            continue;
          }
        }
      }

      // Autolink: <https://…> / <http://…> (reconciliation #56 — canonical
      // uses angle-bracket autolinks for privacy.html + dataprivacyframework.gov;
      // without this they render as literal &lt;https://…&gt; text).
      if (ch === '<') {
        const closeAngle = text.indexOf('>', i + 1);
        if (closeAngle > i) {
          const inner = text.slice(i + 1, closeAngle).trim();
          if (/^https?:\/\/[^\s<>]+$/.test(inner)) {
            flushPlain();
            runs.push({ type: 'link', text: inner, href: inner, bold: false, italic: false });
            i = closeAngle + 1;
            continue;
          }
        }
      }

      plainBuf += ch;
      i++;
    }

    flushPlain();
    return runs;
  }

  // -------------------------------------------------------------------------
  // Block classifier + table-row parser (unchanged from prior version).
  // -------------------------------------------------------------------------

  function classify(line) {
    if (/^#{1,6}\s/.test(line)) return 'heading';
    if (/^\|.*\|\s*$/.test(line)) return 'table';
    if (/^---+\s*$/.test(line)) return 'hr';
    if (/^>\s/.test(line)) return 'blockquote';
    if (/^-\s/.test(line)) return 'ulitem';
    if (/^\d+\.\s/.test(line)) return 'olitem';
    if (/^\s*$/.test(line)) return 'blank';
    return 'paragraph';
  }

  function parseTableRow(line) {
    return line.replace(/^\||\|\s*$/g, '').split('|').map(function (c) { return c.trim(); });
  }

  // -------------------------------------------------------------------------
  // Block parser — produces typed AST nodes.
  // -------------------------------------------------------------------------

  function parse(md, vars) {
    md = stripFrontmatter(md);
    md = substituteVars(md, vars);
    // L7c safety-net: HTML comments must NEVER render as visible text in a
    // binding contract. The Edge Function already strips §B-REGIME delimiter
    // comments, but this guarantees ANY <!-- … --> in ANY template (current
    // or future) is dropped at render. Standard markdown behaviour.
    md = md.replace(/<!--[\s\S]*?-->/g, '');

    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const ast = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const type = classify(line);

      if (type === 'blank') { i++; continue; }

      if (type === 'heading') {
        const m = line.match(/^(#{1,6})\s+(.*)$/);
        const level = m[1].length;
        const text = m[2].replace(/\s+#+\s*$/, '');
        ast.push({ type: 'heading', level: level, runs: parseInlineRuns(text) });
        i++;
        continue;
      }

      if (type === 'hr') {
        ast.push({ type: 'hr' });
        i++;
        continue;
      }

      if (type === 'blockquote') {
        const buf = [];
        while (i < lines.length && classify(lines[i]) === 'blockquote') {
          buf.push(lines[i].slice(2));
          i++;
        }
        ast.push({ type: 'blockquote', runs: parseInlineRuns(buf.join(' ')) });
        continue;
      }

      if (type === 'ulitem' || type === 'olitem') {
        const ordered = type === 'olitem';
        const stripRe = ordered ? /^\d+\.\s+/ : /^-\s+/;
        const items = [];
        while (i < lines.length) {
          const t = classify(lines[i]);
          if (t !== type) break;
          let item = lines[i].replace(stripRe, '');
          i++;
          while (
            i < lines.length &&
            lines[i].length > 0 &&
            !/^[-#|>]|^\d+\.\s/.test(lines[i].trim()) &&
            !/^---+\s*$/.test(lines[i])
          ) {
            item += ' ' + lines[i].trim();
            i++;
          }
          items.push(parseInlineRuns(item));
        }
        ast.push({ type: 'list', ordered: ordered, items: items });
        continue;
      }

      if (type === 'table') {
        const tableLines = [];
        while (i < lines.length && classify(lines[i]) === 'table') {
          tableLines.push(lines[i]);
          i++;
        }
        const hasHeader = tableLines.length >= 2 && /^\|[\s\-|:]+\|\s*$/.test(tableLines[1]);
        let headers = null;
        let rowSourceStart = 0;
        if (hasHeader) {
          headers = parseTableRow(tableLines[0]).map(parseInlineRuns);
          rowSourceStart = 2;
        }
        const rows = [];
        for (let r = rowSourceStart; r < tableLines.length; r++) {
          rows.push(parseTableRow(tableLines[r]).map(parseInlineRuns));
        }
        ast.push({ type: 'table', headers: headers, rows: rows });
        continue;
      }

      // Paragraph: collect contiguous paragraph lines until blank or other block.
      const buf = [line];
      i++;
      while (i < lines.length && classify(lines[i]) === 'paragraph') {
        buf.push(lines[i]);
        i++;
      }
      ast.push({ type: 'paragraph', runs: parseInlineRuns(buf.join(' ')) });
    }

    return ast;
  }

  // -------------------------------------------------------------------------
  // HTML renderer — walks AST, emits HTML strings. Replaces the previous
  // monolithic render() output. Preserves the same HTML shape so downstream
  // CSS in dpa-contract.html keeps working without changes.
  // -------------------------------------------------------------------------

  function runsToHtml(runs) {
    return runs.map(function (r) {
      if (r.type === 'link') {
        let inner = escapeHtml(r.text);
        if (r.bold) inner = '<strong>' + inner + '</strong>';
        if (r.italic) inner = '<em>' + inner + '</em>';
        return '<a href="' + escapeHtml(r.href) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>';
      }
      let html = escapeHtml(r.text);
      if (r.code) return '<code>' + html + '</code>';
      if (r.bold) html = '<strong>' + html + '</strong>';
      if (r.italic) html = '<em>' + html + '</em>';
      return html;
    }).join('');
  }

  function astToHtml(ast) {
    const out = [];
    for (let i = 0; i < ast.length; i++) {
      const node = ast[i];
      if (node.type === 'heading') {
        out.push('<h' + node.level + '>' + runsToHtml(node.runs) + '</h' + node.level + '>');
      } else if (node.type === 'paragraph') {
        out.push('<p>' + runsToHtml(node.runs) + '</p>');
      } else if (node.type === 'hr') {
        out.push('<hr>');
      } else if (node.type === 'blockquote') {
        out.push('<blockquote>' + runsToHtml(node.runs) + '</blockquote>');
      } else if (node.type === 'list') {
        const tag = node.ordered ? 'ol' : 'ul';
        const items = node.items.map(function (runs) { return '<li>' + runsToHtml(runs) + '</li>'; }).join('');
        out.push('<' + tag + '>' + items + '</' + tag + '>');
      } else if (node.type === 'table') {
        let html = '<table>';
        if (node.headers) {
          html += '<thead><tr>';
          for (let h = 0; h < node.headers.length; h++) html += '<th>' + runsToHtml(node.headers[h]) + '</th>';
          html += '</tr></thead>';
        }
        html += '<tbody>';
        for (let r = 0; r < node.rows.length; r++) {
          html += '<tr>';
          for (let c = 0; c < node.rows[r].length; c++) html += '<td>' + runsToHtml(node.rows[r][c]) + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table>';
        out.push(html);
      }
    }
    return out.join('\n');
  }

  // Backward-compat wrapper.
  function render(md, vars) {
    return astToHtml(parse(md, vars));
  }

  root.RegenMD = {
    parse: parse,
    astToHtml: astToHtml,
    render: render,
    escapeHtml: escapeHtml,
    stripFrontmatter: stripFrontmatter,
    substituteVars: substituteVars,
    sanitiseUserText: sanitiseUserText,
    parseInlineRuns: parseInlineRuns,
  };
})(typeof window !== 'undefined' ? window : this);
