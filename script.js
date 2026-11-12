// ============================================================
//  SNAKE – Golden Circle  |  script.js  (enhanced v3)
// ============================================================

// --- DOM ---
const dom_replay   = document.querySelector("#replay");
const dom_start    = document.querySelector("#start");
const dom_score    = document.querySelector("#score");
const dailyBtn     = document.getElementById("daily-btn");
const dom_canvas   = document.querySelector("#game");
const CTX          = dom_canvas.getContext("2d");
const modal        = document.getElementById("game-over-modal");
const closeModalBtn= document.getElementById("close-modal");
const finalScore   = document.getElementById("final-score");

// Canvas dims — isMobile se proverava dinamički (fix za rotaciju)
const BOARD_SIZE = window.innerWidth <= 768 ? 300 : 560;
const W = (dom_canvas.width  = BOARD_SIZE);
const H = (dom_canvas.height = BOARD_SIZE);

// --- Globals ---
let snake, food, bonusFood,
    cells      = 20,
    cellSize   = W / cells,
    isGameOver = false,
    isPaused   = false,
    score      = 0,
    combo      = 0,
    comboTimer = null,
    comboTexts = [],
    particles  = [],
    requestID,
    gameStarted   = false,
    currentDelay  = 8,
    bonusActive   = false,
    bonusTimeout  = null,
    bonusSpawnInterval = null,
    deathParticles = [],
    deathAnimating = false,
    countdownActive = false,
    isDailyChallenge = false,
    dailySeed = null,
    dailyRandom = null,
    shakeFrames = 0,
    shakeIntensity = 0;

// --- AUDIO ---
let audioCtx = null;
let isMuted = safeGet("isMuted", "false") === true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  if (isMuted) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "eat") {
      osc.type = "square";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === "combo") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === "bonus") {
      // Two-tone bonus sound
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc.type = "sine"; osc2.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.18);
      osc2.start(ctx.currentTime + 0.1); osc2.stop(ctx.currentTime + 0.3);
    } else if (type === "death") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === "countdown") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "go") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch(e) {}
}

// --- Achievements ---
const ACHIEVEMENTS = [
  { id: "first_blood",  label: "🐍 Prva krv",          desc: "Pojedi prvu hranu",           check: () => score >= 1  },
  { id: "combo3",       label: "🔥 Combo x3",           desc: "Postigne combo x3",           check: () => combo >= 3  },
  { id: "combo5",       label: "⚡ Combo x5",           desc: "Postigne combo x5",           check: () => combo >= 5  },
  { id: "score10",      label: "🏅 Desetka",            desc: "Dostigni 10 poena",           check: () => score >= 10 },
  { id: "score25",      label: "🥇 Četvrt veka",        desc: "Dostigni 25 poena",           check: () => score >= 25 },
  { id: "score50",      label: "💎 Zlatni nivo",        desc: "Dostigni 50 poena",           check: () => score >= 50 },
  { id: "golden_food",  label: "✨ Zlatni zalogaj",     desc: "Pojedi bonus zlatnu hranu",   check: () => false       },
  { id: "all_themes",   label: "🎨 Kolekcionar",        desc: "Isprobaj sve 4 teme",         check: () => false       },
  { id: "daily_done",   label: "📅 Dnevni izazov",      desc: "Završi Daily Challenge",      check: () => false       },
];
// Fix: localStorage crash u incognito/private modu
function safeGet(key, fallback = "[]") {
  try { return JSON.parse(localStorage.getItem(key) || fallback); }
  catch(e) { return JSON.parse(fallback); }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch(e) {}
}

let unlockedAchievements = safeGet("achievements");
let usedThemes = safeGet("usedThemes");

function checkAchievements(manualId = null) {
  ACHIEVEMENTS.forEach(a => {
    if (unlockedAchievements.includes(a.id)) return;
    const unlocked = manualId ? a.id === manualId : a.check();
    if (unlocked) {
      unlockedAchievements.push(a.id);
      safeSet("achievements", unlockedAchievements);
      showAchievementToast(a);
      renderAchievementsPanel();
    }
  });
}

function renderAchievementsPanel() {
  const list  = document.getElementById("achievements-list");
  const panel = document.getElementById("achievements-panel");
  if (!list || !panel) return;
  list.innerHTML = "";
  ACHIEVEMENTS.forEach(a => {
    const isUnlocked = unlockedAchievements.includes(a.id);
    const li = document.createElement("li");
    if (isUnlocked) li.classList.add("unlocked");
    li.setAttribute("data-desc", a.desc);
    const emoji = a.label.match(/^\S+/)?.[0] || "🔒";
    const name  = a.label.replace(/^\S+\s*/, "");
    li.innerHTML = `
      <span class="ach-icon">${isUnlocked ? emoji : "🔒"}</span>
      <span class="ach-name">${name}</span>`;
    list.appendChild(li);
  });
  const heading = document.querySelector("#achievements-panel h2");
  if (unlockedAchievements.length > 0) {
    panel.classList.add("has-unlocks");
    if (heading) heading.textContent = `ACHIEVEMENTS · ${unlockedAchievements.length}/${ACHIEVEMENTS.length}`;
  } else {
    if (heading) heading.textContent = `ACHIEVEMENTS · 0/${ACHIEVEMENTS.length}`;
  }
}

function showAchievementToast(a) {
  const toast = document.createElement("div");
  toast.className = "achievement-toast";
  toast.innerHTML = `<span class="ach-label">${a.label}</span><span class="ach-desc">${a.desc}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// --- Themes ---
const themes = {
  golden: { head: "#FFD700", tail: "#b8860b", glow: "rgba(255,215,0,.7)", bg: "#1a1612" },
  neon:   { head: "#0ff",    tail: "#f0f",    glow: "rgba(0,255,255,.7)", bg: "#0d0d1a" },
  retro:  { head: "#0f0",    tail: "#ff0",    glow: "rgba(0,255,0,.7)",   bg: "#0a0f0a" },
  matrix: { head: "#00ff41", tail: "#003b00", glow: "rgba(0,255,65,.7)",  bg: "#000300" },
};
let currentThemeName = "golden";
let currentTheme     = themes.golden;

// --- Helpers ---
const helpers = {
  Vec: class {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { this.x += v.x; this.y += v.y; return this; }
  },
  isCollision(v1, v2) { return v1.x === v2.x && v1.y === v2.y; },
  garbageCollector() { particles = particles.filter(p => p.size > 0); },
  drawGrid() {
    CTX.lineWidth = 0.8;
    CTX.strokeStyle = "rgba(255,255,255,0.04)";
    const size = dom_canvas.width;
    const cs   = size / cells;
    for (let i = 1; i < cells; i++) {
      const f = cs * i;
      CTX.beginPath(); CTX.moveTo(f, 0); CTX.lineTo(f, size); CTX.stroke();
      CTX.beginPath(); CTX.moveTo(0, f); CTX.lineTo(size, f); CTX.stroke();
    }
  },
  drawWatermark() {
    CTX.save();
    CTX.globalAlpha = 0.18;
    CTX.font = "bold 11px Poppins, sans-serif";
    CTX.fillStyle = "#FFD700";
    CTX.textAlign = "right";
    CTX.textBaseline = "bottom";
    CTX.fillText("● GOLDEN CIRCLE", dom_canvas.width - 8, dom_canvas.height - 8);
    CTX.restore();
  },
  randHue() { return ~~(Math.random() * 360); },
  randCell(size) {
    const cs = size || (dom_canvas.width / cells);
    return Math.floor(Math.random() * cells) * cs;
  },
  // Seeded random (for daily challenge)
  seededRand(seed) {
    let s = seed >>> 0;
    return function() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }
};

function gameRandom() {
  return isDailyChallenge && dailyRandom ? dailyRandom() : Math.random();
}

// --- DAILY CHALLENGE ---
function getDailyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function getDailySeed() {
  const key = getDailyKey();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function startDailyChallenge() {
  const todayKey = "daily_" + getDailyKey();
  const alreadyPlayed = (() => { try { return localStorage.getItem(todayKey); } catch(e) { return null; } })();
  if (alreadyPlayed !== null) {
    showAchievementToast({ label: "📅 Već odigrano danas", desc: "Tvoj rezultat: " + alreadyPlayed });
    return false;
  }

  isDailyChallenge = true;
  dailySeed = getDailySeed();
  dailyRandom = helpers.seededRand(dailySeed);
  updateLeaderboard();
  dom_start.disabled = true;
  const hint = document.getElementById("start-hint");
  if (hint) hint.classList.add("hidden");

  if (!gameStarted) initialize();
  else reset();
  return true;
}

function saveDailyScore() {
  if (!isDailyChallenge) return;
  const todayKey = "daily_" + getDailyKey();
  try { localStorage.setItem(todayKey, String(score)); } catch(e) {}
  checkAchievements("daily_done");
}

// --- COUNTDOWN ---
function runCountdown(callback) {
  countdownActive = true;
  let count = 3;
  function drawCount(n) {
    clear();
    helpers.drawGrid();
    helpers.drawWatermark();
    CTX.save();
    CTX.textAlign = "center";
    CTX.textBaseline = "middle";
    const cx = dom_canvas.width / 2;
    const cy = dom_canvas.height / 2;
    // Outer ring
    CTX.strokeStyle = currentTheme.glow;
    CTX.lineWidth = 3;
    CTX.shadowBlur = 30;
    CTX.shadowColor = currentTheme.head;
    CTX.beginPath();
    CTX.arc(cx, cy, 48, 0, Math.PI * 2);
    CTX.stroke();
    // Number
    CTX.font = "bold 64px Poppins, sans-serif";
    CTX.fillStyle = currentTheme.head;
    CTX.shadowBlur = 40;
    CTX.shadowColor = currentTheme.head;
    CTX.fillText(n === 0 ? "GO!" : n, cx, cy);
    CTX.restore();
  }

  function tick() {
    drawCount(count);
    playSound(count === 0 ? "go" : "countdown");
    if (count === 0) {
      setTimeout(() => {
        countdownActive = false;
        callback();
      }, 600);
      return;
    }
    count--;
    setTimeout(tick, 900);
  }
  tick();
}

// --- SCREEN SHAKE ---
function triggerShake(intensity = 8, duration = 20) {
  shakeFrames = duration;
  shakeIntensity = intensity;
}

function applyShake() {
  if (shakeFrames <= 0) return;
  const dx = (Math.random() - 0.5) * shakeIntensity;
  const dy = (Math.random() - 0.5) * shakeIntensity;
  CTX.translate(dx, dy);
  shakeFrames--;
  shakeIntensity *= 0.9;
}

// --- KEY ---
let pendingDirection = null;
let turnQueued = false;

function queueDirection(dx, dy) {
  if (!snake || !gameStarted || isGameOver || isPaused || countdownActive || turnQueued) return;
  const next = new helpers.Vec(dx * snake.size, dy * snake.size);
  if (next.x === -snake.dir.x && next.y === -snake.dir.y) return;
  pendingDirection = next;
  turnQueued = true;
}

const KEY = {
  resetState() {
    pendingDirection = null;
    turnQueued = false;
  },
  listen() {
    addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "p" || e.key === "P") {
        if (gameStarted && !isGameOver && !countdownActive) togglePause();
        if (e.key === " ") e.preventDefault();
        return;
      }
      if (!gameStarted || isGameOver || isPaused || countdownActive) return;

      const keyMap = {
        "w": [0, -1], "W": [0, -1],
        "s": [0, 1], "S": [0, 1],
        "a": [-1, 0], "A": [-1, 0],
        "d": [1, 0], "D": [1, 0],
        "ArrowUp": [0, -1], "ArrowDown": [0, 1],
        "ArrowLeft": [-1, 0], "ArrowRight": [1, 0]
      };
      const direction = keyMap[e.key];
      if (!direction) return;
      e.preventDefault();
      queueDirection(direction[0], direction[1]);
    }, false);
  }
};

// --- Pause ---
function togglePause() {
  isPaused = !isPaused;
  if (!isPaused) loop();
  else drawPauseScreen();
}

function drawPauseScreen() {
  CTX.fillStyle = "rgba(0,0,0,0.65)";
  CTX.fillRect(0, 0, dom_canvas.width, dom_canvas.height);
  CTX.fillStyle = "#FFD700";
  CTX.font = "bold 36px Poppins, sans-serif";
  CTX.textAlign = "center";
  CTX.shadowBlur = 24; CTX.shadowColor = "#FFD700";
  CTX.fillText("PAUSED", dom_canvas.width / 2, dom_canvas.height / 2);
  CTX.font = "15px Poppins, sans-serif";
  CTX.fillStyle = "#fff"; CTX.shadowBlur = 0;
  CTX.fillText("Press SPACE or P to continue", dom_canvas.width / 2, dom_canvas.height / 2 + 36);
}

// --- COMBO TEXT ---
class ComboText {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.alpha = 1; this.vy = -1.5; this.life = 60;
    this.scale = 1.4;
  }
  update() {
    this.y += this.vy;
    this.alpha -= 1 / this.life;
    this.scale = Math.max(1, this.scale - 0.015);
    CTX.save();
    CTX.globalAlpha = Math.max(0, this.alpha);
    CTX.font = `bold ${Math.floor(18 * this.scale)}px Poppins, sans-serif`;
    CTX.textAlign = "center";
    CTX.fillStyle = this.color;
    CTX.shadowBlur = 16; CTX.shadowColor = this.color;
    CTX.fillText(this.text, this.x, this.y);
    CTX.shadowBlur = 0;
    CTX.restore();
  }
  isDead() { return this.alpha <= 0; }
}

// --- SNAKE ---
class Snake {
  constructor() {
    const cs = dom_canvas.width / cells;
    this.size  = cs;
    this.pos   = new helpers.Vec(
      Math.floor(cells / 2) * cs,
      Math.floor(cells / 2) * cs
    );
    this.dir       = new helpers.Vec(cs, 0);
    this.color     = currentTheme.head;
    this.history   = [];
    this.total     = 1;
    this.delay     = currentDelay;
    this.glow      = currentTheme.glow;
    this.pulseStep = 0;
  }

  draw() {
    const { x, y } = this.pos;
    this.pulseStep += 0.12;
    const pulse = 18 + Math.sin(this.pulseStep) * 10;
    const cs = this.size;
    const r  = cs * 0.35; // corner radius

    // Helper: rounded rect
    function roundRect(ctx, rx, ry, rw, rh, radius) {
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + radius, radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.arcTo(rx + rw, ry + rh, rx + rw - radius, ry + rh, radius);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.arcTo(rx, ry + rh, rx, ry + rh - radius, radius);
      ctx.lineTo(rx, ry + radius);
      ctx.arcTo(rx, ry, rx + radius, ry, radius);
      ctx.closePath();
    }

    // Draw tail segments (back to front for correct layering)
    if (this.total >= 2) {
      for (let i = 0; i < this.history.length - 1; i++) {
        const p = this.history[i];
        if (!p) continue;
        const ratio = i / this.history.length;
        const alpha = 0.35 + ratio * 0.55;
        const segR  = r * (0.6 + ratio * 0.4);
        CTX.globalAlpha = alpha;
        CTX.fillStyle = currentTheme.tail;
        CTX.shadowBlur = pulse / 3;
        CTX.shadowColor = this.glow;
        roundRect(CTX, p.x + 1, p.y + 1, cs - 2, cs - 2, segR);
        CTX.fill();
        CTX.shadowBlur = 0;
        CTX.globalAlpha = 1;
      }
    }

    // Draw head with glow
    CTX.shadowBlur = pulse;
    CTX.shadowColor = this.glow;
    CTX.fillStyle = this.color;
    roundRect(CTX, x + 1, y + 1, cs - 2, cs - 2, r);
    CTX.fill();
    CTX.shadowBlur = 0;

    // Eyes — follow direction (bug fix)
    const eyeSize = cs * 0.12;
    const movingH = this.dir.x !== 0;
    CTX.fillStyle = "#000";
    if (movingH) {
      const eyeOffX = (this.dir.x > 0) ? cs * 0.65 : cs * 0.15;
      CTX.fillRect(x + eyeOffX, y + cs * 0.2,  eyeSize, eyeSize);
      CTX.fillRect(x + eyeOffX, y + cs * 0.65, eyeSize, eyeSize);
    } else {
      const eyeOffY = (this.dir.y > 0) ? cs * 0.65 : cs * 0.15;
      CTX.fillRect(x + cs * 0.2,  y + eyeOffY, eyeSize, eyeSize);
      CTX.fillRect(x + cs * 0.65, y + eyeOffY, eyeSize, eyeSize);
    }
  }

  walls() {
    const size = dom_canvas.width;
    const cs   = this.size;
    if (this.pos.x < 0 || this.pos.x + cs > size ||
        this.pos.y < 0 || this.pos.y + cs > size) {
      isGameOver = true;
    }
  }

  selfCollision() {
    for (const p of this.history) {
      if (p && helpers.isCollision(this.pos, p)) { isGameOver = true; return; }
    }
  }

  update() {
    this.draw();
    if (!this.delay--) {
      if (pendingDirection) this.dir = pendingDirection;
      pendingDirection = null;
      turnQueued = false;
      if (food && helpers.isCollision(this.pos, food.pos)) {
        eatFood(1);
        food.spawn();
      }
      if (bonusActive && bonusFood && helpers.isCollision(this.pos, bonusFood.pos)) {
        eatFood(5, true);
        clearBonusFood();
        checkAchievements("golden_food");
      }

      this.history[this.total - 1] = new helpers.Vec(this.pos.x, this.pos.y);
      for (let i = 0; i < this.total - 1; i++) this.history[i] = this.history[i + 1];
      this.pos.add(this.dir);
      this.delay = currentDelay;

      this.walls();
      if (this.total > 3) this.selfCollision();
    }
  }
}

// --- FOOD ---
class Food {
  constructor(isBonus = false) {
    this.isBonus = isBonus;
    this.size = dom_canvas.width / cells;
    this.spawn();
  }

  draw() {
    if (!this.pos) return;
    const { x, y } = this.pos;
    const cs = this.size;
    const t  = Date.now() / 400;

    if (this.isBonus) {
      // Bonus — zlatna zvezda sa pulsom
      CTX.save();
      CTX.shadowBlur  = 28 + Math.sin(t) * 12;
      CTX.shadowColor = "#FFD700";
      CTX.font = `${cs * 0.85}px serif`;
      CTX.textAlign    = "center";
      CTX.textBaseline = "middle";
      CTX.fillStyle = "#FFD700";
      CTX.fillText("★", x + cs / 2, y + cs / 2);
      CTX.restore();
    } else {
      // Regular food — krunica koja ciklično menja boju
      const hue   = (this.hueOffset + t * 60) % 360;
      const color = `hsl(${hue}, 100%, 58%)`;
      const glow  = `hsla(${hue}, 100%, 58%, 0.8)`;
      const pulse = 14 + Math.sin(t * 1.5) * 6;

      CTX.save();
      CTX.shadowBlur  = pulse;
      CTX.shadowColor = glow;
      CTX.font = `${cs * 0.82}px serif`;
      CTX.textAlign    = "center";
      CTX.textBaseline = "middle";
      CTX.fillStyle = color;
      CTX.fillText("👑", x + cs / 2, y + cs / 2);
      CTX.restore();
    }
  }

  spawn() {
    const cs  = dom_canvas.width / cells;
    this.size = cs;
    let randX, randY, tries = 0;
    do {
      randX = Math.floor(gameRandom() * cells) * cs;
      randY = Math.floor(gameRandom() * cells) * cs;
      tries++;
    } while (tries < 100 && isOccupied(randX, randY));

    this.color     = this.isBonus ? "#FFD700" : `hsl(${helpers.randHue()}, 100%, 55%)`;
    this.hueOffset = helpers.randHue();
    this.pos       = new helpers.Vec(randX, randY);
  }
}

function isOccupied(x, y) {
  if (!snake) return false;
  if (helpers.isCollision(new helpers.Vec(x, y), snake.pos)) return true;
  for (const p of snake.history) if (p && helpers.isCollision(new helpers.Vec(x, y), p)) return true;
  return false;
}

// --- PARTICLES ---
class Particle {
  constructor(pos, color, size, vel) {
    this.pos   = pos;
    this.color = color;
    this.size  = Math.abs(size / 2);
    this.vel   = vel;
    this.gravity = -0.15;
  }
  draw() {
    if (this.size <= 0) return;
    CTX.fillStyle = this.color;
    CTX.globalAlpha = Math.min(1, this.size / 4);
    CTX.fillRect(this.pos.x, this.pos.y, this.size, this.size);
    CTX.globalAlpha = 1;
  }
  update() {
    this.draw();
    this.size -= 0.25;
    this.pos.add(this.vel);
    this.vel.y -= this.gravity;
  }
}

function particleSplash(x, y, color, count = 20) {
  for (let i = 0; i < count; i++) {
    const vel = new helpers.Vec(Math.random() * 8 - 4, Math.random() * 8 - 4);
    particles.push(new Particle(new helpers.Vec(x, y), color || "#FFD700", (dom_canvas.width / cells), vel));
  }
}

// Combo burst — larger, more dramatic particles
function comboBurst(x, y, color, count = 35) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    const vel = new helpers.Vec(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const size = (dom_canvas.width / cells) * (0.8 + Math.random() * 1.2);
    particles.push(new Particle(new helpers.Vec(x, y), color || "#FFD700", size, vel));
  }
}

// --- BONUS FOOD ---
function scheduleBonusFood() {
  clearBonusFood();
  const delay = (15 + gameRandom() * 10) * 1000;
  bonusSpawnInterval = setTimeout(() => {
    if (!gameStarted || isGameOver || isPaused) { scheduleBonusFood(); return; }
    bonusFood   = new Food(true);
    bonusActive = true;
    bonusTimeout = setTimeout(() => {
      clearBonusFood();
      scheduleBonusFood();
    }, 8000);
  }, delay);
}

function clearBonusFood() {
  bonusActive = false;
  bonusFood   = null;
  clearTimeout(bonusTimeout);
}

// --- EAT ---
function eatFood(points, isBonus = false) {
  const multiplier = getComboMultiplier();
  const earned     = points * multiplier;
  score += earned;
  dom_score.innerText = score.toString().padStart(2, "0");
  dom_score.classList.add("pulse");
  setTimeout(() => dom_score.classList.remove("pulse"), 300);

  combo++;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => { combo = 0; }, 2500);

  // Sound
  if (isBonus) playSound("bonus");
  else if (combo >= 3) playSound("combo");
  else playSound("eat");

  // Floating combo text
  const pos = isBonus ? bonusFood?.pos : food?.pos;
  if (combo >= 2 || isBonus) {
    const label = isBonus
      ? `✨ +${earned} BONUS!`
      : (combo >= 5 ? `⚡ COMBO x${combo}!` : combo >= 3 ? `🔥 COMBO x${combo}` : `x${combo}`);
    const color = isBonus ? "#FFD700" : (combo >= 5 ? "#ff4444" : combo >= 3 ? "#ff8c00" : "#fff");
    if (pos) comboTexts.push(new ComboText(pos.x + cellSize / 2, pos.y, label, color));
  }

  // Particles — combo burst on x3+
  const splashColor = isBonus ? "#FFD700" : currentTheme.head;
  if (pos) {
    if (combo >= 3 || isBonus) {
      comboBurst(pos.x, pos.y, splashColor, isBonus ? 50 : 35);
    } else {
      particleSplash(pos.x, pos.y, splashColor, 20);
    }
  }

  if (snake) {
    snake.glow = isBonus ? "rgba(255,215,0,1)" : "rgba(255,255,255,0.9)";
    setTimeout(() => { if (snake) snake.glow = currentTheme.glow; }, 300);
  }

  snake.total++;
  checkAchievements();
}

function getComboMultiplier() {
  if (combo >= 5) return 3;
  if (combo >= 3) return 2;
  return 1;
}

// --- LEADERBOARD ---
function getScoreKey() { return `scores_${currentThemeName}`; }

function saveScore() {
  let scores = safeGet(getScoreKey());
  scores.push(score);
  scores.sort((a, b) => b - a);
  scores = scores.slice(0, 5);
  safeSet(getScoreKey(), scores);
  updateLeaderboard();
}

function updateLeaderboard() {
  const scores = safeGet(getScoreKey());
  const list   = document.getElementById("scores-list");
  if (!list) return;
  list.innerHTML = "";
  const topScore = scores[0];
  scores.forEach((s, i) => {
    const li  = document.createElement("li");
    const isNew = s === score && s === topScore && score > 0;
    li.innerHTML = `<span class="place">${i + 1}.</span> <span class="score-entry ${isNew ? "new-record" : ""}">${s}${isNew ? " 🏆" : ""}</span>`;
    list.appendChild(li);
  });
  const heading = document.querySelector("#leaderboard h2");
  if (heading) heading.textContent = isDailyChallenge
    ? `📅 DAILY · ${getDailyKey()}`
    : `TOP · ${currentThemeName.toUpperCase()}`;
}

// --- DEATH ANIMATION ---
function triggerDeathAnimation(callback) {
  deathAnimating = true;
  deathParticles = [];
  const cs = snake ? snake.size : cellSize;
  triggerShake(10, 25);
  playSound("death");

  const allPositions = snake ? [snake.pos, ...snake.history.filter(Boolean)] : [];
  allPositions.forEach(p => {
    for (let i = 0; i < 8; i++) {
      const vel = new helpers.Vec(Math.random() * 10 - 5, Math.random() * 10 - 5);
      deathParticles.push(new Particle(new helpers.Vec(p.x, p.y), currentTheme.head, cs, vel));
    }
  });

  let frame = 0;
  function animateDeath() {
    CTX.save();
    applyShake();
    clear();
    helpers.drawGrid();
    helpers.drawWatermark();
    if (food) food.draw();
    deathParticles.forEach(p => p.update());
    deathParticles = deathParticles.filter(p => p.size > 0);
    CTX.restore();
    frame++;
    if (frame < 50 && deathParticles.length > 0) {
      requestAnimationFrame(animateDeath);
    } else {
      deathAnimating = false;
      callback();
    }
  }
  animateDeath();
}

// --- GAME OVER ---
function gameOver() {
  cancelAnimationFrame(requestID);
  clearBonusFood();
  clearTimeout(bonusSpawnInterval);
  combo = 0;
  if (isDailyChallenge) saveDailyScore();

  triggerDeathAnimation(() => {
    saveScore();
    const scores = safeGet(getScoreKey());

    const isHighScore = scores[0] === score && score > 0;
    finalScore.innerHTML =
      `<em>"Svaki pad je prilika za novi rast."</em><br>` +
      `<strong>SCORE: ${score}</strong>` +
      (isDailyChallenge ? `<br><span style="color:#aaa;font-size:12px">📅 Daily Challenge: ${getDailyKey()}</span>` : "") +
      (isHighScore ? `<br><span style="color:#FFD700">🏆 NOVI REKORD!</span>` : "") +
      buildShareHTML();
    modal.classList.remove("hidden");
  });
}

// --- SHARE ---
function buildShareHTML() {
  return `<button id="share-btn" onclick="shareScore()">📤 Podeli rezultat</button>`;
}

window.shareScore = function () {
  const dailyTag = isDailyChallenge ? ` | 📅 Daily ${getDailyKey()}` : "";
  const text = `🐍 Odigrao sam Snake – Golden Circle!\n🏆 Rezultat: ${score} | Tema: ${currentThemeName.toUpperCase()}${dailyTag}\nIgraj i ti: https://DaliborSuvajcevic.github.io/newsnakee\n#GoldenCircle #onegoldenboyy`;
  if (navigator.share) {
    navigator.share({ title: "Snake – Golden Circle", text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById("share-btn");
      if (btn) { btn.textContent = "✅ Kopirano!"; setTimeout(() => { btn.textContent = "📤 Podeli rezultat"; }, 2000); }
    });
  }
};

// --- RESIZE ---
function resizeCanvas() {
  const wrapper = document.querySelector("#game-wrapper");
  if (!wrapper) return;
  const maxSize = window.innerWidth <= 768 ? 300 : 560;
  const size = Math.min(wrapper.offsetWidth, maxSize);
  if (!size) return;

  const oldCellSize = dom_canvas.width / cells;
  const newCellSize = size / cells;
  const resizePoint = point => {
    point.x = Math.round(point.x / oldCellSize) * newCellSize;
    point.y = Math.round(point.y / oldCellSize) * newCellSize;
  };

  dom_canvas.width = size;
  dom_canvas.height = size;
  cellSize = newCellSize;

  if (snake && oldCellSize > 0) {
    resizePoint(snake.pos);
    snake.history.forEach(point => { if (point) resizePoint(point); });
    snake.size = newCellSize;
    snake.dir = new helpers.Vec(
      Math.sign(snake.dir.x) * newCellSize,
      Math.sign(snake.dir.y) * newCellSize
    );
  }

  [food, bonusFood].forEach(item => {
    if (!item) return;
    item.size = newCellSize;
    if (item.pos && oldCellSize > 0) resizePoint(item.pos);
  });
}
window.addEventListener("resize", resizeCanvas);

// --- THEME ---
function setTheme(name) {
  currentThemeName = name;
  currentTheme     = themes[name];
  if (snake) { snake.color = currentTheme.head; snake.glow = currentTheme.glow; }

  document.querySelectorAll("#snake-colors button").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`#snake-colors button[data-theme="${name}"]`);
  if (btn) btn.classList.add("active");

  if (!usedThemes.includes(name)) {
    usedThemes.push(name);
    safeSet("usedThemes", usedThemes);
    if (usedThemes.length >= 4) checkAchievements("all_themes");
  }

  updateLeaderboard();
}
document.querySelectorAll("#snake-colors button").forEach(btn =>
  btn.addEventListener("click", () => setTheme(btn.getAttribute("data-theme")))
);

// --- DIFFICULTY ---
document.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentDelay = parseInt(btn.getAttribute("data-delay"));
    document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// --- CLEAR & LOOP ---
function clear() {
  CTX.fillStyle = currentTheme.bg || "#111118";
  CTX.fillRect(0, 0, dom_canvas.width, dom_canvas.height);
}

function loop() {
  if (isPaused || deathAnimating || countdownActive) return;
  clear();
  if (!isGameOver) {
    CTX.save();
    applyShake();
    requestID = requestAnimationFrame(loop);
    helpers.drawGrid();
    food.draw();
    if (bonusActive && bonusFood) bonusFood.draw();
    snake.update();
    particles.forEach(p => p.update());
    helpers.garbageCollector();
    comboTexts.forEach(ct => ct.update());
    comboTexts = comboTexts.filter(ct => !ct.isDead());
    helpers.drawWatermark();
    CTX.restore();
  } else {
    gameOver();
  }
}

// --- RESET ---
function reset() {
  dom_score.innerText = "00";
  score  = 0;
  combo  = 0;
  isPaused = false;
  particles = [];
  comboTexts = [];
  deathParticles = [];
  deathAnimating = false;
  shakeFrames = 0;
  clearBonusFood();
  clearTimeout(bonusSpawnInterval);
  cancelAnimationFrame(requestID);
  snake = new Snake();
  food  = new Food();
  KEY.resetState();
  isGameOver = false;
  if (gameStarted) {
    runCountdown(() => {
      scheduleBonusFood();
      loop();
    });
  }
}

// --- INITIALIZE ON LOAD ---
KEY.listen();
renderAchievementsPanel();

function initialize() {
  CTX.imageSmoothingEnabled = false;
  cellSize = W / cells;
  resizeCanvas();
  snake = new Snake();
  food  = new Food();
  updateLeaderboard();
  renderAchievementsPanel();
  gameStarted = true;
  runCountdown(() => {
    scheduleBonusFood();
    loop();
  });
}

// --- BUTTONS ---
dom_start.addEventListener("click", () => {
  if (gameStarted) return;
  isDailyChallenge = false;
  dailyRandom = null;
  initialize();
  dom_start.disabled = true;
  const hint = document.getElementById("start-hint");
  if (hint) hint.classList.add("hidden");
});

dom_replay.addEventListener("click", () => {
  isDailyChallenge = false;
  dailyRandom = null;
  if (!gameStarted) {
    initialize();
    dom_start.disabled = true;
    const hint = document.getElementById("start-hint");
    if (hint) hint.classList.add("hidden");
    return;
  }
  reset();
});

closeModalBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  dom_start.disabled = true;
  isDailyChallenge = false;
  dailyRandom = null;
  reset();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.classList.add("hidden");
    isDailyChallenge = false;
    dailyRandom = null;
    reset();
  }
});

// --- MUTE BUTTON ---
const muteBtn = document.getElementById("mute-btn");
function updateMuteBtn() {
  if (!muteBtn) return;
  if (isMuted) {
    muteBtn.innerHTML = `<i class="fas fa-volume-mute"></i> MUTED`;
    muteBtn.classList.add("muted");
  } else {
    muteBtn.innerHTML = `<i class="fas fa-volume-up"></i> SOUND`;
    muteBtn.classList.remove("muted");
  }
}
if (muteBtn) {
  updateMuteBtn();
  muteBtn.addEventListener("click", () => {
    isMuted = !isMuted;
    safeSet("isMuted", isMuted);
    updateMuteBtn();
  });
}
if (dailyBtn) {
  dailyBtn.addEventListener("click", () => {
    if (startDailyChallenge()) modal.classList.add("hidden");
  });
}

// --- TOUCH CONTROLS ---
document.querySelectorAll(".control-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const directions = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0]
    };
    const direction = directions[btn.getAttribute("data-dir")];
    if (direction) queueDirection(direction[0], direction[1]);
  });
});

// --- SWIPE ---
let touchStartX = 0, touchStartY = 0;
dom_canvas.addEventListener("touchstart", e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, { passive: false });

dom_canvas.addEventListener("touchend", e => {
  if (!snake || isPaused || isGameOver || countdownActive) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 20) queueDirection(1, 0);
    if (dx < -20) queueDirection(-1, 0);
  } else {
    if (dy > 20) queueDirection(0, 1);
    if (dy < -20) queueDirection(0, -1);
  }
  e.preventDefault();
}, { passive: false });
