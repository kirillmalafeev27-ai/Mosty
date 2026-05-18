// Mode: Shrinking Ring — 4 answers on a clock face; a ring closes in and eats answers.
window.Modes = window.Modes || {};
window.Modes.ring = function(api) {
  let running = false, paused = false, raf = 0;
  const wrap = document.createElement('div'); wrap.className = 'ring-wrap';
  wrap.innerHTML = `
    <svg class="ring-svg" viewBox="-200 -200 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="rgrad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="rgba(244,185,66,0.25)"/>
          <stop offset="100%" stop-color="rgba(244,185,66,0)"/>
        </radialGradient>
      </defs>
      <circle cx="0" cy="0" r="180" fill="url(#rgrad)" />
      <circle id="ring" cx="0" cy="0" r="170" fill="none" stroke="#f4b942" stroke-width="3" stroke-dasharray="6 6" />
      <g id="answers"></g>
    </svg>
    <div class="ring-q" id="rq"></div>
  `;
  document.getElementById('game-root').appendChild(wrap);
  const ring = wrap.querySelector('#ring');
  const ansG = wrap.querySelector('#answers');
  const rq = wrap.querySelector('#rq');

  const NS = 'http://www.w3.org/2000/svg';
  let q = null;
  let answers = []; // {el, angle, dist, killed, idx}
  let radius = 180;
  let lastT = 0;
  let committed = false;
  let nextAt = 0;

  function placeAnswers() {
    ansG.innerHTML = '';
    answers = [];
    for (let i = 0; i < 4; i++) {
      const angle = (-Math.PI / 2) + i * (Math.PI / 2);
      const dist = 140;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ring-ans');
      const cx = Math.cos(angle) * dist, cy = Math.sin(angle) * dist;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', cx - 70); r.setAttribute('y', cy - 24);
      r.setAttribute('width', 140); r.setAttribute('height', 48);
      r.setAttribute('rx', 10);
      r.setAttribute('fill', '#1a2233');
      r.setAttribute('stroke', '#243049');
      r.setAttribute('stroke-width', '1.5');
      g.appendChild(r);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', cx); t.setAttribute('y', cy + 5);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#e7ecf3');
      t.setAttribute('font-size', '15');
      t.setAttribute('font-weight', '700');
      t.textContent = `${i+1}. ${q.choices[i]}`;
      g.appendChild(t);
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => commit(i));
      ansG.appendChild(g);
      answers.push({ el: g, rect: r, angle, dist, killed: false, idx: i });
    }
  }

  function newQuestion() {
    q = api.pick();
    rq.textContent = q.q;
    committed = false;
    radius = 180;
    placeAnswers();
  }

  function commit(i) {
    if (committed) return;
    const a = answers[i];
    if (!a || a.killed) return;
    committed = true;
    if (i === q.correctIndex) {
      a.rect.setAttribute('fill', '#1f4a2a');
      a.rect.setAttribute('stroke', '#5ce58a');
      api.onCorrect(100);
      setTimeout(() => { if (running) newQuestion(); }, 350);
    } else {
      a.rect.setAttribute('fill', '#4a1f1f');
      a.rect.setAttribute('stroke', '#ff5c5c');
      api.onWrong('wrong');
      setTimeout(() => { if (running) newQuestion(); }, 500);
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

    const diffMul = api.diff() === 'easy' ? 0.7 : api.diff() === 'hard' ? 1.5 : 1.0;
    radius -= 0.35 * dt * api.speed() * diffMul;
    ring.setAttribute('r', Math.max(0, radius));

    // Kill any answer the ring touched
    for (const a of answers) {
      if (a.killed) continue;
      if (radius <= a.dist - 24) {
        a.killed = true;
        a.rect.setAttribute('fill', '#0a0e15');
        a.rect.setAttribute('stroke', '#2a2a2a');
        a.rect.setAttribute('opacity', '0.4');
        a.el.style.cursor = 'not-allowed';
        api.sound.tick();
        // If the correct one died, fail.
        if (a.idx === q.correctIndex && !committed) {
          committed = true;
          api.onWrong('eaten');
          setTimeout(() => { if (running) newQuestion(); }, 400);
        }
      }
    }
    // Ring closed without commit
    if (radius < 4 && !committed) {
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
