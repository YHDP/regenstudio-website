/* Richting een meubelpaspoort: the 218 data points as a half tree trunk, in three tiers.
   Shared by content.html, content.nl.html and content.pt.html. Public data: datapunten.json in this folder
   (read via the hidden .mp__data link, so build.ts rewrites its path per language). That file carries full
   detail only for tier 1 (l:1, a legal basis today: EUDR and/or REACH); those cells open one by one in the
   trunk, and the list of all 52 is mailed by the meubelpaspoort-datapunten Edge Function after the e-mail
   gate. Tier 2 (l:2, expected under the ESPR and the passport standards) and tier 3 (l:3, voluntary) are a
   skeleton there (topic, layer, phase, basis), shown as counts per phase and asked for by e-mail. */
(function () {
  var root = document.getElementById('mp');
  if (!root) return;
  var L = root.getAttribute('data-lang') || 'nl';
  var NS = 'http://www.w3.org/2000/svg';
  var ENDPOINT = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/meubelpaspoort-datapunten';

  var T = {
    nl: {
      top: ['Wat is het', 'Wie maakte het', 'Waar is het van', 'Wat zit erin', 'Hoe is het gemaakt', 'Installeren, demonteren en repareren', 'Gebruik en onderhoud', 'Einde levensduur', 'Verklaringen', 'Over dit paspoort'],
      intTop: { 'Klant en project': 'Klant en project', 'Inkoop en leveranciers': 'Inkoop en leveranciers', 'Registratie': 'Registratie' },
      ring: ['paspoort', 'administratie'],
      legend: { eudr: 'EUDR, ontbossing', reach: 'REACH, stoffen', beide: 'EUDR en REACH', verwacht: 'Verwacht, ESPR en normen, op aanvraag', vrij: 'Vrijwillig, op aanvraag' },
      faseNr: 'Fase',
      fase: ['Vooraf, eenmalig', 'Intake', 'Ontwerp', 'Inkoop', 'Maken', 'Opleveren', 'Publiceren'],
      stand: ['Zit in het prototype', 'Nog niet actief', 'Vervallen'],
      grond: { eudr: 'EUDR, de ontbossingsverordening', reach: 'REACH, de stoffenwet', beide: 'EUDR en REACH', norm: 'De Europese normen voor het paspoort', espr: 'Verwacht onder de ESPR' },
      card: { laag: 'Wie ziet het', grond: 'Grondslag', fase: 'Ontstaat bij', stand: 'In het prototype', code: 'Code', p: 'In het paspoort', i: 'Alleen de maker, in de eigen administratie', pasOog: 'Paspoort', intOog: 'Administratie', close: 'Sluiten' },
      svgTitle: 'Halve boomstam met 218 datapunten: buiten het paspoort in tien onderwerpen, binnen de eigen administratie. De 52 uit de wet zijn aan te klikken, 67 verwachte en 99 vrijwillige op aanvraag.',
      fail: 'Het overzicht kon niet laden. Ververs de pagina of mail info@regenstudio.world.',
      pp: 'Bevestig dat je het privacybeleid hebt gelezen.',
      busy: 'Bezig...', btn: 'Stuur mij de datapunten', err: 'Mislukt. Probeer het opnieuw.',
      codes: { email: 'Vul een geldig e-mailadres in.', privacy: 'Bevestig dat je het privacybeleid hebt gelezen.', too_fast: 'Neem even de tijd om het formulier in te vullen.', expired: 'De sessie is verlopen. Ververs de pagina en probeer het opnieuw.', verification: 'De controle is mislukt. Probeer het opnieuw.', rate_limited: 'Te veel aanvragen. Probeer het later opnieuw.' },
      thanks: 'Dank je. De lijst met de 52 datapunten is onderweg naar je e-mailadres.'
    },
    en: {
      top: ['What it is', 'Who made it', 'What it is made of', 'What is in it', 'How it was made', 'Install, take apart and repair', 'Use and care', 'End of life', 'Declarations', 'About this passport'],
      intTop: { 'Klant en project': 'Customer and project', 'Inkoop en leveranciers': 'Purchasing and suppliers', 'Registratie': 'Registration' },
      ring: ['passport', 'records'],
      legend: { eudr: 'EUDR, deforestation', reach: 'REACH, substances', beide: 'EUDR and REACH', verwacht: 'Expected, ESPR and standards, on request', vrij: 'Voluntary, on request' },
      faseNr: 'Phase',
      fase: ['Set up once', 'Intake', 'Design', 'Purchasing', 'Making', 'Delivery', 'Publishing'],
      stand: ['In the prototype', 'Not active yet', 'Dropped'],
      grond: { eudr: 'EUDR, the deforestation regulation', reach: 'REACH, the chemicals regulation', beide: 'EUDR and REACH', norm: 'The European passport standards', espr: 'Expected under the ESPR' },
      card: { laag: 'Who sees it', grond: 'Legal basis', fase: 'Created at', stand: 'In the prototype', code: 'Code', p: 'In the passport', i: 'Only the maker, in his own records', pasOog: 'Passport', intOog: 'Records', close: 'Close' },
      svgTitle: 'Half a tree trunk with 218 data points: the passport on the outside in ten topics, the maker\'s own records inside. The 52 in the law can be clicked, 67 expected and 99 voluntary ones on request.',
      fail: 'The overview could not load. Reload the page or mail info@regenstudio.world.',
      pp: 'Please confirm you have read the Privacy Policy.',
      busy: 'Sending...', btn: 'Send me the data points', err: 'Failed. Please try again.',
      codes: { email: 'Please enter a valid email address.', privacy: 'Please confirm you have read the Privacy Policy.', too_fast: 'Please take a moment to fill out the form.', expired: 'The session has expired. Reload the page and try again.', verification: 'The check failed. Please try again.', rate_limited: 'Too many requests. Please try again later.' },
      thanks: 'Thank you. The list of the 52 data points is on its way to your email address.'
    },
    pt: {
      top: ['O que é', 'Quem fez', 'Do que é feito', 'O que contém', 'Como foi feito', 'Instalar, desmontar e reparar', 'Uso e cuidados', 'Fim de vida', 'Declarações', 'Sobre este passaporte'],
      intTop: { 'Klant en project': 'Cliente e projeto', 'Inkoop en leveranciers': 'Compras e fornecedores', 'Registratie': 'Registro' },
      ring: ['passaporte', 'registros'],
      legend: { eudr: 'EUDR, desmatamento', reach: 'REACH, substâncias', beide: 'EUDR e REACH', verwacht: 'Esperado, ESPR e normas, sob pedido', vrij: 'Voluntário, sob pedido' },
      faseNr: 'Fase',
      fase: ['Configurado uma vez', 'Entrada', 'Projeto', 'Compras', 'Fabricação', 'Entrega', 'Publicação'],
      stand: ['No protótipo', 'Ainda não ativo', 'Descartado'],
      grond: { eudr: 'EUDR, o regulamento sobre desmatamento', reach: 'REACH, o regulamento de substâncias químicas', beide: 'EUDR e REACH', norm: 'As normas europeias do passaporte', espr: 'Esperado sob o ESPR' },
      card: { laag: 'Quem vê', grond: 'Base legal', fase: 'Surge em', stand: 'No protótipo', code: 'Código', p: 'No passaporte', i: 'Só o marceneiro, nos próprios registros', pasOog: 'Passaporte', intOog: 'Registros', close: 'Fechar' },
      svgTitle: 'Meio tronco de árvore com 218 pontos de dados: o passaporte por fora, em dez temas, e os registros do marceneiro por dentro. Os 52 da lei podem ser clicados, 67 esperados e 99 voluntários sob pedido.',
      fail: 'Não foi possível carregar o quadro. Recarregue a página ou escreva para info@regenstudio.world.',
      pp: 'Confirme que você leu a Política de Privacidade.',
      busy: 'Enviando...', btn: 'Envie-me os pontos de dados', err: 'Falhou. Tente novamente.',
      codes: { email: 'Informe um e-mail válido.', privacy: 'Confirme que você leu a Política de Privacidade.', too_fast: 'Reserve um momento para preencher o formulário.', expired: 'A sessão expirou. Recarregue a página e tente novamente.', verification: 'A verificação falhou. Tente novamente.', rate_limited: 'Muitos pedidos. Tente novamente mais tarde.' },
      thanks: 'Obrigado. A lista com os 52 pontos de dados está a caminho do seu e-mail.'
    }
  }[L];

  /* Regen palette (design-tokens.js); text never sits on these fills. */
  var COL = { eudr: '#008545', reach: '#009BBB', beide: '#65DD35', verwacht: '#FFA92D', vrij: '#E4E2E2' };

  function track(type, target) {
    try { if (window.RegenTracker) window.RegenTracker.track(type, target ? { target: target, section: 'meubelpaspoort' } : { section: 'meubelpaspoort' }); } catch (e) { }
  }

  var gate = document.getElementById('mpGate');
  var D = null, cells = [];
  if (window.MP_DATA) build(window.MP_DATA);
  else {
    var link = root.querySelector('.mp__data');
    fetch(link.href).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(build).catch(function () { // same-origin: datapunten.json beside this post
      var p = document.createElement('p'); p.className = 'mp__fail'; p.textContent = T.fail; root.querySelector('.mp__boom').appendChild(p);
    });
  }

  function topicOf(v) {
    return v.i ? (T.intTop[v.r] || T.top[D.meta.onderwerpen.indexOf(v.r)] || v.r) : T.top[D.meta.onderwerpen.indexOf(v.r)];
  }
  /* Phase numbers 1 to 6 match the six-phase figure above the trunk; 0 is set up once, before any order. */
  function faseNaam(f) { return f ? T.faseNr + ' ' + f + ', ' + T.fase[f] : T.fase[f]; }
  function rows(v) {
    return [[T.card.laag, v.i ? T.card.i : T.card.p], [T.card.grond, T.grond[v.b]], [T.card.fase, faseNaam(v.f)], [T.card.stand, T.stand[v.s]], [T.card.code, v.c]];
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function build(data) {
    D = data;
    var svg = root.querySelector('.mp__boom svg'), boom = root.querySelector('.mp__boom'), kaart = root.querySelector('.mp__kaart');
    svg.querySelector('title').textContent = T.svgTitle;
    var CX = 650, CY = 650, PI = Math.PI;
    function mk(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var a in at) e.setAttribute(a, at[a]); (parent || svg).appendChild(e); return e; }
    function pt(r, t) { return [CX + r * Math.cos(t), CY + r * Math.sin(t)]; }
    function wedge(r0, r1, t0, t1) {
      var a = pt(r1, t0), b = pt(r1, t1), c = pt(r0, t1), d = pt(r0, t0);
      return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) +
        'L' + c[0].toFixed(1) + ' ' + c[1].toFixed(1) + (r0 ? 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + d[0].toFixed(1) + ' ' + d[1].toFixed(1) : '') + 'Z';
    }
    mk('path', { d: wedge(560, 592, PI, 2 * PI), fill: '#1B2833' });
    mk('path', { d: wedge(0, 96, PI, 2 * PI), fill: '#243644' });
    mk('path', { d: wedge(302, 312, PI, 2 * PI), fill: '#1B2833' });
    function rings(list, r0, r1, r2, t0, t1) {
      var n2 = Math.ceil(list.length / 2);
      [[list.slice(n2), r0, r1 - 4], [list.slice(0, n2), r1, r2]].forEach(function (x) {
        x[0].forEach(function (v, i) {
          var a = t0 + (t1 - t0) * i / x[0].length, b = t0 + (t1 - t0) * (i + 1) / x[0].length;
          var p = mk('path', { d: wedge(x[1], x[2], a, b), 'class': 'mp__dp' });
          p._v = v; p._m = [(x[1] + x[2]) / 2, (a + b) / 2]; cells.push(p);
        });
      });
    }
    var P = D.punten.filter(function (v) { return !v.i; }), I = D.punten.filter(function (v) { return v.i; });
    rings(I, 104, 202, 298, PI, 2 * PI);
    var th = PI, list = root.querySelector('.mp__onderwerpen');
    D.meta.onderwerpen.forEach(function (name, o) {
      var part = P.filter(function (v) { return v.r === name; }), t1 = th + PI * part.length / P.length;
      rings(part, 318, 438, 556, th, t1);
      if (o) mk('path', { d: wedge(312, 560, th - 0.004, th + 0.004), fill: '#1B2833', 'pointer-events': 'none' });
      var c = pt(624, (th + t1) / 2);
      mk('circle', { cx: c[0].toFixed(1), cy: c[1].toFixed(1), r: 19, fill: '#1B2833' });
      var tx = mk('text', { x: c[0].toFixed(1), y: (c[1] + 7).toFixed(1), 'text-anchor': 'middle', fill: '#fff', 'font-size': 20, 'font-weight': 700 });
      tx.textContent = String(o + 1);
      var li = document.createElement('li'); li.innerHTML = '<b></b><span></span>';
      li.children[0].textContent = String(o + 1); li.children[1].textContent = T.top[o] + ' (' + part.length + ')';
      list.appendChild(li);
      th = t1;
    });
    [[T.ring[0], 437], [T.ring[1], 200]].forEach(function (x) {
      [-1, 1].forEach(function (z) {
        var t = mk('text', { x: CX + z * x[1], y: CY + 34, 'text-anchor': 'middle', fill: '#4B5563', 'font-size': 20, 'font-weight': 600, 'letter-spacing': '2' });
        t.textContent = x[0].toUpperCase();
      });
    });

    /* Card on the trunk. */
    /* Tiers 2 and 3 open the same card only where the page carries the request block for it ([data-rest], NL);
       the card then names the group and the phase, never the data point itself. */
    var chosen = null, rest = kaart.querySelector('[data-rest]');
    function setText(id, s) { kaart.querySelector('[data-k="' + id + '"]').textContent = s; }
    function open(p) {
      var v = p._v, vast = v.l === 1;
      if (!vast && !rest) return;
      track('mp_card_open', vast ? v.c : 'tier' + v.l);
      if (chosen) chosen.classList.remove('mp__dp--gekozen');
      chosen = p; p.classList.add('mp__dp--gekozen');
      kaart.querySelector('[data-k="tekst"]').hidden = !vast; kaart.querySelector('dl').hidden = !vast;
      if (rest) { rest.hidden = vast; rest.querySelector('[aria-live]').textContent = ''; }
      kaart.classList.toggle('mp__kaart--verwacht', v.l === 2); kaart.classList.toggle('mp__kaart--vrij', v.l === 3);
      if (vast) {
        setText('oog', (v.i ? T.card.intOog : T.card.pasOog) + ' · ' + topicOf(v));
        setText('titel', v.t); setText('tekst', v.o);
        rows(v).forEach(function (r, i) { setText(['laag', 'grond', 'fase', 'stand', 'code'][i], r[1]); });
      } else {
        setText('oog', faseNaam(v.f));
        setText('titel', T.legend[v.l === 2 ? 'verwacht' : 'vrij']);
      }
      kaart.hidden = false;
      var br = boom.getBoundingClientRect(), s = br.width / 1300, m = pt(p._m[0], p._m[1]);
      var x = m[0] * s, y = m[1] * s, w = kaart.offsetWidth, h = kaart.offsetHeight;
      var left = x + 24 + w > br.width ? x - 24 - w : x + 24; left = Math.max(0, Math.min(left, br.width - w));
      kaart.style.left = left + 'px'; kaart.style.top = Math.max(0, Math.min(y - h / 2, br.height - h)) + 'px';
      kaart.querySelector('.mp__dicht').focus({ preventScroll: true });
    }
    function close() {
      if (kaart.hidden) return; kaart.hidden = true;
      if (chosen) { chosen.classList.remove('mp__dp--gekozen'); chosen.focus({ preventScroll: true }); chosen = null; }
    }
    cells.forEach(function (p) {
      p.addEventListener('click', function (e) { e.stopPropagation(); open(p); });
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); } });
    });
    kaart.querySelector('.mp__dicht').setAttribute('aria-label', T.card.close);
    kaart.querySelector('.mp__dicht').addEventListener('click', close);
    kaart.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    /* Colour and state per cell: tier 1 by law, opens its own card; tiers 2 and 3 open the request card where the
       page has one ([data-rest]) and are inert otherwise. */
    var n = {};
    cells.forEach(function (p) {
      var v = p._v, k = v.l === 1 ? v.b : v.l === 2 ? 'verwacht' : 'vrij';
      n[k] = (n[k] || 0) + 1;
      p.setAttribute('fill', COL[k]);
      if (v.l !== 1 && !rest) { p.classList.add('mp__dp--dicht'); p.setAttribute('aria-hidden', 'true'); return; }
      p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button');
      p.setAttribute('aria-label', v.l === 1 ? v.t : T.legend[k] + ', ' + faseNaam(v.f));
    });
    var leg = root.querySelector('.mp__legenda');
    ['eudr', 'reach', 'beide', 'verwacht', 'vrij'].forEach(function (k) {
      var li = el('li'); var sw = el('i'); sw.style.background = COL[k];
      li.appendChild(sw); li.appendChild(el('span', null, T.legend[k] + ' ')); li.appendChild(el('b', null, String(n[k] || 0)));
      leg.appendChild(li);
    });
  }

  /* Requests for the other data points (mailto in EN/PT, a copy button in NL), counted without any detail. */
  root.querySelectorAll('.mp__vraag').forEach(function (a) { a.addEventListener('click', function () { track('mp_request_click'); }); });

  /* Gate form: antibot and consent fields as on the DPP gate; the function mails the list of tier 1. */
  var form = gate && gate.querySelector('form');
  if (!form) return;
  function protect() {
    if (!window.Antibot) return;
    window.Antibot.protect(form);
    var captcha = form.querySelector('.antibot-captcha'), disc = form.querySelector('.dpp-gate__disclaimer');
    if (captcha && disc) form.insertBefore(captcha, disc);
  }
  /* antibot.js is a deferred script placed after this one, so it has not run yet; deferred scripts all run before DOMContentLoaded. */
  if (window.Antibot) protect(); else document.addEventListener('DOMContentLoaded', protect);
  function fail(msg, btn) {
    var e = document.createElement('p'); e.className = 'dpp-gate__error'; e.setAttribute('role', 'alert'); e.textContent = msg; form.appendChild(e);
    if (btn) { btn.disabled = false; btn.textContent = T.btn; }
  }
  function done() {
    var card = gate.querySelector('.dpp-gate__card'), p = el('p', 'dpp-gate__text mp__dank', T.thanks);
    p.setAttribute('role', 'status');
    card.innerHTML = ''; card.appendChild(p);
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var prior = form.querySelector('.dpp-gate__error'); if (prior) prior.remove();
    var btn = form.querySelector('.dpp-gate__btn');
    var email = form.querySelector('input[name="email"]').value;
    var nl = form.querySelector('input[name="newsletter_opt_in"]');
    var pp = form.querySelector('input[name="privacy_policy_accepted"]');
    if (pp && !pp.checked) { fail(T.pp); pp.focus(); return; }
    btn.disabled = true; btn.textContent = T.busy;
    track('mp_unlock_submit');
    function send(antibot) {
      var payload = {
        email: email, lang: L, page_url: window.location.href.split('#')[0].split('?')[0],
        newsletter_opt_in: nl ? nl.checked : false, privacy_policy_accepted: true, consent_version: '2026-04-24'
      };
      if (antibot) for (var k in antibot) if (antibot.hasOwnProperty(k)) payload[k] = antibot[k];
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) // Edge Function on uemspezaqxmkhenimwuf.supabase.co (ENDPOINT above)
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            if (!res.ok) throw new Error(T.codes[d.code] || T.err);
            track('mp_unlock_success');
            done();
          });
        }).catch(function (err) { fail(err instanceof TypeError || !err.message ? T.err : err.message, btn); /* TypeError: network failure, browser wording */ });
    }
    if (window.Antibot) window.Antibot.validate(form).then(send).catch(function (m) { fail(m, btn); });
    else send(null);
  });
})();

/* Copy buttons (closing card, data points request, request card on the trunk): copy the e-mail address to the clipboard. The texts live on
   the button (data-*), so each language file carries its own; without clipboard access the line just shows the address. */
(function () {
  document.querySelectorAll('[data-kopieer]').forEach(function (knop) {
    var regel = knop.closest('.lp-kaart__txt, .mp__laag, .mp__kaart-rest').querySelector('[aria-live]');
    knop.addEventListener('click', function () {
      var adres = knop.getAttribute('data-kopieer');
      var mis = function () { regel.textContent = knop.getAttribute('data-mis'); };
      if (!navigator.clipboard || !navigator.clipboard.writeText) { mis(); return; }
      navigator.clipboard.writeText(adres).then(function () { regel.textContent = knop.getAttribute('data-klaar'); }, mis);
    });
  });
})();

/* Closing card: the poster of the Stadstoel becomes the live 3D chair (3d/stoel.js) once the card comes near the
   viewport. three.js is fetched only then. With reduced motion or without WebGL2 the poster stays and nothing loads.
   The module URL and the label live on the element (data-*), so each language file carries its own. */
(function () {
  var vak = document.querySelector('[data-stoel3d]');
  if (!vak || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var io = new IntersectionObserver(function (ent) {
    if (!ent[0].isIntersecting) return;
    io.disconnect();
    try { if (!document.createElement('canvas').getContext('webgl2')) return; } catch (e) { return; }
    var host = document.createElement('div');
    host.className = 'lp-kaart__3d';
    host.setAttribute('aria-hidden', 'true');
    vak.insertBefore(host, vak.querySelector('span'));
    import(vak.getAttribute('data-stoel3d')).then(function (m) { return m.start(host); }).then(function () {
      host.removeAttribute('aria-hidden');
      host.setAttribute('role', 'img');
      host.setAttribute('aria-label', vak.getAttribute('data-label'));
      vak.querySelector('img').setAttribute('aria-hidden', 'true');
      vak.classList.add('is-3d');
    }).catch(function () { host.remove(); });
  }, { rootMargin: '300px 0px' });
  io.observe(vak);
})();
