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
if (roundEl.previousElementSibling) roundEl.previousElementSibling.textContent = 'Мост';

// -------- Tunables --------
const LOWER_LEN = 12;
const LOWER_WID = 4.6;
const SLOTS = [-4.0, -1.4, 1.4, 4.0]; // X positions of mushrooms
const MUSHROOM_OFFSETS_Z = [-0.8, 0.8, -0.8, 0.8];
const PLAYER_MASS = 0.6;      // lighter than a mushroom (= 1) so 3 weights always out-pull the player
const PICK_RADIUS = 1.05;     // walk within this distance (XZ) to grab
const PLAYER_HEIGHT = 0.46;
const VISIBLE_BRIDGES = 8;    // rolling stack: current bridge + several future bridges
const UPPER_BASE_Y = 6.2;
const FLOOR_HEIGHT = UPPER_BASE_Y;
const UPPER_TILT_AMP = 0.40;  // radians
const UPPER_X_AMP = 2.6;      // world units
const UPPER_TILT_FREQ = 1.1;  // radians / sec
const UPPER_X_FREQ = 0.65;    // radians / sec
const JUMP_REACH = 5.55;      // max vertical clearance; center jumps should not reach the next bridge
const MIN_LAUNCH_LIFT = 0.35; // current bridge must lift the player's feet this much above its center
const MIN_LAUNCH_EDGE_X = 2.2; // player must commit to a side before jumping upward
const FAIL_TILT = 1.3;        // ~74°: only kicks in if the bridge truly flips
const STATIC_MU = 0.32;       // shoes-on-metal-ish; player won't slide if tan(tilt) < this
const UPHILL_CLIMB_SPEED = 2.2; // guaranteed climb when walking against a steep slope
const WALK_SPEED = 5.0;       // m/s — constant, same in every phase
const GAP_JUMP_SPEED = 6.6;   // short hop across missing bridge sections
const GAP_JUMP_VY = 6.4;
const NARROW_BRIDGE_HALF_WIDTH = 0.48;
const ICE_HALF_WIDTH = 0.45;
const ICE_MOVE_AMP = 1.15;
const ICE_MOVE_SPEED = 0.22;  // very slow side-to-side drift
const PLAYER_LOAD_FOLLOW_RATE = 0.7; // low-pass player torque so the bridge lags behind quick side swaps
// Bridge spring-damper tuning. omega_n = sqrt(K_SPRING) ≈ 1.84 rad/s → heavier, slower seesaw.
// Equilibrium tilt = imbalance * K_GRAV / K_SPRING = imbalance * 0.16.
const K_GRAV = 0.55;
const K_SPRING = 3.4;
const C_DAMP = 1.5;           // damping ratio ≈ 0.4 → keeps the slow response from feeling sticky

const BRIDGE_TYPES = [
  'plain',
  'rocking',
  'missingOne',
  'missingTwoPairs',
  'wind',
  'biased',
  'ice',
  'narrow',
  'variedMass',
  'anchor',
  'multiCorrect',
  'sequence',
  'anti',
  'memory',
  'pairs',
  'bird',
  'rockfall',
];

const QUESTION_BRIDGE_TYPES = new Set([
  'multiCorrect',
  'sequence',
  'anti',
  'memory',
  'pairs',
]);

const MOVING_JUMP_BRIDGE_TYPES = new Set([
  'missingOne',
  'missingTwoPairs',
  'narrow',
]);

const BRIDGE_TYPE_LABELS = {
  plain: 'обычный мост',
  rocking: 'качающийся мост',
  missingOne: 'нет одной секции настила',
  missingTwoPairs: 'две секции настила сняты, грибы сгруппированы',
  wind: 'ветер без перил',
  biased: 'смещенный центр тяжести',
  ice: 'ледяная полоса',
  narrow: 'узкое горло',
  variedMass: 'грибы разной массы',
  anchor: 'якорный гриб',
  multiCorrect: 'несколько правильных',
  sequence: 'цепочка',
  anti: 'анти-вопрос',
  memory: 'вопрос исчезнет',
  pairs: 'парные грибы',
  bird: 'пикирующая птица',
  rockfall: 'камнепад',
};

function bridgeTypeFor(floor) {
  return BRIDGE_TYPES[(floor - 1) % BRIDGE_TYPES.length];
}

function isQuestionBridge(bridge) {
  return QUESTION_BRIDGE_TYPES.has(bridge.type);
}

function canUseMovingJump(bridge) {
  return bridge && MOVING_JUMP_BRIDGE_TYPES.has(bridge.type);
}

function floorBaseY(floor = state.round) {
  return (floor - 1) * FLOOR_HEIGHT;
}

// -------- Game state --------
const state = {
  round: 1, score: 0, streak: 0, best: 0,
  phase: 'idle', // 'idle' | 'choose' | 'jump' | 'launching' | 'win' | 'over'
  question: null,
  weights: [],
  amplify: false,
  tilt: 0, tiltVel: 0,
  playerX: 0, playerZ: 0,
  playerLoadX: 0,            // delayed X used for player torque on the bridge
  playerVX: 0, playerVZ: 0, // velocity used only during free fall
  slideVX: 0,               // drift along X caused by bridge slope
  playerY: 0, playerVY: 0,
  jumpStartX: 0, jumpStartZ: 0, jumpWorldX: 0, jumpWorldZ: 0, jumpBaseY: 0,
  jumpMode: 'none',
  jumpLocalVX: 0,
  jumpLocalVZ: 0,
  pickupGrace: 0,
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
let renderer = null;
let rendererError = null;

function initRenderer() {
  if (renderer) return true;
  rendererError = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    root.appendChild(renderer.domElement);
    bindRendererInput();
    return true;
  } catch (err) {
    renderer = null;
    rendererError = err;
    console.error('WebGL renderer failed to start', err);
    return false;
  }
}

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

function rememberPartTransform(part) {
  part.userData.defaultPosition = part.position.clone();
  part.userData.defaultScale = part.scale.clone();
}

function resetPartTransform(part) {
  if (!part.userData.defaultPosition || !part.userData.defaultScale) return;
  part.position.copy(part.userData.defaultPosition);
  part.scale.copy(part.userData.defaultScale);
}

function makeBridge(length, width) {
  const g = new THREE.Group();
  const plankMat = new THREE.MeshStandardMaterial({ color: PLANK_YELLOW, roughness: 0.85 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6e6048, roughness: 0.9 });
  const frameMat = new THREE.MeshStandardMaterial({ color: FRAME_GREEN, roughness: 0.6, metalness: 0.25 });
  const railMat = new THREE.MeshStandardMaterial({ color: RAIL_DARK, roughness: 0.7, metalness: 0.3 });

  g.userData.rails = [];
  g.userData.posts = [];
  g.userData.sideBoards = [];
  g.userData.bars = [];
  g.userData.deckSections = [];

  const sectionCount = 5;
  const sectionPitch = length / sectionCount;
  const sectionLen = sectionPitch - 0.14;
  for (let i = 0; i < sectionCount; i++) {
    const x = -length / 2 + (i + 0.5) * sectionPitch;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(sectionLen, 0.3, width), plankMat);
    floor.position.x = x;
    floor.castShadow = true; floor.receiveShadow = true;
    rememberPartTransform(floor);
    g.add(floor);

    const grid = new THREE.Mesh(
      new THREE.BoxGeometry(sectionLen * 0.86, 0.05, width * 0.7),
      deckMat
    );
    grid.position.set(x, 0.18, 0);
    grid.receiveShadow = true;
    rememberPartTransform(grid);
    g.add(grid);

    g.userData.deckSections.push({ floor, grid, x, halfLen: sectionLen / 2 });
  }

  for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, 0.3), plankMat);
    b.position.set(0, 0.1, z);
    b.castShadow = true; b.receiveShadow = true;
    rememberPartTransform(b);
    g.add(b);
    g.userData.sideBoards.push(b);
  }

  const postH = 1.6;
  for (const x of [-length / 2 + 0.2, length / 2 - 0.2]) {
    for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, postH, 0.25), frameMat);
      p.position.set(x, postH / 2, z);
      p.castShadow = true;
      rememberPartTransform(p);
      g.add(p);
      g.userData.posts.push(p);
    }
  }
  for (const z of [width / 2 - 0.15, -width / 2 + 0.15]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 0.18), railMat);
    r.position.set(0, postH, z);
    r.castShadow = true;
    rememberPartTransform(r);
    g.add(r);
    g.userData.rails.push(r);
  }
  for (let i = 0; i < 5; i++) {
    const x = -length / 2 + (i + 0.5) * (length / 5);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, width), frameMat);
    bar.position.set(x, 0.16, 0);
    bar.castShadow = true;
    rememberPartTransform(bar);
    g.add(bar);
    g.userData.bars.push(bar);
  }
  return g;
}

const bridges = [];
function createBridge(floor) {
  const i = floor - 1;
  const group = makeBridge(LOWER_LEN, LOWER_WID);
  group.position.y = floorBaseY(floor);
  scene.add(group);
  const bridge = {
    group,
    floor,
    baseY: floorBaseY(floor),
    type: bridgeTypeFor(floor),
    question: null,
    weights: [],
    decor: [],
    amplify: false,
    done: false,
    scored: false,
    tilt: 0,
    tiltVel: 0,
    playerLoadX: 0,
    wobbleT: Math.random() * Math.PI * 2,
    wobbleFreq: 0.75 + Math.random() * 0.35,
    driftT: Math.random() * Math.PI * 2,
    driftAmp: UPPER_X_AMP * Math.min(1.15, 0.55 + i * 0.08),
    driftFreq: UPPER_X_FREQ * (0.85 + i * 0.09),
    lockedX: 0,
    biasTorque: 0,
    windDir: 0,
    windT: Math.random() * 5,
    iceT: Math.random() * Math.PI * 2,
    iceZone: null,
    idleT: 0,
    birdCooldown: 0,
    bird: null,
    rocks: [],
    mode: 'default',
    sequenceIndex: 0,
    memoryTimer: 0,
    landingGrace: 0,
  };
  bridges.push(bridge);
  addBridgeCables(bridge);
  return bridge;
}

function activeBridge() {
  return ensureBridge(state.round);
}

function nextBridge() {
  return ensureBridge(state.round + 1);
}

function ensureBridge(floor) {
  let bridge = bridges.find(item => item.floor === floor);
  if (!bridge) {
    bridge = createBridge(floor);
    if (started) setupBridgeQuestion(bridge);
  }
  return bridge;
}

function pruneOldBridges() {
  const minFloor = Math.max(1, state.round - 2);
  for (let i = bridges.length - 1; i >= 0; i--) {
    const bridge = bridges[i];
    if (bridge.floor >= minFloor) continue;
    scene.remove(bridge.group);
    for (let c = cables.length - 1; c >= 0; c--) {
      if (cables[c].bridge !== bridge) continue;
      scene.remove(cables[c].line);
      cables.splice(c, 1);
    }
    bridges.splice(i, 1);
  }
}

// Cables hanging above each stacked bridge
const cableMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7 });
const cables = [];
function addBridgeCables(bridge) {
  for (const cx of [-LOWER_LEN / 2 + 0.4, LOWER_LEN / 2 - 0.4]) {
    for (const cz of [LOWER_WID / 2 - 0.2, -LOWER_WID / 2 + 0.2]) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, bridge.baseY + FLOOR_HEIGHT * 0.78, cz),
        new THREE.Vector3(cx, bridge.baseY, cz),
      ]);
      const line = new THREE.Line(geom, cableMat);
      scene.add(line);
      cables.push({ bridge, line, lx: cx, lz: cz });
    }
  }
}

for (let floor = 1; floor <= VISIBLE_BRIDGES; floor++) {
  createBridge(floor);
}

// Side landings make the tower structure readable as separate floors.
const floorMarkerMat = new THREE.MeshStandardMaterial({ color: 0x4d3c2d, roughness: 0.9 });
const floorMarkerActiveMat = new THREE.MeshStandardMaterial({ color: 0xf4b942, roughness: 0.72, emissive: 0x3a2500 });
const floorMarkerDoneMat = new THREE.MeshStandardMaterial({ color: 0x5ce58a, roughness: 0.72, emissive: 0x12351d });
const floorMarkers = [];
(function buildFloorMarkers() {
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3a2d24, roughness: 0.92 });
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, FLOOR_HEIGHT * (VISIBLE_BRIDGES - 1) + 1.4, 0.35),
    shaftMat
  );
  shaft.position.set(-8.4, FLOOR_HEIGHT * (VISIBLE_BRIDGES - 1) / 2, -3.2);
  shaft.castShadow = true; shaft.receiveShadow = true;
  scene.add(shaft);

  for (let i = 1; i <= VISIBLE_BRIDGES; i++) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 1.0), floorMarkerMat);
    marker.position.set(-8.4, floorBaseY(i), -3.2);
    marker.castShadow = true; marker.receiveShadow = true;
    scene.add(marker);
    floorMarkers.push(marker);
  }
})();

// -------- Mushroom answer weights --------
function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 34); ctx.fill();
  ctx.strokeStyle = '#f4b942'; ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 34); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const maxWidth = c.width - 96;
  const fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  let size = 82;
  let lines = [];
  while (size >= 34) {
    ctx.font = `bold ${size}px ${fontFamily}`;
    lines = wrapLabelText(ctx, text, maxWidth, 3);
    if (lines.length <= 3 && lines.every(line => ctx.measureText(line).width <= maxWidth)) break;
    ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
    size -= 4;
  }

  if (!lines.length) lines = [String(text || '')];
  ctx.font = `bold ${size}px ${fontFamily}`;
  const lineHeight = size * 1.12;
  const startY = c.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, c.width / 2, startY + i * lineHeight);
  });
  return new THREE.CanvasTexture(c);
}
function wrapLabelText(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (ctx.measureText(line).width > maxWidth) {
      line = fitSingleWord(ctx, line, maxWidth);
    }
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    let tail = `${lines[lines.length - 1]}...`;
    while (ctx.measureText(tail).width > maxWidth && tail.length > 4) {
      tail = `${tail.slice(0, -4)}...`;
    }
    lines[lines.length - 1] = tail;
  }
  return lines;
}
function fitSingleWord(ctx, word, maxWidth) {
  let fitted = String(word || '');
  while (ctx.measureText(fitted).width > maxWidth && fitted.length > 4) {
    fitted = `${fitted.slice(0, -4)}...`;
  }
  return fitted;
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
  sprite.position.y = 1.78;
  sprite.scale.set(3.7, 1.85, 1);
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
  if (renderer) renderer.setSize(innerWidth, innerHeight);
});

addEventListener('pagehide', () => {
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss && renderer.forceContextLoss();
});

// -------- Tower setup --------
const zoneMaterials = {
  gap: new THREE.MeshStandardMaterial({ color: 0x0b0704, roughness: 1, transparent: true, opacity: 0.72 }),
  ice: new THREE.MeshStandardMaterial({ color: 0x88d8ff, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.72 }),
  wind: new THREE.MeshStandardMaterial({ color: 0xdcefff, roughness: 0.4, transparent: true, opacity: 0.55 }),
  narrow: new THREE.MeshStandardMaterial({ color: 0x342414, roughness: 0.9, transparent: true, opacity: 0.8 }),
  bias: new THREE.MeshStandardMaterial({ color: 0x4d3424, roughness: 0.9 }),
  warning: new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.5 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x4f4a43, roughness: 0.95, flatShading: true }),
  bird: new THREE.MeshStandardMaterial({ color: 0x19120e, roughness: 0.8, flatShading: true }),
};

function clearBridgeDecor(bridge) {
  for (const item of bridge.decor) bridge.group.remove(item);
  bridge.decor = [];
  const parts = bridge.group.userData;
  for (const part of [...parts.rails, ...parts.posts, ...parts.sideBoards, ...parts.bars]) {
    part.visible = true;
    resetPartTransform(part);
  }
  for (const section of parts.deckSections || []) {
    section.floor.visible = true;
    section.grid.visible = true;
    resetPartTransform(section.floor);
    resetPartTransform(section.grid);
  }
  if (parts.grid) parts.grid.visible = true;
  if (parts.floor) parts.floor.scale.z = 1;
}

function addDeckZone(bridge, x, z, w, d, material, y = 0.34) {
  const zone = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), material);
  zone.position.set(x, y, z);
  zone.receiveShadow = true;
  bridge.group.add(zone);
  bridge.decor.push(zone);
  return zone;
}

function randomDeckSectionIndices(parts, count) {
  if (count === 1 && parts.deckSections.length >= 5) {
    return [shuffle([1, 2, 3])[0]];
  }
  if (count === 2 && parts.deckSections.length >= 5) {
    return [1, 3];
  }
  return [...parts.deckSections.keys()]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .sort((a, b) => a - b);
}

function removeDeckSection(bridge, index) {
  const parts = bridge.group.userData;
  const section = parts.deckSections[index];
  if (!section) return;

  section.floor.visible = false;
  section.grid.visible = false;
  if (parts.bars[index]) parts.bars[index].visible = false;

  bridge.missingSectionIndices.push(index);
  bridge.missingSections.push({
    x: section.x,
    xMin: section.x - section.halfLen,
    xMax: section.x + section.halfLen,
  });
  bridge.missingX.push(section.x);
  addDeckZone(bridge, section.x, 0, section.halfLen * 2, LOWER_WID - 0.45, zoneMaterials.gap, 0.05);
}

function visibleDeckSections(bridge) {
  const missing = new Set(bridge.missingSectionIndices || []);
  return bridge.group.userData.deckSections.filter((_, index) => !missing.has(index));
}

function isOnMissingDeckGap(bridge, x, z) {
  if (!bridge.missingSections || !bridge.missingSections.length) return false;
  const centralDeckHalfWidth = LOWER_WID / 2 - 0.55;
  return bridge.missingSections.some(section =>
    x >= section.xMin
    && x <= section.xMax
    && Math.abs(z) < centralDeckHalfWidth
  );
}

function safeDeckXNear(bridge, x, z) {
  const clampedX = THREE.MathUtils.clamp(x, -LOWER_LEN / 2 + 0.35, LOWER_LEN / 2 - 0.35);
  if (!isOnMissingDeckGap(bridge, clampedX, z)) return clampedX;

  const missing = new Set(bridge.missingSectionIndices || []);
  const candidates = [];
  for (const [index, section] of bridge.group.userData.deckSections.entries()) {
    if (missing.has(index)) continue;
    candidates.push(THREE.MathUtils.clamp(
      clampedX,
      section.x - section.halfLen + 0.25,
      section.x + section.halfLen - 0.25
    ));
  }
  return candidates.sort((a, b) => Math.abs(a - clampedX) - Math.abs(b - clampedX))[0] ?? clampedX;
}

function missingBridgeSlots(bridge) {
  if (bridge.type === 'missingTwoPairs') return [-4.0, -0.45, 0.45, 4.0];
  const missingIndex = bridge.missingSectionIndices?.[0];
  return missingIndex === 2 ? [-4.0, -1.4, 1.4, 4.0] : [-4.0, -0.8, 0.8, 4.0];
}

function makeBridgeVisuallyNarrow(bridge, halfWidth) {
  const parts = bridge.group.userData;
  const targetWidth = halfWidth * 2;
  const scaleZ = targetWidth / LOWER_WID;
  const edgeZ = halfWidth;

  for (const section of parts.deckSections || []) {
    section.floor.scale.z = scaleZ;
    section.grid.scale.z = scaleZ;
  }
  for (const bar of parts.bars) bar.scale.z = scaleZ;

  for (const part of [...parts.sideBoards, ...parts.rails, ...parts.posts]) {
    const side = Math.sign(part.userData.defaultPosition?.z || part.position.z) || 1;
    part.position.z = side * edgeZ;
  }
}

function applyBridgeVariant(bridge) {
  const parts = bridge.group.userData;
  bridge.category = isQuestionBridge(bridge) ? 'question' : 'physical';
  bridge.mode = 'default';
  bridge.biasTorque = 0;
  bridge.windDir = 0;
  bridge.noRails = false;
  bridge.iceBand = null;
  bridge.iceZone = null;
  bridge.narrowZone = null;
  bridge.longJump = false;
  bridge.missingX = [];
  bridge.missingSections = [];
  bridge.missingSectionIndices = [];
  bridge.sequenceIndex = 0;
  bridge.memoryTimer = 0;
  bridge.lastMovementT = 0;
  bridge.birdCooldown = 0;
  bridge.rocks = [];
  bridge.landingGrace = 0;

  if (bridge.type === 'missingOne') {
    for (const index of randomDeckSectionIndices(parts, 1)) removeDeckSection(bridge, index);
  } else if (bridge.type === 'missingTwoPairs') {
    for (const index of randomDeckSectionIndices(parts, 2)) removeDeckSection(bridge, index);
  } else if (bridge.type === 'wind') {
    bridge.noRails = true;
    bridge.windDir = Math.random() < 0.5 ? -1 : 1;
    for (const part of [...parts.rails, ...parts.posts, ...parts.sideBoards]) part.visible = false;
    addDeckZone(bridge, 0, bridge.windDir * (LOWER_WID / 2 + 0.25), LOWER_LEN, 0.3, zoneMaterials.wind, 0.55);
  } else if (bridge.type === 'biased') {
    bridge.biasTorque = (Math.random() < 0.5 ? -1 : 1) * 1.2;
    const side = Math.sign(bridge.biasTorque);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), zoneMaterials.bias);
    crate.position.set(side * 4.7, 0.6, -1.45);
    crate.castShadow = true;
    bridge.group.add(crate);
    bridge.decor.push(crate);
  } else if (bridge.type === 'ice') {
    bridge.iceT = Math.random() * Math.PI * 2;
    bridge.iceBand = { centerZ: 0, halfWidth: ICE_HALF_WIDTH, zMin: -ICE_HALF_WIDTH, zMax: ICE_HALF_WIDTH };
    bridge.iceZone = addDeckZone(bridge, 0, 0, LOWER_LEN - 0.9, ICE_HALF_WIDTH * 2, zoneMaterials.ice, 0.38);
  } else if (bridge.type === 'narrow') {
    bridge.narrowZone = { halfWidth: NARROW_BRIDGE_HALF_WIDTH };
    bridge.longJump = true;
    makeBridgeVisuallyNarrow(bridge, NARROW_BRIDGE_HALF_WIDTH);
  } else if (bridge.type === 'anchor') {
    bridge.mode = 'anchor';
  } else if (bridge.type === 'multiCorrect') {
    bridge.mode = 'multiCorrect';
  } else if (bridge.type === 'sequence') {
    bridge.mode = 'sequence';
  } else if (bridge.type === 'anti') {
    bridge.mode = 'anti';
  } else if (bridge.type === 'memory') {
    bridge.mode = 'memory';
    bridge.memoryTimer = 4;
  } else if (bridge.type === 'pairs') {
    bridge.mode = 'pairs';
  } else if (bridge.type === 'bird') {
    bridge.mode = 'bird';
    const bird = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), zoneMaterials.bird);
    bird.rotation.z = -Math.PI / 2;
    bird.position.set(-6, 3.2, 0);
    bird.visible = false;
    bird.castShadow = true;
    bridge.group.add(bird);
    bridge.decor.push(bird);
    bridge.bird = bird;
  } else if (bridge.type === 'rockfall') {
    bridge.mode = 'rockfall';
    bridge.rockTimer = 2.5;
  }
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function makeQuestionForBridge(bridge) {
  if (!isQuestionBridge(bridge)) {
    const question = window.pickQuestion('mix', { floor: bridge.floor, type: bridge.type });
    question.correctSet = new Set([question.correctIndex]);
    return question;
  }

  if (bridge.type === 'sequence') {
    const numbers = shuffle([2, 5, 8, 11, 14, 17]).slice(0, 4).sort((a, b) => a - b);
    const choices = shuffle(numbers.map(String));
    return {
      q: 'Цепочка: снимай числа по возрастанию.',
      choices,
      correctIndex: -1,
      sequence: numbers.map(String),
      correctSet: new Set(choices.map((_, i) => i)),
    };
  }

  if (bridge.type === 'pairs') {
    const choices = shuffle([
      { text: 'Франция - Париж', correct: true },
      { text: 'Япония - Токио', correct: true },
      { text: 'Бразилия - Мадрид', correct: false },
      { text: 'Египет - Берлин', correct: false },
    ]);
    return {
      q: 'Пары: сними неподходящие страна-столица.',
      choices: choices.map(item => item.text),
      correctIndex: choices.findIndex(item => item.correct),
      correctSet: new Set(choices.map((item, i) => item.correct ? i : -1).filter(i => i >= 0)),
    };
  }

  const question = window.pickQuestion('mix', { floor: bridge.floor, type: bridge.type });
  const correctSet = new Set([question.correctIndex]);

  if (bridge.type === 'multiCorrect') {
    const extra = question.choices.findIndex((_, i) => i !== question.correctIndex);
    if (extra >= 0) correctSet.add(extra);
    question.q = `Множественный правильный: оставь 2 ответа. ${question.q}`;
  } else if (bridge.type === 'anti') {
    question.q = `Анти-вопрос: сними все неправильные, правильный оставь. ${question.q}`;
  } else if (bridge.type === 'memory') {
    question.q = `Запомни за 4 секунды: ${question.q}`;
  }

  question.correctSet = correctSet;
  return question;
}

function setupBridgeQuestion(bridge) {
  for (const w of bridge.weights) bridge.group.remove(w.mesh);
  bridge.weights = [];
  clearBridgeDecor(bridge);
  bridge.type = bridgeTypeFor(bridge.floor);
  applyBridgeVariant(bridge);
  bridge.question = makeQuestionForBridge(bridge);
  bridge.amplify = false;
  bridge.done = false;
  bridge.scored = false;
  bridge.tilt = 0;
  bridge.tiltVel = 0;
  bridge.playerLoadX = 0;
  bridge.wobbleT = Math.random() * Math.PI * 2;
  bridge.driftT = Math.random() * Math.PI * 2;
  bridge.lockedX = bridge.floor === 1 ? 0 : Math.sin(bridge.driftT) * bridge.driftAmp;
  bridge.group.position.set(bridge.lockedX, bridge.baseY, 0);
  bridge.group.rotation.set(0, 0, 0);

  let slots = [...SLOTS];
  let zOffsets = [...MUSHROOM_OFFSETS_Z];
  if (bridge.type === 'missingOne') {
    slots = missingBridgeSlots(bridge);
    zOffsets = [0, 0, 0, 0];
  } else if (bridge.type === 'missingTwoPairs') {
    slots = missingBridgeSlots(bridge);
    zOffsets = [-0.55, -0.55, 0.55, 0.55];
  } else if (bridge.type === 'narrow') {
    slots = [-4.1, -1.4, 1.4, 4.1];
    zOffsets = [0, 0, 0, 0];
  }

  const anchorIndex = bridge.type === 'anchor' ? Math.floor(Math.random() * bridge.question.choices.length) : -1;
  bridge.sequenceOrder = bridge.question.sequence || [];

  bridge.question.choices.forEach((text, i) => {
    const mass = bridge.type === 'variedMass'
      ? [0.5, 1, 2, 1][i]
      : 1;
    const m = makeMushroom(text, i + 1);
    if (bridge.type === 'variedMass') m.scale.setScalar(mass === 2 ? 1.35 : mass === 0.5 ? 0.75 : 1);
    m.position.set(slots[i], 0.35, zOffsets[i]);
    if (i === anchorIndex) {
      const nail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 })
      );
      nail.position.y = 0.55;
      nail.rotation.z = Math.PI / 2;
      m.add(nail);
    }
    bridge.group.add(m);
    bridge.weights.push({
      mesh: m,
      slot: slots[i],
      zOff: zOffsets[i],
      idx: i,
      text,
      isCorrect: bridge.question.correctSet ? bridge.question.correctSet.has(i) : i === bridge.question.correctIndex,
      mass,
      anchor: i === anchorIndex,
      checked: false,
      removed: false,
      fallVy: 0,
    });
  });
  bridge.massOrder = bridge.weights
    .filter(w => !w.isCorrect)
    .sort((a, b) => (a.mass || 1) - (b.mass || 1))
    .map(w => w.idx);
}

function syncQuestionHud() {
  const bridge = activeBridge();
  state.question = bridge.question;
  state.weights = bridge.weights;
  state.amplify = bridge.amplify;
  const label = BRIDGE_TYPE_LABELS[bridge.type] || bridge.type;
  questionEl.textContent = `Мост ${state.round}: ${label} [${bridge.category === 'question' ? 'задание' : 'препятствие'}]. ${bridge.question.q}`;
  if (window.playQuizAudio) window.playQuizAudio(bridge.question);
}

function startRound() {
  for (const bridge of bridges) setupBridgeQuestion(bridge);
  state.round = 1;
  state.amplify = false;
  state.tilt = 0; state.tiltVel = 0;
  state.playerX = 0; state.playerZ = 0;
  state.playerLoadX = 0;
  state.playerVX = 0; state.playerVZ = 0;
  state.slideVX = 0;
  state.playerY = 0; state.playerVY = 0;
  state.jumpStartX = 0; state.jumpStartZ = 0; state.jumpWorldX = 0; state.jumpWorldZ = 0; state.jumpBaseY = 0;
  state.jumpMode = 'none'; state.jumpLocalVX = 0; state.jumpLocalVZ = 0;
  state.pickupGrace = 0;
  state.onBridge = true; state.jumping = false;
  state.launchSuccess = false; state.launchT = 0;
  state.phase = 'choose';
  state.resetting = false;
  state.onUpper = false;
  overlay.hidden = true;

  syncQuestionHud();
  updateHud();
  updateFloorMarkers();
  setHint(`Сними три неверных ответа. ${bridgeControlsHint(activeBridge())}`);
}

function updateHud() {
  roundEl.textContent = state.round;
  scoreEl.textContent = state.score;
  streakEl.textContent = state.streak;
}

function updateFloorMarkers(completedCurrent = false) {
  floorMarkers.forEach((marker, i) => {
    const floor = state.round + i;
    const bridge = bridges.find(item => item.floor === floor);
    marker.position.y = floorBaseY(floor);
    marker.material = bridge?.done || (completedCurrent && floor === state.round)
      ? floorMarkerDoneMat
      : floor === state.round
        ? floorMarkerActiveMat
        : floorMarkerMat;
  });
}

function setHint(text) { hintEl.textContent = text; }

function bridgeControlsHint(bridge) {
  return canUseMovingJump(bridge)
    ? 'На этом мосту движение + пробел = короткий прыжок, пробел без движения = прыжок вверх после очистки.'
    : 'На этом мосту пробел нужен только для прыжка вверх после очистки.';
}

// -------- Removing a weight by walking onto it --------
function maybePickup() {
  if (state.phase !== 'choose') return;
  if (state.pickupGrace > 0) return;
  const bridge = activeBridge();
  const pickRadius = bridge.type === 'narrow' ? 0.72 : PICK_RADIUS;
  for (const w of state.weights) {
    if (w.removed) continue;
    const dx = state.playerX - w.slot;
    const dz = state.playerZ - w.zOff;
    if (dx * dx + dz * dz < pickRadius * pickRadius) {
      removeWeight(w);
      break;
    }
  }
}

function removeWeight(w) {
  const bridge = activeBridge();
  if (w.removed) return;
  Sound && Sound.tick && Sound.tick();

  if (bridge.mode === 'sequence') {
    const expected = bridge.sequenceOrder[bridge.sequenceIndex];
    if (w.text !== expected) {
      bridge.tiltVel += Math.sign(w.slot || 1) * 1.2;
      setHint(`Ошибка в цепочке. Сейчас нужен: ${expected}. Мост дернуло.`);
      return;
    }
    w.removed = true; w.fallVy = 0;
    bridge.sequenceIndex += 1;
    setHint(bridge.sequenceIndex >= bridge.sequenceOrder.length
      ? 'Цепочка собрана. Ищи поднятый край для прыжка.'
      : `Верно. Следующий в цепочке: ${bridge.sequenceOrder[bridge.sequenceIndex]}.`);
  } else if (w.anchor) {
    w.checked = true;
    if (!w.isCorrect) {
      bridge.tiltVel += Math.sign(w.slot || 1) * 0.8;
      setHint('Якорный неправильный ответ засчитан, но гриб остается тянуть мост вниз.');
    } else {
      setHint('Этот якорный гриб правильный: его надо оставить.');
    }
  } else {
    if (bridge.type === 'variedMass' && !w.isCorrect) {
      const nextIdx = bridge.massOrder.find(idx => {
        const item = bridge.weights.find(candidate => candidate.idx === idx);
        return item && !item.removed;
      });
      if (w.idx !== nextIdx) {
        bridge.tiltVel += Math.sign(w.slot || 1) * 1.0;
        setHint('Не тот порядок масс: сначала снимай меньшие грибы. Мост наказал наклоном.');
        return;
      }
    }

    w.removed = true; w.fallVy = 0;
    if (w.isCorrect) {
      bridge.amplify = true;
      state.amplify = true;
      setHint('Это был правильный ответ! Оставшиеся тянут сильнее…');
    }
  }

  if (bridgeReadyToJump(bridge)) {
    if (!nextBridge()) {
      finishTower();
      return;
    }
    state.phase = 'jump';
    setHint(canUseMovingJump(bridge)
      ? 'Чисто! Встань на поднятый край: пробел без движения прыгает вверх, движение + пробел делает короткий прыжок.'
      : 'Чисто! Встань на поднятый край и нажми пробел, чтобы прыгнуть вверх.');
  }
}

function bridgeReadyToJump(bridge) {
  if (bridge.mode === 'sequence') return bridge.sequenceIndex >= bridge.sequenceOrder.length;

  const wrongsHandled = bridge.weights.every(w =>
    w.isCorrect || w.removed || (w.anchor && w.checked)
  );
  const correctLeft = bridge.weights.some(w => w.isCorrect && !w.removed);
  return wrongsHandled && correctLeft;
}

// -------- Input --------
const keys = new Set();

function movementInput() {
  let forward = 0, strafe = 0;
  if (keys.has('arrowup') || keys.has('w')) forward += 1;
  if (keys.has('arrowdown') || keys.has('s')) forward -= 1;
  if (keys.has('arrowright') || keys.has('d')) strafe += 1;
  if (keys.has('arrowleft') || keys.has('a')) strafe -= 1;
  return { forward, strafe };
}

function localMoveVelocity(forward, strafe, speed) {
  const fx = -Math.sin(state.cameraYaw), fz = -Math.cos(state.cameraYaw);
  const rx = Math.cos(state.cameraYaw),  rz = -Math.sin(state.cameraYaw);
  let vx = (fx * forward + rx * strafe) * speed;
  let vz = (fz * forward + rz * strafe) * speed;
  const mag = Math.hypot(vx, vz);
  if (mag > speed) { vx = vx / mag * speed; vz = vz / mag * speed; }
  return { vx, vz };
}

addEventListener('keydown', e => {
  if (state.phase === 'idle') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.key === ' ' || k === 'spacebar') {
    // Some browsers activate the last-focused button on space; drop focus first.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!tryGapJump()) tryJump();
    e.preventDefault();
  }
}, { capture: true });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// Right-mouse-button drag rotates the camera around the player.
let dragging = false, dragLastX = 0, dragLastY = 0;
function bindRendererInput() {
  if (!renderer || renderer.domElement.dataset.inputBound) return;
  renderer.domElement.dataset.inputBound = '1';
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
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
}

// -------- Jump --------
function tryGapJump() {
  const bridge = activeBridge();
  if (!canUseMovingJump(bridge)) return false;
  if (!state.onBridge || state.jumping || (state.phase !== 'choose' && state.phase !== 'jump')) return false;

  const { forward, strafe } = movementInput();
  if (Math.hypot(forward, strafe) < 0.1) return false;

  const { vx, vz } = localMoveVelocity(forward, strafe, GAP_JUMP_SPEED);
  state.jumping = true;
  state.jumpMode = 'gap';
  state.launchSuccess = false;
  state.jumpLocalVX = vx + state.slideVX * 0.25;
  state.jumpLocalVZ = vz;
  state.playerVY = GAP_JUMP_VY;
  state.playerY = 0;
  state.jumpBaseY = bridgeSurfaceYAt(bridge, state.playerX, state.playerZ);
  setHint(bridge.type === 'narrow'
    ? 'Прыжок с движением: перелети гриб и держи узкую линию.'
    : 'Прыжок с движением: держи направление, пока летишь.');
  Sound && Sound.rush && Sound.rush();
  return true;
}

function tryJump() {
  if (state.phase !== 'jump' || state.jumping) return;
  if (!nextBridge()) return;
  const launchBridge = activeBridge();
  const jumpWorldX = bridgeWorldXFromLocal(launchBridge, state.playerX);
  const upperY = upperSurfaceYAt(jumpWorldX, state.playerZ);
  const launchSurfaceY = lowerSurfaceYAt(state.playerX, state.playerZ);
  const playerWorldY = launchSurfaceY + PLAYER_HEIGHT;
  const gap = upperY - playerWorldY;
  const launchLift = launchSurfaceY - (launchBridge.baseY + 0.15);
  const raisedEdgeLaunch = Math.abs(state.playerX) >= MIN_LAUNCH_EDGE_X && launchLift >= MIN_LAUNCH_LIFT;
  const jumpReach = JUMP_REACH + (launchBridge.longJump ? 0.7 : 0);
  const reachable = raisedEdgeLaunch && gap > 0 && gap < jumpReach;
  state.jumping = true;
  state.jumpMode = 'upper';
  state.launchT = 0;
  state.launchSuccess = reachable;
  state.jumpStartX = state.playerX;
  state.jumpStartZ = state.playerZ;
  state.jumpWorldX = jumpWorldX;
  state.jumpWorldZ = state.playerZ;
  state.jumpBaseY = launchSurfaceY;
  state.jumpLocalVX = 0;
  state.jumpLocalVZ = 0;
  // Need player CENTER to rise above (upper surface + PLAYER_HEIGHT) so the
  // feet actually land on the bridge instead of clipping into it. Add a bit
  // of headroom on top so the descent has time to trigger landing detection.
  const apexAboveLaunch = reachable ? (gap + PLAYER_HEIGHT + 0.4) : 1.6;
  state.playerVY = Math.sqrt(2 * 18 * apexAboveLaunch);
  Sound && Sound.rush && Sound.rush();
}

function lowerSurfaceYAt(px /* world */, pz /* world */) {
  return bridgeSurfaceYAt(activeBridge(), px, pz);
}
function upperSurfaceYAt(px, pz) {
  const bridge = nextBridge();
  return bridge ? bridgeSurfaceYAtWorld(bridge, px, pz) : lowerSurfaceYAt(px, pz);
}
function bridgeSurfaceYAt(bridge, px, pz) {
  return bridge.baseY - px * Math.sin(bridge.tilt) + 0.15; // 0.15 = floor half-height
}
function bridgeSurfaceYAtWorld(bridge, worldX, pz) {
  return bridgeSurfaceYAt(bridge, localXForWorldXOnBridge(bridge, worldX), pz);
}
function bridgeWorldXFromLocal(bridge, localX) {
  const yLocal = PLAYER_HEIGHT + 0.15;
  return bridge.group.position.x + localX * Math.cos(bridge.tilt) + yLocal * Math.sin(bridge.tilt);
}
function localXForWorldXOnBridge(bridge, worldX) {
  const yLocal = PLAYER_HEIGHT + 0.15;
  const cos = Math.max(0.2, Math.cos(bridge.tilt));
  return (worldX - bridge.group.position.x - yLocal * Math.sin(bridge.tilt)) / cos;
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

function awardBridge(bridge) {
  if (bridge.scored) return;
  bridge.scored = true;
  bridge.done = true;
  state.score += 100 + state.streak * 25;
  state.streak += 1;
  state.best = Math.max(state.best, state.streak);
  Sound && Sound.good && Sound.good();
  updateHud();
  updateFloorMarkers();
}

function finishTower() {
  if (state.phase === 'win' || state.phase === 'over') return;
  awardBridge(activeBridge());
  state.phase = 'win';
  setHint('Башня из мостов пройдена! Все задания закрыты.');
  setTimeout(() => {
    ovTitle.textContent = 'Все мосты пройдены';
    ovBody.textContent = `Финальный счет: ${state.score}. Серия: ${state.streak}.`;
    overlay.hidden = false;
  }, 700);
}

function landOnNextBridge(landingLocalX) {
  const clearedBridge = activeBridge();
  const targetBridge = nextBridge();
  if (!targetBridge) {
    finishTower();
    return;
  }

  awardBridge(clearedBridge);
  targetBridge.lockedX = targetBridge.group.position.x;
  if (targetBridge.missingSections?.length) {
    targetBridge.tilt = THREE.MathUtils.clamp(targetBridge.tilt, -0.18, 0.18);
    targetBridge.tiltVel *= 0.15;
    targetBridge.group.rotation.z = -targetBridge.tilt;
  }
  const safeLandingX = safeDeckXNear(targetBridge, landingLocalX, state.playerZ);
  state.playerX = THREE.MathUtils.clamp(safeLandingX, -LOWER_LEN / 2 + 0.25, LOWER_LEN / 2 - 0.25);
  state.round += 1;
  state.phase = 'choose';
  state.onBridge = true;
  state.onUpper = false;
  state.jumping = false;
  state.jumpMode = 'none';
  state.jumpLocalVX = 0;
  state.jumpLocalVZ = 0;
  state.launchSuccess = false;
  state.playerLoadX = state.playerX;
  targetBridge.playerLoadX = state.playerX;
  state.slideVX = 0;
  targetBridge.landingGrace = targetBridge.missingSections?.length ? 1.2 : 0.8;
  syncQuestionHud();
  ensureBridge(state.round + VISIBLE_BRIDGES - 1);
  pruneOldBridges();
  updateHud();
  updateFloorMarkers();
  setHint(`Ты на следующем мосту. Он продолжает качаться — снимай неверные ответы. ${bridgeControlsHint(targetBridge)}`);
}

// -------- Render loop --------
const clock = new THREE.Clock();
let started = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (started) update(dt);
  if (renderer) renderer.render(scene, camera);
}
loop();

// -------- Physics / update --------
function bridgeWeightStats(bridge) {
  let imbalance = 0;
  let loadSpan = 0;
  for (const w of bridge.weights) {
    if (w.removed) continue;
    let m = w.mass || 1;
    if (bridge.amplify && !w.isCorrect) m = 3;
    imbalance += w.slot * m;
    loadSpan += Math.abs(w.slot) * m;
  }
  imbalance += bridge.biasTorque || 0;
  return { imbalance, loadSpan };
}

function updateBridgePhysics(bridge, dt, isActive) {
  bridge.windT += dt;
  if (isActive) {
    bridge.group.position.x = bridge.lockedX;
  } else {
    bridge.driftT += dt;
    bridge.group.position.x = Math.sin(bridge.driftT * bridge.driftFreq) * bridge.driftAmp;
  }

  const stats = bridgeWeightStats(bridge);
  let imbalance = stats.imbalance;

  if (isActive && state.onBridge && !state.jumping) {
    const loadFollow = 1 - Math.exp(-PLAYER_LOAD_FOLLOW_RATE * dt);
    bridge.playerLoadX += (state.playerX - bridge.playerLoadX) * loadFollow;
    state.playerLoadX = bridge.playerLoadX;
    imbalance += bridge.playerLoadX * PLAYER_MASS;
  }

  bridge.wobbleT += dt;
  const massAmp = Math.min(0.34, stats.loadSpan * 0.018 + Math.abs(stats.imbalance) * 0.012);
  const wobbleAmp = bridge.type === 'rocking' ? 0.08 + massAmp : 0;
  const wobbleTarget = Math.sin(bridge.wobbleT * bridge.wobbleFreq) * wobbleAmp;
  const torque = imbalance * K_GRAV - (bridge.tilt - wobbleTarget) * K_SPRING - bridge.tiltVel * C_DAMP;
  bridge.tiltVel += torque * dt;
  bridge.tilt += bridge.tiltVel * dt;
  bridge.group.position.y = bridge.baseY;
  bridge.group.rotation.z = -bridge.tilt;
}

function spawnRock(bridge) {
  const x = THREE.MathUtils.randFloat(-LOWER_LEN / 2 + 1.0, LOWER_LEN / 2 - 1.0);
  const z = THREE.MathUtils.randFloat(-LOWER_WID / 2 + 0.6, LOWER_WID / 2 - 0.6);
  const warning = new THREE.Mesh(new THREE.CircleGeometry(0.65, 24), zoneMaterials.warning);
  warning.rotation.x = -Math.PI / 2;
  warning.position.set(x, 0.44, z);
  bridge.group.add(warning);

  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), zoneMaterials.rock);
  rock.position.set(x, 5.2, z);
  rock.castShadow = true;
  bridge.group.add(rock);
  bridge.rocks.push({ x, z, warning, rock, warnT: 1.5, falling: false });
}

function updateIceBand(bridge, dt) {
  if (!bridge.iceBand) return;
  bridge.iceT += dt * ICE_MOVE_SPEED;
  const centerZ = Math.sin(bridge.iceT) * ICE_MOVE_AMP;
  bridge.iceBand.centerZ = centerZ;
  bridge.iceBand.zMin = centerZ - bridge.iceBand.halfWidth;
  bridge.iceBand.zMax = centerZ + bridge.iceBand.halfWidth;
  if (bridge.iceZone) bridge.iceZone.position.z = centerZ;
}

function updateBridgeHazards(bridge, dt, moveIntent) {
  updateIceBand(bridge, dt);

  if (bridge.mode === 'memory' && bridge.memoryTimer > 0) {
    bridge.memoryTimer -= dt;
    if (bridge.memoryTimer <= 0 && bridge === activeBridge()) {
      questionEl.textContent = `Мост ${state.round}: вопрос исчез. Играй по памяти.`;
    }
  }

  if (bridge.mode === 'bird' && bridge === activeBridge() && state.onBridge && !state.jumping) {
    bridge.idleT = moveIntent < 0.08 ? (bridge.idleT || 0) + dt : 0;
    if (bridge.bird) {
      bridge.bird.visible = bridge.idleT > 2.0;
      bridge.bird.position.x = -6 + Math.min(1, Math.max(0, bridge.idleT - 2.0)) * 6;
      bridge.bird.position.z = state.playerZ;
    }
    if (bridge.idleT > 3.0) {
      state.playerX = bridgeWorldXFromLocal(bridge, state.playerX);
      state.onBridge = false;
      state.playerVX = 0;
      state.playerVZ = 3;
      state.playerVY = 0.3;
      fail('Птица сбила тебя, потому что ты стоял на месте');
    }
  }

  if (bridge.mode === 'rockfall') {
    bridge.rockTimer -= dt;
    if (bridge.rockTimer <= 0) {
      spawnRock(bridge);
      bridge.rockTimer = THREE.MathUtils.randFloat(3.0, 5.0);
    }
    for (const item of bridge.rocks) {
      if (item.warnT > 0) {
        item.warnT -= dt;
        item.warning.material.opacity = 0.25 + 0.35 * Math.sin(state.upperT * 18) ** 2;
        if (item.warnT <= 0) {
          item.falling = true;
          bridge.group.remove(item.warning);
        }
      } else if (item.falling) {
        item.rock.position.y -= 8.5 * dt;
        item.rock.rotation.x += dt * 5;
        item.rock.rotation.z += dt * 4;
        if (bridge === activeBridge() && state.onBridge && !state.jumping) {
          const hit = Math.hypot(state.playerX - item.x, state.playerZ - item.z) < 0.7 && item.rock.position.y < 1.2;
          if (hit) fail('Камень попал сверху');
        }
        if (item.rock.position.y < -2) {
          item.falling = false;
          bridge.group.remove(item.rock);
        }
      }
    }
    bridge.rocks = bridge.rocks.filter(item => item.falling || item.warnT > 0);
  }
}

function update(dt) {
  state.upperT += dt;
  state.pickupGrace = Math.max(0, state.pickupGrace - dt);
  const currentBridge = activeBridge();

  // === All bridges keep rocking in the stack ===
  for (const bridge of bridges) {
    updateBridgePhysics(bridge, dt, bridge === currentBridge);
  }
  state.tilt = currentBridge.tilt;

  // Refresh cables to follow each bridge
  for (const cb of cables) {
    // local point on bridge transforms by its rotation+position
    const local = new THREE.Vector3(cb.lx, 0, cb.lz);
    local.applyEuler(cb.bridge.group.rotation);
    local.x += cb.bridge.group.position.x;
    local.y += cb.bridge.group.position.y;
    cb.line.geometry.setFromPoints([
      new THREE.Vector3(cb.lx, cb.bridge.baseY + FLOOR_HEIGHT * 0.78, cb.lz),
      local,
    ]);
  }

  // === Player input → 2D movement on the bridge ===
  // Forward/back: ↑/↓ or W/S. Strafe: ←/→ or A/D. Camera is rotated by RMB drag.
  const { forward, strafe } = movementInput();
  const moveIntent = Math.hypot(forward, strafe);

  if (state.onBridge && !state.jumping && (state.phase === 'choose' || state.phase === 'jump')) {
    // Walking velocity is a CONSTANT in world space — same in every phase.
    let { vx: walkVx, vz: walkVz } = localMoveVelocity(forward, strafe, WALK_SPEED);

    // Slope drift along X (the slope axis). Static friction first.
    const gSin = 9.8 * Math.sin(state.tilt);
    const gCos = 9.8 * Math.cos(state.tilt);
    const onIce = currentBridge.iceBand && state.playerZ >= currentBridge.iceBand.zMin && state.playerZ <= currentBridge.iceBand.zMax;
    const grip = (onIce ? 0 : STATIC_MU) * gCos;
    if (Math.abs(gSin) > grip) {
      const excess = (Math.abs(gSin) - grip) * Math.sign(gSin);
      state.slideVX += excess * dt;
    } else {
      // Feet hold — drift bleeds off quickly.
      state.slideVX *= Math.pow(0.05, dt * 8);
    }

    const downhillDir = Math.sign(gSin);
    if (onIce && downhillDir && walkVx * downhillDir < 0) {
      walkVx = 0;
    }
    const uphillInput = downhillDir ? Math.max(0, -walkVx * downhillDir) : 0;
    if (!onIce && uphillInput > 0.15) {
      const targetClimb = Math.min(UPHILL_CLIMB_SPEED, uphillInput * 0.55);
      const maxDownhillSlide = Math.max(0, uphillInput - targetClimb);
      const slideDownhill = state.slideVX * downhillDir;
      if (slideDownhill > maxDownhillSlide) {
        state.slideVX = maxDownhillSlide * downhillDir;
      }
    }

    if (currentBridge.type === 'wind') {
      const windOn = Math.floor(currentBridge.windT / 5) % 2 === 0;
      if (windOn) {
        if (walkVz * currentBridge.windDir < 0) walkVz *= 0.45;
        walkVz += currentBridge.windDir * 1.85;
      }
    }

    state.playerX += (walkVx + state.slideVX) * dt;
    state.playerZ += walkVz * dt;

    // Keep player within bridge width (Z) — invisible wall on the long edges.
    const halfW = currentBridge.narrowZone?.halfWidth ?? (LOWER_WID / 2 - 0.2);
    if (currentBridge.noRails) {
      if (Math.abs(state.playerZ) > halfW + 0.35) {
        state.playerX = bridgeWorldXFromLocal(currentBridge, state.playerX);
        state.onBridge = false;
        state.playerVX = 0;
        state.playerVZ = Math.sign(state.playerZ) * 2;
        state.playerVY = 0.2;
        fail('Ветер снес туда, где раньше были перила');
      }
    } else {
      if (state.playerZ > halfW) state.playerZ = halfW;
      if (state.playerZ < -halfW) state.playerZ = -halfW;
    }

    currentBridge.landingGrace = Math.max(0, (currentBridge.landingGrace || 0) - dt);
    if (currentBridge.landingGrace <= 0 && isOnMissingDeckGap(currentBridge, state.playerX, state.playerZ)) {
      state.playerX = bridgeWorldXFromLocal(currentBridge, state.playerX);
      state.onBridge = false;
      state.playerVX = state.slideVX;
      state.playerVZ = 0;
      state.playerVY = 0.15;
      fail('Провалился в снятую секцию настила');
    }

    maybePickup();
  }

  for (const bridge of bridges) updateBridgeHazards(bridge, dt, moveIntent);

  // === Slide-off / fail conditions ===
  if (state.onBridge && !state.jumping) {
    if (Math.abs(state.playerX) > LOWER_LEN / 2 + 0.3) {
      state.playerX = bridgeWorldXFromLocal(activeBridge(), state.playerX);
      state.onBridge = false;
      state.playerVY = 0.5;
      // Carry over current slide momentum so the fall is continuous.
      state.playerVX = state.slideVX + Math.sign(state.playerX) * 1.5;
      state.playerVZ = 0;
      if (state.phase === 'choose' || state.phase === 'jump') {
        fail(state.amplify ? 'Снёс правильный — мост перевесило' : 'Перевесило');
      }
    } else if (Math.abs(state.tilt) > FAIL_TILT) {
      state.playerX = bridgeWorldXFromLocal(activeBridge(), state.playerX);
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
    if (state.jumpMode === 'gap') {
      const desired = localMoveVelocity(forward, strafe, GAP_JUMP_SPEED);
      if (moveIntent > 0.1) {
        const airControl = Math.min(1, dt * 4);
        state.jumpLocalVX += (desired.vx - state.jumpLocalVX) * airControl;
        state.jumpLocalVZ += (desired.vz - state.jumpLocalVZ) * airControl;
      }

      state.playerX += state.jumpLocalVX * dt;
      state.playerZ += state.jumpLocalVZ * dt;
      state.playerVY -= 18 * dt;
      state.playerY += state.playerVY * dt;
      if (!currentBridge.noRails) {
        const halfW = currentBridge.narrowZone?.halfWidth ?? (LOWER_WID / 2 - 0.2);
        state.playerZ = THREE.MathUtils.clamp(state.playerZ, -halfW, halfW);
      }

      if (state.playerY <= 0 && state.playerVY < 0) {
        const landingVX = state.jumpLocalVX;
        const landingVZ = state.jumpLocalVZ;
        state.playerY = 0; state.playerVY = 0;
        state.jumping = false;
        state.jumpMode = 'none';
        state.jumpLocalVX = 0;
        state.jumpLocalVZ = 0;

        if (isOnMissingDeckGap(currentBridge, state.playerX, state.playerZ)) {
          state.playerX = bridgeWorldXFromLocal(currentBridge, state.playerX);
          state.onBridge = false;
          state.playerVX = landingVX;
          state.playerVZ = landingVZ;
          state.playerVY = 0.15;
          fail('Провалился в снятую секцию настила');
        } else {
          state.pickupGrace = 0.28;
          setHint('Перепрыгнул пролёт. Дальше снимай ответы или лови момент для прыжка наверх.');
        }
      }
    } else {
      state.playerX = state.jumpWorldX;
      state.playerZ = state.jumpWorldZ;
      state.playerVY -= 18 * dt;
      state.playerY += state.playerVY * dt;
      const jumpWorldY = state.jumpBaseY + PLAYER_HEIGHT + state.playerY;

      if (state.launchSuccess) {
        const targetBridge = nextBridge();
        const landingLocalX = localXForWorldXOnBridge(targetBridge, state.jumpWorldX);
        const safeLandingLocalX = safeDeckXNear(targetBridge, landingLocalX, state.playerZ);
        const onDeckX = Math.abs(safeLandingLocalX) <= LOWER_LEN / 2 - 0.1;
        const targetUpY = bridgeSurfaceYAt(targetBridge, safeLandingLocalX, state.playerZ);
        // Land when the player's feet are at or below the upper surface while descending.
        const feet = jumpWorldY - PLAYER_HEIGHT;
        if (onDeckX && feet <= targetUpY + 0.05 && feet >= targetUpY - 0.6 && state.playerVY <= 0) {
          state.onBridge = true;
          state.onUpper = false;
          state.playerVY = 0; state.playerY = 0;
          state.jumping = false;
          state.jumpMode = 'none';
          landOnNextBridge(safeLandingLocalX);
        }
      }
      // Land back on the lower bridge
      const lowerLocalX = localXForWorldXOnBridge(activeBridge(), state.jumpWorldX);
      const lowerFeetY = bridgeSurfaceYAt(activeBridge(), lowerLocalX, state.playerZ);
      if (jumpWorldY - PLAYER_HEIGHT <= lowerFeetY + 0.05 && state.playerVY < 0) {
        state.playerX = THREE.MathUtils.clamp(lowerLocalX, -LOWER_LEN / 2 + 0.25, LOWER_LEN / 2 - 0.25);
        state.playerY = 0; state.playerVY = 0;
        state.jumping = false;
        state.jumpMode = 'none';
        state.launchSuccess = false;
        if (state.phase === 'jump') {
          setHint('Не дотянул до верхнего моста. Остаешься на этом мосту — поймай момент и прыгай снова.');
        }
      }
    }
  }

  // === Free fall after sliding off ===
  if (!state.onBridge && !state.onUpper) {
    state.playerVY -= 18 * dt;
    state.playerY += state.playerVY * dt;
    state.playerX += state.playerVX * dt;
    state.playerZ += state.playerVZ * dt;
  }

  // === Mushroom fall animation for removed ones ===
  for (const bridge of bridges) {
    for (const w of bridge.weights) {
      if (!w.removed) continue;
      if (w.mesh.visible) {
        w.fallVy -= 18 * dt;
        w.mesh.position.y += w.fallVy * dt;
        w.mesh.rotation.x += dt * 4;
        w.mesh.rotation.z += dt * 3;
        if (w.mesh.position.y < -20) w.mesh.visible = false;
      }
    }
  }

  // === Place player in world ===
  let px, py, pz;
  if (state.onUpper) {
    const bridge = activeBridge();
    const local = new THREE.Vector3(state.playerX, PLAYER_HEIGHT + 0.15, state.playerZ);
    local.applyEuler(bridge.group.rotation);
    local.x += bridge.group.position.x;
    local.y += bridge.group.position.y;
    px = local.x; py = local.y; pz = local.z;
  } else if (state.onBridge && !state.jumping) {
    const bridge = activeBridge();
    const local = new THREE.Vector3(state.playerX, PLAYER_HEIGHT + 0.15, state.playerZ);
    local.applyEuler(bridge.group.rotation);
    local.x += bridge.group.position.x;
    local.y += bridge.group.position.y;
    px = local.x; py = local.y; pz = local.z;
  } else if (state.jumping && state.jumpMode === 'gap') {
    const bridge = activeBridge();
    px = bridgeWorldXFromLocal(bridge, state.playerX);
    py = bridgeSurfaceYAt(bridge, state.playerX, state.playerZ) + PLAYER_HEIGHT + state.playerY;
    pz = state.playerZ;
  } else {
    // In air or fallen: world coords directly
    px = state.jumping ? state.jumpWorldX : state.playerX;
    py = state.jumping
      ? state.jumpBaseY + PLAYER_HEIGHT + state.playerY
      : lowerSurfaceYAt(state.playerX, state.playerZ) + PLAYER_HEIGHT + state.playerY;
    pz = state.jumping ? state.jumpWorldZ : state.playerZ;
  }
  player.position.set(px, py, pz);
  // Lean with whichever bridge is supporting the player
  if (state.onUpper || (state.onBridge && !state.jumping)) player.rotation.z = -activeBridge().tilt * 0.5;
  else player.rotation.z = 0;
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
  if (nextBridge()) {
    const playerWorldX = bridgeWorldXFromLocal(activeBridge(), state.playerX);
    const upY = upperSurfaceYAt(playerWorldX, state.playerZ);
    const myY = lowerSurfaceYAt(state.playerX, state.playerZ) + PLAYER_HEIGHT;
    const gap = upY - myY;
    const launchLift = lowerSurfaceYAt(state.playerX, state.playerZ) - (activeBridge().baseY + 0.15);
    const lift01 = THREE.MathUtils.clamp(launchLift / MIN_LAUNCH_LIFT, 0, 1);
    const edge01 = THREE.MathUtils.clamp((Math.abs(state.playerX) - 0.6) / (MIN_LAUNCH_EDGE_X - 0.6), 0, 1);
    // Normalised: 0 = not ready; 1 = bridge is close and the current bridge has lifted the player enough.
    const reach01 = THREE.MathUtils.clamp(1 - (gap - 1.5) / 4.5, 0, 1) * lift01 * edge01;
    phaseNeedle.style.left = (reach01 * 100) + '%';
  } else {
    phaseNeedle.style.left = '100%';
  }

  // Subtle water shimmer
  water.material.color.setHSL(0.58, 0.55, 0.27 + 0.02 * Math.sin(state.upperT * 1.7));
}

// -------- Boot --------
function showRendererError() {
  boot.hidden = true;
  ovTitle.textContent = 'WebGL не запустился';
  ovBody.textContent = rendererError
    ? 'Встроенный браузер не выдал WebGL-контекст. Перезагрузи вкладку или открой игру во внешнем браузере.'
    : '3D-рендер еще не готов. Попробуй перезагрузить вкладку.';
  overlay.hidden = false;
}

$('start').addEventListener('click', e => {
  e.currentTarget.blur();
  if (!renderer && !initRenderer()) {
    showRendererError();
    return;
  }
  Sound && Sound.set && Sound.set(true);
  boot.hidden = true;
  started = true;
  startRound();
});
$('ov-restart').addEventListener('click', e => {
  e.currentTarget.blur();
  if (!renderer && !initRenderer()) {
    overlay.hidden = true;
    showRendererError();
    return;
  }
  state.score = 0; state.round = 1; state.streak = 0;
  startRound();
});
