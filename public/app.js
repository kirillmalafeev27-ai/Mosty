(() => {
  const $ = id => document.getElementById(id);
  const lobby = $('lobby'), stage = $('stage'), root = $('game-root');
  const overlay = $('overlay'), ovTitle = $('ov-title'), ovBody = $('ov-body');

  const state = {
    mode: null,
    score: 0,
    streak: 0,
    lives: 3,
    speed: 1.0,
    cat: 'mix',
    diff: 'normal',
    activeGame: null
  };

  const MODE_FACTORY = {
    bridge: () => Modes.bridge(api),
    ring:   () => Modes.ring(api),
    lanes:  () => Modes.lanes(api),
    fuse:   () => Modes.fuse(api)
  };

  const api = {
    pick: () => window.pickQuestion(state.cat),
    diff: () => state.diff,
    speed: () => state.speed,
    onCorrect(scoreGain = 100) {
      state.streak += 1;
      const mult = 1 + Math.min(state.streak * 0.1, 2.0);
      state.score += Math.round(scoreGain * mult);
      state.speed = Math.min(1 + state.streak * 0.07, 2.6);
      Sound.good();
      renderHud();
    },
    onWrong(reason = 'wrong') {
      state.streak = 0;
      state.lives -= 1;
      state.speed = Math.max(1.0, state.speed - 0.4);
      Sound.bad();
      renderHud();
      if (state.lives <= 0) endRun(reason);
    },
    onTimeout() { api.onWrong('timeout'); },
    gameOver: (reason) => endRun(reason),
    sound: Sound
  };

  function renderHud() {
    $('score').textContent = state.score;
    $('streak').textContent = state.streak;
    $('mult').textContent = 'x' + (1 + Math.min(state.streak * 0.1, 2.0)).toFixed(1);
    $('lives').textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
    $('speed').textContent = state.speed.toFixed(1) + 'x';
  }

  function startMode(mode) {
    state.mode = mode;
    state.score = 0; state.streak = 0; state.lives = 3; state.speed = 1.0;
    renderHud();
    lobby.hidden = true; stage.hidden = false; $('back-btn').hidden = false;
    overlay.hidden = true;
    root.innerHTML = '';
    state.activeGame = MODE_FACTORY[mode]();
    state.activeGame.start();
  }

  function endRun(reason) {
    if (state.activeGame && state.activeGame.stop) state.activeGame.stop();
    Sound.crash();
    ovTitle.textContent = reason === 'win' ? 'Чисто!' : 'Падение';
    ovBody.textContent = `Очки: ${state.score} · Лучшая серия: ${state.bestStreak || 0}`;
    overlay.hidden = false;
  }

  function backToLobby() {
    if (state.activeGame && state.activeGame.stop) state.activeGame.stop();
    state.activeGame = null;
    stage.hidden = true; lobby.hidden = false; $('back-btn').hidden = true;
    overlay.hidden = true;
  }

  // Track best streak across attempts
  const origCorrect = api.onCorrect;
  api.onCorrect = function(...args) {
    origCorrect.apply(this, args);
    state.bestStreak = Math.max(state.bestStreak || 0, state.streak);
  };

  // Wire up
  document.querySelectorAll('.mode-card').forEach(b => {
    b.addEventListener('click', () => startMode(b.dataset.mode));
  });
  $('back-btn').addEventListener('click', backToLobby);
  $('ov-menu').addEventListener('click', backToLobby);
  $('ov-again').addEventListener('click', () => startMode(state.mode));
  $('cat-select').addEventListener('change', e => state.cat = e.target.value);
  $('diff-select').addEventListener('change', e => state.diff = e.target.value);
  $('sound-toggle').addEventListener('change', e => Sound.set(e.target.checked));

  // Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.activeGame && state.activeGame.pause) state.activeGame.pause();
    else if (!document.hidden && state.activeGame && state.activeGame.resume) state.activeGame.resume();
  });

  renderHud();
})();
