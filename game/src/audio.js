// Procedural WebAudio: no audio files, no network. A shared noise buffer plus
// oscillators make shots, reload clicks, explosions, bomb beeps and UI clicks.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function noise(dur, freq, gain, type = 'lowpass') {
    const c = ensure(); if (!c) return;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const filter = c.createBiquadFilter(); filter.type = type; filter.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filter); filter.connect(g); g.connect(c.destination);
    src.start(); src.stop(c.currentTime + dur);
  }
  function tone(freq, dur, gain, type = 'square', slideTo = 0) {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  return {
    unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    shot(id) {
      if (id === 'LONGBOW') { noise(0.3, 900, 0.5); tone(160, 0.18, 0.3, 'sawtooth', 60); }
      else if (id === 'P9') { noise(0.12, 1800, 0.35); tone(320, 0.08, 0.18, 'square', 120); }
      else { noise(0.16, 1200, 0.42); tone(220, 0.1, 0.22, 'sawtooth', 70); }
    },
    distantShot() { noise(0.2, 500, 0.12); },
    reload() { tone(900, 0.05, 0.12, 'square'); setTimeout(() => tone(620, 0.05, 0.12, 'square'), 140); },
    dryClick() { tone(1400, 0.03, 0.1, 'square'); },
    explosion() { noise(0.9, 320, 0.9); tone(90, 0.7, 0.5, 'sine', 30); },
    beep(final = false) { tone(final ? 1400 : 1050, final ? 0.3 : 0.12, 0.22, 'sine'); },
    hit() { tone(1800, 0.05, 0.14, 'sine'); },
    kill() { tone(1800, 0.05, 0.16, 'sine'); setTimeout(() => tone(2400, 0.08, 0.16, 'sine'), 70); },
    click() { tone(700, 0.04, 0.1, 'square'); },
    buy() { tone(880, 0.07, 0.14, 'sine'); setTimeout(() => tone(1320, 0.09, 0.14, 'sine'), 80); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.16, 'sine'), i * 120)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.16, 'sine'), i * 140)); },
  };
}
