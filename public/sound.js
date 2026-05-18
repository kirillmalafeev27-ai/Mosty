// Tiny Web Audio synth — no assets needed.
window.Sound = (() => {
  let ctx;
  let enabled = true;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur = 0.12, type = 'sine', gain = 0.18) {
    if (!enabled) return;
    const c = ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }
  function noise(dur = 0.18, gain = 0.15) {
    if (!enabled) return;
    const c = ensure();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g).connect(c.destination);
    src.start();
  }
  return {
    set: v => { enabled = !!v; },
    tick: () => tone(880, 0.04, 'square', 0.06),
    good: () => { tone(660, 0.08, 'triangle', 0.18); setTimeout(() => tone(990, 0.12, 'triangle', 0.18), 70); },
    bad:  () => { tone(160, 0.22, 'sawtooth', 0.22); noise(0.25, 0.1); },
    rush: () => { for (let i = 0; i < 6; i++) setTimeout(() => tone(220 + i*40, 0.06, 'square', 0.08), i * 30); },
    crash: () => { noise(0.5, 0.22); tone(80, 0.4, 'sawtooth', 0.16); }
  };
})();
