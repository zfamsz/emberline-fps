// The bomb: Ember plants it on a site by holding E for 3 s, Ash defuses it by holding
// E for 5 s (bots do the same holds in bots.js). Once planted it beeps, faster as the
// 35 s timer runs down, then detonates. State lives here, in one place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;

export function createBomb(scene, G, hooks) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.4 }),
  );
  body.position.y = 0.11;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.position.set(0.1, 0.26, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);
  let beepTimer = 0;

  return {
    group,
    plant(siteKey, x, z) {
      G.bomb.planted = true;
      G.bomb.site = siteKey;
      G.bomb.x = x; G.bomb.z = z;
      G.bomb.timer = BOMB_TIMER;
      G.bomb.plantProgress = 0;
      group.position.set(x, 0, z);
      group.visible = true;
      beepTimer = 0;
      hooks.onPlant(siteKey);
    },
    step(dt) {
      if (!G.bomb.planted) return;
      G.bomb.timer -= dt;
      beepTimer -= dt;
      if (beepTimer <= 0) {
        hooks.onBeep(G.bomb.timer < 10);
        beepTimer = G.bomb.timer < 10 ? 0.5 : 1.0;
      }
      lamp.material.color.setHex(Math.floor(G.bomb.timer * 4) % 2 ? 0xff2a00 : 0xff7a1a);
      if (G.bomb.timer <= 0) hooks.onDetonate();
    },
    clear() {
      G.bomb.planted = false; G.bomb.site = null; G.bomb.timer = 0;
      G.bomb.plantProgress = 0; G.bomb.defuseProgress = 0;
      group.visible = false;
    },
  };
}
