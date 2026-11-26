// De Stadstoel in 3D voor de kaart onderaan de blog (lab-3d, ronde 2, c29). Alles lokaal: three.js r170 (MIT) staat
// naast dit bestand, het hout in tex/ (uitgesneden uit de werkbankfoto van de pilot). Paden lopen via import.meta.url,
// dus ze kloppen op elke pagina waar build.ts de kaart neerzet. Geladen door meubelpaspoort.js, pas als de kaart in
// beeld komt; zonder WebGL of met minder beweging blijft de poster staan en wordt dit bestand nooit opgehaald.
//
// Maten van de Stadstoel: geschat uit de foto's van de pilot (er is geen werktekening of STEP van de stoel).
// Elk paneel is één stuk geometrie met één textuur waarin de strook teak is getekend, dus er flikkert niets door.
import * as THREE from './three.module.js';

export async function start(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  // Zacht licht: een kleine kamer als omgeving (geen HDR-bestand nodig), plus één zachte zon voor de schaduw.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const kamer = new THREE.Scene();
  kamer.add(new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0xeee6da, side: THREE.BackSide })));
  for (const [x, y, z, w, h, k] of [[0, 3.9, 0, 6, 6, 3.2], [5.9, 1.5, 2, 4, 3, 1.6], [-5.9, 1.2, -1, 3, 2.5, 0.8]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff8ee).multiplyScalar(k), side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.lookAt(0, 0, 0); kamer.add(p);
  }
  scene.environment = pmrem.fromScene(kamer, 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const zon = new THREE.DirectionalLight(0xfff4e6, 1.6);
  zon.position.set(1.4, 2.8, 1.6);
  zon.castShadow = true;
  zon.shadow.mapSize.set(1024, 1024);
  Object.assign(zon.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 8 });
  zon.shadow.radius = 9;
  zon.shadow.blurSamples = 16;
  zon.shadow.bias = -0.0004;
  scene.add(zon);

  const vloer = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.12 }));
  vloer.rotation.x = -Math.PI / 2;
  vloer.receiveShadow = true;
  scene.add(vloer);

  // Een zachte contactschaduw recht onder het meubel, zodat het niet zweeft.
  const blobDoek = document.createElement('canvas'); blobDoek.width = blobDoek.height = 128;
  { const c = blobDoek.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(60,40,20,0.30)'); g.addColorStop(0.55, 'rgba(60,40,20,0.12)'); g.addColorStop(1, 'rgba(60,40,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobDoek), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.0005;
  scene.add(blob);

  // --- Hout --------------------------------------------------------------------------------------------------------
  // De textuurbestanden zijn 256 x 1024 px, nerf in de lengte. In eik en licht zit tussen kolom 96 en 132 een wig van
  // de teakstrook uit de werkbankfoto: die kolommen worden nooit gebruikt.
  const SCHOON = { eik: [[0, 94], [134, 256]], licht: [[0, 94], [134, 256]], teak: [[0, 256]] };
  const TINT = { eik: '#f2c48c', licht: '#f2d6a2', teak: '#e9b49a' };
  const PX = 12;               // pixels per cm in een paneeltextuur
  const BRON = 1.1;            // bronpixels -> doekpixels (1 cm hout = ~13 px)
  const beelden = {};
  await Promise.all(Object.keys(SCHOON).map(async n => {
    beelden[n] = await new THREE.ImageLoader().loadAsync(new URL(`tex/${n}.webp`, import.meta.url).href);
  }));

  let zaad = 7;
  const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;

  // Teken hout in een kolom [x0,x1) van het doek: planken naast elkaar, elk met een ander stuk bron en een lijmnaad.
  function hout(c, soort, x0, x1, h) {
    let x = x0;
    while (x < x1 - 0.5) {
      const [s0, s1] = SCHOON[soort][Math.floor(rnd() * SCHOON[soort].length)];
      const bw = s1 - s0, dw = Math.min(bw * BRON, x1 - x);
      const flip = rnd() < 0.5;
      for (let y = 0, k = 0; y < h; y += 1024 * BRON, k++) {
        c.save();
        c.translate(x, y);
        if ((k % 2 === 1) !== flip) { c.translate(0, 1024 * BRON); c.scale(1, -1); }
        c.drawImage(beelden[soort], s0, 0, dw / BRON, 1024, 0, 0, dw, 1024 * BRON);
        c.restore();
      }
      x += dw;
      if (soort !== 'teak' && x < x1 - 1) { c.fillStyle = 'rgba(90,60,30,0.18)'; c.fillRect(x - 0.5, 0, 1, h); }
    }
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = TINT[soort]; c.fillRect(x0, 0, x1 - x0, h); c.restore();
  }

  // Een doek van `dwars` x `lang` cm; stroken = [[van, tot, soort], ...] in cm dwars, de rest is `basis`.
  function doek(dwars, lang, basis, stroken = []) {
    const w = Math.min(2048, Math.round(dwars * PX)), h = Math.min(2048, Math.round(lang * PX));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const sx = w / dwars;
    let a = 0;
    for (const [van, tot, soort] of [...stroken].sort((p, r) => p[0] - r[0])) {
      if (van > a) hout(c, basis, Math.round(a * sx), Math.round(van * sx), h);
      hout(c, soort, Math.round(van * sx), Math.round(tot * sx), h);
      c.fillStyle = 'rgba(60,30,15,0.35)'; c.fillRect(Math.round(van * sx) - 0.5, 0, 1, h); c.fillRect(Math.round(tot * sx) - 0.5, 0, 1, h);
      a = tot;
    }
    if (a < dwars) hout(c, basis, Math.round(a * sx), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  function materiaal(tex) {
    const bump = tex.clone(); bump.colorSpace = THREE.NoColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: bump, bumpScale: 0.6, roughness: 0.58, metalness: 0,
      clearcoat: 0.12, clearcoatRoughness: 0.55 });
  }

  // UV's uit de begrenzing van de geometrie: u dwars, v langs de nerf. Zo valt elke strook op precies één plek.
  const AS = { x: 0, y: 1, z: 2 };
  function uv(geo, dwars, lang) {
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox, mn = min.toArray(), mx = max.toArray();
    const pos = geo.attributes.position, d = AS[dwars], l = AS[lang];
    const arr = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      arr[2 * i] = (p[d] - mn[d]) / (mx[d] - mn[d]);
      arr[2 * i + 1] = (p[l] - mn[l]) / (mx[l] - mn[l]);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
    return { dwars: mx[d] - mn[d], lang: mx[l] - mn[l], min: mn };
  }

  // Een blok in cm (sx, sy, sz) met afgeronde randen (straal r), gecentreerd.
  function blokGeo(sx, sy, sz, r = 0.3) {
    const s = new THREE.Shape();
    s.moveTo(-sx / 2 + r, -sy / 2 + r); s.lineTo(sx / 2 - r, -sy / 2 + r); s.lineTo(sx / 2 - r, sy / 2 - r); s.lineTo(-sx / 2 + r, sy / 2 - r);
    const g = new THREE.ExtrudeGeometry(s, { depth: sz - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -(sz - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  }

  const meubel = new THREE.Group();
  meubel.scale.setScalar(0.01);           // maten in cm, scène in m
  const draaier = new THREE.Group();
  draaier.add(meubel);
  scene.add(draaier);

  function voeg(geo, mat, x = 0, y = 0, z = 0, rx = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    m.castShadow = m.receiveShadow = true;
    meubel.add(m);
    return m;
  }

  // Een gelamineerd paneel: eik met stroken teak, één geometrie, één textuur.
  function paneel(sx, sy, sz, dwars, lang, stroken, basis = 'eik') {
    const g = blokGeo(sx, sy, sz);
    const m = uv(g, dwars, lang);
    return [g, materiaal(doek(m.dwars, m.lang, basis, stroken.map(([a, b, s]) => [a - m.min[AS[dwars]], b - m.min[AS[dwars]], s])))];
  }

  // De Stadstoel. Assen: x breedte, y hoogte, z diepte (voorkant +z).
  // Zijstuk (essen, licht): een korte staande poot voor, een flauw gebogen schommelonderkant die naar achteren oploopt
  // naar een hoge punt, en achter de zitting een schuin oplopende bovenkant met een kap van teak.
  const zij = new THREE.Shape();
  zij.moveTo(17, 0.4);
  zij.lineTo(17, 16);
  zij.lineTo(-19, 16);
  zij.lineTo(-40, 26);
  zij.lineTo(-40, 22.5);
  zij.quadraticCurveTo(-14, -1, 17, 0.4);
  const D = 2.8, r = 0.3;
  const zijGeo = new THREE.ExtrudeGeometry(zij, { depth: D - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 40 });
  zijGeo.translate(0, 0, -(D - 2 * r) / 2);
  zijGeo.rotateY(-Math.PI / 2);          // vorm-x wordt diepte (z), extrusie wordt breedte (x)
  zijGeo.computeVertexNormals();
  const zm = uv(zijGeo, 'y', 'z');
  const zijMat = materiaal(doek(zm.dwars, zm.lang, 'licht'));
  const X = 20.5;                         // hart van de zijstukken
  for (const s of [-1, 1]) voeg(zijGeo, zijMat, s * X);

  // Kap van teak op de schuine achterkant van elk zijstuk, iets smaller dan het zijstuk (geen gedeelde vlakken).
  const kap = new THREE.Shape();
  const helling = 10 / 21, yTop = zz => 16 + (-19 - zz) * helling;
  kap.moveTo(-23.5, yTop(-23.5) - 0.2); kap.lineTo(-40, 26 - 0.2); kap.lineTo(-40, 27.6); kap.lineTo(-23.5, yTop(-23.5) + 1.6);
  const kapGeo = new THREE.ExtrudeGeometry(kap, { depth: 2.2 - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3 });
  kapGeo.translate(0, 0, -(2.2 - 2 * r) / 2);
  kapGeo.rotateY(-Math.PI / 2);
  kapGeo.computeVertexNormals();
  const km = uv(kapGeo, 'y', 'z');
  const kapMat = materiaal(doek(km.dwars, km.lang, 'teak'));
  for (const s of [-1, 1]) voeg(kapGeo, kapMat, s * X);

  // Rubberen plaatjes tussen zijstuk en zitting (zwart, zoals op de foto's).
  const rub = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.8 });
  for (const s of [-1, 1]) for (const z of [14.5, -15]) voeg(blokGeo(3.2, 0.6, 3, 0.1), rub, s * X, 16.6, z);

  // Zitting: eiken paneel met één strook teak dwars over de breedte, iets achter het midden. Nerf in de breedte.
  const [zg, zmat] = paneel(47, 2.2, 38, 'z', 'x', [[-7.2, -0.2, 'teak']]);
  voeg(zg, zmat, 0, 18.0, 0.5);

  // Rug: één lang eiken paneel met de strook teak in het midden. Het loopt achter de zitting door naar beneden en zit
  // met zijn randen ingelaten in de zijstukken (rand op het hart van het zijstuk), tot net boven de schommel.
  const L = 86, TILT = THREE.MathUtils.degToRad(24);
  const [rg, rmat] = paneel(41, L, 2.2, 'x', 'y', [[-3.75, 3.75, 'teak']]);
  const voet = new THREE.Vector3(0, 10, -17.6);
  voeg(rg, rmat, 0, voet.y + (L / 2) * Math.cos(TILT), voet.z - (L / 2) * Math.sin(TILT), -TILT);

  // Op de vloer zetten en centreren rond de draaias.
  meubel.updateMatrixWorld(true);
  const doos = new THREE.Box3().setFromObject(meubel, true);
  const midden = doos.getCenter(new THREE.Vector3());
  meubel.position.set(-midden.x, -doos.min.y, -midden.z);
  draaier.updateMatrixWorld(true);
  const grootte = new THREE.Box3().setFromObject(draaier, true).getSize(new THREE.Vector3());
  const straal = Math.hypot(grootte.x, grootte.z) / 2;
  blob.scale.set(straal * 1.7, straal * 1.7, 1);

  // Punten van het meubel (elk 7e hoekpunt) om het kader in elke draaistand te laten passen.
  const punten = [];
  meubel.traverse(o => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 7) punten.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  const hoogte = grootte.y;

  function past(afstand, elev, doelY, rand) {
    camera.position.set(0, doelY + afstand * elev, afstand);
    camera.lookAt(0, doelY, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const v = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
      const m = new THREE.Matrix4().makeRotationY(k * Math.PI / 12);
      for (const p of punten) { v.copy(p).applyMatrix4(m).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    }
    return { y0, y1, ok: x0 > -rand[0] && x1 < rand[0] && y0 > -rand[1] && y1 < rand[1] };
  }
  function kader(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const rand = [0.86, 0.84], elev = 0.3;
    let doelY = hoogte * 0.45, afstand = 1;
    for (let ronde = 0; ronde < 3; ronde++) {
      let lo = 0.5, hi = 12;
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (past(mid, elev, doelY, rand).ok) hi = mid; else lo = mid; }
      afstand = hi;
      // verticaal centreren: schuif het richtpunt tot boven- en onderrand even ver van het midden liggen
      const q = past(afstand, elev, doelY, rand);
      doelY += ((q.y1 + q.y0) / 2) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * afstand;
    }
    past(afstand, elev, doelY, rand);
  }

  // --- Beweging ----------------------------------------------------------------------------------------------------
  // Constante, langzame draai. Na slepen loopt de snelheid zacht terug naar de draai (geen schok).
  const SNEL = 0.3;            // rad/s, een omwenteling in ~21 s
  let draai = -0.6, snel = 0, sleep = false, vorigeX = 0, rustTot = 0, zichtbaar = true, loopt = false;
  const doek3d = renderer.domElement;
  doek3d.addEventListener('pointerdown', e => { sleep = true; vorigeX = e.clientX; doek3d.setPointerCapture(e.pointerId); });
  doek3d.addEventListener('pointermove', e => {
    if (!sleep) return;
    const dx = e.clientX - vorigeX; vorigeX = e.clientX;
    draai += dx * 0.01; snel = dx * 0.6; rustTot = performance.now() + 1500;
  });
  const los = () => { sleep = false; };
  doek3d.addEventListener('pointerup', los);
  doek3d.addEventListener('pointercancel', los);

  const klok = new THREE.Clock();
  function frame() {
    if (!zichtbaar || document.hidden) { loopt = false; return; }
    const dt = Math.min(klok.getDelta(), 0.05);
    if (!sleep) {
      const doelSnel = performance.now() > rustTot ? SNEL : 0;
      snel += (doelSnel - snel) * (1 - Math.exp(-dt * 1.6));
      draai += snel * dt;
    }
    draaier.rotation.y = draai;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function verder() { if (loopt || !zichtbaar || document.hidden) return; loopt = true; klok.getDelta(); requestAnimationFrame(frame); }

  host.appendChild(doek3d);
  new ResizeObserver(() => { kader(host.clientWidth || 400, host.clientHeight || 300); if (!loopt) renderer.render(scene, camera); }).observe(host);
  kader(host.clientWidth || 400, host.clientHeight || 300);
  draaier.rotation.y = draai;
  renderer.render(scene, camera);

  // Niet tekenen buiten beeld of in een verborgen tab: scheelt stroom en houdt de pagina licht.
  new IntersectionObserver(([e]) => { zichtbaar = e.isIntersecting; verder(); }).observe(host);
  document.addEventListener('visibilitychange', verder);
  verder();
}
