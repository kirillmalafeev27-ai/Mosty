import * as THREE from 'three';

// ============================================================
// MOSTY — 3D balance quiz
// Lower bridge has 4 weights (one per answer). Remove 3 wrongs,
// keep balance, then time the upper bridge swing to jump up.
// ============================================================

// -------- DOM refs --------
const $ = id => document.getElementById(id);
const roundEl = $('round'), scoreEl = $('score'), streakEl = $('streak');
const questionEl = $('question'), hintEl = $('hint');
const tiltNeedle = $('tilt-needle'), phaseNeedle = $('phase-needle'), phaseOk = $('phase-ok');
const overlay = $('overlay'), ovTitle = $('ov-title'), ovBody = $('ov-body');
const boot = $('boot');

// -------- Game state --------
const state = {
  round: 1, score: 0, streak: 0, best: 0,
  phase: 'idle', // 'idle' | 'choose' | 'jump' | 'falling' | 'win' | 'over'
  question: null,
  weights: [],
  amplify: false,         // true if correct answer was wrongly removed
  tilt: 0, tiltVel: 0,    // radians around bridge length axis (Z)
  failTilt: 1.05,         // ~60deg — past this, player slides off
  playerX: 0, playerVX: 0,
  playerY: 0, playerVY: 0,
  onBridge: true,
  jumping: false,
  upperSwing: Math.random() * Math.PI * 2,
  jumpedAt: -1,
  launching: false,
  launchT: 0,
  launchSuccess: false,
};

// -------- Three.js setup --------
const root = $('scene-root');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9a6b4a);
scene.fog = new THREE.Fog(0x9a6b4a, 35, 140);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 6, 14);
camera.lookAt(0, 3, 0);

// -------- Lights --------
const sun = new THREE.DirectionalLight(0xffe1b3, 1.6);
sun.position.set(18, 32, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xc7d6ff, 0x6b3a1a, 0.55));
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// -------- Canyon walls (background blocks) --------
(function buildCanyon() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x884a26, roughness: 0.95, flatShading: true });
  const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x6e3a1c, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const h = 18 + Math.random() * 32;
    const w = 6 + Math.random() * 6;
    const d = 6 + Math.random() * 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Math.random() > 0.5 ? wallMat : wallMat2);
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 28 + Math.random() * 18;
    m.position.set(Math.cos(angle) * dist, h / 2 - 8, Math.sin(angle) * dist);
    m.rotation.y = Math.random() * Math.PI;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  // Distant cylinders like the screenshots
  for (let i = 0; i < 5; i++) {
    const h = 22 + Math.random() * 16;
    const r = 3 + Math.random() * 2;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 14), wallMat);
    const a = -0.8 + (i / 5) * 1.6;
    m.position.set(Math.cos(a) * 42, h / 2 - 6, -38 + Math.sin(a) * 6);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
})();

// -------- Water --------
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x214a6b, roughness: 0.35, metalness: 0.4 })
);
water.rotation.x = -Math.PI / 2;
water.position.y = -12;
water.receiveShadow = true;
scene.add(water);

// -------- Bridges --------
const PLANK_YELLOW = 0xf2b430;
const FRAME_GREEN = 0x2d6a3f;
const RAIL_DARK = 0x1d4a2a;

function makeBridge(length, width) {
  const g = new THREE.Group();
  const plankMat = new THREE.MeshStandardMaterial({ color: PLANK_YELLOW, roughness: 0.85 });
  const frameMat = new THREE.MeshStandardMaterial({ color: FRAME_GREEN, roughness: 0.6, metalness: 0.25 });
  const railMat = new THREE.MeshStandardMaterial({ color: RAIL_DARK, roughness: 0.7, metalness: 0.3 });

  // floor: yellow chunky planks
  const floor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, width), plankMat);
  floor.position.y = 0;
  floor.castShadow = true; floor.receiveShadow = true;
  g.add(floor);

  // mesh-grid pattern strip on top (just decoration)
  const grid = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.92, 0.05, width * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x6e6048, roughness: 0.9 })
  );
  grid.position.y = 0.18;
  g.add(grid);

  // yellow side borders
  for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, 0.3), plankMat);
    b.position.set(0, 0.1, z);
    b.castShadow = true; b.receiveShadow = true;
    g.add(b);
  }

  // green frame: top rails along the length + 4 corner posts
  const postH = 1.6;
  for (const x of [-length / 2 + 0.2, length / 2 - 0.2]) {
    for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, postH, 0.25), frameMat);
      p.position.set(x, postH / 2, z);
      p.castShadow = true;
      g.add(p);
    }
  }
  // top rails
  for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 0.18), railMat);
    r.position.set(0, postH, z);
    r.castShadow = true;
    g.add(r);
  }
  // green diagonal crossbars on the floor (decoration like screenshots)
  for (let i = 0; i < 5; i++) {
    const x = -length / 2 + (i + 0.5) * (length / 5);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, width), frameMat);
    bar.position.set(x, 0.16, 0);
    bar.castShadow = true;
    g.add(bar);
  }

  return g;
}

// Lower bridge — playable
const LOWER_LEN = 11;
const LOWER_WID = 4.4;
const lowerBridge = makeBridge(LOWER_LEN, LOWER_WID);
lowerBridge.position.set(0, 0, 0);
scene.add(lowerBridge);

// Upper bridge — oscillates vertically (rises and falls), like a swinging level above
const upperBridge = makeBridge(LOWER_LEN, LOWER_WID);
upperBridge.position.set(0, 6, 0);
scene.add(upperBridge);

// Cables from sky to upper bridge corners — visual swing reference
const cableMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7 });
const cables = [];
for (const x of [-LOWER_LEN / 2 + 0.4, LOWER_LEN / 2 - 0.4]) {
  for (const z of [LOWER_WID / 2 - 0.2, -LOWER_WID / 2 + 0.2]) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 14, z),
      new THREE.Vector3(x, 6, z),
    ]);
    const line = new THREE.Line(geom, cableMat);
    scene.add(line);
    cables.push({ line, x, z });
  }
}

// -------- Weights (mushroom answers) --------
function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 22);
  ctx.fill();
  ctx.strokeStyle = '#f4b942';
  ctx.lineWidth = 4;
  roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 22);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 56;
  ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (ctx.measureText(text).width > c.width - 60 && size > 22) {
    size -= 4;
    ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  // Two-line fallback
  if (ctx.measureText(text).width > c.width - 60) {
    const words = text.split(' ');
    const half = Math.ceil(words.length / 2);
    const l1 = words.slice(0, half).join(' ');
    const l2 = words.slice(half).join(' ');
    ctx.fillText(l1, c.width / 2, c.height / 2 - size * 0.55);
    ctx.fillText(l2, c.width / 2, c.height / 2 + size * 0.55);
  } else {
    ctx.fillText(text, c.width / 2, c.height / 2);
  }
  return new THREE.CanvasTexture(c);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeMushroom(text, n) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 0.7, 14),
    new THREE.MeshStandardMaterial({ color: 0xf1ecd6, roughness: 0.85 })
  );
  stem.position.y = 0.35;
  stem.castShadow = true; stem.receiveShadow = true;
  g.add(stem);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd13a3a, roughness: 0.65 })
  );
  cap.position.y = 0.7;
  cap.scale.y = 0.85;
  cap.castShadow = true;
  g.add(cap);
  // yellow star on the cap (a simple flat disc)
  const star = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 5),
    new THREE.MeshStandardMaterial({ color: 0xf6d52a, roughness: 0.5, emissive: 0x5a3c00 })
  );
  star.position.set(0, 0.78, 0.66);
  star.rotation.x = -0.3;
  g.add(star);

  // label sprite above
  const tex = labelTexture(`${n}. ${text}`);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
  sprite.position.y = 1.55;
  sprite.scale.set(2.6, 1.3, 1);
  sprite.renderOrder = 999;
  g.add(sprite);

  // make the mushroom group raycastable as a unit
  g.userData.pickable = true;
  return g;
}

// -------- Player --------
const player = new THREE.Group();
const playerBody = new THREE.Mesh(
  new THREE.SphereGeometry(0.46, 22, 16),
  new THREE.MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.45, metalness: 0.1 })
);
playerBody.castShadow = true;
playerBody.position.y = 0.46;
player.add(playerBody);
const playerBelly = new THREE.Mesh(
  new THREE.SphereGeometry(0.30, 18, 12),
  new THREE.MeshStandardMaterial({ color: 0xf4d6a8, roughness: 0.7 })
);
playerBelly.position.set(0, 0.36, 0.22);
playerBelly.scale.set(1, 0.9, 0.6);
player.add(playerBelly);
const playerEyeL = new THREE.Mesh(
  new THREE.SphereGeometry(0.11, 10, 8),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);
playerEyeL.position.set(0.13, 0.65, 0.34);
player.add(playerEyeL);
const playerEyeR = playerEyeL.clone(); playerEyeR.position.x = -0.13; player.add(playerEyeR);
const pupL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0x000 }));
pupL.position.set(0.16, 0.65, 0.42); player.add(pupL);
const pupR = pupL.clone(); pupR.position.x = -0.10; player.add(pupR);
scene.add(player);

// -------- Window resize --------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// -------- Round setup --------
const SLOTS = [-3.7, -1.3, 1.3, 3.7]; // X positions of weights along the bridge

function startRound() {
  // clear old weights
  for (const w of state.weights) lowerBridge.remove(w.mesh);
  state.weights = [];
  state.amplify = false;
  state.tilt = 0; state.tiltVel = 0;
  state.playerX = 0; state.playerVX = 0;
  state.playerY = 0; state.playerVY = 0;
  state.onBridge = true; state.jumping = false; state.jumpedAt = -1;
  state.phase = 'choose';
  overlay.hidden = true;

  state.question = window.pickQuestion('mix');
  questionEl.textContent = state.question.q;

  state.question.choices.forEach((text, i) => {
    const m = makeMushroom(text, i + 1);
    m.position.set(SLOTS[i], 0.35, (i % 2 === 0 ? -0.6 : 0.6));
    lowerBridge.add(m);
    state.weights.push({
      mesh: m,
      slot: SLOTS[i],
      idx: i,
      isCorrect: i === state.question.correctIndex,
      removed: false,
      fallVy: 0,
    });
  });

  updateHud();
  setHint('Снимай ТРИ неверных груза. Один за раз. Следи за наклоном.');
}

function updateHud() {
  roundEl.textContent = state.round;
  scoreEl.textContent = state.score;
  streakEl.textContent = state.streak;
}

function setHint(text) {
  hintEl.textContent = text;
}

// -------- Removing a weight --------
function tryRemove(idx) {
  if (state.phase !== 'choose') return;
  const w = state.weights[idx];
  if (!w || w.removed) return;
  w.removed = true;
  w.fallVy = 0;
  Sound && Sound.tick && Sound.tick();
  if (w.isCorrect) {
    // Catastrophic: remaining wrongs amplify their pull
    state.amplify = true;
    setHint('Это был правильный ответ. Оставшиеся грузы тянут сильнее.');
  }
  // Check if 3 wrongs gone (i.e. only the correct one remains)
  const left = state.weights.filter(x => !x.removed);
  if (left.length === 1 && left[0].isCorrect) {
    state.phase = 'jump';
    setHint('Беги к высокой стороне и прыгай в зелёную зону фазы! [Пробел]');
  } else if (left.length === 0) {
    // Should not happen — but just in case
    fail('Сняты все грузы');
  }
}

// -------- Input --------
const keys = new Set();
addEventListener('keydown', e => {
  if (state.phase === 'idle' || state.phase === 'win' || state.phase === 'over') return;
  keys.add(e.key.toLowerCase());
  if (e.key === ' ') { tryJump(); e.preventDefault(); }
  if (['1', '2', '3', '4'].includes(e.key)) tryRemove(parseInt(e.key, 10) - 1);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', e => {
  if (state.phase !== 'choose') return;
  const r = renderer.domElement.getBoundingClientRect();
  const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const my = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera({ x: mx, y: my }, camera);
  const pickables = state.weights.filter(w => !w.removed).map(w => w.mesh);
  const hits = raycaster.intersectObjects(pickables, true);
  if (hits.length) {
    let obj = hits[0].object;
    while (obj && !obj.userData.pickable) obj = obj.parent;
    if (obj) {
      const found = state.weights.find(w => w.mesh === obj);
      if (found) tryRemove(found.idx);
    }
  }
});

// -------- Jump --------
function tryJump() {
  if (state.phase !== 'jump' || state.jumping || state.launching || !state.onBridge) return;
  // Sample upper bridge's CURRENT height. Player commits at this instant.
  const upY = state.upperY;
  const reachable = upY <= 5.0; // ~bottom 30% of swing → "close enough" to leap
  state.launching = true;
  state.launchT = 0;
  state.launchSuccess = reachable;
  state.jumping = true;
  state.playerVY = 9.0;
  Sound && Sound.rush && Sound.rush();
}

// -------- Failure / success --------
function fail(reason) {
  if (state.phase === 'over' || state.phase === 'win') return;
  state.phase = 'over';
  state.best = Math.max(state.best, state.streak);
  state.streak = 0;
  Sound && Sound.crash && Sound.crash();
  setTimeout(() => {
    ovTitle.textContent = 'Соскользнул';
    ovBody.textContent = `${reason}. Очки: ${state.score}. Лучшая серия: ${state.best}.`;
    overlay.hidden = false;
  }, 700);
}

function win() {
  if (state.phase === 'win' || state.phase === 'over') return;
  state.phase = 'win';
  state.score += 100 + state.streak * 25;
  state.streak += 1;
  state.round += 1;
  state.best = Math.max(state.best, state.streak);
  updateHud();
  Sound && Sound.good && Sound.good();
  setHint('Чисто! Готовим следующий мост…');
  setTimeout(() => startRound(), 950);
}

// -------- Physics loop --------
let lastT = performance.now();
let started = false;
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (!started) { renderer.render(scene, camera); return; }
  update(dt);
  renderer.render(scene, camera);
}
loop();

function update(dt) {
  // -------- Upper bridge oscillation (vertical) --------
  // The upper bridge bobs up and down. When it's LOW, it's close to the player → jumpable.
  // When it's HIGH, the jump can't reach it.
  state.upperSwing += dt * 1.3;
  const UP_MID = 6.0;
  const UP_AMP = 2.2;
  const upperY = UP_MID + Math.sin(state.upperSwing) * UP_AMP; // 3.8 .. 8.2
  state.upperY = upperY;
  upperBridge.position.y = upperY;
  // Small lateral sway for visual life (does not affect gameplay)
  upperBridge.rotation.z = Math.sin(state.upperSwing * 0.9) * 0.06;
  // Stretch cables to follow bridge
  for (const cb of cables) {
    const pts = [new THREE.Vector3(cb.x, 14, cb.z), new THREE.Vector3(cb.x, upperY, cb.z)];
    cb.line.geometry.setFromPoints(pts);
  }
  // Phase needle: needle position tracks normalised upper Y (0 = low/close, 1 = high/far).
  const phase01 = (upperY - (UP_MID - UP_AMP)) / (UP_AMP * 2);
  phaseNeedle.style.left = (phase01 * 100) + '%';
  // The CSS green OK zone sits at left 0..30% so it matches the "low" portion.

  // -------- Lower bridge tilt physics --------
  // Imbalance: sum of (slot_position * effective_mass) for remaining weights.
  let imbalance = 0;
  let remaining = 0;
  for (const w of state.weights) {
    if (w.removed) continue;
    let m = 1;
    if (state.amplify && !w.isCorrect) m = 3; // wrongs pull harder once correct was removed
    imbalance += w.slot * m;
    remaining++;
  }
  // Torque from gravity = imbalance * g_factor; spring tries to return to level; damping.
  const K_GRAV = 0.45;
  const K_SPRING = 1.5; // small spring keeps bridge stable when balanced
  const C_DAMP = 1.6;
  const torque = imbalance * K_GRAV - state.tilt * K_SPRING - state.tiltVel * C_DAMP;
  state.tiltVel += torque * dt;
  state.tilt += state.tiltVel * dt;

  // Apply tilt to lower bridge mesh (around Z so X-ends rise/fall)
  lowerBridge.rotation.z = state.tilt;

  // -------- Player physics on (or off) the bridge --------
  // Movement input
  let move = 0;
  if (keys.has('arrowleft') || keys.has('a')) move -= 1;
  if (keys.has('arrowright') || keys.has('d')) move += 1;
  const walkSpeed = state.phase === 'jump' ? 5.4 : 3.2;

  if (state.onBridge && !state.jumping) {
    // Slide accel due to bridge tilt: gravity component along tilted surface
    // Tilt > 0 means +X end goes up, so player slides toward -X (down the slope).
    // The slope angle around Z is `state.tilt`; sliding accel = -g * sin(tilt) (toward -X when tilt > 0).
    // Wait — rotation.z positive in three.js: with right-hand rule about +Z, +X rotates toward +Y.
    // So tilt > 0 raises +X end. Player slides toward -X.
    const slideAccel = -9.8 * Math.sin(state.tilt) * 0.85;
    state.playerVX += slideAccel * dt;
    state.playerVX += move * walkSpeed * dt * 4;
    // Friction
    state.playerVX *= Math.pow(0.78, dt * 60);
    state.playerX += state.playerVX * dt;
  }

  // Slide off?
  if (Math.abs(state.playerX) > LOWER_LEN / 2 + 0.3 && state.onBridge) {
    state.onBridge = false;
    state.playerVY = 0.5;
    state.playerVX = Math.sign(state.playerX) * 2.5;
    state.phase === 'jump' || state.phase === 'choose' ? fail('Перевесило') : null;
  }

  // Past fail tilt → also forced off
  if (Math.abs(state.tilt) > state.failTilt && state.onBridge) {
    state.onBridge = false;
    state.playerVY = 0;
    state.playerVX = Math.sign(state.tilt) * -3;
    fail('Угол стал смертельным');
  }

  // Jump physics
  if (state.jumping) {
    state.launchT += dt;
    if (state.launchSuccess) {
      // Successful jump: arc up onto the upper bridge.
      // Boost vy as needed so the apex lands at the upper bridge height (state.upperY).
      state.playerVY -= 18 * dt;
      state.playerY += state.playerVY * dt;
      // When player reaches the (frozen-low) upper bridge height, attach.
      const targetY = Math.max(state.upperY - 0.46, 4.5);
      if (state.playerY >= targetY - 0.4) {
        // Snap onto upper bridge
        state.jumping = false;
        state.launching = false;
        state.playerY = targetY;
        // Brief pause then win
        if (state.phase === 'jump') win();
      }
    } else {
      // Failed jump: shorter arc; on landing back, slide off and game over.
      state.playerVY -= 22 * dt;
      state.playerY += state.playerVY * dt;
      if (state.playerY <= 0 && state.playerVY < 0) {
        state.playerY = 0; state.playerVY = 0;
        state.jumping = false;
        state.launching = false;
        if (state.phase === 'jump') fail('Не поймал фазу — мост был слишком высоко');
      }
    }
  }

  // Falling off the world
  if (!state.onBridge) {
    state.playerVY -= 18 * dt;
    state.playerY += state.playerVY * dt;
    state.playerX += state.playerVX * dt;
  }

  // Falling weights
  for (const w of state.weights) {
    if (!w.removed) continue;
    if (w.mesh.visible) {
      w.fallVy = (w.fallVy ?? 0) - 18 * dt;
      w.mesh.position.y += w.fallVy * dt;
      w.mesh.rotation.x += dt * 4;
      w.mesh.rotation.z += dt * 3;
      if (w.mesh.position.y < -20) w.mesh.visible = false;
    }
  }

  // -------- Place player relative to (tilted) bridge --------
  const local = new THREE.Vector3(state.playerX, 0.46 + state.playerY, 0);
  if (state.onBridge && !state.jumping) local.applyEuler(lowerBridge.rotation);
  local.add(lowerBridge.position);
  player.position.copy(local);
  // Lean the player with the bridge a bit while standing
  player.rotation.z = (state.onBridge && !state.jumping) ? state.tilt * 0.8 : Math.sign(state.tilt) * 0.3;
  player.rotation.y = move * 0.2;

  // -------- Camera follow --------
  const targetCamX = state.playerX * 0.4;
  const targetCamY = 6 + Math.abs(state.tilt) * 1.5 + state.playerY * 0.4;
  camera.position.x += (targetCamX - camera.position.x) * Math.min(1, dt * 4);
  camera.position.y += (targetCamY - camera.position.y) * Math.min(1, dt * 4);
  camera.position.z = 14;
  camera.lookAt(state.playerX * 0.5, 3 + state.playerY * 0.5, 0);

  // -------- HUD meters --------
  const tiltPct = THREE.MathUtils.clamp(state.tilt / state.failTilt, -1, 1);
  tiltNeedle.style.left = (50 + tiltPct * 50) + '%';
  // Color shift
  const danger = Math.abs(tiltPct);
  tiltNeedle.style.background = `rgb(${244 + (255 - 244) * danger},${185 - 100 * danger},${66 - 60 * danger})`;
  tiltNeedle.style.boxShadow = `0 0 ${6 + 14 * danger}px rgba(255,${180 - 100 * danger},80,0.9)`;

  // Adjust water shimmer (subtle)
  water.material.color.setHSL(0.58, 0.55, 0.27 + 0.02 * Math.sin(state.upperSwing * 1.7));
}

// -------- Boot --------
$('start').addEventListener('click', () => {
  Sound && Sound.set && Sound.set(true);
  boot.hidden = true;
  started = true;
  startRound();
});
$('ov-restart').addEventListener('click', () => {
  state.score = 0; state.round = 1;
  startRound();
});
