// =========================================================
//  SNAKE · THE GOLDEN CIRCLE  |  script.js  v4
//  Grid logika + fiksni tick (ista brzina na 60Hz i 120Hz),
//  glatko iscrtavanje, retina canvas, PWA, touch kontrole.
// =========================================================
"use strict";

(() => {
  // ---------- STORAGE (radi i u private modu) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    },
  };

  // ---------- KONFIGURACIJA ----------
  const CELLS = 20;
  const COMBO_WINDOW = 2500;      // ms igre između dva zalogaja za combo
  const BONUS_LIFETIME = 8000;    // ms
  const BONUS_POINTS = 5;
  const DEATH_DELAY = 950;        // ms animacije pre ekrana "kraj igre"

  const SPEEDS = {
    easy:   { label: "Easy",   tick: 150 },
    normal: { label: "Normal", tick: 100 },
    hard:   { label: "Hard",   tick: 67 },
  };

  const THEMES = {
    gold: {
      label: "Gold", board: "#0c0c0c", grid: "rgba(255,177,50,0.045)",
      head: "#FFB132", tailFrom: "#E59A22", tailTo: "#5E3F0E", eye: "#111111",
      food: "#FFB132", foodRing: "rgba(255,177,50,0.35)", text: "#FFB132", crownAlpha: 0.07,
    },
    cream: {
      label: "Cream", board: "#F7F3EA", grid: "rgba(17,17,17,0.06)",
      head: "#111111", tailFrom: "#2a2a2a", tailTo: "#a39b8c", eye: "#FFB132",
      food: "#FFB132", foodRing: "rgba(17,17,17,0.35)", text: "#111111", crownAlpha: 0.13,
    },
    noir: {
      label: "Noir", board: "#000000", grid: "rgba(255,255,255,0.045)",
      head: "#FFFFFF", tailFrom: "#E6E6E6", tailTo: "#3a3a3a", eye: "#111111",
      food: "#FFB132", foodRing: "rgba(255,177,50,0.35)", text: "#FFFFFF", crownAlpha: 0.06,
    },
  };

  const ACHIEVEMENTS = [
    { id: "first_blood", name: "Prva krv",        desc: "Pojedi prvi zlatni krug" },
    { id: "combo3",      name: "Combo x3",        desc: "Postigni combo x3" },
    { id: "combo5",      name: "Combo x5",        desc: "Postigni combo x5" },
    { id: "score10",     name: "Desetka",         desc: "Dostigni 10 poena" },
    { id: "score25",     name: "Četvrt veka",     desc: "Dostigni 25 poena" },
    { id: "score50",     name: "Zlatni nivo",     desc: "Dostigni 50 poena" },
    { id: "golden_food", name: "Zlatni zalogaj",  desc: "Pojedi bonus zlatni krug" },
    { id: "all_themes",  name: "Kolekcionar",     desc: "Isprobaj sve 3 teme" },
    { id: "daily_done",  name: "Dnevni izazov",   desc: "Završi Daily izazov" },
  ];

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const canvas = $("#game");
  const ctx = canvas.getContext("2d");
  const ui = {
    stage: $("#stage"), board: $("#board"),
    score: $("#score"), best: $("#best"), combo: $("#combo"), comboBox: $("#combo-box"),
    pauseBtn: $("#pause-btn"), soundBtn: $("#sound-btn"),
    menu: $("#menu-screen"), pause: $("#pause-screen"), over: $("#over-screen"),
    startBtn: $("#start-btn"), dailyBtn: $("#daily-btn"),
    resumeBtn: $("#resume-btn"), pauseMenuBtn: $("#pause-menu-btn"),
    againBtn: $("#again-btn"), shareBtn: $("#share-btn"), overMenuBtn: $("#over-menu-btn"),
    overScore: $("#over-score"), overMode: $("#over-mode"), recordBadge: $("#record-badge"),
    panel: $("#panel"), panelBtn: $("#panel-btn"), panelClose: $("#panel-close"), scrim: $("#scrim"),
    lbTitle: $("#lb-title"), scoresList: $("#scores-list"), dailyLine: $("#daily-line"),
    achTitle: $("#ach-title"), achList: $("#achievements-list"), toasts: $("#toasts"),
  };

  const crownImg = new Image();
  crownImg.src = "assets/crown.png";

  // ---------- STANJE ----------
  let speedKey = SPEEDS[store.get("gc_speed", "easy")] ? store.get("gc_speed", "easy") : "easy";
  let themeKey = THEMES[store.get("gc_theme", "gold")] ? store.get("gc_theme", "gold") : "gold";
  let theme = THEMES[themeKey];
  let isMuted = store.get("isMuted", false) === true;
  let unlocked = store.get("achievements", []);
  if (!Array.isArray(unlocked)) unlocked = [];
  let usedThemes = store.get("gc_usedThemes", []);
  if (!Array.isArray(usedThemes)) usedThemes = [];

  // "menu" | "countdown" | "playing" | "paused" | "dying" | "over"
  let state = "menu";
  let snake = [], prevSnake = [], dir = DIRS.right, dirQueue = [], grow = 0;
  let food = null, bonus = null, nextBonusAt = 0;
  let score = 0, combo = 0, lastEatAt = -Infinity;
  let gameTime = 0, tickAcc = 0, countdown = 0, lastCountNum = 0;
  let deathTimer = 0, shake = 0;
  let isDaily = false, rng = Math.random, runSpeed = speedKey;
  let particles = [], floats = [];
  let lastSavedIndex = -1;

  // canvas metrika
  let cssSize = 300, dpr = 1, unit = 15; // unit = px po ćeliji (device px)

  // ---------- POMOĆNE ----------
  const rand = () => rng();
  const lerp = (a, b, t) => a + (b - a) * t;
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }
  function seeded(seed) { // mulberry32
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dailyKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function dailySeed() {
    const k = "gc-snake-" + dailyKey();
    let h = 2166136261;
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function getDailyScore() {
    try { const v = localStorage.getItem("daily_" + dailyKey()); return v === null ? null : Number(v); }
    catch (e) { return null; }
  }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ---------- AUDIO ----------
  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function tone(type, f1, f2, dur, vol, delay = 0) {
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t0);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur * 0.7);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur);
  }
  function sound(name) {
    if (isMuted || !audioCtx) return;
    try {
      switch (name) {
        case "eat":   tone("square", 440, 880, 0.12, 0.08); break;
        case "combo": tone("triangle", 660, 1320, 0.18, 0.12); break;
        case "bonus": tone("sine", 880, 0, 0.18, 0.14); tone("sine", 1175, 0, 0.22, 0.14, 0.1); break;
        case "death": tone("sawtooth", 300, 60, 0.45, 0.12); break;
        case "count": tone("sine", 660, 0, 0.14, 0.12); break;
        case "go":    tone("sine", 880, 1320, 0.25, 0.14); break;
        case "click": tone("sine", 520, 0, 0.05, 0.05); break;
      }
    } catch (e) {}
  }

  // ---------- CANVAS VELIČINA ----------
  function fitBoard() {
    const w = ui.stage.clientWidth;
    const h = ui.stage.clientHeight;
    let size = Math.floor(Math.min(w, h, 680));
    size = Math.max(160, size - (size % CELLS)); // celi pikseli po ćeliji = oštra mreža
    cssSize = size;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    ui.board.style.width = size + "px";
    ui.board.style.height = size + "px";
    ui.board.classList.toggle("is-compact", size < 400);
    ui.board.classList.toggle("is-tiny", size < 330);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    unit = canvas.width / CELLS;
    render();
  }
  if ("ResizeObserver" in window) new ResizeObserver(fitBoard).observe(ui.stage);
  else window.addEventListener("resize", fitBoard);

  // ---------- IGRA ----------
  function freeCells() {
    const taken = new Set(snake.map((p) => p.x + "," + p.y));
    if (food) taken.add(food.x + "," + food.y);
    if (bonus) taken.add(bonus.x + "," + bonus.y);
    const free = [];
    for (let y = 0; y < CELLS; y++)
      for (let x = 0; x < CELLS; x++)
        if (!taken.has(x + "," + y)) free.push({ x, y });
    return free;
  }
  function spawnFood() {
    const free = freeCells();
    food = free.length ? free[Math.floor(rand() * free.length)] : null;
    if (food) food.born = gameTime;
  }
  function spawnBonus() {
    const free = freeCells();
    if (!free.length) return;
    bonus = free[Math.floor(rand() * free.length)];
    bonus.born = gameTime;
    bonus.expires = gameTime + BONUS_LIFETIME;
  }
  function scheduleBonus() { nextBonusAt = gameTime + 15000 + rand() * 10000; }

  function newRun(daily) {
    isDaily = daily;
    rng = daily ? seeded(dailySeed()) : Math.random;
    runSpeed = daily ? "normal" : speedKey;
    const mid = Math.floor(CELLS / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    prevSnake = snake.map((p) => ({ ...p }));
    dir = DIRS.right; dirQueue = []; grow = 0;
    food = null; bonus = null;
    score = 0; combo = 0; lastEatAt = -Infinity;
    gameTime = 0; tickAcc = 0;
    particles = []; floats = []; shake = 0;
    lastSavedIndex = -1;
    spawnFood();
    scheduleBonus();
    updateHud();
    updateLeaderboard();
    hideScreens();
    startCountdown(3);
  }

  function startCountdown(n) {
    state = "countdown";
    countdown = n * 700;
    lastCountNum = 0;
    ui.pauseBtn.disabled = false;
  }

  function queueDir(name) {
    if (state !== "playing" && state !== "countdown") return;
    const d = DIRS[name];
    if (!d) return;
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
    if (dirQueue.length < 2) dirQueue.push(d);
  }

  function step() {
    prevSnake = snake.map((p) => ({ ...p }));
    if (dirQueue.length) dir = dirQueue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // zid
    if (head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS) return die();

    const eatsFood = food && head.x === food.x && head.y === food.y;
    const eatsBonus = bonus && head.x === bonus.x && head.y === bonus.y;
    const growing = grow > 0 || eatsFood || eatsBonus;

    // telo (rep se pomera ako ne raste, pa ta ćelija nije prepreka)
    const body = growing ? snake : snake.slice(0, -1);
    if (body.some((p) => p.x === head.x && p.y === head.y)) return die();

    snake.unshift(head);
    if (grow > 0) grow--;
    else if (!eatsFood && !eatsBonus) snake.pop();

    if (eatsFood) eat(1, false, head);
    if (eatsBonus) eat(BONUS_POINTS, true, head);
  }

  function eat(points, isBonus, at) {
    combo = gameTime - lastEatAt <= COMBO_WINDOW ? combo + 1 : 1;
    lastEatAt = gameTime;
    const mult = combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
    const earned = points * mult;
    score += earned;

    const cx = at.x + 0.5, cy = at.y + 0.5;
    if (isBonus) {
      bonus = null;
      scheduleBonus();
      sound("bonus");
      vibrate(25);
      burst(cx, cy, theme.food, 46, 7);
      floats.push(makeFloat(cx, cy, `+${earned} BONUS`, theme.food));
      unlock("golden_food");
    } else {
      spawnFood();
      if (combo >= 3) {
        sound("combo");
        burst(cx, cy, theme.food, 30, 6);
        floats.push(makeFloat(cx, cy, `COMBO x${combo}`, theme.food));
      } else {
        sound("eat");
        burst(cx, cy, theme.food, 16, 4);
        if (combo === 2) floats.push(makeFloat(cx, cy, "x2", theme.text));
      }
      vibrate(8);
    }

    if (score >= 1) unlock("first_blood");
    if (combo >= 3) unlock("combo3");
    if (combo >= 5) unlock("combo5");
    if (score >= 10) unlock("score10");
    if (score >= 25) unlock("score25");
    if (score >= 50) unlock("score50");

    updateHud(true);
  }

  function die() {
    state = "dying";
    deathTimer = DEATH_DELAY;
    ui.pauseBtn.disabled = true;
    sound("death");
    vibrate([35, 40, 35]);
    shake = 1;
    const segs = snake.slice(0, 60);
    segs.forEach((p, i) => {
      const c = i === 0 ? theme.head : mixHex(theme.tailFrom, theme.tailTo, i / Math.max(1, snake.length - 1));
      burst(p.x + 0.5, p.y + 0.5, c, 5, 5);
    });
    snake = [];
    prevSnake = [];
    saveResult();
  }

  function saveResult() {
    if (isDaily) {
      try { localStorage.setItem("daily_" + dailyKey(), String(score)); } catch (e) {}
      unlock("daily_done");
      lastSavedIndex = -1;
      updateLeaderboard();
      return;
    }
    const key = "gc_scores_" + runSpeed;
    let list = store.get(key, []);
    if (!Array.isArray(list)) list = [];
    const prevBest = list[0] || 0;
    list.push(score);
    list.sort((a, b) => b - a);
    list = list.slice(0, 5);
    store.set(key, list);
    lastSavedIndex = score > 0 ? list.indexOf(score) : -1;
    ui.recordBadge.classList.toggle("hidden", !(score > 0 && score > prevBest));
    updateLeaderboard();
  }

  function showGameOver() {
    state = "over";
    ui.overScore.textContent = score;
    ui.overMode.textContent = isDaily ? `DAILY · ${dailyKey()}` : SPEEDS[runSpeed].label.toUpperCase();
    if (isDaily) ui.recordBadge.classList.add("hidden");
    ui.againBtn.textContent = isDaily ? "NOVA IGRA" : "IGRAJ PONOVO";
    showScreen(ui.over);
    updateDailyBtn();
  }

  function pauseGame() {
    if (state !== "playing" && state !== "countdown") return;
    state = "paused";
    showScreen(ui.pause);
  }
  function resumeGame() {
    if (state !== "paused") return;
    hideScreens();
    startCountdown(3);
  }
  function toMenu() {
    state = "menu";
    snake = []; prevSnake = []; food = null; bonus = null;
    particles = []; floats = [];
    ui.pauseBtn.disabled = true;
    isDaily = false;
    updateHud();
    updateLeaderboard();
    updateDailyBtn();
    showScreen(ui.menu);
  }

  // ---------- EFEKTI ----------
  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed;
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 1, decay: 1.4 + Math.random() * 1.2,
        size: 0.12 + Math.random() * 0.18, color,
      });
    }
  }
  function makeFloat(x, y, text, color) { return { x, y, text, color, life: 1 }; }

  // ---------- UPDATE ----------
  function update(dt) {
    if (state === "countdown") {
      countdown -= dt;
      const n = Math.ceil(countdown / 700);
      if (n !== lastCountNum && n > 0) { lastCountNum = n; sound("count"); }
      if (countdown <= 0) {
        state = "playing";
        tickAcc = 0;
        sound("go");
        floats.push(makeFloat(CELLS / 2, CELLS / 2 + 0.6, "GO", theme.text));
      }
    }

    if (state === "playing") {
      gameTime += dt;
      tickAcc += dt;
      const tick = SPEEDS[runSpeed].tick;
      let guard = 0;
      while (tickAcc >= tick && state === "playing" && guard++ < 5) {
        tickAcc -= tick;
        step();
      }
      if (bonus && gameTime >= bonus.expires) { bonus = null; scheduleBonus(); }
      if (!bonus && gameTime >= nextBonusAt) spawnBonus();
      if (combo > 0 && gameTime - lastEatAt > COMBO_WINDOW) { combo = 0; updateHud(); }
    }

    if (state === "dying") {
      deathTimer -= dt;
      if (deathTimer <= 0) showGameOver();
    }

    if (state !== "paused") {
      const s = dt / 1000;
      particles.forEach((p) => {
        p.x += p.vx * s; p.y += p.vy * s;
        p.vx *= 0.94; p.vy *= 0.94;
        p.life -= p.decay * s;
      });
      particles = particles.filter((p) => p.life > 0);
      floats.forEach((f) => { f.y -= 1.6 * s; f.life -= 1.1 * s; });
      floats = floats.filter((f) => f.life > 0);
      shake = Math.max(0, shake - s * 2.2);
    }
  }

  // ---------- RENDER ----------
  function render() {
    const W = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.board;
    ctx.fillRect(0, 0, W, W);

    let sx = 0, sy = 0;
    if (shake > 0) {
      const amp = shake * shake * unit * 0.45;
      sx = (Math.random() - 0.5) * amp;
      sy = (Math.random() - 0.5) * amp;
    }
    ctx.setTransform(unit, 0, 0, unit, sx, sy); // od sada crtamo u jedinicama ćelija

    drawGrid();
    drawCrown();
    drawFood();
    drawBonus();
    drawSnake();
    drawParticles();

    ctx.setTransform(1, 0, 0, 1, sx, sy); // tekst u pikselima
    drawFloats();
    if (state === "countdown") drawCountdown();
  }

  function drawGrid() {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = dpr / unit;
    ctx.beginPath();
    for (let i = 1; i < CELLS; i++) {
      ctx.moveTo(i, 0); ctx.lineTo(i, CELLS);
      ctx.moveTo(0, i); ctx.lineTo(CELLS, i);
    }
    ctx.stroke();
  }

  function drawCrown() {
    if (!crownImg.complete || !crownImg.naturalWidth) return;
    const w = 9;
    const h = w * (crownImg.naturalHeight / crownImg.naturalWidth);
    ctx.save();
    ctx.globalAlpha = theme.crownAlpha;
    ctx.drawImage(crownImg, (CELLS - w) / 2, (CELLS - h) / 2, w, h);
    ctx.restore();
  }

  function drawFood() {
    if (!food) return;
    const t = performance.now() / 1000;
    const cx = food.x + 0.5, cy = food.y + 0.5;
    const appear = Math.min(1, (gameTime - (food.born || 0)) / 180);
    const r = (0.27 + Math.sin(t * 4) * 0.025) * Math.max(0.05, appear);
    ctx.save();
    ctx.shadowColor = theme.food;
    ctx.shadowBlur = unit * 0.6;
    ctx.fillStyle = theme.food;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = theme.foodRing;
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(cx, cy, r + 0.12, 0, Math.PI * 2); ctx.stroke();
  }

  function drawBonus() {
    if (!bonus) return;
    const t = performance.now() / 1000;
    const cx = bonus.x + 0.5, cy = bonus.y + 0.5;
    const left = Math.max(0, (bonus.expires - gameTime) / BONUS_LIFETIME);
    const blink = left < 0.25 ? (Math.sin(t * 18) > 0 ? 1 : 0.35) : 1;
    const pulse = 1 + Math.sin(t * 6) * 0.06;
    ctx.save();
    ctx.globalAlpha = blink;
    // zlatni krug: prsten + jezgro
    ctx.shadowColor = theme.food;
    ctx.shadowBlur = unit * 0.9;
    ctx.strokeStyle = theme.food;
    ctx.lineWidth = 0.11;
    ctx.beginPath(); ctx.arc(cx, cy, 0.36 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = theme.food;
    ctx.beginPath(); ctx.arc(cx, cy, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // preostalo vreme
    ctx.strokeStyle = theme.foodRing;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
    ctx.restore();
  }

  function drawSnake() {
    if (!snake.length) return;
    const tick = SPEEDS[runSpeed].tick;
    const a = state === "playing" ? Math.min(1, tickAcc / tick) : 1;
    const n = snake.length;
    const pts = snake.map((p, i) => {
      const q = prevSnake[i] || p;
      return { x: lerp(q.x, p.x, a) + 0.5, y: lerp(q.y, p.y, a) + 0.5 };
    });

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // telo od repa ka glavi
    for (let i = n - 1; i >= 1; i--) {
      const t = (i - 1) / Math.max(1, n - 2);
      ctx.strokeStyle = mixHex(theme.tailFrom, theme.tailTo, t);
      ctx.lineWidth = lerp(0.78, 0.5, t);
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      ctx.stroke();
    }

    // glava
    const h = pts[0];
    const d = dir;
    ctx.save();
    ctx.shadowColor = theme.head;
    ctx.shadowBlur = unit * 0.55;
    ctx.fillStyle = theme.head;
    ctx.beginPath(); ctx.arc(h.x, h.y, 0.44, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // oči prate smer
    const fx = d.x, fy = d.y;      // napred
    const px = -fy, py = fx;       // bočno
    ctx.fillStyle = theme.eye;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.arc(h.x + fx * 0.16 + px * 0.19 * s, h.y + fy * 0.16 + py * 0.19 * s, 0.075, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life + 0.02, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    floats.forEach((f) => {
      const big = f.text === "GO";
      const size = Math.round(unit * (big ? 2.2 : 0.75));
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
      ctx.font = `800 ${size}px Poppins, system-ui, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * unit, f.y * unit);
    });
    ctx.globalAlpha = 1;
  }

  function drawCountdown() {
    const n = Math.max(1, Math.ceil(countdown / 700));
    const frac = (countdown % 700) / 700;
    const c = (CELLS / 2) * unit;
    ctx.save();
    ctx.globalAlpha = 0.35 + frac * 0.65;
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = Math.max(1, unit * 0.08);
    ctx.beginPath();
    ctx.arc(c, c, unit * 2.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(unit * 2.4)}px Poppins, system-ui, sans-serif`;
    ctx.fillText(String(n), c, c + unit * 0.1);
    ctx.restore();
  }

  // ---------- GLAVNA PETLJA ----------
  let lastTs = 0;
  function frame(ts) {
    const dt = lastTs ? Math.min(ts - lastTs, 100) : 16;
    lastTs = ts;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- UI ----------
  function showScreen(el) {
    [ui.menu, ui.pause, ui.over].forEach((s) => s.classList.toggle("hidden", s !== el));
  }
  function hideScreens() { showScreen(null); }

  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  function currentBest() {
    const list = store.get("gc_scores_" + (state === "menu" ? speedKey : runSpeed), []);
    return Array.isArray(list) && list.length ? list[0] : 0;
  }

  function updateHud(animate = false) {
    ui.score.textContent = score;
    ui.best.textContent = Math.max(currentBest(), isDaily ? 0 : score);
    const mult = combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
    ui.combo.textContent = combo > 1 ? `x${combo}` : "x1";
    ui.comboBox.classList.toggle("is-hot", mult > 1);
    if (animate) { bump(ui.score); if (combo > 1) bump(ui.combo); }
  }

  function updateLeaderboard() {
    const key = state === "menu" ? speedKey : runSpeed;
    let list = store.get("gc_scores_" + key, []);
    if (!Array.isArray(list)) list = [];
    ui.lbTitle.textContent = `TOP 5 · ${SPEEDS[key].label.toUpperCase()}`;
    ui.scoresList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Još nema rezultata";
      ui.scoresList.appendChild(li);
    }
    list.forEach((s, i) => {
      const li = document.createElement("li");
      if (i === 0) li.classList.add("is-top");
      if (i === lastSavedIndex && key === runSpeed && !isDaily) li.classList.add("is-latest");
      li.innerHTML = `<span class="rank">${i + 1}.</span><span class="val">${s}</span>`;
      ui.scoresList.appendChild(li);
    });
    const d = getDailyScore();
    ui.dailyLine.textContent = d === null ? "" : `Daily danas (${dailyKey()}): ${d}`;
  }

  function renderAchievements() {
    ui.achList.innerHTML = "";
    ACHIEVEMENTS.forEach((a) => {
      const li = document.createElement("li");
      if (unlocked.includes(a.id)) li.classList.add("unlocked");
      li.innerHTML = `<span class="ach-dot"></span><span class="ach-text"><span class="ach-name">${a.name}</span><span class="ach-desc">${a.desc}</span></span>`;
      ui.achList.appendChild(li);
    });
    const count = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length;
    ui.achTitle.textContent = `DOSTIGNUĆA · ${count}/${ACHIEVEMENTS.length}`;
  }

  function unlock(id) {
    if (unlocked.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    unlocked.push(id);
    store.set("achievements", unlocked);
    renderAchievements();
    toast(a.name, a.desc);
  }

  function toast(title, text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<img src="assets/crown.png" alt=""><div><strong></strong><span></span></div>`;
    el.querySelector("strong").textContent = title;
    el.querySelector("span").textContent = text;
    ui.toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 350);
    }, 2600);
  }

  function setSpeed(key) {
    if (!SPEEDS[key]) return;
    speedKey = key;
    store.set("gc_speed", key);
    document.querySelectorAll("#speed-seg button").forEach((b) => b.classList.toggle("active", b.dataset.speed === key));
    updateLeaderboard();
    updateHud();
  }

  function setTheme(key) {
    if (!THEMES[key]) return;
    themeKey = key;
    theme = THEMES[key];
    store.set("gc_theme", key);
    document.querySelectorAll("#theme-seg button").forEach((b) => b.classList.toggle("active", b.dataset.theme === key));
    if (!usedThemes.includes(key)) {
      usedThemes.push(key);
      store.set("gc_usedThemes", usedThemes);
    }
    if (Object.keys(THEMES).every((k) => usedThemes.includes(k))) unlock("all_themes");
    render();
  }

  const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function updateSoundBtn() {
    ui.soundBtn.innerHTML = isMuted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    ui.soundBtn.classList.toggle("is-off", isMuted);
    ui.soundBtn.setAttribute("aria-label", isMuted ? "Uključi zvuk" : "Isključi zvuk");
  }

  function updateDailyBtn() {
    const d = getDailyScore();
    ui.dailyBtn.disabled = d !== null;
    ui.dailyBtn.textContent = d === null ? "DAILY IZAZOV" : `DAILY ODIGRAN · ${d}`;
  }

  function openPanel(open) {
    ui.panel.classList.toggle("open", open);
    ui.scrim.classList.toggle("open", open);
    if (open) pauseGame();
  }

  async function share() {
    const url = location.origin + location.pathname;
    const mode = isDaily ? `Daily ${dailyKey()}` : SPEEDS[runSpeed].label;
    const text = `Snake · The Golden Circle\nRezultat: ${score} (${mode})\nIgraj i ti: ${url}\n#GoldenCircle #onegoldenboyy`;
    if (navigator.share) {
      try { await navigator.share({ title: "Snake · The Golden Circle", text }); } catch (e) {}
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      ui.shareBtn.textContent = "KOPIRANO";
    } catch (e) {
      ui.shareBtn.textContent = "NIJE USPELO";
    }
    setTimeout(() => { ui.shareBtn.textContent = "PODELI"; }, 1800);
  }

  // ---------- DOGAĐAJI: DUGMAD ----------
  const tap = (el, fn) => el.addEventListener("click", (e) => { unlockAudio(); sound("click"); fn(e); });

  tap(ui.startBtn, () => newRun(false));
  tap(ui.dailyBtn, () => {
    if (getDailyScore() !== null) {
      toast("Daily je već odigran", `Tvoj današnji rezultat: ${getDailyScore()}`);
      updateDailyBtn();
      return;
    }
    newRun(true);
  });
  tap(ui.resumeBtn, resumeGame);
  tap(ui.pauseMenuBtn, toMenu);
  tap(ui.againBtn, () => newRun(false));
  tap(ui.overMenuBtn, toMenu);
  tap(ui.shareBtn, share);
  tap(ui.pauseBtn, () => (state === "paused" ? resumeGame() : pauseGame()));
  tap(ui.soundBtn, () => {
    isMuted = !isMuted;
    store.set("isMuted", isMuted);
    updateSoundBtn();
  });
  if (ui.panelBtn) tap(ui.panelBtn, () => openPanel(true));
  if (ui.panelClose) ui.panelClose.addEventListener("click", () => openPanel(false));
  ui.scrim.addEventListener("click", () => openPanel(false));

  document.querySelectorAll("#speed-seg button").forEach((b) => tap(b, () => setSpeed(b.dataset.speed)));
  document.querySelectorAll("#theme-seg button").forEach((b) => tap(b, () => setTheme(b.dataset.theme)));

  // ---------- DOGAĐAJI: TASTATURA ----------
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };
  window.addEventListener("keydown", (e) => {
    unlockAudio();
    if (KEYMAP[e.key]) {
      if (state === "playing" || state === "countdown") e.preventDefault();
      queueDir(KEYMAP[e.key]);
      return;
    }
    if (e.key === " " || e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (state === "playing" || state === "countdown") { e.preventDefault(); pauseGame(); }
      else if (state === "paused" && e.key !== "Escape") { e.preventDefault(); resumeGame(); }
      return;
    }
    if (e.key === "Enter") {
      if (state === "menu" && document.activeElement === document.body) newRun(false);
      else if (state === "over" && document.activeElement === document.body) newRun(false);
    }
  });

  // ---------- DOGAĐAJI: SWIPE ----------
  // Smer se okida čim prst pređe prag (ne čeka se podizanje prsta),
  // pa može da se vodi zmija jednim neprekidnim pokretom.
  const SWIPE_MIN = 18;
  let touchX = 0, touchY = 0, tracking = false;
  ui.stage.addEventListener("touchstart", (e) => {
    unlockAudio();
    if (e.touches.length !== 1) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  ui.stage.addEventListener("touchmove", (e) => {
    if (state === "playing" || state === "countdown") e.preventDefault();
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchX;
    const dy = e.touches[0].clientY - touchY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? "right" : "left");
    else queueDir(dy > 0 ? "down" : "up");
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: false });
  ui.stage.addEventListener("touchend", () => { tracking = false; }, { passive: true });

  // ---------- DOGAĐAJI: D-PAD ----------
  document.querySelectorAll(".pad").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlockAudio();
      btn.classList.add("pressed");
      queueDir(btn.dataset.dir);
      vibrate(5);
    });
    const release = () => btn.classList.remove("pressed");
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  // ---------- BLOKADA ZUMIRANJA ----------
  // 1) viewport meta + CSS touch-action, 2) iOS Safari pinch (gesture*),
  // 3) brzi dupli tap.
  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
  );
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320 && !e.target.closest(".panel")) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // ---------- AUTO PAUZA ----------
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  window.addEventListener("blur", () => pauseGame());

  // ---------- PWA ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ---------- START ----------
  setSpeed(speedKey);
  setTheme(themeKey);
  updateSoundBtn();
  updateDailyBtn();
  renderAchievements();
  updateLeaderboard();
  updateHud();
  showScreen(ui.menu);
  fitBoard();
  crownImg.addEventListener("load", render);
  requestAnimationFrame(frame);
})();
