// Mode: Collapsing Bridge — direct homage to Sonic Adventure tiles.
// Side-scrolling view. The player auto-runs to the right.
// Ahead: a fan of 4 answer-platforms. Behind: the bridge crumbles inward.
// Player must press 1/2/3/4 (or click an answer) to LEAP onto that platform.
// If platform is wrong OR collapse catches up — fall.
window.Modes = window.Modes || {};
window.Modes.bridge = function(api) {
  let raf = 0, running = false, paused = false;
  const wrap = document.createElement('div'); wrap.className = 'bridge-wrap';
  wrap.innerHTML = `
    <div class="bridge-sky"></div>
    <div class="bridge-water"></div>
    <canvas class="bridge-canvas"></canvas>
    <div class="bridge-question" id="bq"></div>
    <div class="bridge-hint">1/2/3/4 или клик · ↑ прыжок · влево/вправо — выбор полосы</div>
  `;
  const root = document.getElementById('game-root');
  root.appendChild(wrap);
  const c = wrap.querySelector('canvas');
  const qEl = wrap.querySelector('#bq');
  const ctx = c.getContext('2d');

  // Geometry constants (in canvas px). Resized on layout.
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  function fit() {
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height;
    c.width = W * DPR; c.height = H * DPR; c.style.width = W + 'px'; c.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  fit();
  const ro = new ResizeObserver(fit); ro.observe(wrap);

  // Game state
  let q = null;
  let tiles = []; // array of {x, y, w, h, alive, fall, answerIdx (or null)}
  let player = { x: 100, y: 0, vy: 0, onTile: null, alive: true, animT: 0, leaping: false, targetTile: null, fall: 0 };
  let collapseX = 0; // edge of collapse, advances right over time
  let lane = 1; // 0..3 — selected lane visually (the chosen answer when committing)
  let committed = false;
  let nextQuestionAt = 0;
  let lastT = performance.now();
  let bestStreakLocal = 0;

  const COLORS = {
    plank: '#f4b942',
    plankShadow: '#8a5a0f',
    frame: '#2d6a3f',
    tileGap: '#1a1208'
  };

  function newQuestion() {
    q = api.pick();
    qEl.textContent = q.q;
    committed = false;
    player.leaping = false;
    player.targetTile = null;
    lane = 1;
    // Build new run segment.
    layoutSegment();
  }

  function layoutSegment() {
    // We'll keep player around x = 30% of width; segment extends to the right.
    const baseY = H * 0.62;
    tiles = [];
    // Past safe tiles
    const tileW = Math.max(80, W * 0.12);
    const tileH = 18;
    const startX = -200;
    let x = startX;
    while (x < player.x + 60) {
      tiles.push(makeTile(x, baseY, tileW, tileH, null));
      x += tileW + 6;
    }
    // A short connector
    for (let i = 0; i < 3; i++) {
      tiles.push(makeTile(x, baseY, tileW, tileH, null));
      x += tileW + 6;
    }
    // Then the FAN: 4 answer platforms vertically stacked further right
    const fanStartX = x + 70;
    const fanLaneGapY = Math.min(60, H * 0.08);
    const fanCenterY = baseY - fanLaneGapY * 1.5;
    const ansW = Math.max(130, W * 0.18);
    const ansH = 36;
    for (let i = 0; i < 4; i++) {
      const t = makeTile(fanStartX, fanCenterY + i * fanLaneGapY, ansW, ansH, i);
      t.label = q.choices[i];
      tiles.push(t);
    }
    // Continuation after answer (visible "if correct" path) far right - reachable only by correct one
    // We'll create when committed.
    collapseX = -260;
    player.onTile = tiles.find(t => t.x <= player.x && t.x + t.w >= player.x && t.answerIdx == null) || tiles[0];
    player.y = player.onTile.y - 28;
    player.vy = 0; player.alive = true; player.fall = 0; player.recovering = false;
  }

  function makeTile(x, y, w, h, answerIdx) {
    return { x, y, w, h, alive: true, fall: 0, answerIdx, label: null, falling: false };
  }

  function setup() {
    fit();
    newQuestion();
  }

  // Input
  function onKey(e) {
    if (!q) return;
    if (e.key === 'ArrowLeft') { lane = Math.max(0, lane - 1); }
    else if (e.key === 'ArrowRight') { lane = Math.min(3, lane + 1); }
    else if (e.key === 'ArrowUp' || e.key === ' ') { commitLane(lane); }
    else if (['1','2','3','4'].includes(e.key)) { commitLane(parseInt(e.key, 10) - 1); }
  }
  function onPointer(e) {
    if (!q || committed) return;
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    for (const t of tiles) {
      if (t.answerIdx == null) continue;
      if (px >= t.x && px <= t.x + t.w && py >= t.y - 6 && py <= t.y + t.h + 6) {
        commitLane(t.answerIdx); return;
      }
    }
  }
  window.addEventListener('keydown', onKey);
  c.addEventListener('pointerdown', onPointer);

  function commitLane(i) {
    if (committed) return;
    committed = true;
    const target = tiles.find(t => t.answerIdx === i);
    if (!target) return;
    player.targetTile = target;
    player.leaping = true;
    player.vy = -8.5; // initial jump impulse
    // Add a continuation platform to the right of the correct one for momentum.
    const correctTile = tiles.find(t => t.answerIdx === q.correctIndex);
    if (i === q.correctIndex) {
      const cont = makeTile(correctTile.x + correctTile.w + 30, correctTile.y, W * 0.4, 18, null);
      tiles.push(cont);
    }
  }

  // Physics-ish step
  function step(t) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    if (paused) { lastT = t; return; }
    const dt = Math.min(40, t - lastT) / 16.67; // normalize to ~60fps frames
    lastT = t;

    // Difficulty / streak speed factor
    const diffMul = api.diff() === 'easy' ? 0.75 : api.diff() === 'hard' ? 1.35 : 1.0;
    const speedFactor = api.speed() * diffMul;

    // Collapse advance: a creeping edge that consumes safe tiles from behind.
    // Goal: it should reach answer fan within ~6 seconds at speed 1.
    collapseX += 1.2 * dt * speedFactor;

    // Mark tiles caught by collapse as falling.
    for (const tile of tiles) {
      if (!tile.alive || tile.falling) continue;
      if (tile.answerIdx == null && tile.x + tile.w * 0.6 < collapseX) {
        tile.falling = true;
        api.sound.tick();
      }
    }
    // Update falling tiles physics
    for (const tile of tiles) {
      if (tile.falling) {
        tile.fall += 0.6 * dt;
        tile.y += tile.fall;
        if (tile.y > H + 40) tile.alive = false;
      }
    }

    // Player physics
    if (player.alive) {
      if (player.leaping) {
        player.vy += 0.55 * dt; // gravity
        player.x += 3.2 * dt * speedFactor;
        player.y += player.vy * dt * 1.4;
        // Landing check
        const target = player.targetTile;
        if (target) {
          const landY = target.y - 28;
          if (player.vy > 0 && player.y >= landY && player.x + 14 > target.x && player.x - 14 < target.x + target.w) {
            player.y = landY;
            player.vy = 0;
            player.leaping = false;
            player.onTile = target;
            // Evaluate
            if (target.answerIdx === q.correctIndex) {
              api.onCorrect(100);
              // Move on
              flashGood();
              setTimeout(() => { if (running) newQuestionShift(); }, 350);
            } else {
              flashBad();
              api.onWrong('wrong');
              if (running) {
                player.recovering = true; // ignore fall-through during reset
                setTimeout(() => { target.falling = true; }, 120);
                setTimeout(() => { if (running) newQuestionShift(); }, 500);
              }
            }
          }
        }
        // Missed the platform / fell
        if (player.y > H + 40) {
          if (!player.recovering) { player.alive = false; api.gameOver('fall'); }
        }
      } else {
        // Standing on a tile that may be crumbling
        if (player.onTile && (!player.onTile.alive || player.onTile.falling)) {
          player.vy += 0.6 * dt;
          player.y += player.vy * dt * 1.4;
          if (player.y > H + 40 && !player.recovering) { player.alive = false; api.gameOver('fall'); }
        } else {
          // breathing idle
          player.animT += dt * 0.3;
        }
      }
    }

    draw();
  }

  function newQuestionShift() {
    // shift world left so player sits at ~30%
    const targetX = W * 0.25;
    const shift = player.x - targetX;
    if (Math.abs(shift) > 4) {
      // Animate by moving all tiles & player
      for (const t of tiles) t.x -= shift;
      collapseX -= shift;
      player.x -= shift;
    }
    newQuestion();
  }

  function flashGood() { wrap.classList.remove('flash-bad'); wrap.classList.remove('flash-good'); void wrap.offsetWidth; wrap.classList.add('flash-good'); }
  function flashBad() { wrap.classList.remove('flash-bad'); wrap.classList.remove('flash-good'); void wrap.offsetWidth; wrap.classList.add('flash-bad'); }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Distant green frame rails of the bridge
    ctx.strokeStyle = COLORS.frame;
    ctx.lineWidth = 6;
    const baseY = tiles.length ? Math.min(...tiles.filter(t => t.answerIdx == null && t.alive).map(t => t.y)) : H * 0.62;
    // simple side rails along the live path
    let safe = tiles.filter(t => t.answerIdx == null && t.alive && !t.falling).sort((a,b) => a.x - b.x);
    if (safe.length > 1) {
      ctx.beginPath();
      ctx.moveTo(safe[0].x, baseY - 30);
      for (const t of safe) ctx.lineTo(t.x + t.w / 2, baseY - 30);
      ctx.stroke();
    }

    // Draw tiles
    for (const t of tiles) {
      if (!t.alive) continue;
      // tile body
      const isAns = t.answerIdx != null;
      const grad = ctx.createLinearGradient(0, t.y, 0, t.y + t.h);
      grad.addColorStop(0, isAns ? '#ffd76b' : COLORS.plank);
      grad.addColorStop(1, COLORS.plankShadow);
      ctx.fillStyle = grad;
      roundRect(ctx, t.x, t.y, t.w, t.h, 4); ctx.fill();
      // metal cross-grid pattern
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      for (let gx = t.x + 6; gx < t.x + t.w - 4; gx += 10) {
        ctx.fillRect(gx, t.y + 4, 1, t.h - 8);
      }
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(t.x, t.y + t.h, t.w, 3);

      // answer label
      if (isAns && t.label) {
        ctx.fillStyle = '#1a1304';
        ctx.font = '600 13px ui-sans-serif, system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const text = `${t.answerIdx + 1}. ${t.label}`;
        wrapText(ctx, text, t.x + 8, t.y + t.h / 2, t.w - 16);
      }

      // lane highlight on selected answer (before commit)
      if (!committed && t.answerIdx === lane) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        roundRect(ctx, t.x - 2, t.y - 2, t.w + 4, t.h + 4, 6); ctx.stroke();
      }
    }

    // Collapse edge marker (a glowing wave)
    const ex = collapseX;
    const eg = ctx.createLinearGradient(ex - 40, 0, ex + 10, 0);
    eg.addColorStop(0, 'rgba(255,140,40,0)');
    eg.addColorStop(0.7, 'rgba(255,140,40,0.5)');
    eg.addColorStop(1, 'rgba(255,80,40,0.95)');
    ctx.fillStyle = eg;
    ctx.fillRect(ex - 40, 0, 50, H);
    ctx.fillStyle = 'rgba(255,80,40,1)';
    ctx.fillRect(ex, 0, 2, H);

    // Player (a stylised blue blob — Sonic vibe without IP)
    drawPlayer(player.x, player.y);
  }

  function drawPlayer(x, y) {
    // body
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(player.animT) * 2;
    ctx.fillStyle = '#3aa0ff';
    ctx.beginPath();
    ctx.ellipse(0, -4 + bob, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // belly
    ctx.fillStyle = '#f4d6a8';
    ctx.beginPath();
    ctx.ellipse(2, 2 + bob, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(4, -8 + bob, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(5, -8 + bob, 1.6, 0, Math.PI * 2); ctx.fill();
    // shoes
    ctx.fillStyle = '#e34a4a';
    ctx.fillRect(-10, 12 + bob * 0.4, 8, 4);
    ctx.fillRect(2, 12 + bob * 0.4, 8, 4);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function wrapText(ctx, text, x, y, maxW) {
    // Single-line truncate with ellipsis if too long
    let t = text;
    while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2);
    if (t !== text) t = t.slice(0, -1) + '…';
    ctx.fillText(t, x, y);
  }

  return {
    start() { running = true; setup(); lastT = performance.now(); raf = requestAnimationFrame(step); },
    pause() { paused = true; },
    resume() { paused = false; lastT = performance.now(); },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      wrap.remove();
    }
  };
};
