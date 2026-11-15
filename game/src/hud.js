// The DOM HUD: health, ammo, money, round timer, score, alive counts, kill feed,
// bomb status, crosshair spread, hitmarker, buy menu and the overlay panels. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const COPY = {
  start: { title: 'EMBERLINE', copy: 'Cinderworks yard. Ember attacks, Ash holds the sites. Plant the bomb or clear the yard.', action: 'Click to play' },
  paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  end: { title: 'Round over', copy: '', action: 'Next round' },
  match: { title: 'Match over', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay'), title = $('overlay-title'), copy = $('overlay-copy'), play = $('play');
  const hud = $('hud');
  let last = {};
  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }
  function feedHtml(entries) {
    $('killfeed').innerHTML = entries.map((e) => `<div>${e}</div>`).join('');
  }
  return {
    showHud() { hud.hidden = false; },
    setHealth(hp, armor) {
      setText($('hp-num'), 'hp', `${Math.ceil(hp)}`);
      $('hp-fill').style.width = `${Math.max(0, hp)}%`;
      $('armor-line').textContent = armor > 0 ? `Armor ${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, weaponName, grenades) {
      setText($('ammo-mag'), 'mag', String(mag));
      setText($('ammo-reserve'), 'res', `/ ${reserve}`);
      setText($('weapon-name'), 'wname', weaponName);
      setText($('grenade-count'), 'nades', grenades > 0 ? `G ${grenades} HE` : 'G — no HE');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(m) { setText($('money'), 'money', `$${m}`); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText($('timer'), 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      $('timer').classList.toggle('buy', phase === 'buy');
      setText($('phase'), 'phase', phase === 'buy' ? 'BUY PHASE — press B' : phase === 'fight' ? 'ROUND LIVE' : 'ROUND OVER');
    },
    setScore(ember, ash, round) {
      setText($('score-line'), 'score', `EMBER ${ember} — ${ash} ASH · ROUND ${round}`);
    },
    setAlive(ember, ash) {
      setText($('alive'), 'alive', `Ember ${ember} alive · Ash ${ash} alive`);
    },
    setBomb(text) { setText($('bomb-status'), 'bomb', text); },
    setSpread(px) {
      const c = $('crosshair');
      c.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, sticky = false) {
      const h = $('hitmarker');
      h.classList.add('on');
      h.classList.toggle('kill', killed);
      clearTimeout(h._t);
      if (!sticky) h._t = setTimeout(() => h.classList.remove('on', 'kill'), 120);
    },
    feed(entries) { feedHtml(entries); },
    banner(text, sub, good, sticky = false) {
      const b = $('banner');
      $('banner-title').textContent = text;
      $('banner-sub').textContent = sub || '';
      b.classList.toggle('good', !!good);
      b.classList.toggle('bad', !good);
      b.hidden = false;
      clearTimeout(b._t);
      if (!sticky) b._t = setTimeout(() => { b.hidden = true; }, 3500);
    },
    hideBanner() { $('banner').hidden = true; },
    showBuy(money) {
      const menu = $('buy-menu');
      menu.hidden = false;
      $('buy-money').textContent = `$${money}`;
      const rows = Object.values(WEAPONS).map((w) => {
        const key = { P9: '1', VK47: '2', HORNET: '3', LONGBOW: '4' }[w.id];
        return `<button data-buy="${w.id}"><b>${key} · ${w.name}</b><span>$${w.price} · ${w.damage} dmg · ${w.mag}/${w.reserve}</span></button>`;
      }).join('');
      $('buy-items').innerHTML = rows
        + `<button data-buy="GRENADE"><b>5 · HE Grenade</b><span>$${GRENADE_PRICE} · blast radius</span></button>`
        + `<button data-buy="ARMOR"><b>6 · Armor</b><span>$${ARMOR_PRICE} · absorbs 50%</span></button>`;
      menu.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => this.onBuyItem && this.onBuyItem(btn.dataset.buy));
      });
    },
    hideBuy() { $('buy-menu').hidden = true; },
    buyNote(text) { setText($('buy-note'), 'buynote', text); },
    showOverlay(mode, scoreText) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' || mode === 'match' ? scoreText : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    onBuyItem: null,
  };
}
