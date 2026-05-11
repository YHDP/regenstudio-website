/**
 * canonical-loader.js — frontmatter parser + interpolator for canonical contract markdown.
 *
 * Each canonical .md may begin with a YAML frontmatter block describing the
 * cover (title, subtitle, parties rows, signature labels). Both render paths
 * (HTML in dpa-contract.html / scope-contract.html and PDF in
 * dpa-pdf-renderer.js / scope-pdf-renderer.js) consume the parsed metadata so
 * cover content has one source.
 *
 *   ---
 *   variant: mutual
 *   document_title: Mutual Sub-processor DPA
 *   subtitle: |
 *     GDPR Article 28(3) reciprocal sub-processor agreement · partnership-wide
 *   parties:
 *     - [Party A, Regen Studio B.V.]
 *     - [Party B, "{{legal_name}}"]
 *   signature_box:
 *     title: Mutual bilateral signature
 *     party_a_role: Party A — Regen Studio B.V.
 *   ---
 *   # Body markdown...
 *
 * Public API (browser global window.RegenCanonical):
 *   parseCanonical(rawText) → { coverMetadata, body }
 *   interpolate(coverMetadata, vars) → coverMetadata with {{key}} substituted
 *
 * Sibling Deno port: supabase/functions/_shared/canonical-loader.ts. Keep both
 * in sync — they must produce byte-identical output for the same input so the
 * server-side SHA pin and the client-side render agree.
 *
 * No external deps. Schema is intentionally narrow: top-level scalars, block
 * scalars (|), nested mappings (one level), and lists of inline two-element
 * lists. Sufficient for the cover schema; not a full YAML parser.
 */
(function (root) {
  'use strict';

  function leadingWs(line) {
    var m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function parseValue(text) {
    if (text == null) return null;
    text = text.trim();
    if (text === '') return '';
    // Quoted string — drop outer quotes
    if ((text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') ||
        (text.charAt(0) === "'" && text.charAt(text.length - 1) === "'")) {
      return text.slice(1, -1);
    }
    // Inline list: [a, b, "c, d"]
    if (text.charAt(0) === '[' && text.charAt(text.length - 1) === ']') {
      var inner = text.slice(1, -1).trim();
      if (inner === '') return [];
      return splitTopLevel(inner, ',').map(function (s) { return parseValue(s); });
    }
    if (text === 'null' || text === '~') return null;
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text;
  }

  function splitTopLevel(text, delim) {
    var parts = [];
    var depth = 0;
    var current = '';
    var inQuote = null;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inQuote) {
        current += ch;
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inQuote = ch; current += ch; continue; }
      if (ch === '[' || ch === '{') { depth++; current += ch; continue; }
      if (ch === ']' || ch === '}') { depth--; current += ch; continue; }
      if (ch === delim && depth === 0) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);
    return parts.map(function (s) { return s.trim(); }).filter(function (s, i, a) { return s !== '' || a.length > 1; });
  }

  function parseSimpleYaml(yamlText) {
    var lines = yamlText.split('\n');
    var result = {};
    var i = 0;

    function isBlankOrComment(s) {
      var t = s.replace(/\s+$/, '').replace(/^\s+/, '');
      return t === '' || t.charAt(0) === '#';
    }

    function nextNonBlank(from) {
      var j = from;
      while (j < lines.length && isBlankOrComment(lines[j])) j++;
      return j;
    }

    while (i < lines.length) {
      var line = lines[i];
      if (isBlankOrComment(line)) { i++; continue; }
      var indent = leadingWs(line);
      var content = line.slice(indent).replace(/\s+$/, '');

      // Only top-level keys handled in the outer loop. Nested handled inline below.
      if (indent !== 0) { i++; continue; }

      var colon = content.indexOf(':');
      if (colon < 0) { i++; continue; }
      var key = content.slice(0, colon).trim();
      var rest = content.slice(colon + 1).trim();

      if (rest === '') {
        // Empty RHS — peek next non-blank line to decide list vs map vs null
        var j = nextNonBlank(i + 1);
        if (j >= lines.length) { result[key] = null; i = j; continue; }
        var nextLine = lines[j];
        var nextIndent = leadingWs(nextLine);
        if (nextIndent === 0) { result[key] = null; i = j; continue; }
        var nextContent = nextLine.slice(nextIndent).replace(/\s+$/, '');

        if (nextContent.indexOf('- ') === 0) {
          // List
          var listItems = [];
          var k = j;
          while (k < lines.length) {
            if (isBlankOrComment(lines[k])) { k++; continue; }
            var lk = lines[k];
            var lkIndent = leadingWs(lk);
            if (lkIndent !== nextIndent) break;
            var lkContent = lk.slice(lkIndent).replace(/\s+$/, '');
            if (lkContent.indexOf('- ') !== 0) break;
            listItems.push(parseValue(lkContent.slice(2)));
            k++;
          }
          result[key] = listItems;
          i = k;
          continue;
        } else {
          // Nested mapping (one level)
          var submap = {};
          var m = j;
          while (m < lines.length) {
            if (isBlankOrComment(lines[m])) { m++; continue; }
            var lm = lines[m];
            var lmIndent = leadingWs(lm);
            if (lmIndent !== nextIndent) break;
            var lmContent = lm.slice(lmIndent).replace(/\s+$/, '');
            var subColon = lmContent.indexOf(':');
            if (subColon < 0) { m++; continue; }
            var subKey = lmContent.slice(0, subColon).trim();
            var subRest = lmContent.slice(subColon + 1).trim();
            submap[subKey] = parseValue(subRest);
            m++;
          }
          result[key] = submap;
          i = m;
          continue;
        }
      } else if (rest === '|') {
        // Block scalar (literal, preserve newlines)
        var p = nextNonBlank(i + 1);
        if (p >= lines.length) { result[key] = ''; i = p; continue; }
        var blockIndent = leadingWs(lines[p]);
        if (blockIndent === 0) { result[key] = ''; i = p; continue; }
        var blockLines = [];
        var q = i + 1;
        while (q < lines.length) {
          var lq = lines[q];
          if (lq.replace(/\s+$/, '') === '') {
            blockLines.push('');
            q++;
            continue;
          }
          var lqIndent = leadingWs(lq);
          if (lqIndent < blockIndent) break;
          blockLines.push(lq.slice(blockIndent));
          q++;
        }
        while (blockLines.length && blockLines[blockLines.length - 1] === '') blockLines.pop();
        result[key] = blockLines.join('\n');
        i = q;
        continue;
      } else {
        result[key] = parseValue(rest);
        i++;
        continue;
      }
    }
    return result;
  }

  function parseCanonical(text) {
    if (!text) return { coverMetadata: null, body: '' };
    if (text.indexOf('---\n') !== 0 && text.indexOf('---\r\n') !== 0) {
      return { coverMetadata: null, body: text };
    }
    var afterOpen = text.indexOf('\n') + 1;
    var closeIdx = text.indexOf('\n---\n', afterOpen);
    if (closeIdx < 0) {
      // No closing delimiter — treat whole file as body, ignore opening dashes
      return { coverMetadata: null, body: text };
    }
    var yamlText = text.slice(afterOpen, closeIdx);
    var body = text.slice(closeIdx + 5);
    var coverMetadata = null;
    try {
      coverMetadata = parseSimpleYaml(yamlText);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('canonical-loader: frontmatter parse failed:', e);
      }
      coverMetadata = null;
    }
    return { coverMetadata: coverMetadata, body: body };
  }

  function interpolate(obj, vars) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      return obj.replace(/\{\{(\w+)\}\}/g, function (m, k) {
        return (vars && vars[k] != null && vars[k] !== '') ? String(vars[k]) : m;
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(function (v) { return interpolate(v, vars); });
    }
    if (typeof obj === 'object') {
      var out = {};
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          out[key] = interpolate(obj[key], vars);
        }
      }
      return out;
    }
    return obj;
  }

  var api = { parseCanonical: parseCanonical, interpolate: interpolate };

  if (typeof window !== 'undefined') {
    window.RegenCanonical = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this);
