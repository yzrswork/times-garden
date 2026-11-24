// 試作07: 生き物の視点。同じ場所に別の体で降りると別の世界に見えるかを確かめる。
// 本番の engine/ と viewer/plan.mjs、viewer/draw.mjs を読むだけで、書き換えない。
import * as THREE from 'three';
import { restore, fileName } from '../../engine/observations.mjs';
import { bestiary } from '../../engine/traits.mjs';
import { bodyPlan } from '../../viewer/plan.mjs';
import { creatureSVG } from '../../viewer/draw.mjs';
import { palette } from '../../viewer/palette.mjs';
import { buildBody, animateBody } from './body3d.mjs';

const BASE = new URL('../../', import.meta.url);
const get = async p => (await fetch(new URL(p, BASE))).json();
const STAR_LIGHT = { red: 0xff8a5c, yellow: 0xffe6a3, blue: 0xd8f2ff };

export async function init() {
  // 公開データから、図鑑と同じ世界を組み立てる
  const manifest = await get('data/manifest.json');
  const ledger = (await get('data/ledger.json')).issues;
  const [chunks, checkpoints] = await Promise.all([
    Promise.all(manifest.checkpoints.map(n => get('data/observations/' + fileName(n)))),
    Promise.all(manifest.checkpoints.map(n => get('data/checkpoints/' + fileName(n)))),
  ]);
  const { W } = restore({ manifest, ledger, chunks, checkpoints });
  const all = bestiary(W);
  // 判定の対象: 放射腕で触手を持つ系統（いなければ放射腕のいちばん複雑な系統）
  const subject = all.find(e => e.look.form === 'radial' && e.look.limb === 'tentacle')
    || all.find(e => e.look.form === 'radial') || all[0];
  const others = all.filter(e => e !== subject && e.cx >= 3).slice(0, 4);

  document.getElementById('name').textContent =
    `${subject.look.form === 'radial' ? '放射腕' : subject.look.form} の系統 #${subject.born} に分かれた`;
  document.getElementById('look').textContent = subject.text;
  document.getElementById('card').innerHTML = creatureSVG(subject, W, { size: 124 })
    + `<p>図鑑の絵（同じ設計図）</p>`;

  const P = palette(W.star);
  const host = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); // 画素密度は最大2（アートバイブル8）
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.bg);
  scene.fog = new THREE.FogExp2(new THREE.Color(P.bg), 0.075);

  // 光: 恒星の色が世界の色温度を決める
  const key = new THREE.DirectionalLight(STAR_LIGHT[W.star] ?? 0xffffff, 2.1);
  key.position.set(-4, 6, 3);
  scene.add(key, new THREE.HemisphereLight(STAR_LIGHT[W.star] ?? 0xffffff, new THREE.Color(P.ground), 0.75));

  // 地面
  const groundGeo = new THREE.PlaneGeometry(90, 90, 40, 40);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.26) * Math.cos(y * 0.21) * 0.5 + Math.sin(x * 0.07 + y * 0.09) * 1.1);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(P.ground), flatShading: true }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const groundAt = (x, z) => Math.sin(x * 0.26) * Math.cos(-z * 0.21) * 0.5 + Math.sin(x * 0.07 - z * 0.09) * 1.1;

  // 目の前に、同じ系統と別の系統を置く
  const bodies = [];
  const place = (entry, x, z, s) => {
    const g = buildBody(bodyPlan(entry, W));
    g.scale.multiplyScalar(s);
    g.position.set(x, groundAt(x, z) + 0.75 * s, z);
    g.rotation.y = Math.atan2(-x, -z);
    scene.add(g);
    bodies.push(g);
    return g;
  };
  place(subject, 0, -3.4, 1.25);
  place(subject, 2.6, -6.2, 1.0);
  others.forEach((e, i) => place(e, -3.4 + i * 2.6, -8.5 - i * 1.6, 0.9));

  // 目のない種の見え方: 走査した点群が浮かんで消え、音の波紋が輪郭を一瞬照らす
  const cloud = buildPointCloud(scene, bodies, ground);
  scene.add(cloud.points);

  // 生き物の目の高さに降りる
  const eyeH = 0.52;
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  const look = { yaw: 0, pitch: -0.04 };
  let mode = 'lens', orbit = 0;

  const setMode = m => {
    mode = m;
    for (const id of ['lens', 'none', 'orbit'])
      document.getElementById('m-' + id).setAttribute('aria-pressed', String(mode === id));
    const eyeless = m === 'none';
    cloud.points.visible = eyeless;
    scene.fog.density = eyeless ? 0.1 : 0.075;
    for (const b of bodies) b.visible = !eyeless;
    ground.visible = !eyeless;
    scene.background = new THREE.Color(eyeless ? '#05080c' : P.bg);
  };
  for (const id of ['lens', 'none', 'orbit']) document.getElementById('m-' + id).onclick = () => setMode(id);
  setMode('lens');

  // ドラッグで見回す
  let drag = null;
  host.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ...look }; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointermove', e => {
    if (!drag) return;
    look.yaw = drag.yaw - (e.clientX - drag.x) * 0.005;
    look.pitch = Math.max(-0.7, Math.min(0.5, drag.pitch - (e.clientY - drag.y) * 0.004));
  });
  host.addEventListener('pointerup', () => { drag = null; });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  let last = performance.now(), slow = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, 0.25); last = now; // dt の上限（調査ログ）
    const t = now / 1000;
    for (const b of bodies) animateBody(b, t + b.position.x);
    if (mode === 'orbit') { // 姿を見る: 1体をゆっくり回して、カードの絵と見比べる
      orbit += dt * 0.5;
      const r = 2.4;
      camera.position.set(Math.sin(orbit) * r, bodies[0].position.y + 0.35, -3.4 + Math.cos(orbit) * r);
      camera.lookAt(bodies[0].position);
    } else {
      camera.position.set(0, groundAt(0, 0) + eyeH, 0.8);
      camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    }
    if (mode === 'none') cloud.update(t);
    renderer.render(scene, camera);
    // フレームが重い状態が続いたら描画倍率を下げる（調査ログの施策）
    if (dt > 0.02) { if (++slow > 120) { slow = 0; renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() - 0.25)); } } else slow = 0;
  });
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : renderer.getAnimationLoop?.() ?? null), { once: false });
  return { scene, camera, renderer, setMode, subject };
}

/* ---------- 目のない種の見え方 ---------- */
// 走査（赤外線）が通った点が光って消え、音の波紋が通った点が一瞬だけ強く光る。
function buildPointCloud(scene, bodies, ground) {
  const pts = [];
  const push = (mesh, step) => {
    mesh.updateWorldMatrix(true, false);
    const p = mesh.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      pts.push(v.x, v.y, v.z);
    }
  };
  for (const b of bodies) b.traverse(o => { if (o.isMesh) push(o, 1); });
  push(ground, 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const uni = {
    uScan: { value: 0 }, uRipple: { value: 99 }, uRippleMax: { value: 26 },
    uOrigin: { value: new THREE.Vector3(0, 0.5, 0.8) }, uSize: { value: 3.2 * Math.min(devicePixelRatio || 1, 2) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uScan, uRipple, uRippleMax, uSize;
      uniform vec3 uOrigin;
      varying float vB;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 d = wp.xyz - uOrigin;
        float az = atan(d.z, d.x);
        float behind = mod(uScan - az + 12.56637, 6.28319);   // 走査が通ってからの角度
        float scan = exp(-behind * 0.85);                      // 通った直後が明るく、尾を引いて消える
        float dist = length(d);
        float fade = exp(-dist * 0.07);                        // 遠いほど届かない
        float ring = exp(-abs(dist - uRipple) * 3.2) * max(0.0, 1.0 - uRipple / uRippleMax);
        vB = clamp((scan * 0.8 + ring * 1.8) * fade, 0.0, 1.0);
        vec4 mv = viewMatrix * wp;
        gl_PointSize = uSize * (1.0 + vB) * (14.0 / max(0.4, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vB;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.06, length(q)) * vB;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(vec3(0.35,0.75,0.95), vec3(1.0), vB * 0.7), a);
      }`,
  });
  let ripple = 99;
  return {
    points: new THREE.Points(geo, mat),
    count: pts.length / 3,
    update(t) {
      uni.uScan.value = (t * 2.4) % (Math.PI * 2);
      ripple = ripple > uni.uRippleMax.value ? 0 : ripple + 0.28; // 波紋がときどき広がる
      uni.uRipple.value = ripple;
    },
  };
}
