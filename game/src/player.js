// Player movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows the player.
// Stopping to aim pays: spread in combat.js scales with ground speed.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(world) {
  const player = {
    position: new THREE.Vector3(0, 0, 13),
    velocity: new THREE.Vector3(),
    yaw: 0, // face north, up the yard toward the sites
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
  };
  const wish = new THREE.Vector3();
  const collides = (x, y, z, h, lift) => world.collides(x, y, z, h, lift);

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }
  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }
  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) { player.crouching = true; player.height = CROUCH_HEIGHT; }
    else if (!crouching && player.crouching && !collides(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false; player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw); const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp; player.velocity.z *= damp;
    }
    if (keys.has('Space') && player.onGround) { player.velocity.y = JUMP_SPEED; player.onGround = false; }
    player.velocity.y -= GRAVITY * dt;
    const nextX = player.position.x + player.velocity.x * dt;
    if (!collides(nextX, player.position.y, player.position.z, player.height, 0.04)) player.position.x = nextX;
    else player.velocity.x = 0;
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!collides(player.position.x, player.position.y, nextZ, player.height, 0.04)) player.position.z = nextZ;
    else player.velocity.z = 0;
    player.position.y += player.velocity.y * dt;
    player.onGround = false;
    if (collides(player.position.x, player.position.y, player.position.z, player.height, 0)) {
      if (player.velocity.y <= 0) { player.position.y = 0; player.velocity.y = 0; player.onGround = true; }
      else { player.velocity.y = 0; }
    }
    if (player.position.y < 0) { player.position.y = 0; player.velocity.y = 0; player.onGround = true; }
    player.velocity.y = Math.max(-30, player.velocity.y);
  }
  return {
    state: player,
    step, look, recoil,
    groundSpeed() { return Math.hypot(player.velocity.x, player.velocity.z); },
    reset(x, z, yaw) {
      player.position.set(x, 0, z); player.velocity.set(0, 0, 0);
      player.yaw = yaw; player.pitch = 0; player.health = 100; player.armor = 0;
      player.crouching = false; player.height = STAND_HEIGHT; player.eye = STAND_EYE;
    },
  };
}
