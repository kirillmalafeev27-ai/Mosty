import * as THREE from 'three';

// ============================================================
// MOSTY — 3D balance quiz
// Lower bridge has 4 weights (one per answer). Walk onto a weight to
// remove it. Keep balance: each weight (and the player) torques the
// bridge proportional to its X distance from center. Removing the
// correct answer makes remaining wrongs pull 3x harder.
// When only the correct weight is left, time the swinging upper
// bridge so it's low + above you, then jump.
// ============================================================

// -------- DOM refs --------
const $ = id => document.getElementById(id);
const roundEl = $('round'), scoreEl = $('score'), streakEl = $('streak');
const questionEl = $('question'), hintEl = $('hint');
const tiltNeedle = $('tilt-needle'), phaseNeedle = $('phase-needle');
const overlay = $('overlay'), ovTitle = $('ov-title'), ovBody = $('ov-body');
const boot = $('boot');

// -------- Tunables --------
const LOWER_LEN = 12;
const LOWER_WID = 4.6;
const SLOTS = [-4.0, -1.4, 1.4, 4.0]; // X positions of mushrooms
const MUSHROOM_OFFSETS_Z = [-0.8, 0.8, -0.8, 0.8];
const PLAYER_MASS = 0.6;      // lighter than a mushroom (= 1) so 3 weights always out-pull the player
const PICK_RADIUS = 1.05;     // walk within this distance (XZ) to grab
const PLAYER_HEIGHT = 0.46;
const UPPER_BASE_Y = 7.0;
const UPPER_TILT_AMP = 0.40;  // radians
const UPPER_X_AMP = 2.6;      // world units
const UPPER_TILT_FREQ = 1.1;  // radians / sec
const UPPER_X_FREQ = 0.65;    // radians / sec
const JUMP_REACH = 3.4;       // max vertical clearance the jump covers
const FAIL_TILT = 1.3;        // ~74°: only kicks in if the bridge truly flips
const STATIC_MU = 0.32;       // shoes-on-metal-ish; player won't slide if tan(tilt) < this
const WALK_SPEED = 5.0;       // m/s — constant, same in every phase
// Bridge spring-damper tuning. omega_n = sqrt(K_SPRING) ≈ 3.16 rad/s → ~1s settle.
// Equilibrium tilt = imbalance * K_GRAV / K_SPRING = imbalance * 0.16.
const K_GRAV = 1.6;
const K_SPRING = 10.0;
const C_DAMP = 2.5;           // damping ratio ≈ 0.4 → slight overshoot for a punchy feel

// -------- Game state --------
const state = {
  round: 1, score: 0, streak: 0, best: 0,
  phase: 'idle', // 'idle' | 'choose' | 'jump' | 'launching' | 'win' | 'over'
  question: null,
  weights: [],
  amplify: false,
  tilt: 0, tiltVel: 0,
  playerX: 0, playerZ: 0,
  playerVX: 0, playerVZ: 0, // velocity used only during free fall
  slideVX: 0,               // drift along X caused by bridge slope
  playerY: 0, playerVY: 0,
  onBridge: true,
  jumping: false,
  launchSuccess: false,
  launchT: 0,
  cameraYaw: 0,        // orbit angle around player, controlled by RMB drag
  cameraPitch: 0.35,   // tilt up/down, controlled by RMB drag (Y)
  cameraDist: 11,
  cameraHeight: 5.5,
  upperT: Math.random() * Math.PI * 2,
  upperTilt: 0,
  upperX: 0,
  resetting: false,
  onUpper: false,
  upperLocalX: 0,
  upperLocalZ: 0,
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

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 8, 14);

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

// -------- Canyon walls --------
(function buildCanyon() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x884a26, roughness: 0.95, flatShading: true });
  const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x6e3a1c, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 22; i++) {
    const h = 18 + Math.random() * 32;
    const w = 6 + Math.random() * 6;
    const d = 6 + Math.random() * 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Math.random() > 0.5 ? wallMat : wallMat2);
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 28 + Math.random() * 18;
    m.position.set(Math.cos(angle) * dist, h / 2 - 8, Math.sin(angle) * dist);
    m.rotation.y = Math.random() * Math.PI;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
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
  new THREE.PlaneGeometry(400, 400),
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

  const floor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, width), plankMat);
  floor.castShadow = true; floor.receiveShadow = true;
  g.add(floor);

  const grid = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.92, 0.05, width * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x6e6048, roughness: 0.9 })
  );
  grid.position.y = 0.18;
  g.add(grid);

  for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, 0.3), plankMat);
    b.position.set(0, 0.1, z);
    b.castShadow = true; b.receiveShadow = true;
    g.add(b);
  }

  const postH = 1.6;
  for (const x of [-length / 2 + 0.2, length / 2 - 0.2]) {
    for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, postH, 0.25), frameMat);
      p.position.set(x, postH / 2, z);
      p.castShadow = true;
      g.add(p);
    }
  }
  for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 0.18), railMat);
    r.position.set(0, postH, z);
    r.castShadow = true;
    g.add(r);
  }
  for (let i = 0; i < 5; i++) {
    const x = -length / 2 + (i + 0.5) * (length / 5);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, width), frameMat);
    bar.position.set(x, 0.16, 0);
    bar.castShadow = true;
    g.add(bar);
  }
  return g;
}

const lowerBridge = makeBridge(LOWER_LEN, LOWER_WID);
scene.add(lowerBridge);

const upperBridge = makeBridge(LOWER_LEN, LOWER_WID);
upperBridge.position.set(0, UPPER_BASE_Y, 0);
scene.add(upperBridge);

// Cables hanging from sky to upper-bridge corners
const cableMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7 });
const cables = [];
for (const cx of [-LOWER_LEN / 2 + 0.4, LOWER_LEN / 2 - 0.4]) {
  for (const cz of [LOWER_WID / 2 - 0.2, -LOWER_WID / 2 + 0.2]) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, 16, cz),
      new THREE.Vector3(cx, UPPER_BASE_Y, cz),
    ]);
    const line = new THREE.Line(geom, cableMat);
    scene.add(line);
    cables.push({ line, lx: cx, lz: cz });
  }
}

// -------- Mushroom answer weights --------
function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 22); ctx.fill();
  ctx.strokeStyle = '#f4b942'; ctx.lineWidth = 4;
  roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 22); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 56;
  ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (ctx.measureText(text).width > c.width - 60 && size > 22) {
    size -= 4;
    ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  if (ctx.measureText(text).width > c.width - 60) {
    const words = text.split(' ');
    const half = Math.ceil(words.length / 2);
    ctx.fillText(words.slice(0, half).join(' '), c.width / 2, c.height / 2 - size * 0.55);
    ctx.fillText(words.slice(half).join(' '), c.width / 2, c.height / 2 + size * 0.55);
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
  cap.position.y = 0.7; cap.scale.y = 0.85;
  cap.castShadow = true;
  g.add(cap);
  const star = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 5),
    new THREE.MeshStandardMaterial({ color: 0xf6d52a, roughness: 0.5, emissive: 0x5a3c00 })
  );
  star.position.set(0, 0.78, 0.66);
  star.rotation.x = -0.3;
  g.add(star);
  const tex = labelTexture(`${n}. ${text}`);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
  sprite.position.y = 1.55;
  sprite.scale.set(2.6, 1.3, 1);
  sprite.renderOrder = 999;
  g.add(sprite);
  return g;
}

// -------- Player --------
const player = new THREE.Group();
const playerBody = new THREE.Mesh(
  new THREE.SphereGeometry(PLAYER_HEIGHT, 22, 16),
  new THREE.MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.45, metalness: 0.1 })
);
playerBody.castShadow = true;
playerBody.position.y = PLAYER_HEIGHT;
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
const pupL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0 }));
pupL.position.set(0.16, 0.65, 0.42); player.add(pupL);
const pupR = pupL.clone(); pupR.position.x = -0.10; player.add(pupR);
scene.add(player);

// -------- Resize --------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// -------- Round setup --------
function startRound() {
  for (const w of state.weights) lowerBridge.remove(w.mesh);
  state.weights = [];
  state.amplify = false;
  state.tilt = 0; state.tiltVel = 0;
  state.playerX = 0; state.playerZ = 0;
  state.playerVX = 0; state.playerVZ = 0;
  state.slideVX = 0;
  state.playerY = 0; state.playerVY = 0;
  state.onBridge = true; state.jumping = false;
  state.launchSuccess = false; state.launchT = 0;
  state.phase = 'choose';
  state.resetting = false;
  state.onUpper = false;
  overlay.hidden = true;

  state.question = window.pickQuestion('mix');
  questionEl.textContent = state.question.q;

  state.question.choices.forEach((text, i) => {
    const m = makeMushroom(text, i + 1);
    m.position.set(SLOTS[i], 0.35, MUSHROOM_OFFSETS_Z[i]);
    lowerBridge.add(m);
    state.weights.push({
      mesh: m,
      slot: SLOTS[i],
      zOff: MUSHROOM_OFFSETS_Z[i],
      idx: i,
      isCorrect: i === state.question.correctIndex,
      removed: false,
      fallVy: 0,
    });
  });

  updateHud();
  setHint('↑↓ или WS — идти, ←→ или AD — стрейф, ПКМ + мышь — камера. Дойди до гриба.');
}

function updateHud() {
  roundEl.textContent = state.round;
  scoreEl.textContent = state.score;
  streakEl.textContent = state.streak;
}

function setHint(text) { hintEl.textContent = text; }

// -------- Removing a weight by walking onto it --------
function maybePickup() {
  if (state.phase !== 'choose') return;
  for (const w of state.weights) {
    if (w.removed) continue;
    const dx = state.playerX - w.slot;
    const dz = state.playerZ - w.zOff;
    if (dx * dx + dz * dz < PICK_RADIUS * PICK_RADIUS) {
      removeWeight(w);
      break;
    }
  }
}

function removeWeight(w) {
  w.removed = true; w.fallVy = 0;
  Sound && Sound.tick && Sound.tick();
  if (w.isCorrect) {
    state.amplify = true;
    setHint('Это был правильный ответ! Оставшиеся тянут сильнее…');
  }
  const left = state.weights.filter(x => !x.removed);
  if (left.length === 1 && left[0].isCorrect) {
    state.phase = 'jump';
    setHint('Чисто! Жди когда верхний мост опустится над тобой и жми ПРОБЕЛ.');
  }
}

// -------- Input --------
const keys = new Set();
addEventListener('keydown', e => {
  if (state.phase === 'idle') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.key === ' ' || k === 'spacebar') {
    // Some browsers activate the last-focused button on space; drop focus first.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    tryJump();
    e.preventDefault();
  }
}, { capture: true });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// Right-mouse-button drag rotates the camera around the player.
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
let dragging = false, dragLastX = 0, dragLastY = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button === 2) {
    dragging = true;
    dragLastX = e.clientX; dragLastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  }
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - dragLastX;
  const dy = e.clientY - dragLastY;
  dragLastX = e.clientX; dragLastY = e.clientY;
  state.cameraYaw -= dx * 0.005;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + dy * 0.004, -0.15, 1.0);
});
renderer.domElement.addEventListener('pointerup', e => {
  if (e.button === 2 || dragging) {
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
    renderer.domElement.style.cursor = '';
  }
});

// -------- Jump --------
function tryJump() {
  if (state.phase !== 'jump' || state.jumping) return;
  // Compute upper bridge surface height at the player's CURRENT XZ
  const upperY = upperSurfaceYAt(state.playerX, state.playerZ);
  // Player's current world Y on top of (tilted) lower bridge
  const playerWorldY = lowerSurfaceYAt(state.playerX, state.playerZ) + PLAYER_HEIGHT;
  const gap = upperY - playerWorldY;
  const reachable = gap > 0 && gap < JUMP_REACH;
  state.jumping = true;
  state.launchT = 0;
  state.launchSuccess = reachable;
  state.playerVY = Math.sqrt(2 * 18 * (reachable ? gap + 0.3 : 1.5)); // exact apex
  Sound && Sound.rush && Sound.rush();
}

function lowerSurfaceYAt(px /* world */, pz /* world */) {
  // Bridge rotates around Z axis by state.tilt: world Y = -px * sin(tilt) (using rotation.z = -tilt convention)
  // We apply lowerBridge.rotation.z = -state.tilt below; bridge center at y=0.
  return -px * Math.sin(state.tilt) + 0.15; // 0.15 = floor half-height
}
function upperSurfaceYAt(px, pz) {
  const localX = px - state.upperX;
  // upperBridge.rotation.z = -state.upperTilt; surface Y = base - localX * sin(upperTilt) + thickness
  return UPPER_BASE_Y - localX * Math.sin(state.upperTilt) + 0.15;
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
  setHint('Чисто! Следующий мост…');
  state.resetting = true;
  setTimeout(() => startRound(), 1000);
}

// -------- Render loop --------
const clock = new THREE.Clock();
let started = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (started) update(dt);
  renderer.render(scene, camera);
}
loop();

// -------- Physics / update --------
function update(dt) {
  // === Upper bridge oscillation: seesaw tilt + lateral X drift ===
  state.upperT += dt;
  state.upperTilt = Math.sin(state.upperT * UPPER_TILT_FREQ) * UPPER_TILT_AMP;
  state.upperX = Math.sin(state.upperT * UPPER_X_FREQ + 0.7) * UPPER_X_AMP;
  upperBridge.position.x = state.upperX;
  upperBridge.position.y = UPPER_BASE_Y;
  upperBridge.rotation.z = -state.upperTilt;
  // Refresh cables to follow the moving upper bridge
  for (const cb of cables) {
    // local point on bridge transforms by its rotation+position
    const local = new THREE.Vector3(cb.lx, 0, cb.lz);
    local.applyEuler(upperBridge.rotation);
    local.x += state.upperX;
    local.y += UPPER_BASE_Y;
    cb.line.geometry.setFromPoints([
      new THREE.Vector3(cb.lx + state.upperX * 0.4, 16, cb.lz),
      local,
    ]);
  }

  // === Lower bridge tilt physics ===
  // Imbalance is the signed torque around the Z axis from each weight at slot X.
  // Sign convention: imbalance > 0 means right side (+X) is heavier; bridge should tilt so +X goes DOWN.
  //   we use lowerBridge.rotation.z = -state.tilt, so state.tilt > 0 also means +X down → consistent.
  let imbalance = 0;
  for (const w of state.weights) {
    if (w.removed) continue;
    let m = 1;
    if (state.amplify && !w.isCorrect) m = 3;
    imbalance += w.slot * m;
  }
  // Add player mass torque only when on the bridge (and not in air)
  if (state.onBridge && !state.jumping) {
    imbalance += state.playerX * PLAYER_MASS;
  }
  const torque = imbalance * K_GRAV - state.tilt * K_SPRING - state.tiltVel * C_DAMP;
  state.tiltVel += torque * dt;
  state.tilt += state.tiltVel * dt;
  lowerBridge.rotation.z = -state.tilt;

  // === Player input → 2D movement on the bridge ===
  // Forward/back: ↑/↓ or W/S. Strafe: ←/→ or A/D. Camera is rotated by RMB drag.
  let forward = 0, strafe = 0;
  if (keys.has('arrowup') || keys.has('w')) forward += 1;
  if (keys.has('arrowdown') || keys.has('s')) forward -= 1;
  if (keys.has('arrowright') || keys.has('d')) strafe += 1;
  if (keys.has('arrowleft') || keys.has('a')) strafe -= 1;

  if (state.onBridge && !state.jumping && (state.phase === 'choose' || state.phase === 'jump')) {
    // Forward / right unit vectors from current camera yaw.
    const fx = -Math.sin(state.cameraYaw), fz = -Math.cos(state.cameraYaw);
    const rx = Math.cos(state.cameraYaw),  rz = -Math.sin(state.cameraYaw);
    // Walking velocity is a CONSTANT in world space — same in every phase.
    let walkVx = (fx * forward + rx * strafe) * WALK_SPEED;
    let walkVz = (fz * forward + rz * strafe) * WALK_SPEED;
    // Normalise diagonal so combined speed == WALK_SPEED, not WALK_SPEED * sqrt(2).
    const mag = Math.hypot(walkVx, walkVz);
    if (mag > WALK_SPEED) { walkVx = walkVx / mag * WALK_SPEED; walkVz = walkVz / mag * WALK_SPEED; }

    // Slope drift along X (the slope axis). Static friction first.
    const gSin = 9.8 * Math.sin(state.tilt);
    const gCos = 9.8 * Math.cos(state.tilt);
    const grip = STATIC_MU * gCos;
    if (Math.abs(gSin) > grip) {
      const excess = (Math.abs(gSin) - grip) * Math.sign(gSin);
      state.slideVX += excess * dt;
    } else {
      // Feet hold — drift bleeds off quickly.
      state.slideVX *= Math.pow(0.05, dt * 8);
    }

    state.playerX += (walkVx + state.slideVX) * dt;
    state.playerZ += walkVz * dt;

    // Keep player within bridge width (Z) — invisible wall on the long edges.
    const halfW = LOWER_WID / 2 - 0.2;
    if (state.playerZ > halfW) state.playerZ = halfW;
    if (state.playerZ < -halfW) state.playerZ = -halfW;

    maybePickup();
  }

  // === Slide-off / fail conditions ===
  if (state.onBridge && !state.jumping) {
    if (Math.abs(state.playerX) > LOWER_LEN / 2 + 0.3) {
      state.onBridge = false;
      state.playerVY = 0.5;
      // Carry over current slide momentum so the fall is continuous.
      state.playerVX = state.slideVX + Math.sign(state.playerX) * 1.5;
      state.playerVZ = 0;
      if (state.phase === 'choose' || state.phase === 'jump') {
        fail(state.amplify ? 'Снёс правильный — мост перевесило' : 'Перевесило');
      }
    } else if (Math.abs(state.tilt) > FAIL_TILT) {
      state.onBridge = false;
      state.playerVY = 0;
      state.playerVX = state.slideVX + Math.sign(state.tilt) * 2;
      state.playerVZ = 0;
      fail('Угол стал смертельным');
    }
  }

  // === Jump arc ===
  if (state.jumping) {
    state.launchT += dt;
    state.playerVY -= 18 * dt;
    state.playerY += state.playerVY * dt;

    if (state.launchSuccess) {
      // While in the air, also drift to follow the moving upper-bridge target X
      // so the player visually arcs toward where it currently is.
      const targetUpY = upperSurfaceYAt(state.playerX, state.playerZ);
      // Smoothly nudge player X toward upper bridge X projection (so the arc lands)
      const desiredX = THREE.MathUtils.lerp(state.playerX, state.upperX + (state.playerX - state.upperX) * 0.6, dt * 1.6);
      state.playerX = desiredX;
      // Snap when player rises to the (current) upper bridge surface
      const playerWorldY = lowerSurfaceYAt(state.playerX, state.playerZ) + PLAYER_HEIGHT + state.playerY;
      if (playerWorldY >= targetUpY + PLAYER_HEIGHT && state.playerVY <= 0) {
        // Land on upper bridge — switch frame so we follow its ongoing motion
        state.onBridge = false;
        state.onUpper = true;
        state.upperLocalX = state.playerX - state.upperX;
        state.upperLocalZ = state.playerZ;
        state.playerVY = 0; state.playerY = 0;
        state.jumping = false;
        win();
      }
    }
    // Land back on the lower bridge
    if (state.playerY <= 0 && state.playerVY < 0) {
      state.playerY = 0; state.playerVY = 0;
      state.jumping = false;
      if (state.phase === 'jump' && !state.launchSuccess) {
        fail('Не дотянул — верхний мост был слишком далеко');
      }
    }
  }

  // === Free fall after sliding off ===
  if (!state.onBridge) {
    state.playerVY -= 18 * dt;
    state.playerY += state.playerVY * dt;
    state.playerX += state.playerVX * dt;
    state.playerZ += state.playerVZ * dt;
  }

  // === Mushroom fall animation for removed ones ===
  for (const w of state.weights) {
    if (!w.removed) continue;
    if (w.mesh.visible) {
      w.fallVy -= 18 * dt;
      w.mesh.position.y += w.fallVy * dt;
      w.mesh.rotation.x += dt * 4;
      w.mesh.rotation.z += dt * 3;
      if (w.mesh.position.y < -20) w.mesh.visible = false;
    }
  }

  // === Place player in world ===
  let px, py, pz;
  if (state.onUpper) {
    // Player rides on the upper bridge (post-success): follow its current transform
    const local = new THREE.Vector3(state.upperLocalX, PLAYER_HEIGHT + 0.15, state.upperLocalZ);
    local.applyEuler(upperBridge.rotation);
    local.x += state.upperX;
    local.y += UPPER_BASE_Y;
    px = local.x; py = local.y; pz = local.z;
  } else if (state.onBridge && !state.jumping) {
    const local = new THREE.Vector3(state.playerX, PLAYER_HEIGHT + 0.15, state.playerZ);
    local.applyEuler(lowerBridge.rotation);
    px = local.x; py = local.y; pz = local.z;
  } else {
    // In air or fallen: world coords directly
    px = state.playerX;
    py = lowerSurfaceYAt(state.playerX, state.playerZ) + PLAYER_HEIGHT + state.playerY;
    pz = state.playerZ;
  }
  player.position.set(px, py, pz);
  // Lean with whichever bridge is supporting the player
  if (state.onUpper) player.rotation.z = state.upperTilt * 0.5;
  else player.rotation.z = (state.onBridge && !state.jumping) ? -state.tilt * 0.5 : 0;
  // Face the forward direction
  player.rotation.y = state.cameraYaw + Math.PI;

  // === Camera orbit around player (yaw + pitch from RMB drag) ===
  const flatDist = state.cameraDist * Math.cos(state.cameraPitch);
  const camTargetX = px + Math.sin(state.cameraYaw) * flatDist;
  const camTargetZ = pz + Math.cos(state.cameraYaw) * flatDist;
  const camTargetY = py + state.cameraHeight + state.cameraDist * Math.sin(state.cameraPitch);
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 5);
  camera.position.z += (camTargetZ - camera.position.z) * Math.min(1, dt * 5);
  camera.lookAt(px, py + 0.4, pz);

  // === HUD meters ===
  const tiltPct = THREE.MathUtils.clamp(state.tilt / FAIL_TILT, -1, 1);
  tiltNeedle.style.left = (50 + tiltPct * 50) + '%';
  const danger = Math.abs(tiltPct);
  tiltNeedle.style.background = `rgb(${244 + (255 - 244) * danger},${185 - 100 * danger},${66 - 60 * danger})`;
  tiltNeedle.style.boxShadow = `0 0 ${6 + 14 * danger}px rgba(255,${180 - 100 * danger},80,0.9)`;
  // Phase needle: how reachable is the upper bridge RIGHT NOW above the player?
  const upY = upperSurfaceYAt(state.playerX, state.playerZ);
  const myY = lowerSurfaceYAt(state.playerX, state.playerZ) + PLAYER_HEIGHT;
  const gap = upY - myY;
  // Normalised: 0 = unreachably high (gap≥6), 1 = very close (gap≤1.5)
  const reach01 = THREE.MathUtils.clamp(1 - (gap - 1.5) / 4.5, 0, 1);
  phaseNeedle.style.left = (reach01 * 100) + '%';

  // Subtle water shimmer
  water.material.color.setHSL(0.58, 0.55, 0.27 + 0.02 * Math.sin(state.upperT * 1.7));
}

// -------- Boot --------
$('start').addEventListener('click', e => {
  e.currentTarget.blur();
  Sound && Sound.set && Sound.set(true);
  boot.hidden = true;
  started = true;
  startRound();
});
$('ov-restart').addEventListener('click', e => {
  e.currentTarget.blur();
  state.score = 0; state.round = 1;
  startRound();
});
