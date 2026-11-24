// 体の設計図（本番の viewer/plan.mjs）を three.js のメッシュにする。
// 形質の解釈はしない。設計図が決めた数値を立体に置き換えるだけ。SVG 版（viewer/draw.mjs）と
// 同じ設計図を読むので、カードの姿と3Dの姿が同じ系統になる。
//
// 設計図は 120 四方の平面（y は下向き）。3D では中心を原点、y を上向きにして、
// 奥行きは設計図の縦横から決める（設計図に奥行きは持たせず、ここで一度だけ決める）。
import * as THREE from 'three';
import { VB, C0 } from '../../viewer/plan.mjs';

const S = 1 / 36;                       // 設計図の長さ → 3D の長さ
const px = x => (x - C0) * S;           // 設計図の x → 3D の x
const py = y => -(y - C0) * S;          // 設計図の y → 3D の y（上下が逆）
const depthOf = (rx, ry) => (rx + ry) / 2 * 0.9; // 奥行きは縦横の平均より少し細く

// ローポリでマットに（Muse の助言: 濡れた質感や写実的な肉感に寄せると「キモいだけ」になる）
function skin(color, { flat = false, alpha = 1 } = {}) {
  return new THREE.MeshLambertMaterial({
    color, flatShading: flat, transparent: alpha < 1, opacity: alpha,
    side: alpha < 1 ? THREE.DoubleSide : THREE.FrontSide,
  });
}

const hsl = c => new THREE.Color().setHSL(((c.h % 360) + 360) / 360, c.s / 100, c.l / 100);

/* ---------- 設計図の部品ごとの立体 ---------- */

function ellipsoidMesh(s, mat) {
  const r = depthOf(s.rx, s.ry);
  const g = new THREE.SphereGeometry(1, 20, 14);
  g.scale(s.rx * S, s.ry * S, r * S);
  const m = new THREE.Mesh(g, mat);
  m.position.set(px(s.cx), py(s.cy), 0);
  return m;
}

// 放射腕と胞子の棘。根元の幅と先端までの向きを設計図から取り、先細りの円錐にする。
function spikeMesh(s, mat) {
  const b = new THREE.Vector3(px(s.base[0]), py(s.base[1]), 0);
  const e = new THREE.Vector3(px(s.end[0]), py(s.end[1]), 0);
  const t = new THREE.Vector3(px(s.tip[0]), py(s.tip[1]), 0);
  const root = b.clone().add(e).multiplyScalar(0.5);
  const halfW = b.distanceTo(e) / 2;
  const dir = t.clone().sub(root);
  const len = dir.length();
  if (len < 1e-4 || halfW < 1e-4) return null;
  const g = new THREE.CylinderGeometry(halfW * 0.08, halfW, len, 10, 1, false);
  g.translate(0, len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(root);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// やわらかい塊（不定形）。閉じた輪郭を押し出して角を丸める。
function loopMesh(s, mat) {
  const shape = new THREE.Shape();
  s.pts.forEach(([x, y], i) => i ? shape.lineTo(px(x), py(y)) : shape.moveTo(px(x), py(y)));
  shape.closePath();
  const d = 0.5;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: true, bevelThickness: d * 0.9, bevelSize: d * 0.5, bevelSegments: 6, curveSegments: 16,
  });
  g.translate(0, 0, -d / 2);
  return new THREE.Mesh(g, mat);
}

// 傘型。縁の点から半径を取り、半球をつぶして作る。
function domeMesh(s, mat) {
  const xs = s.pts.map(p => px(p[0])), ys = s.pts.map(p => py(p[1]));
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = Math.max(...ys) - Math.min(...ys);
  const g = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(rx, ry * 1.4, rx);
  const m = new THREE.Mesh(g, mat);
  m.position.set((Math.max(...xs) + Math.min(...xs)) / 2, Math.min(...ys), 0);
  return m;
}

// 触手と脚。設計図の点の列に沿った管を作り、先へ行くほど細くする。
function strandMesh(s, mat) {
  const pts = s.pts.map(([x, y], i) => new THREE.Vector3(px(x), py(y), Math.sin(i * 1.1) * 0.06));
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts);
  const TUB = 18, RAD = 7, r0 = s.w0 * S / 2;
  const g = new THREE.TubeGeometry(curve, TUB, r0, RAD, false);
  // 先へ行くほど細く（TubeGeometry は太さが一定なので、頂点を中心へ寄せる）
  const pos = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / (RAD + 1)), t = seg / TUB;
    curve.getPoint(t, c);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(s.w1 / s.w0 + (1 - s.w1 / s.w0) * (1 - t)).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// 透ける膜（ひれ、翼）。
function membraneMesh(s, mat) {
  const shape = new THREE.Shape();
  shape.moveTo(px(s.base[0]), py(s.base[1]));
  shape.quadraticCurveTo(px(s.ctrl1[0]), py(s.ctrl1[1]), px(s.far[0]), py(s.far[1]));
  shape.quadraticCurveTo(px(s.ctrl2[0]), py(s.ctrl2[1]), px(s.end[0]), py(s.end[1]));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -0.02);
  return new THREE.Mesh(g, mat);
}

const partMesh = (s, mat) => s.type === 'ellipsoid' ? ellipsoidMesh(s, mat)
  : s.type === 'spike' ? spikeMesh(s, mat)
  : s.type === 'loop' ? loopMesh(s, mat)
  : s.type === 'dome' ? domeMesh(s, mat)
  : s.type === 'membrane' ? membraneMesh(s, mat)
  : s.type === 'strand' ? strandMesh(s, mat) : null;

/* ---------- 1体ぶん ---------- */

// plan は viewer/plan.mjs の bodyPlan()。戻り値の group.userData.parts に、
// 動かすための参照（触手と目）を入れる。
export function buildBody(plan) {
  const c = plan.color;
  const body = skin(hsl(c), { flat: true });
  const back = skin(hsl({ ...c, l: Math.max(6, c.l - 22) }), { flat: true });
  const film = skin(hsl({ ...c, l: Math.min(92, c.l + 10) }), { alpha: 0.55 });
  const group = new THREE.Group();
  const strands = [];

  for (const s of plan.back) { const m = partMesh(s, back); if (m) group.add(m); }
  for (const s of plan.body) { const m = partMesh(s, body); if (m) group.add(m); }
  for (const s of plan.limbs) {
    const m = partMesh(s, s.type === 'membrane' ? film : (s.layer === 'back' ? back : body));
    if (!m) continue;
    group.add(m);
    if (s.type === 'strand') strands.push({ mesh: m, spec: s });
  }

  // 目: 白目、瞳、ハイライト。設計図の位置から前へ押し出す。
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f1e8 });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x141019 });
  // 目は体のいちばん大きな塊の表面に置く（前へ出しただけだと横から見たときに浮く）
  const host = plan.body.filter(s => s.type === 'ellipsoid')
    .sort((a, b) => b.rx * b.ry - a.rx * a.ry)[0];
  const eyes = [];
  for (const e of plan.eyes) {
    const r = e.r * S;
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), white);
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.46, 12, 10), pupil);
    p.position.z = r * 0.74;
    g.add(w, p);
    let z = depthOf(plan.w, plan.h) * S * 0.5;
    if (host) { // 楕円体の式から、その位置での表面の奥行きを出す
      const dx = (e.x - host.cx) / host.rx, dy = (e.y - host.cy) / host.ry;
      const k = Math.max(0, 1 - dx * dx - dy * dy);
      z = depthOf(host.rx, host.ry) * S * Math.sqrt(k) * 0.94;
    }
    g.position.set(px(e.x), py(e.y), z);
    group.add(g);
    eyes.push({ group: g, pupil: p, kind: e.kind, r });
  }

  group.userData = { plan, strands, eyes };
  return group;
}

// 呼吸と、触手の遅れた揺れ（アートバイブル3「関節ごとに遅れて揺れる付属器」）。
export function animateBody(group, t) {
  const { strands, eyes } = group.userData;
  const breathe = 1 + Math.sin(t * 1.4) * 0.025;
  group.scale.set(breathe, 2 - breathe, breathe);
  strands.forEach((s, i) => { s.mesh.rotation.z = Math.sin(t * 1.1 + i * 0.7) * 0.09; });
  eyes.forEach((e, i) => { e.pupil.position.x = Math.sin(t * 0.6 + i) * e.r * 0.12; });
}
