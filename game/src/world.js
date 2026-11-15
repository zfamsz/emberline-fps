// Cinderworks: an original 40 x 30 m industrial yard. Two bombsites (A Foundry west,
// B Depot east), a mid lane, a long west lane, a connector, and cover from containers,
// crates and furnace walls. Every box is a collider and a bullet stop. Waypoints form
// the graph bots route along; sites are the plant zones.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: id, x, z, neighbours. Lanes: spawn -> yard -> mid/long -> connector -> sites.
const NODES = [
  [0, 0, 13, [1, 2, 3]], // 0 ember spawn (south yard)
  [1, 0, 8, [0, 4, 5, 6]],
  [2, -11, 9, [0, 5, 10]],
  [3, 11, 9, [0, 6, 12]],
  [4, 0, 3, [1, 7, 5, 6]], // mid
  [5, -7, 3, [1, 2, 4, 8, 10]],
  [6, 7, 3, [1, 3, 4, 9, 12]],
  [7, 0, -4, [4, 8, 9]], // connector
  [8, -9, -4, [5, 7, 11, 13]],
  [9, 9, -4, [6, 7, 12, 14]],
  [10, -16, 4, [2, 5, 11]], // long west
  [11, -15, -8, [8, 10, 15]], // A approach
  [12, 16, 4, [3, 6, 14]], // long east
  [13, -13, -6, [8, 15]],
  [14, 13, -6, [9, 16]],
  [15, -16, -11.5, [11, 13]], // site A Foundry
  [16, 16, -11.5, [12, 14]], // site B Depot
  [17, -6, -11, [11, 15]], // A hold
  [18, 6, -11, [12, 16]], // B hold
  [19, 0, -11, [17, 18, 7]], // north mid hold
];
NODES[11][3].push(17);
NODES[12][3].push(18);

export const SITES = {
  A: { name: 'Foundry', x: -16, z: -11.5, r: 3.4, node: 15 },
  B: { name: 'Depot', x: 16, z: -11.5, r: 3.4, node: 16 },
};
export const EMBER_SPAWNS = [[-4, 13], [-1.5, 13.5], [1.5, 13.5], [4, 13], [0, 11.5]];
export const ASH_SPAWNS = [[-16, -11], [-8, -12], [0, -12.5], [8, -12], [16, -11]];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.5 : 0.92,
      metalness: name === 'steel' ? 0.55 : 0.06,
    });
  }
  const colliders = [];
  const shootables = [];
  const probe = new THREE.Box3();

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const c = new THREE.Box3().setFromObject(mesh);
    if (collide) colliders.push(c);
    shootables.push(mesh);
    return mesh;
  }
  // Floor + perimeter (40 x 30, walls 5 m).
  box(40.6, 0.4, 30.6, 0, -0.2, 0, 'surface');
  box(0.4, 5, 30.6, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.6, 20.2, 2.5, 0, 'surface');
  box(40.6, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(40.6, 5, 0.4, 0, 2.5, 15.2, 'surface');
  // Furnace block at site A (Foundry) and depot racks at site B.
  box(4, 4.2, 2.2, -18.6, 2.1, -13.6, 'rust');
  box(2.4, 3.4, 1.6, -13.2, 1.7, -13.8, 'steel');
  box(4.4, 2.6, 1.8, 18.4, 1.3, -13.6, 'steel');
  box(2, 1.4, 2, 12.6, 0.7, -13.4, 'rust');
  // Mid divider walls: split mid into two peekable lanes with a gap at the connector.
  box(1, 2.6, 6, -3.4, 1.3, 0, 'surface');
  box(1, 2.6, 6, 3.4, 1.3, 0, 'surface');
  box(1.2, 2.2, 5, -3.4, 1.1, -8.5, 'hairline');
  box(1.2, 2.2, 5, 3.4, 1.1, -8.5, 'hairline');
  // Long-lane cover west/east.
  box(2.6, 1.3, 1.4, -16, 0.65, 2, 'rust');
  box(1.4, 1.3, 2.6, -16, 0.65, 8, 'hairline');
  box(2.6, 1.3, 1.4, 16, 0.65, 2, 'rust');
  box(1.4, 1.3, 2.6, 16, 0.65, 8, 'hairline');
  // Containers (tall cover) and crates (crouch cover) across the yard.
  box(3.2, 2.4, 1.6, -7, 1.2, 6.5, 'steel');
  box(3.2, 2.4, 1.6, 7, 1.2, 6.5, 'ember');
  box(1.4, 1.1, 1.4, -11, 0.55, -0.5, 'hairline');
  box(1.4, 1.1, 1.4, 11, 0.55, -0.5, 'hairline');
  box(1.4, 1.1, 1.4, -1.5, 0.55, -7, 'moss');
  box(1.4, 1.1, 1.4, 1.5, 0.55, -7, 'moss');
  box(2.2, 1.1, 1.2, -9, 0.55, -11, 'rust');
  box(2.2, 1.1, 1.2, 9, 0.55, -11, 'rust');
  box(1.2, 2.2, 1.2, -19, 1.1, 0, 'steel');
  box(1.2, 2.2, 1.2, 19, 1.1, 0, 'steel');
  // Site markers: flat ember plates on the floor (no collision).
  const markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.28 });
  for (const key of Object.keys(SITES)) {
    const s = SITES[key];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2, s.r * 2), markMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.x, 0.02, s.z);
    group.add(m);
  }
  // Chimney silhouettes outside the north wall for the skyline (no collision, above wall).
  box(2, 7, 2, -8, 6, -16.4, 'hairline', false);
  box(2, 9, 2, 6, 7, -16.4, 'hairline', false);
  // Lighting: low ember sun from the west, cool fill, warm point lights over the sites.
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.8));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a8'), 2.6);
  key.position.set(-14, 16, 6);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24; key.shadow.camera.right = 24;
  key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60; key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(10, 9, 12);
  scene.add(fill);
  for (const s of Object.values(SITES)) {
    const p = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 14, 1.8);
    p.position.set(s.x, 3.4, s.z);
    scene.add(p);
  }
  const emberGlow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 40, 18, 1.6);
  emberGlow.position.set(-18, 2.5, -13);
  scene.add(emberGlow);

  // Shared collision probe: a standing box of radius 0.34 against every collider.
  function collides(x, y, z, height, lift = 0.04) {
    probe.min.set(x - 0.34, y + lift, z - 0.34);
    probe.max.set(x + 0.34, y + height - lift, z + 0.34);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }
  // BFS route through the waypoint graph.
  function route(fromNode, toNode) {
    const prev = new Array(NODES.length).fill(-1);
    const queue = [fromNode];
    prev[fromNode] = fromNode;
    while (queue.length) {
      const n = queue.shift();
      if (n === toNode) break;
      for (const m of NODES[n][3]) if (prev[m] === -1) { prev[m] = n; queue.push(m); }
    }
    if (prev[toNode] === -1) return [toNode];
    const path = [];
    let n = toNode;
    while (n !== fromNode) { path.unshift(n); n = prev[n]; }
    return path;
  }
  function nearestNode(x, z) {
    let best = 0; let bd = Infinity;
    for (let i = 0; i < NODES.length; i++) {
      const dx = NODES[i][1] - x; const dz = NODES[i][2] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  return { colliders, shootables, group, collides, route, nearestNode, nodes: NODES, sites: SITES };
}
