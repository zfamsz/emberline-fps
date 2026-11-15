// Bots: 4 Ember allies + 5 Ash enemies. Each bot is a state machine — route, hold,
// fight, investigate, plant, defuse — walking a waypoint graph, checking line of sight
// with a raycast, and firing with accuracy that falls with distance and target speed.
// Bots also hear: the last gunshot within 28 m pulls nearby bots to investigate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { EMBER_SPAWNS, ASH_SPAWNS } from './world.js';

const EMBER_NAMES = ['Vex', 'Kilo', 'Rook', 'Sable'];
const ASH_NAMES = ['Cinder', 'Flint', 'Mara', 'Onyx', 'Pike'];
const BOT_SPEED = 3.4;
const EYE = 1.5;

export function createBots(scene, world, combat, G, hooks) {
  const bots = [];
  const eyeA = new THREE.Vector3();
  const eyeB = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function buildMesh(team) {
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'ember' ? PALETTE.accent : PALETTE.steel), roughness: 0.6, metalness: 0.15,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'ember' ? PALETTE.ember : '#8a97a3'), roughness: 0.5, metalness: 0.2,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), headMat);
    head.position.y = 1.53;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.26), darkMat);
    legs.position.y = 0.31;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
    gun.position.set(0.2, 1.15, -0.25);
    group.add(torso, head, legs, gun);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(group);
    return { group, torso, head };
  }

  function makeBot(id, team, name, spawn, weaponId) {
    const mesh = buildMesh(team);
    const bot = {
      id, team, name, weaponId, def: WEAPONS[weaponId],
      group: mesh.group, torso: mesh.torso, head: mesh.head,
      health: 100, armor: 0, alive: true,
      yaw: team === 'ember' ? 0 : Math.PI, pitch: 0,
      state: 'route', path: [], pathIdx: 0, holdNode: -1, holdUntil: 0,
      target: null, lastSeen: null, investigate: null, investigateUntil: 0,
      fireTimer: 0, burstLeft: 0, burstPause: 0, thinkTimer: Math.random() * 0.15,
      strafeDir: 1, strafeTimer: 0, plantTimer: 0, defuseTimer: 0,
      carrier: false, speed: BOT_SPEED, fall: 0, spawn,
    };
    bot.torso.userData.bot = bot; bot.torso.userData.part = 'torso';
    bot.head.userData.bot = bot; bot.head.userData.part = 'head';
    bot.group.position.set(spawn[0], 0, spawn[1]);
    bots.push(bot);
    return bot;
  }
  for (let i = 0; i < 4; i++) makeBot(i, 'ember', EMBER_NAMES[i], EMBER_SPAWNS[i + 1], i === 0 ? 'VK47' : i === 1 ? 'HORNET' : 'VK47');
  for (let i = 0; i < 5; i++) makeBot(4 + i, 'ash', ASH_NAMES[i], ASH_SPAWNS[i], i === 2 ? 'LONGBOW' : i % 2 ? 'HORNET' : 'VK47');
  bots[0].carrier = true;

  function reset(round) {
    for (const b of bots) {
      b.health = 100; b.alive = true; b.fall = 0; b.plantTimer = 0; b.defuseTimer = 0;
      b.target = null; b.investigate = null; b.state = 'route'; b.path = []; b.pathIdx = 0;
      b.group.rotation.set(0, 0, 0);
      b.group.position.set(b.spawn[0], 0, b.spawn[1]);
      b.group.visible = true;
      b.yaw = b.team === 'ember' ? 0 : Math.PI; b.pitch = 0;
      b.def = WEAPONS[b.weaponId];
    }
    // Attackers split between the two sites; defenders hold site/mid posts.
    const site = round % 2 === 0 ? 'A' : 'B';
    bots.forEach((b, i) => {
      if (b.team !== 'ember') return;
      const s = i < 2 ? site : (site === 'A' ? 'B' : 'A');
      b.site = s;
      b.path = world.route(world.nearestNode(b.group.position.x, b.group.position.z), world.sites[s].node);
      b.pathIdx = 0;
    });
    const holds = [15, 17, 19, 18, 16];
    bots.forEach((b, i) => {
      if (b.team !== 'ash') return;
      b.holdNode = holds[i % holds.length];
      b.path = world.route(world.nearestNode(b.group.position.x, b.group.position.z), b.holdNode);
      b.pathIdx = 0;
    });
  }

  function eyeOf(bot, out) { return out.set(bot.group.position.x, EYE, bot.group.position.z); }
  function visibleEnemy(bot) {
    // Nearest enemy with line of sight inside 45 m.
    eyeOf(bot, eyeA);
    let best = null; let bestD = 46;
    const player = G.player;
    if (player.health > 0 && bot.team === 'ash') {
      eyeB.set(player.position.x, player.position.y + player.eye, player.position.z);
      const d = eyeA.distanceTo(eyeB);
      if (d < bestD && combat.hasLOS(eyeA, eyeB)) { best = { isPlayer: true, pos: player.position, eye: player.position.y + player.eye, speed: G.playerSpeed, health: player.health }; bestD = d; }
    }
    for (const e of bots) {
      if (!e.alive || e.team === bot.team) continue;
      eyeB.set(e.group.position.x, EYE, e.group.position.z);
      const d = eyeA.distanceTo(eyeB);
      if (d < bestD && combat.hasLOS(eyeA, eyeB)) { best = e; bestD = d; }
    }
    return best ? { target: best, dist: bestD } : null;
  }
  function aimAt(bot, tx, ty, tz) {
    toTarget.set(tx - bot.group.position.x, ty - EYE, tz - bot.group.position.z);
    const len = toTarget.length() || 1;
    bot.yaw = Math.atan2(-toTarget.x, -toTarget.z);
    bot.pitch = Math.asin(Math.max(-1, Math.min(1, toTarget.y / len)));
  }
  function moveToward(bot, tx, tz, dt) {
    const dx = tx - bot.group.position.x; const dz = tz - bot.group.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.25) return true;
    const step = bot.speed * dt;
    const nx = bot.group.position.x + (dx / len) * step;
    const nz = bot.group.position.z + (dz / len) * step;
    if (!world.collides(nx, 0, bot.group.position.z, 1.72, 0.04)) bot.group.position.x = nx;
    if (!world.collides(bot.group.position.x, 0, nz, 1.72, 0.04)) bot.group.position.z = nz;
    bot.yaw = Math.atan2(-dx, -dz);
    return false;
  }
  function routeTo(bot, node) {
    bot.path = world.route(world.nearestNode(bot.group.position.x, bot.group.position.z), node);
    bot.pathIdx = 0;
  }
  function followPath(bot, dt) {
    if (bot.pathIdx >= bot.path.length) return true;
    const n = world.nodes[bot.path[bot.pathIdx]];
    if (moveToward(bot, n[1], n[2], dt)) bot.pathIdx += 1;
    return bot.pathIdx >= bot.path.length;
  }
  function fireAt(bot, target, dist, dt) {
    bot.fireTimer -= dt;
    if (bot.burstLeft <= 0) {
      bot.burstPause -= dt;
      if (bot.burstPause <= 0) { bot.burstLeft = 2 + Math.floor(G.rng() * 4); bot.burstPause = 0.5 + G.rng() * 0.7; }
      return;
    }
    if (bot.fireTimer > 0) return;
    bot.fireTimer = bot.def.fireGap * 1.6;
    bot.burstLeft -= 1;
    const tSpeed = target.isPlayer ? (target.speed || 0) : 2.5;
    // The player is not a raycast mesh: bot accuracy vs the player is a hit roll that
    // falls with distance and with the player's speed, so stopping to aim pays both ways.
    if (target.isPlayer) {
      hooks.onBotShot(bot, dist);
      const chance = Math.max(0.06, Math.min(0.55, 0.5 - dist * 0.008 - tSpeed * 0.035));
      if (G.rng() < chance) {
        const head = G.rng() < 0.08;
        hooks.onDamagePlayer(bot.def.damage * (head ? bot.def.headMult : 1), bot, head);
      }
      return;
    }
    const spread = 0.008 + dist * 0.00045 + tSpeed * 0.0035;
    eyeOf(bot, eyeA);
    const res = combat.fire(eyeA, bot.yaw, bot.pitch, spread, bot.def, { team: bot.team, bots, rng: G.rng });
    if (res.kind === 'world' || res.kind === 'none') { hooks.onBotShot(bot, dist); return; }
    hooks.onBotShot(bot, dist);
    damage(res.bot, res.damage, bot, res.part === 'head');
  }
  function damage(bot, amount, killer, headshot) {
    if (!bot.alive) return;
    let dmg = amount;
    if (bot.armor > 0) { const absorbed = Math.min(bot.armor, dmg * 0.5); bot.armor -= absorbed; dmg -= absorbed; }
    bot.health -= dmg;
    bot.defuseTimer = 0; bot.plantTimer = 0;
    if (bot.health <= 0) {
      bot.alive = false; bot.health = 0; bot.fall = 0;
      hooks.onKill(killer, bot, headshot);
    }
  }
  function step(dt) {
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) { bot.fall = Math.min(1, bot.fall + dt / 0.4); bot.group.rotation.x = -bot.fall * 1.45; }
        continue;
      }
      bot.thinkTimer -= dt;
      // Hear the last shot: investigate when close and idle.
      if (G.lastShot && G.time - G.lastShot.time < 1.2 && !bot.target) {
        const dx = G.lastShot.x - bot.group.position.x; const dz = G.lastShot.z - bot.group.position.z;
        if (dx * dx + dz * dz < 28 * 28 && bot.state !== 'defuse') {
          bot.investigate = { x: G.lastShot.x, z: G.lastShot.z };
          bot.investigateUntil = G.time + 6;
          if (bot.state === 'hold') { bot.state = 'route'; routeTo(bot, world.nearestNode(bot.investigate.x, bot.investigate.z)); }
        }
      }
      if (bot.thinkTimer <= 0) {
        bot.thinkTimer = 0.15;
        const seen = visibleEnemy(bot);
        if (seen) { bot.target = seen.target; bot.lastSeen = { x: seen.target.isPlayer ? seen.target.pos.x : seen.target.group.position.x, z: seen.target.isPlayer ? seen.target.pos.z : seen.target.group.position.z, t: G.time }; }
        else if (bot.target && G.time - (bot.lastSeen ? bot.lastSeen.t : 0) > 1.5) bot.target = null;
      }
      if (bot.target) {
        const t = bot.target;
        const tx = t.isPlayer ? t.pos.x : t.group.position.x;
        const ty = t.isPlayer ? t.eye : 1.05; // aim at the torso: headshots stay earned, not free
        const tz = t.isPlayer ? t.pos.z : t.group.position.z;
        aimAt(bot, tx, ty, tz);
        const dist = Math.hypot(tx - bot.group.position.x, tz - bot.group.position.z);
        // Strafe while fighting; hold ground at long range.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) { bot.strafeDir *= -1; bot.strafeTimer = 0.7 + G.rng() * 0.8; }
        if (dist > 6) {
          const sx = bot.group.position.x + Math.cos(bot.yaw) * bot.strafeDir * bot.speed * 0.5 * dt;
          if (!world.collides(sx, 0, bot.group.position.z, 1.72, 0.04)) bot.group.position.x = sx;
        }
        fireAt(bot, t, dist, dt);
        continue;
      }
      // Bomb states override routing.
      if (G.bomb.planted && bot.team === 'ash' && G.bomb.site) {
        if (bot.state !== 'defuse') { bot.state = 'defuse'; routeTo(bot, world.sites[G.bomb.site].node); }
        if (followPath(bot, dt)) {
          const dx = G.bomb.x - bot.group.position.x; const dz = G.bomb.z - bot.group.position.z;
          if (Math.hypot(dx, dz) < 2.2) {
            bot.defuseTimer += dt;
            if (bot.defuseTimer >= 5) hooks.onBotDefuse(bot);
          }
        }
        continue;
      }
      if (bot.team === 'ember' && bot.carrier && G.bomb.site === null && !G.bomb.planted) {
        const site = world.sites[bot.site];
        if (bot.pathIdx >= bot.path.length) {
          const dx = site.x - bot.group.position.x; const dz = site.z - bot.group.position.z;
          if (Math.hypot(dx, dz) < site.r) {
            bot.plantTimer += dt;
            if (bot.plantTimer >= 3) hooks.onBotPlant(bot, bot.site);
          } else moveToward(bot, site.x, site.z, dt);
          continue;
        }
      }
      if (bot.state === 'route') {
        if (followPath(bot, dt)) {
          bot.state = 'hold'; bot.holdUntil = G.time + 4 + G.rng() * 4;
          bot.yaw += (G.rng() - 0.5) * 1.2;
        }
      } else if (bot.state === 'hold') {
        if (bot.investigate && G.time < bot.investigateUntil) {
          if (moveToward(bot, bot.investigate.x, bot.investigate.z, dt)) { bot.investigate = null; bot.holdUntil = G.time + 3; }
        } else if (G.time >= bot.holdUntil) {
          // Rotate: attackers push the other site, defenders re-post.
          if (bot.team === 'ember') {
            bot.site = bot.site === 'A' ? 'B' : 'A';
            bot.state = 'route'; routeTo(bot, world.sites[bot.site].node);
          } else {
            bot.state = 'route'; routeTo(bot, bot.holdNode);
          }
        }
      }
    }
  }
  return {
    bots, step, reset, damage,
    aliveCount(team) { return bots.filter((b) => b.alive && b.team === team).length; },
    hitMeshes() { const m = []; for (const b of bots) m.push(b.torso, b.head); return m; },
  };
}
