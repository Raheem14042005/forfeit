// FORFEIT sound: every sound is synthesized live with WebAudio, no audio files.
window.FF = window.FF || {};
(function () {
  const A = FF.audio = { muted: false };
  let ctx = null, out = null, noiseBuf = null, musicTimer = null, musicGain = null;

  A.unlock = function () {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor();
        out = ctx.createGain();
        out.gain.value = 0.55;
        out.connect(comp);
        comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  function tone(f, t, dur, type, vol, f2, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(t, dur, vol, f1, f2, dest, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass';
    f.Q.value = q || 1.2;
    f.frequency.setValueAtTime(f1, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || out);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  const SFX = {
    join: t => { tone(523, t, 0.12, 'triangle', 0.3); tone(784, t + 0.08, 0.2, 'triangle', 0.3); },
    leave: t => { tone(600, t, 0.12, 'triangle', 0.2); tone(400, t + 0.08, 0.2, 'triangle', 0.2); },
    tick: t => tone(1250, t, 0.045, 'square', 0.07),
    lock: t => tone(330, t, 0.09, 'square', 0.12, 700),
    pop: t => tone(520, t, 0.08, 'sine', 0.28, 1100),
    whoosh: t => noise(t, 0.55, 0.3, 300, 4000),
    drum: t => { for (let i = 0; i < 16; i++) noise(t + i * 0.065, 0.06, 0.08 + i * 0.012, 180, 0, null, 0.8); noise(t + 16 * 0.065, 0.5, 0.45, 120, 60, null, 0.6); },
    reveal: t => { tone(392, t, 0.14, 'sawtooth', 0.13); tone(523, t + 0.1, 0.14, 'sawtooth', 0.13); tone(784, t + 0.2, 0.45, 'sawtooth', 0.16); },
    fanfare: t => { [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, i === 3 ? 0.7 : 0.14, 'square', 0.12)); tone(1046, t + 0.36, 0.7, 'triangle', 0.15); },
    fail: t => { [392, 370, 349].forEach((f, i) => tone(f, t + i * 0.3, 0.28, 'sawtooth', 0.12)); tone(330, t + 0.9, 0.9, 'sawtooth', 0.13, 240); },
    buzz: t => { tone(110, t, 0.5, 'sawtooth', 0.22); tone(116, t, 0.5, 'square', 0.1); },
    ding: t => { tone(1318, t, 0.6, 'sine', 0.25); tone(1976, t, 0.35, 'sine', 0.08); },
    slam: t => { tone(90, t, 0.35, 'sine', 0.5, 40); noise(t, 0.25, 0.4, 2000, 300); },
    wheel: t => tone(950 + Math.random() * 150, t, 0.03, 'square', 0.08),
  };

  A.play = function (name, delay) {
    if (A.muted || !ctx || !SFX[name]) return;
    try { SFX[name](ctx.currentTime + 0.01 + (delay || 0)); } catch (e) { /* ignore audio glitches */ }
  };

  // Wheel ticks that slow down with the spin.
  A.spinTicks = function (seconds) {
    if (A.muted || !ctx) return;
    let t = 0, gap = 0.035;
    while (t < seconds) { A.play('wheel', t); t += gap; gap *= 1.07; }
  };

  // A small lobby groove: kick, clap, hats and a bass line at 112 BPM.
  const BASS = [45, 45, 41, 41, 48, 48, 43, 43];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  A.music = function (on) {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicGain) { const g = musicGain; g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); setTimeout(() => g.disconnect(), 1200); musicGain = null; }
    if (!on || A.muted || !ctx) return;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(out);
    const step = 60 / 112 / 4;
    let next = ctx.currentTime + 0.1, i = 0;
    const g = musicGain;
    musicTimer = setInterval(() => {
      while (next < ctx.currentTime + 0.25) {
        const s = i % 16, bar = Math.floor(i / 16) % 8;
        if (s === 0 || s === 8 || s === 10) tone(120, next, 0.22, 'sine', 0.5, 45, g);
        if (s === 4 || s === 12) noise(next, 0.14, 0.22, 1500, 900, g, 0.7);
        if (s % 2 === 0) noise(next, 0.03, 0.06, 8000, 0, g, 3);
        if (s === 0 || s === 3 || s === 6 || s === 11 || s === 14) tone(midi(BASS[bar]), next, step * 1.6, 'triangle', 0.2, 0, g);
        if (s === 7 && bar % 2 === 1) tone(midi(BASS[bar] + 24), next, 0.12, 'square', 0.04, 0, g);
        next += step; i++;
      }
    }, 60);
  };

  A.setMuted = function (m) { A.muted = m; if (m) A.music(false); };
})();
