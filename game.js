// ==========================================
// MEGASOUND - Protótipo 2D de Percepção Musical (Dó-Móvel)
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
  { name: 'Dó',  degree: 'I',   freq: 261.63, color: '#ff4d6d' },
  { name: 'Ré',  degree: 'II',  freq: 293.66, color: '#ff9248' },
  { name: 'Mi',  degree: 'III', freq: 329.63, color: '#ffd166' },
  { name: 'Fá',  degree: 'IV',  freq: 349.23, color: '#06d6a0' },
  { name: 'Sol', degree: 'V',   freq: 392.00, color: '#00e5ff' },
  { name: 'Lá',  degree: 'VI',  freq: 440.00, color: '#4ea8de' },
  { name: 'Si',  degree: 'VII', freq: 493.88, color: '#9b5de5' },
  { name: 'Dó8', degree: 'VIII',freq: 523.25, color: '#f15bb5' }
];

// ==========================================
// SISTEMA DE ÁUDIO (Web Audio API - Synth Chiptune)
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

  playNote(freq, duration = 0.55, type = 'triangle', volume = 0.25, delay = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delay;

    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    // Sub-oscilador sutil uma oitava abaixo para corpo estilo Mega Man
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * 0.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + duration + 0.02);
    subOsc.stop(now + duration + 0.02);
  }

  // Toca referência da tonalidade (Dó - Mi - Sol - Dó)
  playTonicReference() {
    this.init();
    this.playNote(261.63, 0.22, 'triangle', 0.18, 0.00);
    this.playNote(329.63, 0.22, 'triangle', 0.16, 0.12);
    this.playNote(392.00, 0.22, 'triangle', 0.16, 0.24);
    this.playNote(261.63, 0.45, 'sine',     0.24, 0.36);
  }

  playAbsorbFx() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.18);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playHitFx() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.25);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }
}

const audio = new SoundEngine();

// ==========================================
// ESTADO DO JOGO
// ==========================================
const MAX_HP = 100;

const state = {
  running: false,
  lastTime: 0,
  shakeTime: 0,
  shakeIntensity: 0,
  hitStop: 0,
  hits: 0,
  misses: 0,
  combo: 0,
  waveTimer: 0,
  nextAttackDelay: 1.4,
  bgOffset: 0,

  // PC Inimigo (Esquerda)
  enemy: {
    x: 130,
    y: 330,
    hp: MAX_HP,
    maxHp: MAX_HP,
    hurtTimer: 0,
    shootAnim: 0
  },

  // Jogador (Direita)
  player: {
    x: 830,
    y: 330,
    hp: MAX_HP,
    maxHp: MAX_HP,
    hurtTimer: 0,
    shootAnim: 0
  },

  // Projéteis ativos
  enemyWaves: [],    // Ondas sonoras indo da esquerda -> direita
  playerShots: [],   // Tiros do jogador indo da direita -> esquerda
  particles: [],
  floatingTexts: []
};

function setFeedback(text, color = '#a9c2ed') {
  feedbackBanner.textContent = text;
  feedbackBanner.style.color = color;
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
    vy: -48,
    text,
    color,
    life: 0.95
  });
}

// ==========================================
// MECÂNICA DE ATAQUE E CONTRA-ATAQUE
// ==========================================
function enemyFireWave() {
  if (!state.running) return;
  const noteIndex = Math.floor(Math.random() * SCALE.length);
  const note = SCALE[noteIndex];

  state.enemy.shootAnim = 0.28;
  audio.playNote(note.freq, 0.75, 'sawtooth', 0.20);

  state.enemyWaves.push({
    x: state.enemy.x + 48,
    y: state.enemy.y - 26,
    vx: 205, // Velocidade justa para ouvir, identificar e contra-atacar
    noteIndex,
    note,
    radius: 22,
    phase: 0
  });

  setFeedback('Onda sonora disparada! Identifique a nota e contra-ataque!', '#ffd166');
}

function playerFireNote(noteIndex) {
  if (!state.running) return;
  const note = SCALE[noteIndex];

  state.player.shootAnim = 0.22;
  audio.playNote(note.freq, 0.38, 'triangle', 0.22);

  // Destaca botão na interface
  const btn = noteButtons[noteIndex];
  if (btn) {
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 140);
  }

  state.playerShots.push({
    x: state.player.x - 48,
    y: state.player.y - 26,
    vx: -480,
    noteIndex,
    note,
    charged: false, // Fica true ao absorver a onda inimiga!
    radius: 12
  });
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

  state.bgOffset = (state.bgOffset + dt * 28) % 64;

  if (state.shakeTime > 0) state.shakeTime -= dt;
  if (state.enemy.hurtTimer > 0) state.enemy.hurtTimer -= dt;
  if (state.enemy.shootAnim > 0) state.enemy.shootAnim -= dt;
  if (state.player.hurtTimer > 0) state.player.hurtTimer -= dt;
  if (state.player.shootAnim > 0) state.player.shootAnim -= dt;

  // Dispara nova onda inimiga quando não há ondas na tela
  if (state.enemyWaves.length === 0) {
    state.waveTimer += dt;
    if (state.waveTimer >= state.nextAttackDelay) {
      state.waveTimer = 0;
      enemyFireWave();
    }
  }

  // Atualiza ondas inimigas (Esquerda -> Direita)
  for (let i = state.enemyWaves.length - 1; i >= 0; i--) {
    const w = state.enemyWaves[i];
    w.x += w.vx * dt;
    w.phase += dt * 12;

    // Atingiu o jogador
    if (w.x >= state.player.x - 28) {
      state.enemyWaves.splice(i, 1);
      damagePlayer(15, `Era ${w.note.name}!`);
    }
  }

  // Atualiza tiros do jogador (Direita -> Esquerda)
  for (let i = state.playerShots.length - 1; i >= 0; i--) {
    const s = state.playerShots[i];
    s.x += s.vx * dt;

    // Verifica colisão com ondas sonoras inimigas (se ainda não carregado)
    if (!s.charged) {
      for (let j = state.enemyWaves.length - 1; j >= 0; j--) {
        const w = state.enemyWaves[j];
        if (Math.abs(s.x - w.x) <= s.radius + w.radius) {
          if (s.noteIndex === w.noteIndex) {
            // ACERTOU A NOTA! Absorve a energia da onda sonora!
            state.enemyWaves.splice(j, 1);
            s.charged = true;
            s.vx = -760; // Disparo carregado ultra-rápido!
            s.radius = 24;
            state.hits++;
            state.combo++;
            state.hitStop = 0.055; // Impacto estilo Mega Man / Touhou

            audio.playAbsorbFx();
            triggerShake(7, 0.18);
            spawnParticles(w.x, w.y, '#00e5ff', 24, 1.3);
            spawnFloatingText(w.x, w.y - 30, `CONTRA-ATAQUE! (${w.note.name})`, '#00e5ff');
            setFeedback(`Acertou ${w.note.name}! Energia absorvida — contra-ataque lançado!`, '#06d6a0');
          } else {
            // ERROU A NOTA! Tiro do jogador dissipa e a onda inimiga continua
            state.playerShots.splice(i, 1);
            state.combo = 0;
            spawnParticles(s.x, s.y, '#ff4d6d', 10, 0.7);
            spawnFloatingText(s.x, s.y - 24, `Nota errada (${s.note.name})!`, '#ff4d6d');
            setFeedback(`Você disparou ${s.note.name}, mas a onda tem outra altura!`, '#ff4d6d');
          }
          break;
        }
      }
    }

    // Verifica se o tiro (carregado ou normal) chegou ao inimigo
    if (state.playerShots[i] && s.x <= state.enemy.x + 34) {
      state.playerShots.splice(i, 1);
      if (s.charged) {
        damageEnemy(20, s.note.name);
      } else {
        // Tiro sem absorver onda inimiga não causa dano (só contra-ataque causa dano)
        spawnParticles(state.enemy.x + 34, s.y, '#6c7a9c', 8, 0.5);
        spawnFloatingText(state.enemy.x + 20, s.y - 30, 'SEM ENERGIA!', '#8fa8d6');
      }
    }
  }

  // Atualiza partículas
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Atualiza textos flutuantes
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
  state.combo = 0;

  audio.playHitFx();
  triggerShake(11, 0.28);
  spawnParticles(state.player.x, state.player.y - 26, '#ff4d6d', 22, 1.2);
  spawnFloatingText(state.player.x - 20, state.player.y - 75, `-${amount} HP (${reasonText})`, '#ff4d6d');
  setFeedback(`Você sofreu dano! ${reasonText}`, '#ff4d6d');

  if (state.player.hp <= 0) {
    endGame(false);
  }
}

function damageEnemy(amount, noteName) {
  state.enemy.hp = Math.max(0, state.enemy.hp - amount);
  state.enemy.hurtTimer = 0.4;
  state.hitStop = 0.05;

  audio.playHitFx();
  triggerShake(10, 0.24);
  spawnParticles(state.enemy.x, state.enemy.y - 26, '#ffd166', 26, 1.35);
  spawnFloatingText(state.enemy.x - 10, state.enemy.y - 78, `-${amount} HP!`, '#ffd166');

  if (state.enemy.hp <= 0) {
    endGame(true);
  }
}

function endGame(victory) {
  state.running = false;
  endOverlay.classList.add('active');
  endTitle.textContent = victory ? 'VITÓRIA!' : 'DERROTA!';
  endTitle.style.color = victory ? '#06d6a0' : '#ff4d6d';
  endStats.textContent = `Acertos: ${state.hits} | Erros: ${state.misses}`;
}

// ==========================================
// RENDERIZAÇÃO 2D (ESTILO MEGA MAN)
// ==========================================
function drawArena() {
  // Fundo cyber-musical
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#070b19');
  grad.addColorStop(0.75, '#0f1936');
  grad.addColorStop(1, '#162447');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grade futurista no fundo
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let x = -state.bgOffset; x < canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 370);
    ctx.stroke();
  }
  for (let y = 64; y < 370; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Pauta musical sutil no centro do palco
  ctx.strokeStyle = 'rgba(126, 232, 255, 0.14)';
  for (let i = 0; i < 5; i++) {
    const lineY = 270 + i * 14;
    ctx.beginPath();
    ctx.moveTo(180, lineY);
    ctx.lineTo(780, lineY);
    ctx.stroke();
  }

  // Chão metálico estilo Mega Man
  ctx.fillStyle = '#141e38';
  ctx.fillRect(0, 370, canvas.width, 110);

  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(0, 370, canvas.width, 4);

  ctx.fillStyle = '#1f2f57';
  for (let x = 0; x < canvas.width; x += 48) {
    ctx.fillRect(x + 4, 382, 38, 16);
  }
}

// Barras de HP segmentadas estilo Mega Man
function drawMegaHealthBar(x, y, hp, maxHp, label, primaryColor) {
  const segments = 20;
  const filled = Math.ceil((hp / maxHp) * segments);

  // Nome
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText(`${label} (${hp}/${maxHp})`, x, y - 8);

  // Moldura externa
  ctx.fillStyle = '#050811';
  ctx.fillRect(x, y, 224, 24);
  ctx.strokeStyle = '#7ee8ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 224, 24);

  // Segmentos
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < filled ? primaryColor : '#1b243b';
    ctx.fillRect(x + 4 + i * 11, y + 4, 8, 16);
  }
}

// Desenha o PC Inimigo (Esquerda, olhando para a direita)
function drawEnemy(e) {
  if (e.hurtTimer > 0 && Math.floor(e.hurtTimer * 25) % 2 === 0) return;

  ctx.save();
  ctx.translate(e.x, e.y);

  // Sombra
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 38, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Corpo robótico estilo Boss de Mega Man
  ctx.fillStyle = '#6b2cf5';
  ctx.fillRect(-24, -44, 48, 54);

  // Ombreiras
  ctx.fillStyle = '#9b5de5';
  ctx.fillRect(-30, -46, 16, 20);
  ctx.fillRect(14, -46, 16, 20);

  // Capacete / Cabeça
  ctx.fillStyle = '#4a1fb8';
  ctx.fillRect(-20, -72, 40, 28);

  // Visor brilhante
  ctx.fillStyle = '#ff4d6d';
  ctx.fillRect(0, -64, 18, 10);

  // Canhão sonoro (braço direito apontando para a direita)
  const recoil = e.shootAnim > 0 ? -6 : 0;
  ctx.fillStyle = '#2b2d42';
  ctx.fillRect(16 + recoil, -32, 34, 18);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(46 + recoil, -35, 6, 24);

  // Pernas
  ctx.fillStyle = '#3a1894';
  ctx.fillRect(-20, 10, 15, 28);
  ctx.fillRect(5, 10, 15, 28);

  ctx.restore();
}

// Desenha o Jogador (Direita, olhando para a esquerda)
function drawPlayer(p) {
  if (p.hurtTimer > 0 && Math.floor(p.hurtTimer * 25) % 2 === 0) return;

  ctx.save();
  ctx.translate(p.x, p.y);

  // Sombra
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 38, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tronco armadura azul estilo Mega Man
  ctx.fillStyle = '#0077b6';
  ctx.fillRect(-20, -40, 40, 48);

  // Peitoral ciano
  ctx.fillStyle = '#00b4d8';
  ctx.fillRect(-16, -36, 32, 22);

  // Capacete
  ctx.fillStyle = '#0077b6';
  ctx.fillRect(-18, -68, 36, 28);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(-6, -68, 12, 8);

  // Rosto / Visor olhando para a esquerda
  ctx.fillStyle = '#ffe5d9';
  ctx.fillRect(-16, -58, 18, 16);
  ctx.fillStyle = '#03045e';
  ctx.fillRect(-14, -55, 6, 7);

  // Mega Buster (apontando para a esquerda)
  const recoil = p.shootAnim > 0 ? 6 : 0;
  ctx.fillStyle = '#0096c7';
  ctx.fillRect(-46 + recoil, -32, 30, 16);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(-50 + recoil, -30, 6, 12);

  // Botas estilo Mega Man
  ctx.fillStyle = '#0096c7';
  ctx.fillRect(-20, 8, 16, 30);
  ctx.fillRect(4, 8, 16, 30);

  ctx.restore();
}

function drawProjectiles() {
  // Ondas sonoras inimigas
  for (const w of state.enemyWaves) {
    ctx.save();
    ctx.translate(w.x, w.y);

    // Anéis de onda sonora
    for (let r = 0; r < 3; r++) {
      const pulse = Math.sin(w.phase - r * 0.9) * 5;
      ctx.strokeStyle = r === 0 ? '#ffd166' : 'rgba(255, 209, 102, 0.45)';
      ctx.lineWidth = 3 - r * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, w.radius + pulse - r * 5, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
    }

    // Núcleo energético (sem mostrar o nome da nota, para o jogador usar o ouvido!)
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', 0, 1);

    ctx.restore();
  }

  // Tiros do jogador
  for (const s of state.playerShots) {
    ctx.save();
    ctx.translate(s.x, s.y);

    if (s.charged) {
      // Disparo carregado após absorver a onda sonora!
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(12, 0, 38, 22, 0, 0, Math.PI * 2);
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
      // Tiro inicial do jogador
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

  // Barras de HP no topo
  drawMegaHealthBar(28, 34, state.enemy.hp, state.enemy.maxHp, 'PC-INIMIGO', '#ff4d6d');
  drawMegaHealthBar(canvas.width - 252, 34, state.player.hp, state.player.maxHp, 'JOGADOR', '#00e5ff');

  drawEnemy(state.enemy);
  drawPlayer(state.player);
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
  state.enemyWaves = [];
  state.playerShots = [];
  state.particles = [];
  state.floatingTexts = [];
  state.hits = 0;
  state.misses = 0;
  state.combo = 0;
  state.waveTimer = 0.2;
  state.running = true;

  startOverlay.classList.remove('active');
  endOverlay.classList.remove('active');

  audio.playTonicReference();
  setFeedback('Tonalidade de Dó estabelecida! Prepare-se para o primeiro ataque...', '#00e5ff');
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

const KEY_MAP = {
  '1': 0, 'a': 0, 'A': 0,
  '2': 1, 's': 1, 'S': 1,
  '3': 2, 'd': 2, 'D': 2,
  '4': 3, 'f': 3, 'F': 3,
  '5': 4, 'g': 4, 'G': 4,
  '6': 5, 'h': 5, 'H': 5,
  '7': 6, 'j': 6, 'J': 6,
  '8': 7, 'k': 7, 'K': 7
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    audio.playTonicReference();
    setFeedback('Referência de Dó tocada!', '#7ee8ff');
    return;
  }
  if (e.key in KEY_MAP) {
    playerFireNote(KEY_MAP[e.key]);
  }
});

requestAnimationFrame(gameLoop);
