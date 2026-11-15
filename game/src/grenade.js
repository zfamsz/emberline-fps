// HE grenade: a parabolic projectile that explodes 1.2 s after the throw or on first
// ground contact. Radius damage falls off with distance; a flash sphere + point light
// mark the blast. One shared mesh per live grenade, reused across rounds.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 1.2;
const RADIUS = 5.5;
const MAX_DAMAGE = 95;
const GRAVITY = 12;

export function createGrenades(scene, G, hooks) {
  const live = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.4 });
  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  const blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const tmp = new THREE.Vector3();

  function throwGrenade(origin, yaw, pitch, fromPlayer) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    scene.add(mesh);
    const vel = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.45, -Math.cos(yaw) * Math.cos(pitch),
    ).multiplyScalar(11);
    live.push({ mesh, pos: origin.clone(), vel, fuse: FUSE, fromPlayer });
    hooks.onThrow();
  }
  function explode(g) {
    scene.remove(g.mesh);
    const flash = new THREE.Mesh(blastGeo, blastMat.clone());
    flash.position.copy(g.pos);
    flash.scale.setScalar(0.3);
    scene.add(flash);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 120, 16, 1.6);
    light.position.copy(g.pos);
    scene.add(light);
    hooks.onExplode(g.pos);
    // Radius damage to bots and to the player.
    for (const b of G.bots.bots) {
      if (!b.alive) continue;
      const d = tmp.copy(b.group.position).setY(1).distanceTo(g.pos);
      if (d < RADIUS) {
        const dmg = MAX_DAMAGE * (1 - d / RADIUS);
        if (g.fromPlayer) hooks.onGrenadeHit(b, dmg);
        else G.bots.damage(b, dmg, null, false);
      }
    }
    const pd = tmp.copy(G.player.position).setY(G.player.position.y + 1).distanceTo(g.pos);
    if (pd < RADIUS) hooks.onDamagePlayer(MAX_DAMAGE * (1 - pd / RADIUS) * 0.8, null, false);
    let life = 0.35;
    const tick = () => {
      life -= 0.05;
      flash.scale.setScalar(0.3 + (0.35 - life) * 12);
      flash.material.opacity = Math.max(0, life / 0.35) * 0.85;
      light.intensity = Math.max(0, life / 0.35) * 120;
      if (life > 0) setTimeout(tick, 50);
      else { scene.remove(flash); scene.remove(light); flash.material.dispose(); }
    };
    tick();
  }
  function step(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y <= 0.1) { g.pos.y = 0.1; g.fuse = 0; }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) { live.splice(i, 1); explode(g); }
    }
  }
  function clear() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
  }
  return { throwGrenade, step, clear };
}
