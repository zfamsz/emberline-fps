// EMBERLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. All state lives in G; modules own one job each. ?shot=start|play|end|buy
// with &seed=N sets up a deterministic frame, renders it twice, freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createGrenades } from './grenade.js';
import { createBomb } from './bomb.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const combat = createCombat(scene, world);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world);
const weapon = createWeaponRig(camera);
const input = createInput(renderer.domElement, onLockChange);

const G = {
  time: 0, rng: mulberry32(seed),
  player: player.state, playerSpeed: 0,
  money: 800, grenadesOwned: 0,
  score: { ember: 0, ash: 0 },
  round: { number: 0, phase: 'buy', timer: BUY_SECONDS, kills: 0, endReason: '' },
  bomb: { planted: false, site: null, x: 0, z: 0, timer: 0, plantProgress: 0, defuseProgress: 0 },
  lastShot: null,
  bots: null, weapon, grenades: null,
};
const YOU = { name: 'You', isPlayer: true };
const feed = [];
function pushFeed(text) {
  feed.unshift(text);
  if (feed.length > 5) feed.pop();
  hud.feed(feed);
}
let lastDistant = -1;

const bots = createBots(scene, world, combat, G, {
  onKill(killer, victim, headshot) {
    const kName = killer ? (killer.isPlayer ? 'You' : killer.name) : 'Blast';
    pushFeed(`${kName} ${headshot ? '⌖' : '▸'} ${victim.name}`);
    if (killer && killer.isPlayer) {
      G.money += 300; G.round.kills += 1;
      hud.setMoney(G.money);
      audio.kill();
    }
    if (victim.carrier) {
      victim.carrier = false;
      const next = bots.bots.find((b) => b.alive && b.team === 'ember');
      if (next) next.carrier = true;
    }
  },
  onDamagePlayer(dmg, fromBot, head) {
    if (G.player.health <= 0) return;
    let d = dmg;
    if (G.player.armor > 0) { const ab = Math.min(G.player.armor, d * 0.5); G.player.armor -= ab; d -= ab; }
    G.player.health -= d;
    const dmgEl = document.getElementById('dmg');
    dmgEl.style.opacity = '0.55';
    setTimeout(() => { dmgEl.style.opacity = '0'; }, 180);
    if (G.player.health <= 0) {
      G.player.health = 0;
      pushFeed(`${fromBot ? fromBot.name : 'Blast'} ▸ You`);
    }
  },
  onBotShot(bot, dist) {
    if (dist < 34 && G.time - lastDistant > 0.18) { lastDistant = G.time; audio.distantShot(); }
  },
  onBotPlant(bot, siteKey) {
    if (G.bomb.planted) return;
    const s = world.sites[siteKey];
    bomb.plant(siteKey, s.x, s.z);
    pushFeed(`${bot.name} planted the bomb at ${s.name}`);
  },
  onBotDefuse() { rounds.endRound('ash', 'defuse'); },
});
G.bots = bots;

const grenades = createGrenades(scene, G, {
  onThrow() {},
  onExplode(pos) {
    audio.explosion();
    G.lastShot = { x: pos.x, z: pos.z, time: G.time };
  },
  onGrenadeHit(bot, dmg) { bots.damage(bot, dmg, YOU, false); },
  onDamagePlayer(dmg, from, head) {
    if (G.player.health <= 0) return;
    G.player.health = Math.max(0, G.player.health - dmg);
  },
});
G.grenades = grenades;

const bomb = createBomb(scene, G, {
  onPlant(siteKey) { audio.beep(); hud.setBomb(`BOMB PLANTED — ${world.sites[siteKey].name} · 35s`); },
  onBeep(final) { audio.beep(final); },
  onDetonate() {
    audio.explosion();
    rounds.endRound('ember', 'detonation');
  },
});

const rounds = createRounds(G, {
  onRoundStart(n) {
    player.reset(0, 13, 0);
    bots.reset(n);
    bomb.clear();
    hud.hideBanner();
    hud.hideBuy();
    hud.setBomb('No bomb planted');
    hud.setScore(G.score.ember, G.score.ash, n);
  },
  onBuyEnd() { hud.hideBuy(); pushFeed('Buy phase over — round live'); },
  onRoundEnd(winner, reason, e, a) {
    hud.hideBuy();
    const good = winner === 'ember';
    const reasonText = { elimination: 'enemy team eliminated', detonation: 'bomb detonated', defuse: 'bomb defused', timeout: 'time expired — bomb never planted', time: 'time expired' }[reason] || reason;
    hud.banner(good ? 'EMBER WINS THE ROUND' : 'ASH WINS THE ROUND', `${reasonText} · ${e} — ${a}`, good);
    if (good) audio.roundWin(); else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
    G.roundOverAt = G.time;
  },
  onBuy(id) { audio.buy(); hud.setMoney(G.money); hud.buyNote(`Bought ${WEAPONS[id] ? WEAPONS[id].name : id}`); },
});

const body = player.state;
const rayOrigin = new THREE.Vector3();
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let prevG = false;
let prevB = false;
let overlayMode = 'start';

weapon.equip('P9');
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, G.grenadesOwned);
hud.setMoney(G.money);
hud.setHealth(100, 0);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS, 'buy');
hud.onBuyItem = (id) => {
  const res = rounds.buy(id);
  hud.buyNote(res === 'ok' ? `Bought ${id}` : res === 'no-money' ? 'Not enough money' : res === 'owned' ? 'Already equipped' : res);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, G.grenadesOwned);
  hud.setMoney(G.money);
  audio.click();
};
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (G.round.phase === 'over') {
    if (rounds.matchOver()) resetMatch();
    else rounds.startRound();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function resetMatch() {
  G.score.ember = 0; G.score.ash = 0;
  G.round.number = 0;
  G.money = 800; G.grenadesOwned = 0;
  weapon.equip('P9');
  rounds.startRound();
}
function onLockChange(locked) {
  if (shot) return;
  if (locked) { started = true; hud.hideOverlay(); hud.hideBuy(); audio.unlock(); }
  else if (G.round.phase === 'over') {
    overlayMode = rounds.matchOver() ? 'match' : 'end';
    hud.showOverlay(overlayMode, rounds.matchOver()
      ? `Final score Ember ${G.score.ember} — ${G.score.ash} Ash.`
      : `Ember ${G.score.ember} — ${G.score.ash} Ash · Round ${G.round.number} of ${Math.max(9, G.round.number)}`);
  } else if (started) {
    overlayMode = 'paused';
    hud.showOverlay('paused');
  }
}
function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}
function shoot() {
  if (!weapon.takeRound()) { audio.dryClick(); return false; }
  const spread = weapon.spread(player.groundSpeed());
  camera.getWorldDirection(rayOrigin);
  const res = combat.fire(camera.position, body.yaw, body.pitch, spread, weapon.def(), { team: 'ember', bots: bots.bots, rng: G.rng });
  G.lastShot = { x: body.position.x, z: body.position.z, time: G.time };
  audio.shot(weapon.state.weaponId);
  weapon.pullTrigger();
  player.recoil(weapon.def().recoil * (0.9 + G.rng() * 0.3), (G.rng() * 2 - 1) * 0.004);
  if (res.kind === 'bot') {
    bots.damage(res.bot, res.damage, YOU, res.part === 'head');
    hud.hitMarker(res.bot.health <= 0);
    audio.hit();
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, G.grenadesOwned);
  return true;
}
function tryPlant(dt, holding) {
  if (G.bomb.planted || G.round.phase !== 'fight' || body.health <= 0) { G.bomb.plantProgress = 0; return; }
  let siteKey = null;
  for (const key of Object.keys(world.sites)) {
    const s = world.sites[key];
    if (Math.hypot(body.position.x - s.x, body.position.z - s.z) < s.r) { siteKey = key; break; }
  }
  if (!siteKey || !holding) {
    if (G.bomb.plantProgress > 0) hud.setBomb('No bomb planted');
    G.bomb.plantProgress = 0;
    return;
  }
  G.bomb.plantProgress += dt;
  hud.setBomb(`Planting at ${world.sites[siteKey].name}… ${Math.min(99, Math.floor(G.bomb.plantProgress / 3 * 100))}% — hold E`);
  if (G.bomb.plantProgress >= 3) {
    const s = world.sites[siteKey];
    bomb.plant(siteKey, s.x, s.z);
    pushFeed(`You planted the bomb at ${s.name}`);
    G.bomb.plantProgress = 0;
  }
}
function step(dt) {
  G.time += dt;
  const keys = input.state.keys;
  if (body.health > 0) player.step(dt, keys);
  G.playerSpeed = player.groundSpeed();
  weapon.step(dt, G.playerSpeed > 0.5);
  bots.step(dt);
  grenades.step(dt);
  bomb.step(dt);
  rounds.step(dt);
  tryPlant(dt, keys.has('KeyE'));
  // Round-over overlay timing (normal play only).
  if (!shot && G.round.phase === 'over' && G.roundOverAt !== undefined && G.time - G.roundOverAt > 1.6 && !document.pointerLockElement && overlayMode !== 'end' && overlayMode !== 'match') {
    overlayMode = rounds.matchOver() ? 'match' : 'end';
    hud.showOverlay(overlayMode, rounds.matchOver()
      ? `Final score Ember ${G.score.ember} — ${G.score.ash} Ash.`
      : `Ember ${G.score.ember} — ${G.score.ash} Ash · next round ready`);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const firing = input.state.firing;
    const def = weapon.def();
    if (body.health > 0 && G.round.phase !== 'buy' && ((def.auto && firing) || (!def.auto && firing && !prevFiring)) && weapon.ready()) shoot();
    else if (firing && !prevFiring && weapon.state.mag === 0) audio.dryClick();
    prevFiring = firing;
    if (input.state.keys.has('KeyR') && weapon.reload()) audio.reload();
    const gDown = input.state.keys.has('KeyG');
    if (gDown && !prevG && G.grenadesOwned > 0 && body.health > 0) {
      G.grenadesOwned -= 1;
      rayOrigin.set(body.position.x, body.position.y + body.eye, body.position.z);
      grenades.throwGrenade(rayOrigin, body.yaw, body.pitch, true);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name, G.grenadesOwned);
    }
    prevG = gDown;
    const bDown = input.state.keys.has('KeyB');
    if (bDown && !prevB && G.round.phase === 'buy') {
      if (document.getElementById('buy-menu').hidden) { hud.showBuy(G.money); if (document.pointerLockElement) document.exitPointerLock(); }
      else { hud.hideBuy(); input.requestLock(); }
    }
    prevB = bDown;
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']) {
      if (input.state.keys.has(code)) {
        input.state.keys.delete(code);
        const id = { Digit1: 'P9', Digit2: 'VK47', Digit3: 'HORNET', Digit4: 'LONGBOW', Digit5: 'GRENADE', Digit6: 'ARMOR' }[code];
        const res = rounds.buy(id);
        hud.buyNote(res === 'ok' ? `Bought ${id}` : res === 'no-money' ? 'Not enough money' : res);
        hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, G.grenadesOwned);
        hud.setMoney(G.money);
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) { step(FIXED_STEP); accumulator -= FIXED_STEP; steps += 1; }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setHealth(body.health, body.armor);
    hud.setTimer(G.round.timer, G.round.phase);
    hud.setAlive(bots.aliveCount('ember') + (body.health > 0 ? 1 : 0), bots.aliveCount('ash'));
    hud.setSpread(4 + weapon.spread(G.playerSpeed) * 500);
    if (G.bomb.planted) hud.setBomb(`BOMB PLANTED — ${world.sites[G.bomb.site].name} · ${Math.ceil(G.bomb.timer)}s`);
  }
  renderer.render(scene, camera);
}
function settle(steps) { for (let i = 0; i < steps; i++) step(FIXED_STEP); }
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) { window.__shotReady = true; frozen = true; }
  }
  requestAnimationFrame(paint);
}
function runShot(name) {
  hud.hideOverlay();
  hud.showHud();
  rounds.startRound();
  if (name === 'start') {
    body.position.set(0, 0, 13); body.yaw = 0; body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.6, -8));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    body.position.set(0, 0, 13); body.yaw = 0; body.pitch = 0;
    settle(10);
    hud.showBuy(G.money);
  } else if (name === 'play') {
    G.round.phase = 'fight'; G.round.timer = 92;
    weapon.equip('VK47');
    body.position.set(0, 0, 7); body.yaw = 0; body.pitch = 0;
    settle(10);
    const ash = bots.bots.find((b) => b.team === 'ash');
    ash.group.position.set(0.5, 0, -4); ash.yaw = Math.PI;
    const ally = bots.bots.find((b) => b.team === 'ember');
    ally.group.position.set(-3.5, 0, 1.5); ally.yaw = 0;
    aimAt(new THREE.Vector3(0.5, 1.1, -4));
    shoot();
    settle(6); // let the muzzle flash expire before the capture
    hud.hitMarker(false, true);
    hud.setHealth(100, 0);
  } else if (name === 'end') {
    G.round.phase = 'fight'; G.round.timer = 41;
    weapon.equip('VK47');
    body.position.set(-4, 0, 2); body.yaw = 0.5; body.pitch = 0;
    for (const b of bots.bots) if (b.team === 'ash') bots.damage(b, 500, YOU, false);
    settle(10);
    hud.banner('EMBER WINS THE ROUND', 'enemy team eliminated · 1 — 0', true, true);
    hud.setHealth(62, 50);
  }
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, G.grenadesOwned);
  hud.setMoney(G.money);
  hud.setScore(G.score.ember, G.score.ash, G.round.number);
  hud.setTimer(G.round.timer, G.round.phase);
  hud.setAlive(bots.aliveCount('ember') + (body.health > 0 ? 1 : 0), bots.aliveCount('ash'));
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else {
  rounds.startRound();
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
