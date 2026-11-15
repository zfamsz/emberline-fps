// Combat: the one hitscan path for every shooter. A ray from the muzzle eye hits the
// world first; a bot torso box or head sphere in front of it takes damage instead.
// Headshots deal 3x, damage falls off past the weapon's range. Reused Vector3s only:
// no allocation in the hot loop.
import * as THREE from 'three';

export function createCombat(scene, world) {
  const raycaster = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  raycaster.far = 90;

  // origin: Vector3 eye, yaw/pitch aim, spread: radians, def: weapon def, opts: {team, bots, player, rng, onHit}
  // Returns {kind: 'bot'|'world'|'none', bot, part, damage} or null when no round fired.
  function fire(origin, yaw, pitch, spread, def, opts) {
    dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    dir.x += (opts.rng() * 2 - 1) * spread;
    dir.y += (opts.rng() * 2 - 1) * spread;
    dir.z += (opts.rng() * 2 - 1) * spread;
    dir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(origin, dir);
    const meshes = [];
    for (const b of opts.bots) {
      if (!b.alive || b.team === opts.team) continue;
      meshes.push(b.torso, b.head);
    }
    const hits = raycaster.intersectObjects(world.shootables.concat(meshes), false);
    const hit = hits[0];
    if (!hit) return { kind: 'none' };
    const bot = hit.object.userData.bot;
    if (!bot) return { kind: 'world', point: hit.point };
    const dist = hit.distance;
    const falloff = dist <= def.range ? 1 : Math.max(0.4, 1 - (dist - def.range) / def.range);
    const part = hit.object.userData.part;
    const damage = def.damage * falloff * (part === 'head' ? def.headMult : 1);
    return { kind: 'bot', bot, part, damage, point: hit.point, dist };
  }

  // Line of sight between two eye points: true when no world mesh blocks the ray.
  function hasLOS(a, b) {
    tmp.copy(b).sub(a);
    const dist = tmp.length();
    if (dist < 0.01) return true;
    tmp.normalize();
    raycaster.set(a, tmp);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    raycaster.far = 90;
    return hits.length === 0;
  }
  return { fire, hasLOS };
}
