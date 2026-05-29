import * as THREE from '/vendor/three.module.js';

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
const roundEl = $('round'), scoreEl = $('score'), streakEl = $('streak'), shardsEl = $('shards');
const questionEl = $('question'), hintEl = $('hint');
const tiltNeedle = $('tilt-needle'), phaseNeedle = $('phase-needle');
const overlay = $('overlay'), ovTitle = $('ov-title'), ovBody = $('ov-body'), ovRestart = $('ov-restart');
const boot = $('boot'), touchControls = $('touch-controls');
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
  'bird',
  'rockfall',
];

const QUESTION_BRIDGE_TYPES = new Set([
  'multiCorrect',
  'sequence',
  'anti',
  'memory',
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
  bird: 'пикирующая птица',
  rockfall: 'камнепад',
  tutWalk: 'обучение: сними неверный',
  tutBalance: 'обучение: следи за наклоном',
  tutJump: 'обучение: прыжок наверх',
};

const TUTORIAL_SCRIPT = ['tutWalk', 'tutBalance', 'tutJump'];
const TUTORIAL_BRIDGE_TYPES = new Set(TUTORIAL_SCRIPT);
const EARLY_BRIDGE_SCRIPT = ['plain', 'rocking', 'plain', 'rocking', 'biased'];
const TIER_EASY = ['plain', 'biased', 'rocking'];
const TIER_MID = ['plain', 'biased', 'rocking', 'variedMass', 'ice', 'wind', 'multiCorrect', 'missingOne'];
const TIER_HARD = ['plain', 'rocking', 'biased', 'variedMass', 'ice', 'wind', 'multiCorrect', 'missingOne', 'memory', 'anti', 'sequence', 'anchor', 'bird', 'narrow', 'rockfall', 'missingTwoPairs'];
const CHECKPOINT_INTERVAL = 3;
const PERK_OFFER_FLOORS = new Set([2, 4, 7, 10, 13, 16, 20, 24, 28]);
const PROFILE_KEY = 'mosty.roguelike.profile.v1';

const SHOP_UPGRADES = [
  {
    id: 'grip',
    name: 'Сапоги с шипами',
    desc: 'Меньше сносит на наклонном мосту.',
    max: 3,
    costs: [30, 70, 140],
  },
  {
    id: 'reach',
    name: 'Длинная рука',
    desc: 'Можно снимать грибы чуть дальше от себя.',
    max: 3,
    costs: [35, 85, 160],
  },
  {
    id: 'safety',
    name: 'Страховочный канат',
    desc: 'Дополнительное спасение от падения в каждом забеге.',
    max: 2,
    costs: [55, 130],
  },
  {
    id: 'choice',
    name: 'Лавка реликвий',
    desc: 'Иногда показывает 4 реликвии вместо 3.',
    max: 1,
    costs: [120],
  },
];

const PERKS = [
  {
    id: 'catPaws',
    name: 'Кошачьи лапы',
    desc: 'Сцепление с мостом сильно выше. Хорошо против наклона и ветра.',
    mods: { gripMul: 1.65 },
  },
  {
    id: 'longArm',
    name: 'Длинная рука',
    desc: 'Снимаешь грибы на расстоянии, меньше бегая по краям.',
    mods: { pickRadiusAdd: 0.55 },
  },
  {
    id: 'ghost',
    name: 'Призрачный шаг',
    desc: 'Ты почти не раскачиваешь мост, но хуже работаешь как противовес.',
    mods: { playerMassMul: 0.38, loadFollowMul: 0.55 },
  },
  {
    id: 'counterweight',
    name: 'Живой противовес',
    desc: 'Твой вес сильнее влияет на мост. Опасно, зато можно спасать перекос телом.',
    mods: { playerMassMul: 1.55, gripMul: 1.12 },
  },
  {
    id: 'quietStep',
    name: 'Тихий шаг',
    desc: 'Мост медленнее реагирует на твои перебежки.',
    mods: { loadFollowMul: 0.35 },
  },
  {
    id: 'sprinter',
    name: 'Спринтер',
    desc: 'Бежишь быстрее. Сложнее, но можно вырывать темп.',
    mods: { walkSpeedMul: 1.25, scoreMul: 1.08 },
  },
  {
    id: 'antimagnet',
    name: 'Антимагнит',
    desc: 'Спасает один раз: если снимешь правильный гриб — даёт прыгнуть на следующий мост. После моста реликвия уходит.',
    mods: { amplifyWeightMul: 0.62 },
  },
  {
    id: 'pendulum',
    name: 'Маятник',
    desc: 'Мост качается шире и помогает прыгать выше, но требует чувства ритма.',
    mods: { springAdd: -0.75, dampAdd: -0.28, jumpReachAdd: 0.65 },
  },
  {
    id: 'brakes',
    name: 'Тормоза',
    desc: 'Мост быстрее гасит раскачку. Надежно, но прыжки надо ловить точнее.',
    mods: { springAdd: 0.9, dampAdd: 0.2 },
  },
  {
    id: 'echo',
    name: 'Эхо вопроса',
    desc: 'Memory-мосты держат вопрос дольше, а птица терпит паузу.',
    mods: { memoryTimerMul: 1.8, birdPatienceAdd: 1.6 },
  },
  {
    id: 'weathercoat',
    name: 'Плащ ветра',
    desc: 'Ветер слабее, а на льду можно сопротивляться скольжению.',
    mods: { windPushMul: 0.58, iceUphill: true },
  },
  {
    id: 'airStep',
    name: 'Воздушный шаг',
    desc: 'Вертикальный прыжок достает выше. Хорошо для поздних мостов.',
    mods: { jumpReachAdd: 0.9 },
  },
];

function mulberry32(seed) {
  let s = (seed >>> 0) || 1;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let runSeed = (Math.random() * 0xffffffff) >>> 0;
const bridgeTypeCache = new Map();
function setRunSeed(seed) {
  runSeed = (seed >>> 0) || 1;
  bridgeTypeCache.clear();
}

function bridgeTypeFor(floor) {
  if (!profile.tutorialDone && floor <= TUTORIAL_SCRIPT.length) {
    return TUTORIAL_SCRIPT[floor - 1];
  }
  const earlyOffset = profile.tutorialDone ? 0 : TUTORIAL_SCRIPT.length;
  const earlyFloor = floor - earlyOffset;
  if (earlyFloor >= 1 && earlyFloor <= EARLY_BRIDGE_SCRIPT.length) {
    return EARLY_BRIDGE_SCRIPT[earlyFloor - 1];
  }
  if (bridgeTypeCache.has(floor)) return bridgeTypeCache.get(floor);
  const tierFloor = earlyFloor - EARLY_BRIDGE_SCRIPT.length;
  const pool = tierFloor <= 7 ? TIER_EASY : tierFloor <= 16 ? TIER_MID : TIER_HARD;
  const rng = mulberry32((runSeed ^ Math.imul(floor, 0x9E3779B1)) >>> 0);
  const type = pool[Math.floor(rng() * pool.length)];
  bridgeTypeCache.set(floor, type);
  return type;
}

function defaultProfile() {
  return {
    shards: 0,
    totalShards: 0,
    bestFloor: 1,
    bestStreak: 0,
    runs: 0,
    tutorialDone: false,
    upgrades: { grip: 0, reach: 0, safety: 0, choice: 0 },
  };
}

function loadProfile() {
  const base = defaultProfile();
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return base;
    const merged = {
      ...base,
      ...raw,
      upgrades: { ...base.upgrades, ...(raw.upgrades || {}) },
    };
    // Existing players already past the tutorial-equivalent floor graduate automatically.
    if (!merged.tutorialDone && (Number(merged.bestFloor) || 1) >= TUTORIAL_SCRIPT.length + 1) {
      merged.tutorialDone = true;
    }
    return merged;
  } catch (_) {
    return base;
  }
}

let profile = loadProfile();

function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (_) {}
}

function upgradeLevel(id) {
  return Math.max(0, Number(profile.upgrades?.[id]) || 0);
}

function upgradeCost(upgrade) {
  const level = upgradeLevel(upgrade.id);
  return level >= upgrade.max ? null : upgrade.costs[level];
}

function buyUpgrade(id) {
  const upgrade = SHOP_UPGRADES.find(item => item.id === id);
  if (!upgrade) return;
  const cost = upgradeCost(upgrade);
  if (cost === null || profile.shards < cost) return;
  profile.shards -= cost;
  profile.upgrades[upgrade.id] = upgradeLevel(upgrade.id) + 1;
  saveProfile();
  updateMetaUi();
  updateHud();
}

function upgradeAdd(key) {
  if (key === 'pickRadiusAdd') return upgradeLevel('reach') * 0.15;
  if (key === 'rescueChargesAdd') return upgradeLevel('safety');
  return 0;
}

function upgradeMul(key) {
  if (key === 'gripMul') return 1 + upgradeLevel('grip') * 0.16;
  return 1;
}

function runModAdd(key) {
  let value = upgradeAdd(key);
  for (const perkId of state.perks || []) {
    const perk = PERKS.find(item => item.id === perkId);
    value += Number(perk?.mods?.[key]) || 0;
  }
  return value;
}

function runModMul(key) {
  let value = upgradeMul(key);
  for (const perkId of state.perks || []) {
    const perk = PERKS.find(item => item.id === perkId);
    const mod = perk?.mods?.[key];
    if (Number.isFinite(mod)) value *= mod;
  }
  return value;
}

function runModFlag(key) {
  return (state.perks || []).some(perkId => {
    const perk = PERKS.find(item => item.id === perkId);
    return perk?.mods?.[key] === true;
  });
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
  phase: 'idle', // 'idle' | 'choose' | 'jump' | 'paused' | 'win' | 'over'
  question: null,
  weights: [],
  perks: [],
  offeredPerkFloors: [],
  checkpointFloor: 1,
  checkpointScore: 0,
  checkpointStreak: 0,
  checkpointPerks: [],
  checkpointOfferFloors: [],
  runShards: 0,
  runRescues: 0,
  runSeed: 0,
  runHistory: [],
  runStartedAt: 0,
  previousBestFloor: 1,
  failureReason: '',
  failureBridgeType: '',
  restartMode: 'new',
  perkActive: false,
  aiResumePhase: null,
  bridgeStartedAt: 0,
  bridgeMaxTilt: 0,
  bridgeMistakes: 0,
  lastGrade: '',
  spacePromptReady: false,
  amplify: false,
  tilt: 0, tiltVel: 0,
  playerX: 0, playerZ: 0,
  playerLoadX: 0,            // delayed X used for player torque on the bridge
  playerVX: 0, playerVZ: 0, // velocity used only during free fall
  slideVX: 0,               // drift along X caused by bridge slope
  playerY: 0, playerVY: 0,
  worldX: 0, worldY: 0, worldZ: 0,
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

const coachEl = document.createElement('div');
coachEl.id = 'coach';
coachEl.hidden = true;
document.body.appendChild(coachEl);

const overlayExtra = document.createElement('div');
overlayExtra.id = 'overlay-extra';
overlayExtra.className = 'overlay-extra';
if (ovBody?.parentElement) ovBody.parentElement.insertBefore(overlayExtra, ovRestart);

const activePerksEl = document.createElement('div');
activePerksEl.id = 'active-perks';
activePerksEl.className = 'active-perks';
activePerksEl.hidden = true;
document.body.appendChild(activePerksEl);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setCoach(text = '', tone = '') {
  coachEl.textContent = text;
  coachEl.className = tone ? `coach ${tone}` : 'coach';
  coachEl.hidden = !text;
}

function clearOverlayExtra() {
  overlayExtra.innerHTML = '';
  overlayExtra.hidden = true;
  if (ovRestart) ovRestart.hidden = false;
}

function updateActivePerksUi() {
  const perks = state.perks || [];
  if (!perks.length) {
    activePerksEl.hidden = true;
    activePerksEl.innerHTML = '';
    return;
  }
  activePerksEl.hidden = false;
  activePerksEl.innerHTML = perks.map(id => {
    const perk = PERKS.find(p => p.id === id);
    if (!perk) return '';
    return `<span class="perk-chip" title="${escapeHtml(perk.desc)}">${escapeHtml(perk.name)}</span>`;
  }).join('');
}

function isCheckpointFloor(floor) {
  return floor > 1 && (floor - 1) % CHECKPOINT_INTERVAL === 0;
}

function startingRescueCharges() {
  return 1 + runModAdd('rescueChargesAdd');
}

function effectivePlayerMass() {
  return PLAYER_MASS * runModMul('playerMassMul');
}

function effectivePickRadius(bridge) {
  const base = bridge.type === 'narrow' ? 0.72 : PICK_RADIUS;
  return base + runModAdd('pickRadiusAdd') + earlyMercyForFloor() * 0.18;
}

function earlyMercyForFloor(floor = state.round) {
  // Smooth linear ramp instead of step cliff: floor 1 = 1.0, floor 11 = 0.
  return Math.max(0, 1 - ((Number(floor) || 1) - 1) / 10);
}

function effectiveFailTilt() {
  return FAIL_TILT + earlyMercyForFloor() * 0.34;
}

function effectiveJumpReach(bridge) {
  return JUMP_REACH + (bridge.longJump ? 0.7 : 0) + runModAdd('jumpReachAdd') + earlyMercyForFloor() * 0.35;
}

function effectiveLaunchLift() {
  const bridge = bridges.find(b => b.floor === state.round);
  if (bridge?.tutorialStep > 0) return 0;
  return Math.max(0.18, MIN_LAUNCH_LIFT - earlyMercyForFloor() * 0.12);
}

function effectiveLaunchEdgeX() {
  const bridge = bridges.find(b => b.floor === state.round);
  if (bridge?.tutorialStep > 0) return 1.0;
  return Math.max(1.35, MIN_LAUNCH_EDGE_X - earlyMercyForFloor() * 0.45);
}

function checkpointSnapshot() {
  state.checkpointFloor = state.round;
  state.checkpointScore = state.score;
  state.checkpointStreak = state.streak;
  state.checkpointPerks = [...state.perks];
  state.checkpointOfferFloors = [...state.offeredPerkFloors];
}

function markProfileProgress() {
  profile.bestFloor = Math.max(profile.bestFloor || 1, state.round);
  profile.bestStreak = Math.max(profile.bestStreak || 0, state.best || 0);
  saveProfile();
}

function grantShards(amount) {
  const gained = Math.max(0, Math.floor(amount));
  if (!gained) return 0;
  profile.shards += gained;
  profile.totalShards += gained;
  saveProfile();
  updateMetaUi();
  updateHud();
  return gained;
}

function availablePerks() {
  const taken = new Set(state.perks);
  return PERKS.filter(perk => !taken.has(perk.id));
}

function choosePerkOptions(count) {
  const pool = shuffle(availablePerks());
  return pool.slice(0, Math.min(count, pool.length));
}

function shouldOfferPerkOnFloor(floor) {
  return PERK_OFFER_FLOORS.has(floor) && !state.offeredPerkFloors.includes(floor) && availablePerks().length > 0;
}

function showPerkChoice() {
  const count = 3 + upgradeLevel('choice');
  const choices = choosePerkOptions(count);
  if (!choices.length) return false;
  if (state.phase !== 'paused') state.aiResumePhase = state.phase;
  state.perkActive = true;
  state.phase = 'paused';
  state.offeredPerkFloors.push(state.round);
  overlay.hidden = false;
  ovTitle.textContent = 'Реликвия забега';
  ovBody.textContent = 'Выбери одну штуку. Она меняет физику мостов до конца этой попытки.';
  overlayExtra.hidden = false;
  overlayExtra.innerHTML = `
    <div class="perk-choice-grid">
      ${choices.map(perk => `
        <button class="perk-card" type="button" data-perk="${perk.id}">
          <span class="perk-name">${escapeHtml(perk.name)}</span>
          <span class="perk-desc">${escapeHtml(perk.desc)}</span>
        </button>
      `).join('')}
    </div>
  `;
  if (ovRestart) ovRestart.hidden = true;
  setCoach('');
  return true;
}

overlayExtra.addEventListener('click', event => {
  const button = event.target.closest('[data-perk]');
  if (!button) return;
  const perk = PERKS.find(item => item.id === button.dataset.perk);
  if (!perk) return;
  state.perks.push(perk.id);
  clearOverlayExtra();
  overlay.hidden = true;
  state.perkActive = false;
  // If AI generation is still running, stay paused; the AI .finally will resume.
  if (!aiPauseActive) {
    state.phase = state.aiResumePhase || 'choose';
    state.aiResumePhase = null;
  }
  setHint(`Реликвия взята: ${perk.name}. ${bridgeControlsHint(activeBridge())}`);
  updateMetaUi();
  // Any AI work that was deferred while the perk overlay was up — kick it now.
  const pending = bridges.find(b => b.pendingSetup);
  if (pending) triggerAiPause(pending);
});

function bridgeGrade(bridge) {
  const elapsed = bridge.startedAt ? (performance.now() - bridge.startedAt) / 1000 : 999;
  const maxTilt = bridge.maxAbsTilt ?? state.bridgeMaxTilt ?? 0;
  const mistakes = bridge.mistakes ?? 0;
  let points = 0;
  if (elapsed <= 18) points += 1;
  if (maxTilt <= 0.52) points += 1;
  if (mistakes === 0) points += 1;
  if (points >= 3) return { label: 'S', scoreBonus: 75, shards: 4 };
  if (points === 2) return { label: 'A', scoreBonus: 45, shards: 3 };
  if (points === 1) return { label: 'B', scoreBonus: 20, shards: 2 };
  return { label: 'C', scoreBonus: 0, shards: 1 };
}

// -------- Three.js setup --------
const root = $('scene-root');
let renderer = null;
let rendererError = null;

function rendererPixelRatio() {
  const touchFirst = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 760;
  const cap = touchFirst ? 1.5 : 2;
  return Math.min(window.devicePixelRatio || 1, cap);
}

function initRenderer() {
  if (renderer) return true;
  rendererError = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(rendererPixelRatio());
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
    if (started) {
      if (bridgeUsesAiPool(bridge) && !window.quizPoolHasQuestion?.({ floor: bridge.floor, type: bridge.type })) {
        bridge.pendingSetup = true;
        triggerAiPause(bridge);
      } else {
        setupBridgeQuestion(bridge);
      }
    }
  }
  return bridge;
}

// Sequence and pairs bridges build their question locally; everything else
// (including multiCorrect/anti/memory) pulls one item from the AI pool.
const SELF_CONTAINED_BRIDGE_TYPES = new Set(['sequence', 'tutWalk', 'tutBalance', 'tutJump']);
function bridgeUsesAiPool(bridge) {
  if (typeof window.quizPoolHasQuestion !== 'function') return false;
  return !SELF_CONTAINED_BRIDGE_TYPES.has(bridge.type);
}

let aiPauseActive = false;
function triggerAiPause(bridge) {
  if (aiPauseActive) return;
  // Perk overlay is up — don't stomp it. Defer the AI work until the perk is chosen.
  if (state.perkActive) {
    bridge.pendingSetup = true;
    return;
  }
  aiPauseActive = true;
  if (state.phase !== 'paused') state.aiResumePhase = state.phase;
  state.phase = 'paused';
  questionEl.textContent = 'Пул заданий исчерпан. AI готовит новые вопросы — подожди…';
  setHint('Пул заданий исчерпан. AI генерирует новые вопросы — подожди…');
  const ensure = window.quizEnsureQuestionAvailable
    ? window.quizEnsureQuestionAvailable({ floor: bridge.floor, type: bridge.type })
    : Promise.resolve();
  Promise.resolve(ensure)
    .catch(err => console.warn('AI generation failed:', err))
    .finally(() => {
      for (const b of bridges) {
        if (b.pendingSetup) {
          setupBridgeQuestion(b);
          b.pendingSetup = false;
        }
      }
      aiPauseActive = false;
      // Perk overlay covers us — let the perk click handler resume phase.
      if (state.perkActive) return;
      if (state.phase === 'paused') {
        state.phase = state.aiResumePhase || 'choose';
        syncQuestionHud();
        setHint(`Новые задания подготовлены. ${bridgeControlsHint(activeBridge())}`);
      }
      state.aiResumePhase = null;
    });
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
  // Standard plate is 1024x512 with the original font scale. Only the plate's
  // HEIGHT grows when text truly can't fit otherwise — no ellipsis.
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  const maxTextWidth = c.width - 96;

  let size = 82;
  let lines = [String(text || '')];
  while (size >= 34) {
    ctx.font = `bold ${size}px ${fontFamily}`;
    lines = naturalWrapLines(ctx, text, maxTextWidth);
    if (lines.length <= 3) break;
    size -= 4;
  }

  const lineHeight = size * 1.12;
  const verticalPad = 56;
  const requiredHeight = lines.length * lineHeight + verticalPad * 2;
  if (requiredHeight > c.height) {
    c.height = Math.ceil(requiredHeight);
  }

  // Setting canvas.width/height clears state — re-apply everything.
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 34); ctx.fill();
  ctx.strokeStyle = '#f4b942';
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 34); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${size}px ${fontFamily}`;

  const startY = c.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, c.width / 2, startY + i * lineHeight);
  });

  return {
    texture: new THREE.CanvasTexture(c),
    aspect: c.width / c.height,
  };
}

function naturalWrapLines(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (ctx.measureText(word).width > maxWidth) {
      // Single word longer than the plate — hard-break by characters.
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (ctx.measureText(next).width > maxWidth) {
          if (chunk) lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
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
  const { texture, aspect } = labelTexture(`${n}. ${text}`);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  const labelWidth = 3.18;
  const labelHeight = labelWidth / aspect;
  sprite.scale.set(labelWidth, labelHeight, 1);
  // Anchor by the plate center: standard plate (aspect 2) sits at y=1.7 like
  // before; a grown plate lifts up to keep its bottom clear of the mushroom.
  sprite.position.y = Math.max(1.7, 0.9 + labelHeight / 2);
  sprite.renderOrder = 999;
  g.add(sprite);
  return g;
}

// -------- Tutorial sprites in 3D --------
function makeTutorialBannerTexture(text, accent = '#f4b942') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 20, 28, 0.94)';
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 32); ctx.fill();
  ctx.strokeStyle = accent; ctx.lineWidth = 8;
  roundRect(ctx, 10, 10, c.width - 20, c.height - 20, 32); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontFamily = 'ui-sans-serif, system-ui, sans-serif';
  const maxWidth = c.width - 80;
  let size = 92;
  let lines = [];
  while (size >= 32) {
    ctx.font = `bold ${size}px ${fontFamily}`;
    lines = wrapLabelText(ctx, text, maxWidth, 2);
    if (lines.length <= 2 && lines.every(line => ctx.measureText(line).width <= maxWidth)) break;
    size -= 6;
  }
  if (!lines.length) lines = [String(text || '')];
  ctx.font = `bold ${size}px ${fontFamily}`;
  const lh = size * 1.18;
  const startY = c.height / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((line, i) => ctx.fillText(line, c.width / 2, startY + i * lh));
  return new THREE.CanvasTexture(c);
}

function makeArrowTexture(direction, color) {
  // direction: 'down' or 'up'. Returns a tall canvas with shaft + arrowhead.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  const headStart = direction === 'down' ? 150 : 106;
  const tipY = direction === 'down' ? 250 : 6;
  const shaftTop = direction === 'down' ? 6 : 250;
  const shaftBot = direction === 'down' ? 170 : 86;
  ctx.beginPath();
  ctx.moveTo(50, shaftTop);
  ctx.lineTo(78, shaftTop);
  ctx.lineTo(78, shaftBot);
  ctx.lineTo(50, shaftBot);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(15, headStart);
  ctx.lineTo(113, headStart);
  ctx.lineTo(64, tipY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

function makeTutorialArrowSprite(color) {
  const tex = makeArrowTexture('down', color);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  sprite.scale.set(0.85, 1.55, 1);
  sprite.renderOrder = 1090;
  return sprite;
}

function makeTutorialChip(text, color) {
  const tex = makeTutorialBannerTexture(text, color);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  sprite.scale.set(1.7, 0.55, 1);
  sprite.renderOrder = 1095;
  return sprite;
}

function makeTutorialBanner(text) {
  const tex = makeTutorialBannerTexture(text, '#f4b942');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  sprite.scale.set(7.0, 1.75, 1);
  sprite.renderOrder = 1100;
  return sprite;
}

function makeTutorialUpArrow() {
  const tex = makeArrowTexture('up', '#5ce58a');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  sprite.scale.set(1.1, 2.0, 1);
  sprite.renderOrder = 1100;
  return sprite;
}

const TUTORIAL_BANNER_TEXTS = {
  1: 'СНИМИ НЕВЕРНЫЙ',
  2: 'СНИМИ 3 НЕВЕРНЫХ',
  3: 'ОЧИСТИ И ПРЫГАЙ',
};

function decorateTutorialBridge(bridge) {
  if (!bridge.tutorialStep) return;

  const banner = makeTutorialBanner(TUTORIAL_BANNER_TEXTS[bridge.tutorialStep] || 'ОБУЧЕНИЕ');
  banner.position.set(0, 4.6, 0);
  bridge.group.add(banner);
  bridge.decor.push(banner);
  bridge.tutorialBanner = banner;

  for (const w of bridge.weights) {
    const color = w.isCorrect ? '#5ce58a' : '#ff5c5c';
    const arrow = makeTutorialArrowSprite(color);
    arrow.position.set(w.slot, 3.0, w.zOff);
    bridge.group.add(arrow);
    bridge.decor.push(arrow);
    w.tutorialArrow = arrow;

    const chip = makeTutorialChip(w.isCorrect ? 'ОСТАВЬ' : 'СНИМИ', color);
    chip.position.set(w.slot, 3.85, w.zOff);
    bridge.group.add(chip);
    bridge.decor.push(chip);
    w.tutorialChip = chip;
  }
  bridge.tutorialT = 0;
  bridge.tutorialJumpArrow = null;
  bridge.tutorialJumpChip = null;
}

function ensureTutorialJumpArrow(bridge) {
  if (!bridge.tutorialStep || bridge.tutorialJumpArrow) return;
  if (!bridgeReadyToJump(bridge)) return;

  let sign;
  if (bridge.tutorialStep === 1) {
    sign = 1;
  } else {
    const correct = bridge.weights.find(w => w.isCorrect && !w.removed);
    sign = -Math.sign(correct?.slot || 1) || 1;
  }

  const arrow = makeTutorialUpArrow();
  arrow.position.set(sign * 4.5, 3.4, 0);
  bridge.group.add(arrow);
  bridge.decor.push(arrow);
  bridge.tutorialJumpArrow = arrow;

  const chip = makeTutorialChip('ПРОБЕЛ', '#5ce58a');
  chip.scale.set(2.2, 0.72, 1);
  chip.position.set(sign * 4.5, 5.2, 0);
  bridge.group.add(chip);
  bridge.decor.push(chip);
  bridge.tutorialJumpChip = chip;
}

function updateTutorialMarkers(bridge, dt) {
  if (!bridge.tutorialStep) return;
  bridge.tutorialT = (bridge.tutorialT || 0) + dt;
  const bob = Math.sin(bridge.tutorialT * 3.4) * 0.18;
  const pulse = 0.85 + 0.15 * Math.sin(bridge.tutorialT * 4.5);
  for (const w of bridge.weights) {
    if (!w.tutorialArrow) continue;
    if (w.removed) {
      w.tutorialArrow.visible = false;
      if (w.tutorialChip) w.tutorialChip.visible = false;
      continue;
    }
    w.tutorialArrow.position.y = 3.0 + bob;
    if (w.tutorialChip) w.tutorialChip.material.opacity = pulse;
  }
  if (bridge.tutorialBanner) {
    bridge.tutorialBanner.material.opacity = 0.95;
  }
  if (bridge === activeBridge() && state.phase === 'jump') {
    ensureTutorialJumpArrow(bridge);
  }
  if (bridge.tutorialJumpArrow) {
    bridge.tutorialJumpArrow.position.y = 3.4 + bob * 1.3;
    bridge.tutorialJumpArrow.material.opacity = pulse;
    if (bridge.tutorialJumpChip) bridge.tutorialJumpChip.material.opacity = pulse;
  }
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

// -------- Online coop --------
function playerLabelTexture(text, color = '#5ce58a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(6, 12, 14, 0.82)';
  roundRect(ctx, 8, 10, c.width - 16, c.height - 20, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  roundRect(ctx, 8, 10, c.width - 16, c.height - 20, 18);
  ctx.stroke();
  ctx.fillStyle = '#f7fbff';
  ctx.font = '800 42px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  return new THREE.CanvasTexture(c);
}

function makeRemotePlayer(color = 0x5ce58a, label = 'P2') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(PLAYER_HEIGHT * 1.05, 22, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.12, emissive: color, emissiveIntensity: 0.08 })
  );
  body.castShadow = true;
  body.position.y = PLAYER_HEIGHT;
  body.userData.kind = 'body';
  g.add(body);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.045, 8, 34),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, emissive: color, emissiveIntensity: 0.18 })
  );
  ring.position.y = 0.15;
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
  );
  beacon.position.y = 1.22;
  g.add(beacon);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: playerLabelTexture(label, `#${new THREE.Color(color).getHexString()}`),
    depthTest: false,
    depthWrite: false,
  }));
  labelSprite.position.y = 1.86;
  labelSprite.scale.set(1.35, 0.5, 1);
  labelSprite.renderOrder = 1000;
  labelSprite.userData.kind = 'label';
  g.add(labelSprite);
  g.userData.label = label;
  return g;
}

const Coop = {
  enabled: false,
  room: '',
  playerId: '',
  seat: 1,
  color: '#3aa0ff',
  players: new Map(),
  configs: new Map(),
  meshes: new Map(),
  eventSource: null,
  lastSend: 0,
  statusEl: null,
  badgeEl: null,

  get isHost() { return this.seat === 1; },

  async join(roomCodeValue = '') {
    const response = await fetch('/api/coop/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomCodeValue }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    this.enabled = true;
    this.room = data.room;
    this.playerId = data.playerId;
    this.seat = data.seat;
    this.color = data.color;
    playerBody.material.color.set(data.color);
    this.applyRoomState(data.state);
    this.openEvents();
    this.updateUi(`Комната ${this.room}. Игрок ${this.seat}. Второй может открыть ?room=${this.room}`, 'on');
    this.updateBadge();
    try {
      const url = new URL(location.href);
      url.searchParams.set('room', this.room);
      history.replaceState(null, '', url);
    } catch (_) {}
  },

  openEvents() {
    if (this.eventSource) this.eventSource.close();
    this.eventSource = new EventSource(`/api/coop/events?room=${encodeURIComponent(this.room)}&player=${encodeURIComponent(this.playerId)}`);
    this.eventSource.addEventListener('room', (event) => this.applyRoomState(JSON.parse(event.data || '{}')));
    this.eventSource.addEventListener('state', (event) => this.applyRoomState(JSON.parse(event.data || '{}')));
    this.eventSource.addEventListener('config', (event) => {
      const payload = JSON.parse(event.data || '{}');
      if (payload.floor && payload.config) this.applyConfig(payload.floor, payload.config);
    });
    this.eventSource.onerror = () => {
      this.updateUi(`Комната ${this.room}: переподключаюсь...`, 'warn');
    };
  },

  applyRoomState(roomState = {}) {
    if (roomState.configs) {
      Object.entries(roomState.configs).forEach(([floor, config]) => this.applyConfig(floor, config));
    }
    const nextPlayers = new Map();
    for (const playerInfo of roomState.players || []) {
      if (!playerInfo || playerInfo.id === this.playerId) continue;
      applyRemoteBridgeProgress(playerInfo.state);
      nextPlayers.set(playerInfo.id, playerInfo);
    }
    this.players = nextPlayers;
    this.updateRemoteMeshes();
    this.updateBadge();
  },

  applyConfig(floor, config) {
    const key = String(floor);
    if (!config || this.configs.has(key)) return;
    this.configs.set(key, config);
    const bridge = bridges.find(item => String(item.floor) === key);
    if (started && bridge && !bridge.scored) {
      setupBridgeQuestion(bridge);
      if (bridge === activeBridge()) syncQuestionHud();
    }
  },

  configForFloor(floor) {
    return this.enabled ? this.configs.get(String(floor)) : null;
  },

  publishBridgeConfig(bridge) {
    if (!this.enabled || this.configs.has(String(bridge.floor))) return;
    const key = String(bridge.floor);
    const config = bridgeConfigFromBridge(bridge);
    this.configs.set(key, config);
    fetch('/api/coop/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: this.room, playerId: this.playerId, floor: bridge.floor, config }),
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data?.config || JSON.stringify(data.config) === JSON.stringify(config)) return;
        this.configs.delete(key);
        this.applyConfig(key, data.config);
      })
      .catch(() => {});
  },

  bridgeLoads(floor) {
    const loads = [];
    for (const playerInfo of this.players.values()) {
      const s = playerInfo.state;
      if (!s || s.phase === 'over' || s.floor !== floor || !s.onBridge || s.jumping) continue;
      if (!Number.isFinite(s.playerX)) continue;
      loads.push({ id: playerInfo.id, x: s.playerX, mass: PLAYER_MASS });
    }
    return loads;
  },

  tick(dt) {
    if (!this.enabled || !started) return;
    this.lastSend += dt;
    if (this.lastSend < 0.08) return;
    this.lastSend = 0;
    const payload = {
      floor: state.round,
      phase: state.phase,
      playerX: state.playerX,
      playerZ: state.playerZ,
      playerY: state.playerY,
      worldX: state.worldX,
      worldY: state.worldY,
      worldZ: state.worldZ,
      onBridge: state.onBridge,
      onUpper: state.onUpper,
      jumping: state.jumping,
      jumpMode: state.jumpMode,
      tilt: state.tilt,
      score: state.score,
      streak: state.streak,
      bridges: bridges.map(bridge => ({
        floor: bridge.floor,
        removed: bridge.weights.filter(w => w.removed).map(w => w.idx),
        checked: bridge.weights.filter(w => w.anchor && w.checked).map(w => w.idx),
        amplify: bridge.amplify,
        done: bridge.done,
      })),
      t: performance.now(),
    };
    fetch('/api/coop/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: this.room, playerId: this.playerId, state: payload }),
    }).catch(() => {});
  },

  updateRemoteMeshes() {
    if (!this.enabled || !started) return;
    const alive = new Set();
    for (const playerInfo of this.players.values()) {
      const s = playerInfo.state;
      if (!s) continue;
      alive.add(playerInfo.id);
      let mesh = this.meshes.get(playerInfo.id);
      if (!mesh) {
        const label = `P${playerInfo.seat || 2}`;
        mesh = makeRemotePlayer(new THREE.Color(playerInfo.color || '#5ce58a').getHex(), label);
        scene.add(mesh);
        this.meshes.set(playerInfo.id, mesh);
      }
      const pos = remoteWorldPosition(s);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.rotation.z = s.floor === state.round ? -activeBridge().tilt * 0.5 : 0;
      mesh.visible = true;
    }
    for (const [id, mesh] of this.meshes) {
      if (!alive.has(id)) mesh.visible = false;
    }
  },

  updateUi(text, variant = '') {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `coop-status ${variant}`.trim();
  },

  updateBadge() {
    if (!this.badgeEl) return;
    if (!this.enabled) {
      this.badgeEl.classList.remove('on');
      return;
    }
    const peers = this.players.size;
    this.badgeEl.textContent = `Кооп ${this.room}: ты игрок ${this.seat}, рядом ${peers}`;
    this.badgeEl.classList.add('on');
  },
};

function remoteWorldPosition(remoteState) {
  if (Number.isFinite(remoteState.worldX) && Number.isFinite(remoteState.worldY) && Number.isFinite(remoteState.worldZ)) {
    return { x: remoteState.worldX, y: remoteState.worldY, z: remoteState.worldZ };
  }
  const bridge = ensureBridge(remoteState.floor || state.round);
  const x = Number(remoteState.playerX) || 0;
  const z = Number(remoteState.playerZ) || 0;
  return {
    x: bridgeWorldXFromLocal(bridge, x),
    y: bridgeSurfaceYAt(bridge, x, z) + PLAYER_HEIGHT + (Number(remoteState.playerY) || 0),
    z,
  };
}

function applyRemoteBridgeProgress(remoteState) {
  if (!started || !remoteState || !Array.isArray(remoteState.bridges)) return;
  for (const bridgeState of remoteState.bridges) {
    const floor = Number(bridgeState.floor);
    if (!Number.isFinite(floor)) continue;
    const bridge = ensureBridge(floor);
    const removed = new Set(bridgeState.removed || []);
    const checked = new Set(bridgeState.checked || []);
    let changed = false;
    for (const w of bridge.weights) {
      if (checked.has(w.idx)) w.checked = true;
      if (!removed.has(w.idx) || w.removed) continue;
      w.removed = true;
      w.fallVy = 0;
      if (w.isCorrect) bridge.amplify = true;
      changed = true;
    }
    if (bridgeState.amplify) bridge.amplify = true;
    if (bridgeState.done) bridge.done = true;
    if (changed && bridge === activeBridge()) {
      state.amplify = bridge.amplify;
      if (state.phase === 'choose' && bridgeReadyToJump(bridge)) {
        state.phase = 'jump';
        setHint('Партнер очистил мост. Встань на поднятый край и прыгай наверх.');
      }
    }
  }
}

function initCoopUi() {
  const panel = boot && boot.firstElementChild;
  const startBtn = $('start');
  if (!panel || !startBtn || $('coop-panel')) return;
  const el = document.createElement('div');
  el.id = 'coop-panel';
  el.className = 'coop-panel';
  const initialRoom = new URLSearchParams(location.search).get('room') || '';
  el.innerHTML = `
    <div class="coop-title">Сетевая игра</div>
    <div class="coop-row">
      <input id="coop-room" maxlength="8" autocomplete="off" placeholder="Код комнаты" value="${initialRoom.replace(/"/g, '')}">
      <button type="button" id="coop-create">Создать</button>
      <button type="button" id="coop-join">Войти</button>
    </div>
    <div id="coop-status" class="coop-status">Можно играть одному или подключить второго игрока по коду комнаты.</div>
  `;
  panel.insertBefore(el, startBtn);
  const badge = document.createElement('div');
  badge.id = 'coop-badge';
  badge.className = 'coop-badge';
  document.body.appendChild(badge);
  Coop.statusEl = $('coop-status');
  Coop.badgeEl = badge;
  const input = $('coop-room');
  const connect = async (room) => {
    try {
      Coop.updateUi('Подключаю комнату...', 'warn');
      await Coop.join(room);
    } catch (err) {
      Coop.updateUi(`Не удалось подключиться: ${err.message || err}`, 'warn');
    }
  };
  $('coop-create').addEventListener('click', () => connect(''));
  $('coop-join').addEventListener('click', () => connect(input.value));
  if (initialRoom) connect(initialRoom);
}
initCoopUi();

function initMetaUi() {
  const panel = boot && boot.firstElementChild;
  const startBtn = $('start');
  if (!panel || !startBtn || $('meta-panel')) return;
  const el = document.createElement('div');
  el.id = 'meta-panel';
  el.className = 'meta-panel';
  el.innerHTML = `
    <div class="meta-head">
      <div>
        <div class="meta-kicker">Между падениями</div>
        <div class="meta-title">Постоянные улучшения</div>
      </div>
      <div class="meta-bank"><span id="meta-shards">0</span> оск.</div>
    </div>
    <div id="shop-grid" class="shop-grid"></div>
    <div id="run-build" class="run-build"></div>
  `;
  panel.insertBefore(el, startBtn);
  el.addEventListener('click', event => {
    const button = event.target.closest('[data-buy-upgrade]');
    if (!button) return;
    buyUpgrade(button.dataset.buyUpgrade);
  });
  updateMetaUi();
}

function updateMetaUi() {
  if (shardsEl) shardsEl.textContent = profile.shards;
  const metaShards = $('meta-shards');
  if (metaShards) metaShards.textContent = profile.shards;
  const grid = $('shop-grid');
  if (grid) {
    grid.innerHTML = SHOP_UPGRADES.map(upgrade => {
      const level = upgradeLevel(upgrade.id);
      const cost = upgradeCost(upgrade);
      const maxed = cost === null;
      const disabled = maxed || profile.shards < cost;
      return `
        <button class="shop-card" type="button" data-buy-upgrade="${upgrade.id}" ${disabled ? 'disabled' : ''}>
          <span class="shop-name">${escapeHtml(upgrade.name)} <b>${level}/${upgrade.max}</b></span>
          <span class="shop-desc">${escapeHtml(upgrade.desc)}</span>
          <span class="shop-cost">${maxed ? 'куплено' : `${cost} оск.`}</span>
        </button>
      `;
    }).join('');
  }
  const build = $('run-build');
  if (build) {
    const names = state.perks
      .map(id => PERKS.find(perk => perk.id === id)?.name)
      .filter(Boolean);
    build.textContent = names.length
      ? `Реликвии забега: ${names.join(' + ')}`
      : `Рекорд: мост ${profile.bestFloor || 1}. В каждом забеге есть 1 бесплатное спасение.`;
  }
  updateActivePerksUi();
}

initMetaUi();

// -------- Resize --------
addEventListener('resize', () => {
  updateTouchDeviceClass();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setPixelRatio(rendererPixelRatio());
    renderer.setSize(innerWidth, innerHeight);
  }
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
  bridge.tutorialBanner = null;
  bridge.tutorialJumpArrow = null;
  bridge.tutorialJumpChip = null;
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

function applyBridgeVariant(bridge, config = null) {
  const parts = bridge.group.userData;
  const variant = config?.variant || {};
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
  bridge.tutorialStep = 0;
  bridge.tutorialNoTilt = false;
  bridge.tutorialNoAmplify = false;

  if (TUTORIAL_BRIDGE_TYPES.has(bridge.type)) {
    bridge.tutorialStep = TUTORIAL_SCRIPT.indexOf(bridge.type) + 1;
    bridge.tutorialNoTilt = bridge.type === 'tutWalk';
    bridge.tutorialNoAmplify = bridge.type !== 'tutJump';
    bridge.category = 'обучение';
    return;
  }

  if (bridge.type === 'missingOne') {
    const indices = variant.missingSectionIndices || randomDeckSectionIndices(parts, 1);
    for (const index of indices) removeDeckSection(bridge, index);
  } else if (bridge.type === 'missingTwoPairs') {
    const indices = variant.missingSectionIndices || randomDeckSectionIndices(parts, 2);
    for (const index of indices) removeDeckSection(bridge, index);
  } else if (bridge.type === 'wind') {
    bridge.noRails = true;
    bridge.windDir = variant.windDir || (Math.random() < 0.5 ? -1 : 1);
    for (const part of [...parts.rails, ...parts.posts, ...parts.sideBoards]) part.visible = false;
    addDeckZone(bridge, 0, bridge.windDir * (LOWER_WID / 2 + 0.25), LOWER_LEN, 0.3, zoneMaterials.wind, 0.55);
  } else if (bridge.type === 'biased') {
    bridge.biasTorque = Number.isFinite(variant.biasTorque) ? variant.biasTorque : (Math.random() < 0.5 ? -1 : 1) * 1.2;
    const side = Math.sign(bridge.biasTorque);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), zoneMaterials.bias);
    crate.position.set(side * 4.7, 0.6, -1.45);
    crate.castShadow = true;
    bridge.group.add(crate);
    bridge.decor.push(crate);
  } else if (bridge.type === 'ice') {
    bridge.iceT = Number.isFinite(variant.iceT) ? variant.iceT : Math.random() * Math.PI * 2;
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
    bridge.memoryTimer = 4 * runModMul('memoryTimerMul');
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

function makeTutorialQuestion(bridge) {
  if (bridge.type === 'tutWalk') {
    return {
      q: '2 + 2 = ? Снимай НЕВЕРНЫЕ грибы (подойди — они провалятся). Правильный оставляем.',
      choices: ['5', '4'],
      correctIndex: 1,
      correctSet: new Set([1]),
    };
  }
  if (bridge.type === 'tutBalance') {
    return {
      q: 'Сколько ног у паука? Снимай неверные. Каждый снятый гриб качает мост к оставшимся.',
      choices: ['6', '8', '10', '12'],
      correctIndex: 1,
      correctSet: new Set([1]),
    };
  }
  return {
    q: 'Какого цвета небо днём? Сними 3 неверных. Когда останется один правильный — мост перекосит, встань на поднятый край и жми ПРОБЕЛ.',
    choices: ['Синее', 'Зелёное', 'Красное', 'Жёлтое'],
    correctIndex: 0,
    correctSet: new Set([0]),
  };
}

function makeQuestionForBridge(bridge) {
  if (TUTORIAL_BRIDGE_TYPES.has(bridge.type)) {
    return makeTutorialQuestion(bridge);
  }
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

  const question = window.pickQuestion('mix', { floor: bridge.floor, type: bridge.type });
  const correctSet = new Set([question.correctIndex]);

  if (bridge.type === 'multiCorrect') {
    const extra = question.choices.findIndex((_, i) => i !== question.correctIndex);
    if (extra >= 0) correctSet.add(extra);
    question.q = `Множественный правильный: оставь 2 ответа. ${question.q}`;
  } else if (bridge.type === 'anti') {
    question.q = `Анти-вопрос: сними все неправильные, правильный оставь. ${question.q}`;
  } else if (bridge.type === 'memory') {
    const seconds = Math.max(1, Math.round(4 * runModMul('memoryTimerMul')));
    question.q = `Запомни за ${seconds} ${seconds === 1 ? 'секунду' : seconds < 5 ? 'секунды' : 'секунд'}: ${question.q}`;
  }

  question.correctSet = correctSet;
  return question;
}

function serializableQuestion(question) {
  return {
    ...question,
    correctSet: question.correctSet ? [...question.correctSet] : null,
  };
}

function restoreQuestion(question) {
  if (!question) return null;
  return {
    ...question,
    correctSet: Array.isArray(question.correctSet) ? new Set(question.correctSet) : question.correctSet,
  };
}

function bridgeVariantConfig(bridge) {
  return {
    missingSectionIndices: [...(bridge.missingSectionIndices || [])],
    windDir: bridge.windDir,
    biasTorque: bridge.biasTorque,
    iceT: bridge.iceT,
  };
}

function bridgeConfigFromBridge(bridge) {
  return {
    floor: bridge.floor,
    type: bridge.type,
    variant: bridgeVariantConfig(bridge),
    question: serializableQuestion(bridge.question),
    weights: bridge.weights.map(w => ({
      slot: w.slot,
      zOff: w.zOff,
      idx: w.idx,
      text: w.text,
      isCorrect: w.isCorrect,
      mass: w.mass,
      anchor: w.anchor,
    })),
  };
}

function setupBridgeQuestion(bridge) {
  if (bridge.question && !bridge.scored && typeof window.releaseQuizQuestion === 'function') {
    window.releaseQuizQuestion(bridge.question);
  }
  bridge.question = null;
  for (const w of bridge.weights) bridge.group.remove(w.mesh);
  bridge.weights = [];
  clearBridgeDecor(bridge);
  const coopConfig = Coop?.configForFloor?.(bridge.floor) || null;
  bridge.type = coopConfig?.type || bridgeTypeFor(bridge.floor);
  applyBridgeVariant(bridge, coopConfig);
  bridge.question = restoreQuestion(coopConfig?.question) || makeQuestionForBridge(bridge);
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

  const configuredWeights = Array.isArray(coopConfig?.weights) ? coopConfig.weights : null;
  let slots = configuredWeights ? configuredWeights.map(w => w.slot) : [...SLOTS];
  let zOffsets = configuredWeights ? configuredWeights.map(w => w.zOff || 0) : [...MUSHROOM_OFFSETS_Z];
  if (bridge.type === 'missingOne') {
    slots = missingBridgeSlots(bridge);
    zOffsets = [0, 0, 0, 0];
  } else if (bridge.type === 'missingTwoPairs') {
    slots = missingBridgeSlots(bridge);
    zOffsets = [-0.55, -0.55, 0.55, 0.55];
  } else if (bridge.type === 'narrow') {
    slots = [-4.1, -1.4, 1.4, 4.1];
    zOffsets = [0, 0, 0, 0];
  } else if (bridge.type === 'tutWalk') {
    slots = [-2.5, 2.5];
    zOffsets = [0, 0];
  }

  const anchorIndex = configuredWeights
    ? configuredWeights.findIndex(w => w.anchor)
    : bridge.type === 'anchor' ? Math.floor(Math.random() * bridge.question.choices.length) : -1;
  bridge.sequenceOrder = bridge.question.sequence || [];

  bridge.question.choices.forEach((text, i) => {
    const configured = configuredWeights?.[i] || null;
    const mass = configured?.mass || (bridge.type === 'variedMass'
      ? [0.5, 1, 2, 1][i]
      : 1);
    const labelText = configured?.text || text;
    const m = makeMushroom(labelText, i + 1);
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
      idx: configured?.idx ?? i,
      text: labelText,
      isCorrect: configured?.isCorrect ?? (bridge.question.correctSet ? bridge.question.correctSet.has(i) : i === bridge.question.correctIndex),
      mass,
      anchor: configured?.anchor ?? i === anchorIndex,
      checked: false,
      removed: false,
      fallVy: 0,
    });
  });
  bridge.massOrder = bridge.weights
    .filter(w => !w.isCorrect)
    .sort((a, b) => (a.mass || 1) - (b.mass || 1))
    .map(w => w.idx);
  decorateTutorialBridge(bridge);
  if (!coopConfig) Coop?.publishBridgeConfig?.(bridge);
}

function syncQuestionHud() {
  const bridge = activeBridge();
  state.question = bridge.question;
  state.weights = bridge.weights;
  state.amplify = bridge.amplify;
  bridge.startedAt = performance.now();
  bridge.maxAbsTilt = 0;
  bridge.mistakes = 0;
  state.bridgeStartedAt = bridge.startedAt;
  state.bridgeMaxTilt = 0;
  state.bridgeMistakes = 0;
  state.spacePromptReady = false;
  const label = BRIDGE_TYPE_LABELS[bridge.type] || bridge.type;
  questionEl.textContent = `Мост ${state.round}: ${label} [${bridge.category === 'question' ? 'задание' : 'препятствие'}]. ${bridge.question.q}`;
  if (window.playQuizAudio) window.playQuizAudio(bridge.question);
}

function startRound(options = {}) {
  const fromFloor = Math.max(1, Math.floor(options.fromFloor || 1));
  const resuming = Boolean(options.resumeCheckpoint);
  if (resuming && state.runSeed) {
    setRunSeed(state.runSeed);
  } else {
    state.runSeed = (Math.random() * 0xffffffff) >>> 0;
    setRunSeed(state.runSeed);
  }
  state.perkActive = false;
  state.aiResumePhase = null;
  for (let floor = Math.max(1, fromFloor - 2); floor < fromFloor + VISIBLE_BRIDGES; floor++) {
    ensureBridge(floor);
  }
  for (const bridge of bridges) {
    if (bridge.floor >= Math.max(1, fromFloor - 2) && bridge.floor < fromFloor + VISIBLE_BRIDGES) {
      setupBridgeQuestion(bridge);
    }
  }
  state.round = fromFloor;
  state.score = resuming ? state.checkpointScore : 0;
  state.streak = resuming ? state.checkpointStreak : 0;
  state.perks = resuming ? [...state.checkpointPerks] : [];
  state.offeredPerkFloors = resuming ? [...state.checkpointOfferFloors] : [];
  state.runShards = resuming ? state.runShards : 0;
  state.runRescues = startingRescueCharges();
  state.runHistory = resuming ? (state.runHistory || []).filter(h => h.floor < state.checkpointFloor) : [];
  state.runStartedAt = performance.now();
  state.failureReason = '';
  state.failureBridgeType = '';
  state.previousBestFloor = profile.bestFloor || 1;
  state.restartMode = 'new';
  state.best = Math.max(state.best, profile.bestStreak || 0);
  if (!resuming) {
    profile.runs += 1;
    saveProfile();
  }
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
  clearOverlayExtra();
  setCoach('');
  checkpointSnapshot();

  syncQuestionHud();
  pruneOldBridges();
  updateHud();
  updateFloorMarkers();
  updateMetaUi();
  const startedBridge = activeBridge();
  let intro;
  if (startedBridge.tutorialStep > 0) {
    intro = 'Обучение. Главное правило: снимай НЕВЕРНЫЕ ответы — правильный должен остаться. Подойди к грибу — он провалится.';
    setCoach('Шаг 1 из 3: сними неверный гриб', 'good');
  } else if (fromFloor === 1) {
    intro = 'Сначала спокойно: снимай неверные грибы, правильный оставляй. Первые мосты мягче и учат базу.';
  } else {
    intro = `Продолжение с чекпоинта: мост ${fromFloor}.`;
  }
  setHint(`${intro} ${bridgeControlsHint(startedBridge)}`);
}

function updateHud() {
  roundEl.textContent = state.round;
  scoreEl.textContent = state.score;
  streakEl.textContent = state.streak;
  if (shardsEl) shardsEl.textContent = profile.shards;
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
  if (touchInputPreferred()) {
    return canUseMovingJump(bridge)
      ? 'На этом мосту держи направление и жми «Прыг» для короткого прыжка. Без направления «Прыг» работает как прыжок вверх после очистки.'
      : 'Кнопка «Прыг» нужна только для прыжка вверх после очистки. Камеру крути свайпом по свободной части экрана.';
  }
  return canUseMovingJump(bridge)
    ? 'На этом мосту движение + пробел = короткий прыжок, пробел без движения = прыжок вверх после очистки.'
    : 'На этом мосту пробел нужен только для прыжка вверх после очистки.';
}

// -------- Removing a weight by walking onto it --------
function maybePickup() {
  if (state.phase !== 'choose') return;
  if (state.pickupGrace > 0) return;
  const bridge = activeBridge();
  const pickRadius = effectivePickRadius(bridge);
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
      bridge.mistakes = (bridge.mistakes || 0) + 1;
      state.bridgeMistakes = bridge.mistakes;
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
    if (bridge.tutorialNoAmplify && w.isCorrect) {
      // Tutorial: don't let the player softlock the bridge by removing the correct mushroom.
      bridge.tiltVel = 0;
      bridge.tilt = 0;
      state.pickupGrace = 0.6;
      setHint('Правильный гриб надо ОСТАВЛЯТЬ. Снимай только НЕВЕРНЫЕ.');
      setCoach('Снимай НЕВЕРНЫЕ грибы', 'warn');
      return;
    }
    if (bridge.type === 'variedMass' && !w.isCorrect) {
      const nextIdx = bridge.massOrder.find(idx => {
        const item = bridge.weights.find(candidate => candidate.idx === idx);
        return item && !item.removed;
      });
      if (w.idx !== nextIdx) {
        bridge.mistakes = (bridge.mistakes || 0) + 1;
        state.bridgeMistakes = bridge.mistakes;
        bridge.tiltVel += Math.sign(w.slot || 1) * 1.0;
        setHint('Не тот порядок масс: сначала снимай меньшие грибы. Мост наказал наклоном.');
        return;
      }
    }

    w.removed = true; w.fallVy = 0;
    if (w.isCorrect) {
      bridge.mistakes = (bridge.mistakes || 0) + 1;
      state.bridgeMistakes = bridge.mistakes;
      const hasAntimagnet = (state.perks || []).includes('antimagnet');
      if (hasAntimagnet && !bridge.antimagnetRescue) {
        bridge.antimagnetRescue = true;
        setHint('Антимагнит сработал! Сними оставшиеся неверные и прыгай. Реликвия уйдёт после моста.');
        setCoach('Антимагнит спасает', 'warn');
      } else if (!bridge.tutorialNoAmplify) {
        bridge.amplify = true;
        state.amplify = true;
        setHint('Это был правильный ответ! Оставшиеся тянут сильнее…');
      } else {
        setHint('Это был правильный гриб — на обучении я ничего не делаю, но помни: его надо ОСТАВЛЯТЬ.');
      }
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
  if (wrongsHandled && correctLeft) return true;
  // Antimagnet rescue: lets the player jump even though the correct mushroom
  // is gone. The perk is consumed once they actually land on the next bridge.
  if (bridge.antimagnetRescue && wrongsHandled) return true;
  return false;
}

// -------- Input --------
const keys = new Set();
const virtualKeys = new Set();

function setVirtualKey(key, pressed) {
  const normalized = String(key || '').toLowerCase();
  if (!normalized) return;
  if (pressed) {
    virtualKeys.add(normalized);
    keys.add(normalized);
  } else {
    virtualKeys.delete(normalized);
    keys.delete(normalized);
  }
}

function clearVirtualKeys() {
  for (const key of virtualKeys) keys.delete(key);
  virtualKeys.clear();
  document.querySelectorAll('.touch-btn.active, .touch-jump.active')
    .forEach(btn => btn.classList.remove('active'));
}

function requestPlayerJump() {
  if (state.phase === 'idle') return;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (!tryGapJump()) tryJump();
}

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

function hasTouchDevice() {
  return (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
}

function tabletControlsPreferred() {
  const shortSide = Math.min(innerWidth, innerHeight);
  const longSide = Math.max(innerWidth, innerHeight);
  return hasTouchDevice() && shortSide >= 700 && longSide <= 1400;
}

function touchInputPreferred() {
  return matchMedia('(pointer: coarse)').matches || hasTouchDevice() || Math.min(innerWidth, innerHeight) < 760;
}

function updateTouchDeviceClass() {
  document.documentElement.classList.toggle('tablet-controls', tabletControlsPreferred());
}

updateTouchDeviceClass();

addEventListener('keydown', e => {
  if (state.phase === 'idle') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.key === ' ' || k === 'spacebar') {
    requestPlayerJump();
    e.preventDefault();
  }
}, { capture: true });
addEventListener('keyup', e => {
  const key = e.key.toLowerCase();
  if (!virtualKeys.has(key)) keys.delete(key);
});
addEventListener('blur', clearVirtualKeys);

function bindTouchControls() {
  if (!touchControls || touchControls.dataset.bound) return;
  touchControls.dataset.bound = '1';

  for (const btn of touchControls.querySelectorAll('[data-key]')) {
    const key = btn.dataset.key;
    // iOS Safari delays pointerdown near the left screen edge while it decides
    // whether the touch is a swipe-back gesture. touchstart + preventDefault
    // cancels that gesture path and makes the movement key immediate.
    const press = (e) => {
      e.preventDefault();
      btn.classList.add('active');
      setVirtualKey(key, true);
      if (e.pointerId !== undefined) {
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };
    const release = (e) => {
      e.preventDefault();
      btn.classList.remove('active');
      setVirtualKey(key, false);
      if (e.pointerId !== undefined) {
        try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('pointerdown', press, { passive: false });
    btn.addEventListener('pointerup', release, { passive: false });
    btn.addEventListener('pointercancel', release, { passive: false });
    btn.addEventListener('lostpointercapture', () => {
      btn.classList.remove('active');
      setVirtualKey(key, false);
    });
  }

  const jumpBtn = $('touch-jump');
  if (jumpBtn) {
    const releaseJump = () => jumpBtn.classList.remove('active');
    jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      jumpBtn.classList.add('active');
      requestPlayerJump();
      try { jumpBtn.setPointerCapture(e.pointerId); } catch (_) {}
    }, { passive: false });
    jumpBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      releaseJump();
      try { jumpBtn.releasePointerCapture(e.pointerId); } catch (_) {}
    }, { passive: false });
    jumpBtn.addEventListener('pointercancel', releaseJump);
    jumpBtn.addEventListener('lostpointercapture', releaseJump);
  }
}
bindTouchControls();

// Right-mouse-button drag rotates the camera on desktop; one-finger drag does it on touch screens.
let dragging = false, dragLastX = 0, dragLastY = 0;
function bindRendererInput() {
  if (!renderer || renderer.domElement.dataset.inputBound) return;
  renderer.domElement.dataset.inputBound = '1';
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', e => {
    const touchCamera = e.pointerType === 'touch' && touchInputPreferred();
    if (e.button === 2 || touchCamera) {
      e.preventDefault();
      dragging = true;
      dragLastX = e.clientX; dragLastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    }
  }, { passive: false });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.preventDefault();
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    dragLastX = e.clientX; dragLastY = e.clientY;
    state.cameraYaw -= dx * 0.005;
    state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + dy * 0.004, -0.15, 1.0);
  }, { passive: false });
  renderer.domElement.addEventListener('pointerup', e => {
    if (e.button === 2 || dragging) {
      dragging = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
      renderer.domElement.style.cursor = '';
    }
  });
  renderer.domElement.addEventListener('pointercancel', e => {
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
    renderer.domElement.style.cursor = '';
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
  const raisedEdgeLaunch = launchBridge.antimagnetRescue
    || (Math.abs(state.playerX) >= effectiveLaunchEdgeX() && launchLift >= effectiveLaunchLift());
  const jumpReach = effectiveJumpReach(launchBridge) + (launchBridge.antimagnetRescue ? 1.6 : 0);
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
function resetToSafeSpot(reason) {
  const bridge = activeBridge();
  state.runRescues = Math.max(0, state.runRescues - 1);
  state.onBridge = true;
  state.onUpper = false;
  state.jumping = false;
  state.jumpMode = 'none';
  state.launchSuccess = false;
  state.playerX = safeDeckXNear(bridge, 0, 0);
  state.playerZ = 0;
  state.playerY = 0;
  state.playerVY = 0;
  state.playerVX = 0;
  state.playerVZ = 0;
  state.slideVX = 0;
  state.pickupGrace = 0.6;
  state.phase = bridgeReadyToJump(bridge) ? 'jump' : 'choose';
  bridge.tilt = THREE.MathUtils.clamp(bridge.tilt, -0.18, 0.18);
  bridge.tiltVel *= 0.15;
  bridge.playerLoadX = state.playerX;
  bridge.group.rotation.z = -bridge.tilt;
  setCoach(`Спасение! Осталось: ${state.runRescues}`, 'warn');
  setHint(`${reason}. Канат вернул тебя на мост. Дыши, продолжай.`);
  Sound && Sound.good && Sound.good();
}

function bridgeKillerLabel() {
  const type = state.failureBridgeType || activeBridge()?.type || '';
  return BRIDGE_TYPE_LABELS[type] || type || 'мост';
}

function buildRunSummaryHtml({ outcome, reason, gained }) {
  const history = state.runHistory || [];
  const cleared = history.filter(h => !h.tutorial);
  const reached = state.round;
  const previousBest = state.previousBestFloor || 1;
  let delta = '';
  if (outcome === 'fail') {
    if (reached > previousBest) {
      delta = `<span class="sum-delta good">+${reached - previousBest} к рекорду (было ${previousBest})</span>`;
    } else if (reached === previousBest) {
      delta = `<span class="sum-delta">повторил рекорд ${previousBest}</span>`;
    } else {
      delta = `<span class="sum-delta bad">−${previousBest - reached} от рекорда ${previousBest}</span>`;
    }
  } else if (outcome === 'win') {
    delta = `<span class="sum-delta good">Башня закрыта!</span>`;
  }

  const grades = cleared.reduce((acc, h) => {
    if (h.grade) acc[h.grade] = (acc[h.grade] || 0) + 1;
    return acc;
  }, {});
  const gradesStr = ['S', 'A', 'B', 'C']
    .filter(g => grades[g])
    .map(g => `<b>${g}</b>×${grades[g]}`)
    .join(' · ') || '—';

  const cellList = history.map(h => {
    const label = BRIDGE_TYPE_LABELS[h.type] || h.type;
    const grade = h.tutorial ? '✓' : (h.grade || '—');
    const cls = h.tutorial ? 'grade-A' : `grade-${h.grade || 'C'}`;
    return `<div class="sum-floor ${cls}" title="${escapeHtml(label)}"><span class="sum-grade">${grade}</span>${h.floor}</div>`;
  });
  if (outcome === 'fail') {
    const failLabel = BRIDGE_TYPE_LABELS[state.failureBridgeType] || state.failureBridgeType || '';
    cellList.push(`<div class="sum-floor died" title="Здесь упал: ${escapeHtml(failLabel)}"><span class="sum-grade">✗</span>${reached}</div>`);
  }

  const perks = (state.perks || []).map(id => PERKS.find(p => p.id === id)?.name).filter(Boolean);
  const perksHtml = perks.length
    ? `<div class="sum-perks">${perks.map(n => `<span class="sum-perk">${escapeHtml(n)}</span>`).join('')}</div>`
    : `<div class="sum-empty">Реликвий в этом забеге не было.</div>`;

  const headline = outcome === 'fail'
    ? `Упал на мосту <b>${reached}</b> · ${escapeHtml(bridgeKillerLabel())}<br>${escapeHtml(reason)}`
    : 'Башня пройдена полностью';

  return `
    <div class="run-summary">
      <div class="sum-headline">${headline}<br>${delta}</div>
      <div class="sum-row"><span>Очки</span><span><b>${state.score}</b></span></div>
      <div class="sum-row"><span>Осколки за забег</span><span><b>+${gained}</b></span></div>
      <div class="sum-row"><span>Очищено мостов</span><span><b>${cleared.length}</b> (всего рекорд ${profile.bestFloor || 1})</span></div>
      <div class="sum-row"><span>Оценки</span><span>${gradesStr}</span></div>
      <div class="sum-section-title">Пройденные мосты</div>
      <div class="sum-floors">${cellList.join('')}</div>
      <div class="sum-section-title">Реликвии</div>
      ${perksHtml}
    </div>
  `;
}

function showRunEnd(reason, gained) {
  const checkpointText = state.restartMode === 'checkpoint'
    ? `Можно продолжить с чекпоинта (мост ${state.checkpointFloor}) или начать заново.`
    : 'Жми «Заново», чтобы пробовать ещё.';
  ovTitle.textContent = 'Падение';
  ovBody.innerHTML = checkpointText;
  if (ovRestart) ovRestart.textContent = state.restartMode === 'checkpoint' ? 'С чекпоинта' : 'Новый забег';
  overlayExtra.innerHTML = buildRunSummaryHtml({ outcome: 'fail', reason, gained });
  overlayExtra.hidden = false;
  if (ovRestart) ovRestart.hidden = false;
  overlay.hidden = false;
}

function fail(reason) {
  if (state.phase === 'over' || state.phase === 'win') return;
  if (state.runRescues > 0) {
    resetToSafeSpot(reason);
    return;
  }
  state.phase = 'over';
  state.best = Math.max(state.best, state.streak);
  state.failureReason = reason;
  state.failureBridgeType = activeBridge()?.type || '';
  // state.previousBestFloor was snapshotted at startRound — leave it as the
  // pre-run record so the summary can show a real delta.
  const reached = Math.max(state.round, profile.bestFloor || 1);
  profile.bestFloor = reached;
  profile.bestStreak = Math.max(profile.bestStreak || 0, state.best);
  const gained = grantShards(Math.max(3, Math.floor(state.round * 1.4) + Math.floor(state.score / 350)));
  state.restartMode = state.checkpointFloor > 1 && state.round >= state.checkpointFloor ? 'checkpoint' : 'new';
  state.streak = 0;
  Sound && Sound.crash && Sound.crash();
  saveProfile();
  updateMetaUi();
  updateHud();
  setTimeout(() => showRunEnd(reason, gained), 700);
}

function awardBridge(bridge) {
  if (bridge.scored) return;
  bridge.scored = true;
  bridge.done = true;
  const tutorialClear = bridge.tutorialStep > 0;
  const grade = bridgeGrade(bridge);
  const baseScore = tutorialClear ? 30 : 100 + state.streak * 25 + grade.scoreBonus;
  const scoreGain = Math.round(baseScore * runModMul('scoreMul'));
  state.score += scoreGain;
  if (!tutorialClear) state.runShards += grantShards(grade.shards);
  state.lastGrade = tutorialClear ? '' : grade.label;
  bridge.grade = tutorialClear ? '' : grade.label;
  bridge.elapsed = bridge.startedAt ? (performance.now() - bridge.startedAt) / 1000 : 0;
  state.runHistory.push({
    floor: bridge.floor,
    type: bridge.type,
    grade: bridge.grade,
    mistakes: bridge.mistakes || 0,
    maxTilt: bridge.maxAbsTilt || 0,
    elapsed: bridge.elapsed,
    tutorial: tutorialClear,
  });
  state.streak += 1;
  state.best = Math.max(state.best, state.streak);
  profile.bestFloor = Math.max(profile.bestFloor || 1, bridge.floor + 1);
  profile.bestStreak = Math.max(profile.bestStreak || 0, state.best);
  if (tutorialClear && bridge.tutorialStep === TUTORIAL_SCRIPT.length && !profile.tutorialDone) {
    profile.tutorialDone = true;
    bridgeTypeCache.clear();
    setCoach('Обучение пройдено! Дальше — настоящие мосты.', 'good');
  } else if (!tutorialClear) {
    setCoach(`Оценка ${grade.label}: +${grade.shards} оск.`, grade.label === 'S' || grade.label === 'A' ? 'good' : '');
  } else {
    setCoach('Шаг обучения пройден.', 'good');
  }
  saveProfile();
  Sound && Sound.good && Sound.good();
  updateHud();
  updateMetaUi();
  updateFloorMarkers();
}

function finishTower() {
  if (state.phase === 'win' || state.phase === 'over') return;
  awardBridge(activeBridge());
  state.phase = 'win';
  setHint('Башня из мостов пройдена! Все задания закрыты.');
  // previousBestFloor was set at startRound — keep it for the delta in the summary.
  const bonus = grantShards(25 + state.streak * 2);
  markProfileProgress();
  setTimeout(() => {
    ovTitle.textContent = 'Все мосты пройдены';
    ovBody.textContent = `Финальный счёт ${state.score}. Серия ${state.streak}. Бонус башни +${bonus} осколков.`;
    if (ovRestart) ovRestart.textContent = 'Новый забег';
    overlayExtra.innerHTML = buildRunSummaryHtml({ outcome: 'win', reason: '', gained: bonus });
    overlayExtra.hidden = false;
    if (ovRestart) ovRestart.hidden = false;
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
  if (clearedBridge.antimagnetRescue) {
    state.perks = (state.perks || []).filter(p => p !== 'antimagnet');
    setCoach('Антимагнит израсходован', 'warn');
    updateMetaUi();
  }
  targetBridge.lockedX = targetBridge.group.position.x;
  if (targetBridge.missingSections?.length) {
    targetBridge.tilt = THREE.MathUtils.clamp(targetBridge.tilt, -0.18, 0.18);
    targetBridge.tiltVel *= 0.15;
    targetBridge.group.rotation.z = -targetBridge.tilt;
  }
  const safeLandingX = safeDeckXNear(targetBridge, landingLocalX, state.playerZ);
  state.playerX = THREE.MathUtils.clamp(safeLandingX, -LOWER_LEN / 2 + 0.25, LOWER_LEN / 2 - 0.25);
  // On bridges with a missing deck section the mushrooms sit right where the
  // natural landing X would put the player — push them to the back-rail strip
  // and re-center on the middle so they can't accidentally pick a mushroom on
  // landing. The mushrooms here are all on z≈0.
  if (targetBridge.missingSections?.length) {
    state.playerZ = LOWER_WID / 2 - 0.4;
    state.playerX = safeDeckXNear(targetBridge, 0, state.playerZ);
  }
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
  markProfileProgress();
  if (isCheckpointFloor(state.round)) {
    checkpointSnapshot();
    setCoach(`Чекпоинт: мост ${state.round}`, 'good');
  }
  if (shouldOfferPerkOnFloor(state.round) && showPerkChoice()) {
    updateMetaUi();
    return;
  }
  if (state.phase !== 'paused') {
    if (targetBridge.tutorialStep > 0) {
      const step = targetBridge.tutorialStep;
      const lines = {
        1: 'Шаг 1 из 3: подойди к неверному грибу — он провалится. Правильный оставляем.',
        2: 'Шаг 2 из 3: сними 3 неверных. Каждый снятый гриб качает мост в сторону оставшихся.',
        3: 'Шаг 3 из 3: сними 3 неверных. Когда останется один правильный — мост перекосит. Встань на поднятый край и жми ПРОБЕЛ.',
      };
      setCoach(`Шаг ${step} из ${TUTORIAL_SCRIPT.length}`, 'good');
      setHint(`${lines[step] || ''} ${bridgeControlsHint(targetBridge)}`);
    } else {
      setHint(`Ты на следующем мосту. Он продолжает качаться — снимай неверные ответы. ${bridgeControlsHint(targetBridge)}`);
    }
  }
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
    if (bridge.amplify && !w.isCorrect) m = 3 * runModMul('amplifyWeightMul');
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

  if (bridge.tutorialNoTilt) {
    bridge.tilt = 0;
    bridge.tiltVel = 0;
    bridge.group.position.y = bridge.baseY;
    bridge.group.rotation.z = 0;
    return;
  }

  const stats = bridgeWeightStats(bridge);
  let imbalance = stats.imbalance;

  if (isActive && state.onBridge && !state.jumping) {
    const loadFollow = 1 - Math.exp(-PLAYER_LOAD_FOLLOW_RATE * runModMul('loadFollowMul') * dt);
    bridge.playerLoadX += (state.playerX - bridge.playerLoadX) * loadFollow;
    state.playerLoadX = bridge.playerLoadX;
    imbalance += bridge.playerLoadX * effectivePlayerMass();
  }
  for (const remoteLoad of Coop.bridgeLoads(bridge.floor)) {
    imbalance += remoteLoad.x * remoteLoad.mass;
  }

  bridge.wobbleT += dt;
  const massAmp = Math.min(0.34, stats.loadSpan * 0.018 + Math.abs(stats.imbalance) * 0.012);
  const wobbleAmp = bridge.type === 'rocking' ? 0.08 + massAmp : 0;
  const wobbleTarget = Math.sin(bridge.wobbleT * bridge.wobbleFreq) * wobbleAmp;
  const spring = Math.max(1.4, K_SPRING + runModAdd('springAdd'));
  const damp = Math.max(0.55, C_DAMP + runModAdd('dampAdd'));
  const torque = imbalance * K_GRAV - (bridge.tilt - wobbleTarget) * spring - bridge.tiltVel * damp;
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
    // Bird only menaces the player AFTER the bridge is clear, while they're
    // supposed to be jumping. Reading the question itself is safe.
    const shouldHunt = state.phase === 'jump';
    if (shouldHunt) {
      bridge.idleT = moveIntent < 0.08 ? (bridge.idleT || 0) + dt : 0;
    } else {
      bridge.idleT = 0;
    }
    if (bridge.bird) {
      bridge.bird.visible = bridge.idleT > 1.5;
      bridge.bird.position.x = -6 + Math.min(1, Math.max(0, bridge.idleT - 1.5)) * 6;
      bridge.bird.position.z = state.playerZ;
    }
    if (bridge.idleT > 3.5 + runModAdd('birdPatienceAdd') + earlyMercyForFloor() * 0.8) {
      state.playerX = bridgeWorldXFromLocal(bridge, state.playerX);
      state.onBridge = false;
      state.playerVX = 0;
      state.playerVZ = 3;
      state.playerVY = 0.3;
      fail('Птица сбила тебя, потому что ты слишком долго стоял на очищенном мосту');
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
  if (state.phase === 'paused') return;
  state.upperT += dt;
  state.pickupGrace = Math.max(0, state.pickupGrace - dt);
  const currentBridge = activeBridge();

  // === All bridges keep rocking in the stack ===
  for (const bridge of bridges) {
    updateBridgePhysics(bridge, dt, bridge === currentBridge);
  }
  state.tilt = currentBridge.tilt;
  currentBridge.maxAbsTilt = Math.max(currentBridge.maxAbsTilt || 0, Math.abs(state.tilt));
  state.bridgeMaxTilt = currentBridge.maxAbsTilt;

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
    let { vx: walkVx, vz: walkVz } = localMoveVelocity(forward, strafe, WALK_SPEED * runModMul('walkSpeedMul'));

    // Slope drift along X (the slope axis). Static friction first.
    const gSin = 9.8 * Math.sin(state.tilt);
    const gCos = 9.8 * Math.cos(state.tilt);
    const onIce = currentBridge.iceBand && state.playerZ >= currentBridge.iceBand.zMin && state.playerZ <= currentBridge.iceBand.zMax;
    const iceHasGrip = onIce && runModFlag('iceUphill');
    const grip = ((onIce && !iceHasGrip) ? 0 : STATIC_MU * runModMul('gripMul') + earlyMercyForFloor() * 0.06) * gCos;
    if (Math.abs(gSin) > grip) {
      const excess = (Math.abs(gSin) - grip) * Math.sign(gSin);
      state.slideVX += excess * dt;
    } else {
      // Feet hold — drift bleeds off quickly.
      state.slideVX *= Math.pow(0.05, dt * 8);
    }

    const downhillDir = Math.sign(gSin);
    if (onIce && !runModFlag('iceUphill') && downhillDir && walkVx * downhillDir < 0) {
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
        walkVz += currentBridge.windDir * 1.85 * runModMul('windPushMul') * (1 - earlyMercyForFloor() * 0.22);
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
  for (const bridge of bridges) updateTutorialMarkers(bridge, dt);

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
    } else if (Math.abs(state.tilt) > effectiveFailTilt()) {
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
  state.worldX = px;
  state.worldY = py;
  state.worldZ = pz;
  // Lean with whichever bridge is supporting the player
  if (state.onUpper || (state.onBridge && !state.jumping)) player.rotation.z = -activeBridge().tilt * 0.5;
  else player.rotation.z = 0;
  // Face the forward direction
  player.rotation.y = state.cameraYaw + Math.PI;
  Coop.updateRemoteMeshes();
  Coop.tick(dt);

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
  const tiltPct = THREE.MathUtils.clamp(state.tilt / effectiveFailTilt(), -1, 1);
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
    const lift01 = THREE.MathUtils.clamp(launchLift / effectiveLaunchLift(), 0, 1);
    const edge01 = THREE.MathUtils.clamp((Math.abs(state.playerX) - 0.6) / (effectiveLaunchEdgeX() - 0.6), 0, 1);
    // Normalised: 0 = not ready; 1 = bridge is close and the current bridge has lifted the player enough.
    const reach01 = THREE.MathUtils.clamp(1 - (gap - 1.5) / 4.5, 0, 1) * lift01 * edge01;
    phaseNeedle.style.left = (reach01 * 100) + '%';
    if (state.phase === 'jump' && reach01 > 0.84 && !state.spacePromptReady) {
      state.spacePromptReady = true;
      setCoach(touchInputPreferred() ? 'Жми «Прыг»!' : 'Жми ПРОБЕЛ!', 'good');
    } else if (state.phase === 'jump' && reach01 < 0.45 && state.spacePromptReady) {
      state.spacePromptReady = false;
      setCoach('');
    }
  } else {
    phaseNeedle.style.left = '100%';
  }

  // Subtle water shimmer
  water.material.color.setHSL(0.58, 0.55, 0.27 + 0.02 * Math.sin(state.upperT * 1.7));
}

// -------- Boot --------
let bootStartBusy = false;

function setBootStartBusy(button, busy) {
  if (!button) return;
  if (!button.dataset.readyText) button.dataset.readyText = button.textContent;
  button.disabled = busy;
  button.classList.toggle('loading', busy);
  button.textContent = busy ? 'AI грузит...' : button.dataset.readyText;
}

async function prepareQuizForStart() {
  if (typeof window.prepareMostyQuiz !== 'function') return;
  try {
    await window.prepareMostyQuiz({ floors: VISIBLE_BRIDGES, startFloor: 1 });
  } catch (err) {
    // Pool prep failed — fall back to the legacy in-file question bank,
    // pickQuestion already handles that path. Don't block the start button.
    console.warn('AI quiz prepare failed, falling back to local bank:', err);
  }
}

function showRendererError() {
  boot.hidden = true;
  ovTitle.textContent = 'WebGL не запустился';
  ovBody.textContent = rendererError
    ? 'Встроенный браузер не выдал WebGL-контекст. Перезагрузи вкладку или открой игру во внешнем браузере.'
    : '3D-рендер еще не готов. Попробуй перезагрузить вкладку.';
  overlay.hidden = false;
}

$('start').addEventListener('click', async e => {
  if (bootStartBusy) return;
  const button = e.currentTarget;
  button.blur();
  if (!renderer && !initRenderer()) {
    showRendererError();
    return;
  }
  bootStartBusy = true;
  setBootStartBusy(button, true);
  try {
    await prepareQuizForStart();
    Sound && Sound.set && Sound.set(true);
    if (ovRestart) ovRestart.textContent = 'Заново';
    boot.hidden = true;
    started = true;
    startRound();
  } catch (error) {
    console.warn('Mosty quiz prepare failed:', error);
    const status = document.getElementById('learning-status');
    if (status) status.textContent = 'AI не загрузился. Нажми «Начать» еще раз.';
  } finally {
    bootStartBusy = false;
    setBootStartBusy(button, false);
  }
});
$('ov-restart').addEventListener('click', e => {
  e.currentTarget.blur();
  if (!renderer && !initRenderer()) {
    overlay.hidden = true;
    showRendererError();
    return;
  }
  const resumeCheckpoint = state.restartMode === 'checkpoint' && state.checkpointFloor > 1;
  const fromFloor = resumeCheckpoint ? state.checkpointFloor : 1;
  state.score = resumeCheckpoint ? state.checkpointScore : 0;
  state.round = fromFloor;
  state.streak = resumeCheckpoint ? state.checkpointStreak : 0;
  if (ovRestart) ovRestart.textContent = 'Заново';
  startRound({ fromFloor, resumeCheckpoint });
});

window.MOSTY_GAME_READY = true;
