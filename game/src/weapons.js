// Weapons: one definition per gun plus the HE grenade. Each entry owns damage, fire
// rate, magazine, reserve, recoil, spread and price; weapons.js also builds the
// first-person view model for the equipped gun. No external assets: boxes and colour.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  P9: { id: 'P9', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 3, fireGap: 0.16, mag: 12, reserve: 36, reload: 1.4, recoil: 0.011, spreadStill: 0.003, spreadMove: 0.02, auto: false, range: 28 },
  VK47: { id: 'VK47', name: 'VK-47 Rifle', price: 2700, damage: 34, headMult: 3, fireGap: 0.1, mag: 30, reserve: 90, reload: 2.0, recoil: 0.016, spreadStill: 0.0022, spreadMove: 0.03, auto: true, range: 55 },
  HORNET: { id: 'HORNET', name: 'Hornet-9 SMG', price: 1500, damage: 22, headMult: 3, fireGap: 0.075, mag: 28, reserve: 112, reload: 1.7, recoil: 0.009, spreadStill: 0.004, spreadMove: 0.024, auto: true, range: 30 },
  LONGBOW: { id: 'LONGBOW', name: 'Longbow Marksman', price: 4750, damage: 88, headMult: 3, fireGap: 1.1, mag: 5, reserve: 15, reload: 2.8, recoil: 0.05, spreadStill: 0.0006, spreadMove: 0.05, auto: false, range: 80 },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const BUY_LIST = ['P9', 'VK47', 'HORNET', 'LONGBOW'];

const SHAPES = {
  P9: { receiver: [0.07, 0.09, 0.22], barrel: [0.035, 0.035, 0.14], stock: [0.06, 0.1, 0.1], y: -0.19, z: -0.4 },
  VK47: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22], y: -0.2, z: -0.42 },
  HORNET: { receiver: [0.08, 0.1, 0.34], barrel: [0.04, 0.04, 0.22], stock: [0.07, 0.07, 0.16], y: -0.19, z: -0.4 },
  LONGBOW: { receiver: [0.08, 0.09, 0.5], barrel: [0.03, 0.03, 0.55], stock: [0.07, 0.09, 0.26], y: -0.2, z: -0.46 },
};

export function createWeaponRig(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });
  const model = new THREE.Group();
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  camera.add(flashLight);
  let def = WEAPONS.VK47;
  let parts = null;
  let baseZ = -0.42;

  function build(id) {
    def = WEAPONS[id];
    while (model.children.length) model.remove(model.children[0]);
    const s = SHAPES[id];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...s.receiver), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...s.barrel), grip);
    barrel.position.set(0, 0.025, -s.receiver[2] / 2 - s.barrel[2] / 2 + 0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...s.stock), grip);
    stock.position.set(0, -0.02, s.receiver[2] / 2 + s.stock[2] / 2 - 0.06);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), accent);
    sight.position.set(0, 0.07, -0.05);
    model.add(receiver, barrel, stock, sight);
    model.position.set(0.27, s.y, s.z - 0.08);
    baseZ = s.z - 0.08;
    flash.position.set(0.24, s.y + 0.02, s.z - s.receiver[2] / 2 - s.barrel[2] - 0.05);
    flashLight.position.set(0.24, s.y + 0.04, -0.6);
    parts = { receiver, barrel, stock };
  }
  build('VK47');
  const state = { weaponId: 'VK47', mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0 };
  return {
    state,
    def() { return def; },
    equip(id) {
      build(id);
      state.weaponId = id;
      state.mag = def.mag; state.reserve = def.reserve;
      state.cooldown = 0; state.reloadLeft = 0; state.flash = 0; state.kick = 0;
    },
    step(dt, moving) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      state.bloom += ((moving ? 1 : 0) - state.bloom) * Math.min(1, dt * 6);
      model.position.z = baseZ + state.kick;
      model.position.y += Math.sin(performance.now() * 0.004) * 0.0006;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const take = Math.min(def.mag - state.mag, state.reserve);
          state.mag += take; state.reserve -= take;
        }
      }
    },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() { state.cooldown = def.fireGap; state.flash = 0.06; state.kick = 0.055; },
    takeRound() { if (state.mag <= 0) return false; state.mag -= 1; return true; },
    reload() { if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false; state.reloadLeft = def.reload; return true; },
    spread(speed) {
      const move = Math.min(1, speed / 5.4);
      return def.spreadStill + move * def.spreadMove + state.bloom * 0.004;
    },
    refill() { state.mag = def.mag; state.reserve = def.reserve; state.cooldown = 0; state.reloadLeft = 0; },
  };
}
