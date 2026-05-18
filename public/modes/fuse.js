// Mode: Burning Fuse — flame moves across each answer; once it covers the whole answer, it dies.
window.Modes = window.Modes || {};
window.Modes.fuse = function(api) {
  let running = false, paused = false, raf = 0, lastT = 0;
  const wrap = document.createElement('div'); wrap.className = 'fuse-wrap';
  wrap.innerHTML = `
    <div class="fuse-q" id="fq"></div>
    <div class="fuse-answers" id="fans"></div>
  `;
  document.getElementById('game-root').appendChild(wrap);
  const fq = wrap.querySelector('#fq');
  const fans = wrap.querySelector('#fans');
  let q = null, items = [], committed = false;

  function newQuestion() {
    q = api.pick();
    fq.textContent = q.q;
    fans.innerHTML = '';
    items = [];
    // Stagger burn rates per item; the correct one is among them — same rate to keep fair
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'fuse-ans';
      el.innerHTML = `<div class="label"><span class="key">${i+1}</span><span>${q.choices[i]}</span></div><div class="burn"></div>`;
      el.addEventListener('click', () => commit(i));
      fans.appendChild(el);
      // base 0.18 per dt frame, plus per-item delay so they don't finish at once
      items.push({ el, burn: el.querySelector('.burn'), progress: -i * 18, dead: false, idx: i });
    }
    committed = false;
  }

  function commit(i) {
    if (committed) return;
    const it = items[i]; if (!it || it.dead) return;
    committed = true;
    if (i === q.correctIndex) {
      it.el.style.borderColor = '#5ce58a';
      api.onCorrect(100);
      setTimeout(() => { if (running) newQuestion(); }, 350);
    } else {
      it.el.style.borderColor = '#ff5c5c';
      const c = items[q.correctIndex];
      if (c) c.el.style.borderColor = '#5ce58a';
      api.onWrong('wrong');
      setTimeout(() => { if (running) newQuestion(); }, 600);
    }
  }

  function onKey(e) {
    if (['1','2','3','4'].includes(e.key)) commit(parseInt(e.key,10)-1);
  }
  window.addEventListener('keydown', onKey);

  function step(t) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    if (paused) { lastT = t; return; }
    const dt = Math.min(40, t - lastT) / 16.67;
    lastT = t;
    const diffMul = api.diff() === 'easy' ? 0.7 : api.diff() === 'hard' ? 1.4 : 1.0;
    const speed = 0.45 * dt * api.speed() * diffMul;
    let aliveCount = 0, correctAlive = false;
    for (const it of items) {
      if (it.dead) continue;
      it.progress += speed;
      const p = Math.max(0, Math.min(100, it.progress));
      it.burn.style.width = p + '%';
      if (it.progress >= 100) {
        it.dead = true;
        it.el.classList.add('dead');
        api.sound.tick();
        if (it.idx === q.correctIndex && !committed) {
          committed = true;
          api.onWrong('burned');
          setTimeout(() => { if (running) newQuestion(); }, 500);
          return;
        }
      } else {
        aliveCount++;
        if (it.idx === q.correctIndex) correctAlive = true;
      }
    }
    if (!correctAlive && !committed) {
      committed = true;
      api.onTimeout();
      setTimeout(() => { if (running) newQuestion(); }, 400);
    }
  }

  return {
    start() { running = true; newQuestion(); lastT = performance.now(); raf = requestAnimationFrame(step); },
    pause() { paused = true; },
    resume() { paused = false; lastT = performance.now(); },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      wrap.remove();
    }
  };
};
