// Rounds: buy phase (15 s), round timer (100 s), win by elimination, detonation,
// defuse or timeout (Ash wins an unplanted timeout). First to 5, at most 9 rounds.
// Money: $800 start, +$300 a kill, +$3250 a round win, +$1900 a round loss.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;

export function createRounds(G, hooks) {
  function startRound() {
    G.round.number += 1;
    G.round.phase = 'buy';
    G.round.timer = BUY_SECONDS;
    G.round.kills = 0;
    G.bomb.planted = false; G.bomb.site = null; G.bomb.timer = 0;
    G.bomb.plantProgress = 0; G.bomb.defuseProgress = 0;
    G.grenades.clear();
    hooks.onRoundStart(G.round.number);
  }
  function endRound(winner, reason) {
    if (G.round.phase === 'over') return;
    G.round.phase = 'over';
    G.round.endReason = reason;
    if (winner === 'ember') {
      G.score.ember += 1;
      G.money += WIN_REWARD;
    } else {
      G.score.ash += 1;
      G.money += LOSS_REWARD;
    }
    hooks.onRoundEnd(winner, reason, G.score.ember, G.score.ash);
  }
  function buy(itemId) {
    if (G.round.phase !== 'buy') return 'not-buy-phase';
    if (itemId === 'GRENADE') {
      if (G.grenadesOwned >= 2) return 'max-grenades';
      if (G.money < GRENADE_PRICE) return 'no-money';
      G.money -= GRENADE_PRICE; G.grenadesOwned += 1;
      return 'ok';
    }
    if (itemId === 'ARMOR') {
      if (G.player.armor >= 100) return 'max-armor';
      if (G.money < ARMOR_PRICE) return 'no-money';
      G.money -= ARMOR_PRICE; G.player.armor = 100;
      return 'ok';
    }
    const def = WEAPONS[itemId];
    if (!def) return 'unknown';
    if (G.money < def.price) return 'no-money';
    if (G.weapon.state.weaponId === itemId) return 'owned';
    G.money -= def.price;
    G.weapon.equip(itemId);
    hooks.onBuy(itemId);
    return 'ok';
  }
  function step(dt) {
    if (G.round.phase === 'buy' || G.round.phase === 'fight') {
      G.round.timer -= dt;
      if (G.round.phase === 'buy' && G.round.timer <= 0) {
        G.round.phase = 'fight';
        G.round.timer = ROUND_SECONDS;
        hooks.onBuyEnd();
      } else if (G.round.phase === 'fight' && G.round.timer <= 0) {
        endRound(G.bomb.planted ? 'ember' : 'ash', G.bomb.planted ? 'time' : 'timeout');
      }
    }
    if (G.round.phase === 'fight' && !G.bomb.planted) {
      const emberAlive = G.bots.aliveCount('ember') + (G.player.health > 0 ? 1 : 0);
      const ashAlive = G.bots.aliveCount('ash');
      if (ashAlive === 0) endRound('ember', 'elimination');
      else if (emberAlive === 0) endRound('ash', 'elimination');
    }
  }
  function matchOver() {
    return G.score.ember >= WIN_ROUNDS || G.score.ash >= WIN_ROUNDS || G.round.number >= MAX_ROUNDS;
  }
  return { startRound, endRound, buy, step, matchOver };
}
