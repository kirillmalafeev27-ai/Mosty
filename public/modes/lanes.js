// Mode: Four Lanes — top-down racer; the answer line approaches from the top.
window.Modes = window.Modes || {};
window.Modes.lanes = function(api) {
  let running = false, paused = false, raf = 0, lastT = 0;
  const wrap = document.createElement('div'); wrap.className = 'lanes-wrap';
  wrap.innerHTML = `
    <div class="lanes-q" id="lq"></div>
    <div class="lanes-track" id="track">
      <div class="lane"><div class="lane-stripes"></div><div class="lane-answer" data-i="0"></div></div>
      <div class="lane"><div class="lane-stripes"></div><div class="lane-answer" data-i="1"></div></div>
      <div class="lane"><div class="lane-stripes"></div><div class="lane-answer" data-i="2"></div></div>
      <div class="lane"><div class="lane-stripes"></div><div class="lane-answer" data-i="3"></div></div>
    </div>
    <div class="lane-line" id="line"></div>
    <div class="lanes-bike" id="bike"></div>
    <div class="lanes-hint">← / → или клик по полосе · линия ответа летит к тебе</div>
  `;
  document.getElementById('game-root').appendChild(wrap);

  const lq = wrap.querySelector('#lq');
  const bike = wrap.querySelector('#bike');
  const line = wrap.querySelector('#line');
  const track = wrap.querySelector('#track');
  const ansEls = wrap.querySelectorAll('.lane-answer');
  let q = null, lane = 1, committed = false, linePct = 0;

  function newQuestion() {
    q = api.pick();
    lq.textContent = q.q;
    ansEls.forEach((el, i) => { el.textContent = `${i+1}. ${q.choices[i]}`; el.style.background = ''; el.style.borderColor = ''; });
    committed = false;
    linePct = -10; // start above visible area
    line.style.top = linePct + '%';
  }

  function placeBike() {
    const trackRect = track.getBoundingClientRect();
    const laneW = trackRect.width / 4;
    const left = trackRect.left + laneW * lane + laneW / 2 - 28;
    bike.style.left = (left - wrap.getBoundingClientRect().left) + 'px';
  }

  function commit() {
    if (committed || !q) return;
    committed = true;
    const el = ansEls[lane];
    if (lane === q.correctIndex) {
      el.style.background = '#1f4a2a'; el.style.borderColor = '#5ce58a';
      api.onCorrect(100);
      setTimeout(() => { if (running) newQuestion(); }, 350);
    } else {
      el.style.background = '#4a1f1f'; el.style.borderColor = '#ff5c5c';
      // Reveal correct
      const cEl = ansEls[q.correctIndex];
      cEl.style.background = '#1f4a2a'; cEl.style.borderColor = '#5ce58a';
      api.onWrong('wrong');
      setTimeout(() => { if (running) newQuestion(); }, 600);
    }
  }

  function onKey(e) {
    if (committed) return;
    if (e.key === 'ArrowLeft') { lane = Math.max(0, lane - 1); placeBike(); }
    else if (e.key === 'ArrowRight') { lane = Math.min(3, lane + 1); placeBike(); }
    else if (['1','2','3','4'].includes(e.key)) { lane = parseInt(e.key,10)-1; placeBike(); commit(); }
    else if (e.key === ' ' || e.key === 'Enter') commit();
  }
  function onLaneClick(e) {
    const i = parseInt(e.currentTarget.parentElement.querySelector('.lane-answer').dataset.i, 10);
    if (Number.isInteger(i)) { lane = i; placeBike(); commit(); }
  }
  window.addEventListener('keydown', onKey);
  wrap.querySelectorAll('.lane').forEach(l => l.addEventListener('click', onLaneClick));
  window.addEventListener('resize', placeBike);

  function step(t) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    if (paused) { lastT = t; return; }
    const dt = Math.min(40, t - lastT) / 16.67;
    lastT = t;
    const diffMul = api.diff() === 'easy' ? 0.6 : api.diff() === 'hard' ? 1.4 : 1.0;
    linePct += 0.35 * dt * api.speed() * diffMul;
    line.style.top = (Math.min(100, Math.max(-10, linePct))) + '%';
    if (linePct >= 75 && !committed) {
      // The line crosses bike's zone — commit current lane choice automatically
      commit();
    }
    if (linePct > 110 && !committed) {
      api.onTimeout();
      setTimeout(() => { if (running) newQuestion(); }, 400);
    }
  }

  return {
    start() { running = true; newQuestion(); placeBike(); lastT = performance.now(); raf = requestAnimationFrame(step); },
    pause() { paused = true; },
    resume() { paused = false; lastT = performance.now(); },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', placeBike);
      wrap.remove();
    }
  };
};
