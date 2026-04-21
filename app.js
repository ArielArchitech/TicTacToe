/* ============================================================
   FIRE VS ICE — app.js
   ============================================================ */

const FIRE = 'fire';
const ICE = 'ice';

const WIN_LINES = [
    ['TR', 'TC', 'TL'],
    ['MR', 'MC', 'ML'],
    ['BR', 'BC', 'BL'],
    ['TR', 'MR', 'BR'],
    ['TC', 'MC', 'BC'],
    ['TL', 'ML', 'BL'],
    ['TR', 'MC', 'BL'],
    ['TL', 'MC', 'BR'],
];

/* ── State ── */
let board = {};
let currentPlayer = FIRE;
let gameMode = '2P';
let gameOver = false;
let aiThinking = false;
let scores = { fire: 0, ice: 0, draws: 0 };

/* Claimed tiles to redraw each frame */
let claimedTiles = []; // { squareType, player, scale, targetScale }

/* ── DOM refs ── */
const cells = document.querySelectorAll('.cell');
const turnIndicator = document.getElementById('turnIndicator');
const resultOverlay = document.getElementById('resultOverlay');
const resultMsg = document.getElementById('resultMsg');
const playAgainBtn = document.getElementById('playAgainBtn');
const scoreBoardOverlay = document.getElementById('scoreBoardOverlay');
const scoreFireEl = document.getElementById('scoreFireEl');
const scoreIceEl = document.getElementById('scoreIceEl');
const scoreDrawsEl = document.getElementById('scoreDrawsEl');
const restartBtn = document.getElementById('restartBtn');
const onePlayerBtn = document.getElementById('onePlayerModeBtn');
const twoPlayersBtn = document.getElementById('twoPlayersModeBtn');
const scoreBoardBtn = document.getElementById('scoreBoard');
const fireChar = document.querySelector('.character.fire');
const iceChar = document.querySelector('.character.ice');
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

/* ============================================================
   TILE IMAGES — preload both
   Update paths to match wherever your images are served from.
   ============================================================ */
const tileImages = { fire: new Image(), ice: new Image() };
tileImages.fire.src = '/images/fireLand.png';
tileImages.ice.src = '/images/iceLand.png';

/* ============================================================
   CANVAS SETUP
   ============================================================ */
function resizeCanvas() {
    const screen = document.getElementById('screen');
    canvas.width = screen.offsetWidth || window.innerWidth;
    canvas.height = screen.offsetHeight || 750;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

/* ============================================================
   CELL POLYGON DATA
   Visual centroid of each clip-path slice, relative to .arena.
   ============================================================ */
const CELL_POLYGON_DATA = {
    TR: { divLeftPct: 21, divTopPct: 4, divW: 360, divH: 360, points: [[75, 17], [84, 21], [90, 25], [97.5, 32], [66, 32], [64.5, 14], [68, 15]] },
    TC: { divLeftPct: 21, divTopPct: 4, divW: 360, divH: 360, points: [[50, 11.5], [62, 13], [63, 32], [30, 32], [31, 13], [44, 11.5]] },
    TL: { divLeftPct: 15.5, divTopPct: 3.5, divW: 360, divH: 360, points: [[29, 16], [37.8, 14], [36.5, 33], [3, 33], [11, 26], [20, 20]] },
    MR: { divLeftPct: 23.7, divTopPct: 6.5, divW: 360, divH: 360, points: [[62, 32], [95.3, 32], [97.3, 37], [98.8, 42], [99.3, 47], [99, 52], [63.5, 52]] },
    MC: { divLeftPct: 22, divTopPct: 6.5, divW: 360, divH: 360, points: [[28, 32], [61.5, 32], [62.5, 52], [27, 52]] },
    ML: { divLeftPct: 13, divTopPct: 6.5, divW: 360, divH: 360, points: [[5, 32], [40, 32], [39, 52], [2, 52], [1.5, 46], [1.8, 41], [3, 36]] },
    BR: { divLeftPct: 24, divTopPct: 9, divW: 360, divH: 360, points: [[63, 52], [98.5, 52], [95, 58], [89.5, 63], [83.5, 67], [76.5, 71], [65, 75]] },
    BC: { divLeftPct: 15, divTopPct: 10, divW: 360, divH: 360, points: [[38, 51], [74, 51], [76, 75], [58, 77], [51, 77], [44, 76], [37, 75]] },
    BL: { divLeftPct: 13, divTopPct: 9, divW: 360, divH: 360, points: [[2.5, 52], [38, 52.5], [37, 75.5], [25, 72], [20, 69], [12, 64], [6, 58]] },
};

function polyCenter(points, divLeft, divTop, divW, divH) {
    let cx = 0, cy = 0;
    points.forEach(([px, py]) => { cx += px / 100 * divW + divLeft; cy += py / 100 * divH + divTop; });
    return { x: cx / points.length, y: cy / points.length };
}

function polyRadius(points, cx, cy, divLeft, divTop, divW, divH) {
    let maxD = 0;
    points.forEach(([px, py]) => {
        const ax = px / 100 * divW + divLeft;
        const ay = py / 100 * divH + divTop;
        const d = Math.hypot(ax - cx, ay - cy);
        if (d > maxD) maxD = d;
    });
    return maxD;
}

/* Returns polygon vertices in canvas-space — used for ctx.clip() masking */
function getPolygonCanvasPoints(squareType) {
    const data = CELL_POLYGON_DATA[squareType];
    if (!data) return [];
    const arena = document.querySelector('.arena');
    const arenaRect = arena.getBoundingClientRect();
    const sRect = document.getElementById('screen').getBoundingClientRect();
    const arenaX = arenaRect.left - sRect.left;
    const arenaY = arenaRect.top - sRect.top;
    const ringW = arenaRect.width;
    const ringH = arenaRect.height;
    const divLeft = (data.divLeftPct / 100) * ringW;
    const divTop = (data.divTopPct / 100) * ringH;
    return data.points.map(([px, py]) => ({
        x: arenaX + divLeft + (px / 100) * data.divW,
        y: arenaY + divTop + (py / 100) * data.divH,
    }));
}

function getCellCenter(squareType) {
    const data = CELL_POLYGON_DATA[squareType];
    if (!data) return null;
    const arena = document.querySelector('.arena');
    const arenaRect = arena.getBoundingClientRect();
    const sRect = document.getElementById('screen').getBoundingClientRect();
    const arenaX = arenaRect.left - sRect.left;
    const arenaY = arenaRect.top - sRect.top;
    const ringW = arenaRect.width;
    const ringH = arenaRect.height;
    const divLeft = (data.divLeftPct / 100) * ringW;
    const divTop = (data.divTopPct / 100) * ringH;
    const c = polyCenter(data.points, divLeft, divTop, data.divW, data.divH);
    const r = polyRadius(data.points, c.x, c.y, divLeft, divTop, data.divW, data.divH);
    return { x: arenaX + c.x, y: arenaY + c.y, r };
}

function getLaunchOrigin(player) {
    const char = player === FIRE ? fireChar : iceChar;
    const rect = char.getBoundingClientRect();
    const sRect = document.getElementById('screen').getBoundingClientRect();
    return {
        x: player === FIRE ? rect.right - sRect.left - 60 : rect.left - sRect.left + 60,
        y: rect.top - sRect.top + rect.height * 0.46,
    };
}

/* ============================================================
   DRAW CLAIMED TILES
   - Clips to the exact polygon shape of each tile
   - Image is sized to the polygon bounding box so it fills
     the tile without overflowing
   - Pop-in scale animation on placement
   - Pulsing glow on winning tiles
   ============================================================ */
function drawClaimedTiles(winningTypes) {
    claimedTiles.forEach(tile => {
        const pos = getCellCenter(tile.squareType);
        const verts = getPolygonCanvasPoints(tile.squareType);
        if (!pos || verts.length < 3) return;

        const img = tileImages[tile.player];
        if (!img.complete || img.naturalWidth === 0) return;

        // Pop-in scale animation
        if (tile.scale < tile.targetScale) {
            tile.scale = Math.min(tile.targetScale, tile.scale + 0.06);
        }

        // Compute polygon bounding box in canvas space
        const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const bboxW = maxX - minX;
        const bboxH = maxY - minY;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        ctx.save();

        // ── 1. Draw glow OUTSIDE the clip (behind the tile) ──
        const isWinner = winningTypes && winningTypes.includes(tile.squareType);
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
        const glowR = Math.max(bboxW, bboxH) * 0.7;

        if (isWinner) {
            const glowAlpha = 0.55 + pulse * 0.45;
            const gc = tile.player === FIRE
                ? `rgba(255,110,0,${glowAlpha})`
                : `rgba(0,210,255,${glowAlpha})`;
            const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.4);
            gr.addColorStop(0, gc);
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.arc(cx, cy, glowR * 1.4, 0, Math.PI * 2);
            ctx.fillStyle = gr;
            ctx.fill();
        } else {
            // Subtle ambient glow always on
            const gc = tile.player === FIRE
                ? 'rgba(255,80,0,0.22)'
                : 'rgba(0,180,255,0.22)';
            const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
            gr.addColorStop(0, gc);
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
            ctx.fillStyle = gr;
            ctx.fill();
        }

        // ── 2. Build polygon clip path ──
        ctx.beginPath();
        verts.forEach((v, i) => i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y));
        ctx.closePath();
        ctx.clip();

        // ── 3. Scale pop-in: scale around centroid ──
        ctx.translate(cx, cy);
        ctx.scale(tile.scale, tile.scale);
        ctx.translate(-cx, -cy);

        // ── 4. Draw image fitted to the polygon bounding box ──
        // Aspect-correct fit: scale image so it covers the bbox
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const bboxAspect = bboxW / bboxH;
        let drawW, drawH;
        if (imgAspect > bboxAspect) {
            // Image wider than bbox — fit height, crop sides
            drawH = bboxH;
            drawW = bboxH * imgAspect;
        } else {
            // Image taller than bbox — fit width, crop top/bottom
            drawW = bboxW;
            drawH = bboxW / imgAspect;
        }

        ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);

        ctx.restore();
    });
}

/* ============================================================
   PROJECTILE
   ============================================================ */
let projectiles = [];

class Projectile {
    constructor(player, targetType, onArrive) {
        this.player = player;
        this.onArrive = onArrive;
        this.done = false;

        const origin = getLaunchOrigin(player);
        const target = getCellCenter(targetType);

        this.ox = origin.x; this.oy = origin.y;
        this.tx = target ? target.x : origin.x;
        this.ty = target ? target.y : origin.y;
        this.px = this.ox; this.py = this.oy;

        this.radius = player === FIRE ? 26 : 22;
        this.progress = 0;
        this.speed = 0.032;

        const dist = Math.hypot(this.tx - this.ox, this.ty - this.oy);
        this.cp = {
            x: (this.ox + this.tx) / 2,
            y: (this.oy + this.ty) / 2 - dist * 0.22,
        };
        this.trail = [];
    }

    update() {
        this.progress = Math.min(1, this.progress + this.speed);
        const t = this.progress, mt = 1 - t;
        this.px = mt * mt * this.ox + 2 * mt * t * this.cp.x + t * t * this.tx;
        this.py = mt * mt * this.oy + 2 * mt * t * this.cp.y + t * t * this.ty;
        this.trail.push({ x: this.px, y: this.py });
        if (this.trail.length > 28) this.trail.shift();
        if (this.progress >= 1 && !this.done) { this.done = true; this.onArrive(); }
    }

    draw() { this.player === FIRE ? this.drawFireBall() : this.drawIceBall(); }

    drawFireBall() {
        const { px: x, py: y, radius: r } = this;
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i], frac = i / this.trail.length, tr = r * frac * 1.1;
            if (tr < 1) continue;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, tr);
            g.addColorStop(0, `rgba(255,210,80,${frac * 0.6})`);
            g.addColorStop(0.5, `rgba(255,100,0,${frac * 0.3})`);
            g.addColorStop(1, 'rgba(200,30,0,0)');
            ctx.beginPath(); ctx.arc(p.x, p.y, tr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        }
        const corona = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
        corona.addColorStop(0, 'rgba(255,255,180,0.25)');
        corona.addColorStop(0.4, 'rgba(255,140,0,0.18)');
        corona.addColorStop(1, 'rgba(200,40,0,0)');
        ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fillStyle = corona; ctx.fill();
        const main = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
        main.addColorStop(0, 'rgba(255,255,220,1)');
        main.addColorStop(0.25, 'rgba(255,200,50,1)');
        main.addColorStop(0.55, 'rgba(255,90,0,0.9)');
        main.addColorStop(0.8, 'rgba(200,20,0,0.5)');
        main.addColorStop(1, 'rgba(150,0,0,0)');
        ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fillStyle = main; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,230,100,0.6)'; ctx.lineWidth = 2.5; ctx.stroke();
    }

    drawIceBall() {
        const { px: x, py: y, radius: r } = this;
        const now = Date.now() * 0.004;
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i], frac = i / this.trail.length, tr = r * frac * 1.1;
            if (tr < 1) continue;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, tr);
            g.addColorStop(0, `rgba(180,240,255,${frac * 0.6})`);
            g.addColorStop(0.5, `rgba(0,160,255,${frac * 0.3})`);
            g.addColorStop(1, 'rgba(0,60,200,0)');
            ctx.beginPath(); ctx.arc(p.x, p.y, tr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        }
        const corona = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
        corona.addColorStop(0, 'rgba(220,248,255,0.22)');
        corona.addColorStop(0.4, 'rgba(0,180,255,0.15)');
        corona.addColorStop(1, 'rgba(0,60,200,0)');
        ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fillStyle = corona; ctx.fill();
        const main = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
        main.addColorStop(0, 'rgba(255,255,255,1)');
        main.addColorStop(0.2, 'rgba(200,245,255,1)');
        main.addColorStop(0.5, 'rgba(50,190,255,0.9)');
        main.addColorStop(0.8, 'rgba(0,100,230,0.5)');
        main.addColorStop(1, 'rgba(0,50,180,0)');
        ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fillStyle = main; ctx.fill();
        ctx.save(); ctx.translate(x, y);
        for (let a = 0; a < 8; a++) {
            const angle = (a / 8) * Math.PI * 2 + now;
            const inner = r * 0.3, outer = a % 2 === 0 ? r * 1.6 : r * 1.1;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            ctx.strokeStyle = `rgba(200,240,255,${a % 2 === 0 ? 0.9 : 0.55})`;
            ctx.lineWidth = a % 2 === 0 ? 2 : 1.2; ctx.stroke();
        }
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
            const angle = (a / 6) * Math.PI * 2 + now * 0.5;
            a === 0 ? ctx.moveTo(Math.cos(angle) * r * 0.95, Math.sin(angle) * r * 0.95) : ctx.lineTo(Math.cos(angle) * r * 0.95, Math.sin(angle) * r * 0.95);
        }
        ctx.closePath(); ctx.strokeStyle = 'rgba(180,230,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
    }
}

/* ============================================================
   IMPACT BURST
   ============================================================ */
let impacts = [];

function spawnImpact(squareType, player) {
    const pos = getCellCenter(squareType);
    if (!pos) return;
    const isfire = player === FIRE;
    impacts.push({ type: 'ring', x: pos.x, y: pos.y, r: 5, maxR: isfire ? 90 : 80, alpha: 1, color: isfire ? '255,140,0' : '80,210,255', life: 0, maxLife: 24 });
    for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
        const speed = Math.random() * 7 + 2.5;
        impacts.push({
            type: 'dot', x: pos.x, y: pos.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: Math.random() * 5 + 2, alpha: 1,
            color: isfire ? (Math.random() > 0.5 ? '255,200,60' : '255,80,0') : (Math.random() > 0.5 ? '180,240,255' : '0,180,255'),
            life: 0, maxLife: 38 + Math.random() * 25
        });
    }
}

/* ============================================================
   AMBIENT PARTICLES
   ============================================================ */
let ambientParticles = [];
class AmbientParticle {
    constructor(side) { this.side = side; this.reset(true); }
    reset(initial = false) {
        const W = canvas.width, H = canvas.height;
        this.x = this.side === FIRE ? Math.random() * W * 0.22 : W - Math.random() * W * 0.22;
        this.y = initial ? Math.random() * H : H + 10;
        this.size = Math.random() * 3 + 1; this.speedY = -(Math.random() * 0.55 + 0.18);
        this.speedX = (Math.random() - 0.5) * 0.35; this.alpha = Math.random() * 0.5 + 0.2;
        this.life = 0; this.maxLife = Math.random() * 200 + 100;
    }
    update() { this.x += this.speedX; this.y += this.speedY; this.life++; if (this.life > this.maxLife || this.y < -10) this.reset(); }
    draw() {
        ctx.globalAlpha = this.alpha * (1 - this.life / this.maxLife);
        ctx.fillStyle = this.side === FIRE ? '#ff6a00' : '#00c8ff';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
    }
}
for (let i = 0; i < 35; i++)ambientParticles.push(new AmbientParticle(FIRE));
for (let i = 0; i < 35; i++)ambientParticles.push(new AmbientParticle(ICE));

let burstList = [];
function burstParticles(winner) {
    const W = canvas.width, H = canvas.height;
    const cx = winner === FIRE ? W * 0.16 : W * 0.84, cy = H * 0.45;
    const color = winner === FIRE ? '#ff6a00' : '#00c8ff';
    for (let i = 0; i < 80; i++) burstList.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 1.5) * 7, size: Math.random() * 5 + 1, color, alpha: 1, life: 0, maxLife: 90 + Math.random() * 60 });
}

/* ============================================================
   RENDER LOOP
   ============================================================ */
let winningTypes = [];

function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ambient
    ambientParticles.forEach(p => { p.update(); p.draw(); });
    ctx.globalAlpha = 1;

    // Claimed tile images (drawn below projectiles)
    drawClaimedTiles(winningTypes);
    ctx.globalAlpha = 1;

    // Win burst
    burstList = burstList.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.life++;
        p.alpha = 1 - p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        return p.life < p.maxLife;
    });
    ctx.globalAlpha = 1;

    // Projectiles (drawn above tiles)
    projectiles = projectiles.filter(p => { p.update(); p.draw(); return !p.done; });
    ctx.globalAlpha = 1;

    // Impacts (drawn above projectiles)
    impacts = impacts.filter(p => {
        p.life++;
        if (p.type === 'ring') {
            const prog = p.life / p.maxLife; p.alpha = 1 - prog;
            const r = p.r + (p.maxR - p.r) * prog;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${p.color},${p.alpha * 0.9})`; ctx.lineWidth = 4 - prog * 3; ctx.stroke();
            return p.life < p.maxLife;
        } else {
            p.x += p.vx; p.y += p.vy; p.vy += 0.12;
            p.alpha = 1 - p.life / p.maxLife;
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            return p.life < p.maxLife;
        }
    });
    ctx.globalAlpha = 1;

    requestAnimationFrame(renderLoop);
}
renderLoop();

/* ============================================================
   GAME LOGIC
   ============================================================ */
function initBoard() {
    board = {};
    claimedTiles = [];
    winningTypes = [];
    cells.forEach(cell => {
        board[cell.dataset.squareType] = null;
        cell.classList.remove(FIRE, ICE, 'winner', 'claimed');
        cell.style.pointerEvents = 'auto';
    });
    projectiles = []; impacts = []; burstList = [];
    currentPlayer = FIRE; gameOver = false; aiThinking = false;
    updateTurnIndicator();
    clearCharacterStates();
}

function resetGame() {
    resultOverlay.classList.remove('visible');
    initBoard();
}

function updateTurnIndicator() {
    if (gameOver) return;
    const isAI = gameMode === '1P' && currentPlayer === ICE;
    turnIndicator.textContent = isAI ? 'AI IS THINKING…' : `${currentPlayer === FIRE ? '🔥 FIRE' : '❄️ ICE'}'S TURN`;
    turnIndicator.className = `turnIndicator ${currentPlayer}`;
}

cells.forEach(cell => {
    cell.addEventListener('mouseenter', () => {
        if (gameOver || board[cell.dataset.squareType] !== null || aiThinking) return;
        cell.classList.add(`hint-${currentPlayer}`);
    });
    cell.addEventListener('mouseleave', () => {
        cell.classList.remove(`hint-${FIRE}`, `hint-${ICE}`);
    });
    cell.addEventListener('click', () => {
        const type = cell.dataset.squareType;
        if (gameOver || board[type] !== null || aiThinking) return;
        handleMove(type);
    });
});

function handleMove(squareType) {
    cells.forEach(c => c.style.pointerEvents = 'none');
    const shooter = currentPlayer;
    projectiles.push(new Projectile(shooter, squareType, () => {
        spawnImpact(squareType, shooter);
        applyMove(squareType, shooter);
    }));
}

function applyMove(squareType, player) {
    board[squareType] = player;
    const cell = document.querySelector(`[data-square-type="${squareType}"]`);
    // Don't add .fire/.ice CSS color classes — canvas handles the visual
    cell.classList.add('claimed');
    cell.style.pointerEvents = 'none';

    // Register for canvas drawing with pop-in animation
    claimedTiles.push({ squareType, player, scale: 0, targetScale: 1 });

    const winLine = checkWin(player);
    if (winLine) { endGame(player, winLine); return; }
    if (checkDraw()) { endGame(null); return; }

    currentPlayer = player === FIRE ? ICE : FIRE;
    updateTurnIndicator();

    if (gameMode === '1P' && currentPlayer === ICE) {
        aiThinking = true;
        setTimeout(doAIMove, 750);
    } else {
        cells.forEach(c => { if (board[c.dataset.squareType] === null) c.style.pointerEvents = 'auto'; });
    }
}

function checkWin(player) {
    for (const line of WIN_LINES) if (line.every(sq => board[sq] === player)) return line;
    return null;
}
function checkDraw() { return Object.values(board).every(v => v !== null); }

function endGame(winner, winLine = []) {
    gameOver = true;
    winningTypes = winLine;
    if (winner === FIRE) {
        scores.fire++;
        resultMsg.textContent = '🔥 Fire Wins!'; resultMsg.className = 'result-msg fire';
        fireChar.classList.add('victory'); iceChar.classList.add('defeated');
        burstParticles(FIRE);
    } else if (winner === ICE) {
        scores.ice++;
        resultMsg.textContent = '❄️ Ice Wins!'; resultMsg.className = 'result-msg ice';
        iceChar.classList.add('victory'); fireChar.classList.add('defeated');
        burstParticles(ICE);
    } else {
        scores.draws++;
        resultMsg.textContent = "It's a Draw!"; resultMsg.className = 'result-msg draw';
    }
    turnIndicator.textContent = '';
    setTimeout(() => resultOverlay.classList.add('visible'), 1100);
}

function clearCharacterStates() {
    [fireChar, iceChar].forEach(c => c.classList.remove('victory', 'defeated'));
}

/* ── Minimax AI ── */
function doAIMove() {
    const best = minimax(board, ICE, 0); aiThinking = false; handleMove(best.move);
}
function minimax(boardState, player, depth) {
    const opp = player === ICE ? FIRE : ICE;
    for (const line of WIN_LINES) {
        if (line.every(sq => boardState[sq] === ICE)) return { score: 10 - depth };
        if (line.every(sq => boardState[sq] === FIRE)) return { score: -10 + depth };
    }
    const empty = Object.keys(boardState).filter(sq => boardState[sq] === null);
    if (!empty.length) return { score: 0 };
    const moves = empty.map(sq => ({ move: sq, score: minimax({ ...boardState, [sq]: player }, opp, depth + 1).score }));
    return player === ICE ? moves.reduce((a, b) => b.score > a.score ? b : a) : moves.reduce((a, b) => b.score < a.score ? b : a);
}

/* ── Buttons ── */
restartBtn.addEventListener('click', resetGame);
playAgainBtn.addEventListener('click', resetGame);
onePlayerBtn.addEventListener('click', () => { gameMode = '1P'; resetGame(); });
twoPlayersBtn.addEventListener('click', () => { gameMode = '2P'; resetGame(); });
scoreBoardBtn.addEventListener('click', () => {
    scoreFireEl.textContent = scores.fire; scoreIceEl.textContent = scores.ice; scoreDrawsEl.textContent = scores.draws;
    scoreBoardOverlay.classList.add('visible');
});
document.getElementById('closeScoreBoard').addEventListener('click', () => scoreBoardOverlay.classList.remove('visible'));

initBoard();