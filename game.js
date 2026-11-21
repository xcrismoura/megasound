// ==========================================
// MEGASOUND v1.2 - Percepção Musical (Dó-Móvel)
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startOverlay = document.getElementById('startOverlay');
const endOverlay = document.getElementById('endOverlay');
const endTitle = document.getElementById('endTitle');
const endStats = document.getElementById('endStats');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const tonicBtn = document.getElementById('tonicBtn');
const feedbackBanner = document.getElementById('feedbackBanner');
const noteButtons = Array.from(document.querySelectorAll('.note-btn'));

// Escala de Dó Maior (C4 a C5)
const SCALE = [
  { name: 'Dó',  degree: 'I',    freq: 261.63, color: '#ff4d6d' },
  { name: 'Ré',  degree: 'II',   freq: 293.66, color: '#ff9248' },
  { name: 'Mi',  degree: 'III',  freq: 329.63, color: '#ffd166' },
  { name: 'Fá',  degree: 'IV',   freq: 349.23, color: '#06d6a0' },
  { name: 'Sol', degree: 'V',    freq: 392.00, color: '#00e5ff' },
  { name: 'Lá',  degree: 'VI',   freq: 440.00, color: '#4ea8de' },
  { name: 'Si',  degree: 'VII',  freq: 493.88, color: '#9b5de5' },
  { name: 'Dó8', degree: 'VIII', freq: 523.25, color: '#f15bb5' }
];

// ==========================================
// SISTEMA DE ÁUDIO (Som limpo estilo piano elétrico / sine puro)
// ==========================================
class SoundEngine {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClearNote(freq, duration = 1.0, volume = 0.28, delay = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delay;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain1 = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    const masterGain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain1.gain.setValueAtTime(0.8, now);
    gain2.gain.setValueAtTime(0.2, now);

    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 0.025);
    masterGain.gain.setValueAtTime(volume * 0.85, now + duration * 0.7);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(filter);
    gain2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.03);
    osc2.stop(now + duration + 0.03);
  }

  playTonicReference() {
    this.init();
    this.playClearNote(261.63, 1.0, 0.30, 0);
  }

  playAbsorbFx() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playHitFx() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.22);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

const audio = new SoundEngine();

// ==========================================
// ESTADO DO JOGO
// ==========================================
const MAX_HP = 100;
const WAVE_TRAVEL_SECONDS = 10.0;

const state = {
  running: false,
  lastTime: 0,
  shakeTime: 0,
  shakeIntensity: 0,
  hitStop: 0,
  hits: 0,
  misses: 0,
  waveTimer: 0,
  nextAttackDelay: 1.5,

  player: {
    x: 130,
    y: 330,
    hp: MAX_HP,
    maxHp: MAX_HP,
    hurtTimer: 0,
    shootAnim: 0
  },

  enemy: {
    x: 830,
    y: 330,
    hp: MAX_HP,
    maxHp: MAX_HP,
    hurtTimer: 0,
    shootAnim: 0
  },

  enemyWave: null,
  playerShot: null,
  particles: [],
  floatingTexts: []
};

function setFeedback(text, color = '#a9c2ed') {
  feedbackBanner.textContent = text;
  feedbackBanner.style.color = color;
}

function setDeckEnabled(enabled) {
  noteButtons.forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function triggerShake(intensity = 8, duration = 0.22) {
  state.shakeIntensity = intensity;
  state.shakeTime = duration;
}

function spawnParticles(x, y, color, count = 18, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = (90 + Math.random() * 210) * speedScale;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.6,
      size: 3 + Math.random() * 4,
      color
    });
  }
}

function spawnFloatingText(x, y, text, color = '#ffffff') {
  state.floatingTexts.push({
    x,
    y,
    vy: -42,
    text,
    color,
    life: 1.05
  });
}

// ==========================================
// MECÂNICA DE ATAQUE E CONTRA-ATAQUE (1 TIRO POR VEZ)
// ==========================================
function enemyFireWave() {
  if (!state.running) return;
  const noteIndex = Math.floor(Math.random() * SCALE.length);
  const note = SCALE[noteIndex];

  const startX = state.enemy.x - 48;
  const targetX = state.player.x + 28;
  const distance = startX - targetX;
  const speed = distance / WAVE_TRAVEL_SECONDS;

  state.enemy.shootAnim = 0.28;
  audio.playClearNote(note.freq, 1.0, 0.28);

  state.enemyWave = {
    x: startX,
    y: state.enemy.y - 26,
    vx: -speed,
    noteIndex,
    note,
    radius: 22,
    phase: 0,
    hasBeenAnswered: false,
    remainingTime: WAVE_TRAVEL_SECONDS
  };

  setDeckEnabled(true);
  setFeedback('Onda disparada (10s)! Você tem 1 tiro para contra-atacar.', '#ffd166');
}

function playerFireNote(noteIndex) {
  if (!state.running) return;

  if (!state.enemyWave || state.enemyWave.hasBeenAnswered || state.playerShot) {
    return;
  }

  state.enemyWave.hasBeenAnswered = true;
  setDeckEnabled(false);

  const note = SCALE[noteIndex];
  state.player.shootAnim = 0.22;
  audio.playClearNote(note.freq, 1.0, 0.26);

  const btn = noteButtons[noteIndex];
  if (btn) {
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 150);
  }

  state.playerShot = {
    x: state.player.x + 48,
    y: state.player.y - 26,
    vx: 540,
    noteIndex,
    note,
    charged: false,
    radius: 12
  };
}

// ==========================================
// ATUALIZAÇÃO (LOOP PRINCIPAL)
// ==========================================
function update(dt) {
  if (!state.running) return;

  if (state.hitStop > 0) {
    state.hitStop -= dt;
    return;
  }

  if (state.shakeTime > 0) state.shakeTime -= dt;
  if (state.enemy.hurtTimer > 0) state.enemy.hurtTimer -= dt;
  if (state.enemy.shootAnim > 0) state.enemy.shootAnim -= dt;
  if (state.player.hurtTimer > 0) state.player.hurtTimer -= dt;
  if (state.player.shootAnim > 0) state.player.shootAnim -= dt;

  if (!state.enemyWave && !state.playerShot) {
    setDeckEnabled(false);
    state.waveTimer += dt;
    if (state.waveTimer >= state.nextAttackDelay) {
      state.waveTimer = 0;
      enemyFireWave();
    }
  }

  if (state.enemyWave) {
    const w = state.enemyWave;
    w.x += w.vx * dt;
    w.phase += dt * 10;
    w.remainingTime = Math.max(0, w.remainingTime - dt);

    if (w.x <= state.player.x + 28) {
      const missedNoteName = w.note.name;
      state.enemyWave = null;
      setDeckEnabled(false);
      damagePlayer(15, `Tempo esgotado! Era ${missedNoteName}.`);
    }
  }

  if (state.playerShot) {
    const s = state.playerShot;
    s.x += s.vx * dt;

    if (!s.charged && state.enemyWave) {
      const w = state.enemyWave;
      if (Math.abs(s.x - w.x) <= s.radius + w.radius) {
        if (s.noteIndex === w.noteIndex) {
          state.enemyWave = null;
          s.charged = true;
          s.vx = 780;
          s.radius = 24;
          state.hits++;
          state.hitStop = 0.055;

          audio.playAbsorbFx();
          triggerShake(7, 0.18);
          spawnParticles(w.x, w.y, '#00e5ff', 24, 1.3);
          spawnFloatingText(w.x, w.y - 30, `CONTRA-ATAQUE! (${w.note.name})`, '#00e5ff');
          setFeedback(`Acertou ${w.note.name}! Onda absorvida — atingindo o inimigo!`, '#06d6a0');
        } else {
          const correctName = w.note.name;
          const wrongName = s.note.name;
          state.playerShot = null;
          state.enemyWave = null;
          damagePlayer(15, `Você tocou ${wrongName}, mas era ${correctName}!`);
        }
      }
    }

    if (state.playerShot && s.charged && s.x >= state.enemy.x - 34) {
      state.playerShot = null;
      damageEnemy(20);
    }
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y += ft.vy * dt;
    ft.life -= dt;
    if (ft.life <= 0) state.floatingTexts.splice(i, 1);
  }
}

function damagePlayer(amount, reasonText) {
  state.player.hp = Math.max(0, state.player.hp - amount);
  state.player.hurtTimer = 0.45;
  state.misses++;

  audio.playHitFx();
  triggerShake(11, 0.28);
  spawnParticles(state.player.x, state.player.y - 26, '#ff4d6d', 22, 1.2);
  spawnFloatingText(state.player.x + 25, state.player.y - 78, `-${amount} HP`, '#ff4d6d');
  setFeedback(`Dano recebido! ${reasonText}`, '#ff4d6d');

  if (state.player.hp <= 0) {
    endGame(false);
  }
}

function damageEnemy(amount) {
  state.enemy.hp = Math.max(0, state.enemy.hp - amount);
  state.enemy.hurtTimer = 0.4;
  state.hitStop = 0.05;

  audio.playHitFx();
  triggerShake(10, 0.24);
  spawnParticles(state.enemy.x, state.enemy.y - 26, '#ffd166', 26, 1.35);
  spawnFloatingText(state.enemy.x - 20, state.enemy.y - 78, `-${amount} HP!`, '#ffd166');

  if (state.enemy.hp <= 0) {
    endGame(true);
  }
}

function endGame(victory) {
  state.running = false;
  setDeckEnabled(false);
  endOverlay.classList.add('active');
  endTitle.textContent = victory ? 'VITÓRIA!' : 'DERROTA!';
  endTitle.style.color = victory ? '#06d6a0' : '#ff4d6d';
  endStats.textContent = `Acertos: ${state.hits} | Erros: ${state.misses}`;
}

// ==========================================
// RENDERIZAÇÃO 2D
// ==========================================
function drawArena() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#070b19');
  grad.addColorStop(0.75, '#0f1936');
  grad.addColorStop(1, '#162447');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(126, 232, 255, 0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const lineY = 270 + i * 14;
    ctx.beginPath();
    ctx.moveTo(180, lineY);
    ctx.lineTo(780, lineY);
    ctx.stroke();
  }

  ctx.fillStyle = '#141e38';
  ctx.fillRect(0, 370, canvas.width, 110);

  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(0, 370, canvas.width, 4);

  ctx.fillStyle = '#1f2f57';
  for (let x = 0; x < canvas.width; x += 48) {
    ctx.fillRect(x + 4, 382, 38, 16);
  }
}

function drawMegaHealthBar(x, y, hp, maxHp, label, primaryColor) {
  const segments = 20;
  const filled = Math.ceil((hp / maxHp) * segments);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText(`${label} (${hp}/${maxHp})`, x, y - 8);

  ctx.fillStyle = '#050811';
  ctx.fillRect(x, y, 224, 24);
  ctx.strokeStyle = '#7ee8ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 224, 24);

  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < filled ? primaryColor : '#1b243b';
    ctx.fillRect(x + 4 + i * 11, y + 4, 8, 16);
  }
}

function drawPlayer(p) {
  if (p.hurtTimer > 0 && Math.floor(p.hurtTimer * 25) % 2 === 0) return;

  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 38, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0077b6';
  ctx.fillRect(-20, -40, 40, 48);

  ctx.fillStyle = '#00b4d8';
  ctx.fillRect(-16, -36, 32, 22);

  ctx.fillStyle = '#0077b6';
  ctx.fillRect(-18, -68, 36, 28);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(-6, -68, 12, 8);

  ctx.fillStyle = '#ffe5d9';
  ctx.fillRect(-2, -58, 18, 16);
  ctx.fillStyle = '#03045e';
  ctx.fillRect(8, -55, 6, 7);

  const recoil = p.shootAnim > 0 ? -6 : 0;
  ctx.fillStyle = '#0096c7';
  ctx.fillRect(16 + recoil, -32, 30, 16);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(44 + recoil, -30, 6, 12);

  ctx.fillStyle = '#0096c7';
  ctx.fillRect(-20, 8, 16, 30);
  ctx.fillRect(4, 8, 16, 30);

  ctx.restore();
}

function drawEnemy(e) {
  if (e.hurtTimer > 0 && Math.floor(e.hurtTimer * 25) % 2 === 0) return;

  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 38, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#6b2cf5';
  ctx.fillRect(-24, -44, 48, 54);

  ctx.fillStyle = '#9b5de5';
  ctx.fillRect(-30, -46, 16, 20);
  ctx.fillRect(14, -46, 16, 20);

  ctx.fillStyle = '#4a1fb8';
  ctx.fillRect(-20, -72, 40, 28);

  ctx.fillStyle = '#ff4d6d';
  ctx.fillRect(-18, -64, 18, 10);

  const recoil = e.shootAnim > 0 ? 6 : 0;
  ctx.fillStyle = '#2b2d42';
  ctx.fillRect(-50 + recoil, -32, 34, 18);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(-52 + recoil, -35, 6, 24);

  ctx.fillStyle = '#3a1894';
  ctx.fillRect(-20, 10, 15, 28);
  ctx.fillRect(5, 10, 15, 28);

  ctx.restore();
}

function drawProjectiles() {
  if (state.enemyWave) {
    const w = state.enemyWave;
    ctx.save();
    ctx.translate(w.x, w.y);

    for (let r = 0; r < 3; r++) {
      const pulse = Math.sin(w.phase - r * 0.9) * 5;
      ctx.strokeStyle = r === 0 ? '#ffd166' : 'rgba(255, 209, 102, 0.45)';
      ctx.lineWidth = 3 - r * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, w.radius + pulse - r * 5, Math.PI * 0.55, Math.PI * 1.45);
      ctx.stroke();
    }

    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', 0, 1);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px Courier New';
    ctx.fillText(`${w.remainingTime.toFixed(1)}s`, 0, -28);

    ctx.restore();
  }

  if (state.playerShot) {
    const s = state.playerShot;
    ctx.save();
    ctx.translate(s.x, s.y);

    if (s.charged) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-12, 0, 38, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = s.note.color;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawEffects() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  for (const ft of state.floatingTexts) {
    ctx.globalAlpha = Math.min(1, ft.life * 1.4);
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 15px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.save();

  if (state.shakeTime > 0) {
    const dx = (Math.random() - 0.5) * state.shakeIntensity;
    const dy = (Math.random() - 0.5) * state.shakeIntensity;
    ctx.translate(dx, dy);
  }

  drawArena();

  drawMegaHealthBar(28, 34, state.player.hp, state.player.maxHp, 'JOGADOR', '#00e5ff');
  drawMegaHealthBar(canvas.width - 252, 34, state.enemy.hp, state.enemy.maxHp, 'PC-INIMIGO', '#ff4d6d');

  drawPlayer(state.player);
  drawEnemy(state.enemy);
  drawProjectiles();
  drawEffects();

  ctx.restore();
}

function gameLoop(timestamp) {
  const dt = Math.min(0.05, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// ==========================================
// CONTROLES E INICIALIZAÇÃO
// ==========================================
function startBattle() {
  audio.init();
  state.enemy.hp = MAX_HP;
  state.player.hp = MAX_HP;
  state.enemyWave = null;
  state.playerShot = null;
  state.particles = [];
  state.floatingTexts = [];
  state.hits = 0;
  state.misses = 0;
  state.waveTimer = 0.2;
  state.running = true;

  setDeckEnabled(false);
  startOverlay.classList.remove('active');
  endOverlay.classList.remove('active');

  audio.playTonicReference();
  setFeedback('Tonalidade de Dó estabelecida! Prepare-se para o ataque...', '#00e5ff');
}

startBtn.addEventListener('click', startBattle);
restartBtn.addEventListener('click', startBattle);

tonicBtn.addEventListener('click', () => {
  audio.playTonicReference();
  setFeedback('Referência de Dó tocada!', '#7ee8ff');
});

noteButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.index);
    playerFireNote(idx);
  });
});

// Mapeamento físico (e.code) + caractere (e.key) para funcionar em qualquer teclado (ABNT2, US, etc.)
const CODE_MAP = {
  'KeyA': 0,       // Dó
  'KeyS': 1,       // Ré
  'KeyD': 2,       // Mi
  'KeyF': 3,       // Fá
  'KeyJ': 4,       // Sol
  'KeyK': 5,       // Lá
  'KeyL': 6,       // Si
  'Semicolon': 7   // Ç no layout ABNT2 (posição física à direita do L)
};

const KEY_MAP = {
  'a': 0, 'A': 0,
  's': 1, 'S': 1,
  'd': 2, 'D': 2,
  'f': 3, 'F': 3,
  'j': 4, 'J': 4,
  'k': 5, 'K': 5,
  'l': 6, 'L': 6,
  'ç': 7, 'Ç': 7
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    audio.playTonicReference();
    setFeedback('Referência de Dó tocada!', '#7ee8ff');
    return;
  }

  let noteIdx = undefined;
  if (e.code in CODE_MAP) {
    noteIdx = CODE_MAP[e.code];
  } else if (e.key in KEY_MAP) {
    noteIdx = KEY_MAP[e.key];
  }

  if (noteIdx !== undefined) {
    playerFireNote(noteIdx);
  }
});

requestAnimationFrame(gameLoop);
