// ─────────────────────────────────────────────────────────────
// CONSTANTS & CONFIG
// ─────────────────────────────────────────────────────────────

const TILE           = 60;
const TRAIN_RADIUS   = 10;
const STATION_SIZE   = 28;
const JUNCTION_RADIUS = 14;

const PALETTE = ['#e74c3c', '#27ae60', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];
const PNAMES  = ['Rouge',   'Vert',    'Bleu',    'Orange',  'Violet',  'Cyan'];

const DIFFICULTY = {
  easy:   { colors: 2, junctions: 2, interval: 3000, cols: 9,  rows: 7 },
  medium: { colors: 3, junctions: 3, interval: 2000, cols: 11, rows: 8 },
  hard:   { colors: 4, junctions: 4, interval: 1200, cols: 13, rows: 9 },
};

// ─────────────────────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────────────────────

let G = null; // instance principale du jeu

// ─────────────────────────────────────────────────────────────
// CLASSE : Junction
// ─────────────────────────────────────────────────────────────

class Junction {
  constructor(id, col, row, pathA, pathB) {
    this.id    = id;
    this.col   = col;
    this.row   = row;
    this.x     = col * TILE + TILE / 2;
    this.y     = row * TILE + TILE / 2;
    this.pathA = pathA; // [segIn, segOutA]
    this.pathB = pathB; // [segIn, segOutB]
    this.state = 0;     // 0 = voie A, 1 = voie B
    this.animT = 0;
    this.hover = false;
  }

  toggle() {
    this.state = 1 - this.state;
    this.animT = 0.3;
  }

  // Retourne le segment de sortie en fonction du segment entrant
  route(inSeg) {
    const active = this.state === 0 ? this.pathA : this.pathB;
    if (active[0] === inSeg) return active[1];
    if (active[1] === inSeg) return active[0];
    const other = this.state === 0 ? this.pathB : this.pathA;
    if (other[0] === inSeg) return other[1];
    if (other[1] === inSeg) return other[0];
    return -1;
  }

  update(dt) {
    if (this.animT > 0) this.animT = Math.max(0, this.animT - dt);
  }

  draw(ctx) {
    const pulse = this.animT > 0 ? Math.sin(this.animT * Math.PI * 10) * 0.5 + 0.5 : 0;
    const r = JUNCTION_RADIUS + pulse * 4;

    // Halo de survol / animation
    if (this.hover || pulse > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,229,255,${0.1 + pulse * 0.15})`;
      ctx.fill();
    }

    // Cercle principal
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = this.hover ? '#00e5ff' : (this.state === 0 ? '#8888bb' : '#00e5ff');
    ctx.lineWidth = 2;
    ctx.fillStyle = '#0f0f1a';
    ctx.fill();
    ctx.stroke();

    // Flèche de direction
    const active = this.state === 0 ? this.pathA : this.pathB;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = this.state === 0 ? '#6666aa' : '#00e5ff';
    ctx.lineWidth = 2;
    const seg = G ? G.segments[active[1]] : null;
    if (seg) {
      const dx  = seg.x2 - seg.x1;
      const dy  = seg.y2 - seg.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx  = dx / len;
      const ny  = dy / len;
      ctx.beginPath();
      ctx.moveTo(-nx * 5, -ny * 5);
      ctx.lineTo( nx * 7,  ny * 7);
      ctx.moveTo( nx * 7,  ny * 7);
      ctx.lineTo( nx * 3 - ny * 4,  ny * 3 + nx * 4);
      ctx.moveTo( nx * 7,  ny * 7);
      ctx.lineTo( nx * 3 + ny * 4,  ny * 3 - nx * 4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE : Segment
// ─────────────────────────────────────────────────────────────

class Segment {
  constructor(id, x1, y1, x2, y2, junctionStart, junctionEnd) {
    this.id           = id;
    this.x1           = x1;
    this.y1           = y1;
    this.x2           = x2;
    this.y2           = y2;
    this.junctionStart = junctionStart; // id de jonction ou null
    this.junctionEnd   = junctionEnd;   // id de jonction ou null
    this.length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  // Position interpolée entre 0 et 1
  posAt(t) {
    return {
      x: this.x1 + (this.x2 - this.x1) * t,
      y: this.y1 + (this.y2 - this.y1) * t,
    };
  }

  draw(ctx, highlight = false) {
    // Rail principal
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.strokeStyle = highlight ? 'rgba(0,229,255,0.4)' : 'rgba(136,136,153,0.6)';
    ctx.lineWidth   = highlight ? 5 : 4;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Traverses
    const steps = Math.floor(this.length / 14);
    const dx = (this.x2 - this.x1) / this.length;
    const dy = (this.y2 - this.y1) / this.length;
    for (let i = 1; i < steps; i++) {
      const t  = i / steps;
      const cx = this.x1 + (this.x2 - this.x1) * t;
      const cy = this.y1 + (this.y2 - this.y1) * t;
      ctx.beginPath();
      ctx.moveTo(cx - dy * 5, cy + dx * 5);
      ctx.lineTo(cx + dy * 5, cy - dx * 5);
      ctx.strokeStyle = 'rgba(100,100,120,0.4)';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE : Station
// ─────────────────────────────────────────────────────────────

class Station {
  constructor(id, col, row, color, colorName, segmentId) {
    this.id        = id;
    this.col       = col;
    this.row       = row;
    this.x         = col * TILE + TILE / 2;
    this.y         = row * TILE + TILE / 2;
    this.color     = color;
    this.colorName = colorName;
    this.segmentId = segmentId; // segment menant à cette gare
    this.flash     = 0;
    this.flashGood = false;
  }

  trigger(good) {
    this.flash     = good ? 0.5 : 0.3;
    this.flashGood = good;
  }

  update(dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
  }

  draw(ctx) {
    const f  = this.flash;
    const fc = this.flashGood ? '#00ff88' : '#ff4466';
    const s  = STATION_SIZE;

    // Fond de la plateforme
    ctx.fillStyle   = f > 0 ? fc : '#1a1a2e';
    ctx.strokeStyle = f > 0 ? fc : this.color;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.roundRect(this.x - s / 2, this.y - s / 2, s, s, 4);
    ctx.fill();
    ctx.stroke();

    // Carré de couleur intérieur
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(this.x - s / 2 + 5, this.y - s / 2 + 5, s - 10, s - 10, 2);
    ctx.fill();

    // Halo de flash
    if (f > 0) {
      ctx.beginPath();
      ctx.roundRect(this.x - s / 2 - 6, this.y - s / 2 - 6, s + 12, s + 12, 7);
      ctx.strokeStyle = `rgba(${this.flashGood ? '0,255,136' : '255,68,102'},${f})`;
      ctx.lineWidth   = 4;
      ctx.stroke();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE : Tunnel
// ─────────────────────────────────────────────────────────────

class Tunnel {
  constructor(col, row, segmentId) {
    this.col       = col;
    this.row       = row;
    this.x         = col * TILE + TILE / 2;
    this.y         = row * TILE + TILE / 2;
    this.segmentId = segmentId;
  }

  draw(ctx) {
    ctx.fillStyle   = '#0a0a14';
    ctx.strokeStyle = '#444466';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, 12, Math.PI, 0);
    ctx.strokeStyle = '#666688';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.fillStyle    = '#00e5ff';
    ctx.font         = '10px Space Mono';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⬡', this.x, this.y + 2);
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE : Train
// ─────────────────────────────────────────────────────────────

class Train {
  constructor(id, color, colorName, segmentId, direction) {
    this.id          = id;
    this.color       = color;
    this.colorName   = colorName;
    this.segmentId   = segmentId;
    this.t           = 0;         // position normalisée sur le segment (0..1)
    this.direction   = direction; // 1 = start→end, -1 = end→start
    this.speed       = 0.6;       // unités/seconde
    this.active      = true;
    this.trailPoints = [];
    this.arrived     = false;
  }

  update(dt, segments, junctions, stations, game) {
    if (!this.active) return;

    const seg  = segments[this.segmentId];
    const step = (this.speed * dt) / (seg.length / TILE);

    this.t += step * this.direction;

    // Mémoriser la traîne
    const pos = seg.posAt(Math.min(1, Math.max(0, this.t)));
    this.trailPoints.push({ x: pos.x, y: pos.y });
    if (this.trailPoints.length > 12) this.trailPoints.shift();

    // Arrivée en fin de segment (direction +)
    if (this.t >= 1) {
      const endStation = stations.find(s => s.segmentId === this.segmentId);
      if (endStation) {
        game.trainArrived(this, endStation, endStation.color === this.color);
        return;
      }
      const jEnd = seg.junctionEnd !== null
        ? junctions.find(j => j.id === seg.junctionEnd)
        : null;
      if (jEnd) {
        const nextSeg = jEnd.route(this.segmentId);
        if (nextSeg >= 0) {
          const ns        = segments[nextSeg];
          const dStart    = Math.sqrt((jEnd.x - ns.x1) ** 2 + (jEnd.y - ns.y1) ** 2);
          const dEnd      = Math.sqrt((jEnd.x - ns.x2) ** 2 + (jEnd.y - ns.y2) ** 2);
          this.direction  = dStart < dEnd ? 1 : -1;
          this.segmentId  = nextSeg;
          this.t          = dStart < dEnd ? 0 : 1;
        } else {
          this.active = false;
        }
      } else {
        this.active = false;
      }

    // Arrivée en début de segment (direction -)
    } else if (this.t <= 0) {
      const endStation = stations.find(s => s.segmentId === this.segmentId);
      if (endStation) {
        game.trainArrived(this, endStation, endStation.color === this.color);
        return;
      }
      const jStart = seg.junctionStart !== null
        ? junctions.find(j => j.id === seg.junctionStart)
        : null;
      if (jStart) {
        const nextSeg = jStart.route(this.segmentId);
        if (nextSeg >= 0) {
          const ns        = segments[nextSeg];
          const dStart    = Math.sqrt((jStart.x - ns.x1) ** 2 + (jStart.y - ns.y1) ** 2);
          const dEnd      = Math.sqrt((jStart.x - ns.x2) ** 2 + (jStart.y - ns.y2) ** 2);
          this.direction  = dStart < dEnd ? 1 : -1;
          this.segmentId  = nextSeg;
          this.t          = dStart < dEnd ? 0 : 1;
        } else {
          this.active = false;
        }
      } else {
        this.active = false;
      }
    }
  }

  draw(ctx, segments) {
    if (!this.active) return;

    const seg = segments[this.segmentId];
    const pos = seg.posAt(Math.min(1, Math.max(0, this.t)));

    // Traîne lumineuse
    if (this.trailPoints.length > 1) {
      for (let i = 1; i < this.trailPoints.length; i++) {
        const alpha = (i / this.trailPoints.length) * 0.4;
        ctx.beginPath();
        ctx.moveTo(this.trailPoints[i - 1].x, this.trailPoints[i - 1].y);
        ctx.lineTo(this.trailPoints[i].x,     this.trailPoints[i].y);
        ctx.strokeStyle = this.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth   = 6 * (i / this.trailPoints.length);
        ctx.lineCap     = 'round';
        ctx.stroke();
      }
    }

    // Corps du train
    const dx  = seg.x2 - seg.x1;
    const dy  = seg.y2 - seg.y1;
    const ang = Math.atan2(dy * this.direction, dx * this.direction);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);

    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 12;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-TRAIN_RADIUS, -TRAIN_RADIUS * 0.65, TRAIN_RADIUS * 2, TRAIN_RADIUS * 1.3, 3);
    ctx.fill();

    // Cabine
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.roundRect(TRAIN_RADIUS * 0.3, -TRAIN_RADIUS * 0.55, TRAIN_RADIUS * 0.55, TRAIN_RADIUS * 0.8, 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// GÉNÉRATEUR DE CARTE
// ─────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateMap(diff) {
  const cfg = DIFFICULTY[diff];
  const { cols, rows, colors: numColors, junctions: numJunctions } = cfg;
  const W = cols * TILE;
  const H = rows * TILE;

  const segments  = [];
  const junctions = [];
  const stations  = [];
  let   tunnel    = null;
  let   sId       = 0;

  // Sélectionner des couleurs aléatoires parmi la palette
  const colorIndices = shuffleArray([...Array(PALETTE.length).keys()]).slice(0, numColors);
  const usedColors   = colorIndices.map(i => ({ color: PALETTE[i], name: PNAMES[i] }));

  // ── FACILE : 2 couleurs, 2 jonctions ──
  if (numColors === 2 && numJunctions === 2) {
    //
    //          [S0]       [S1]
    //           |          |
    // [TUN]---[J0]--------[J1]----[dead]
    //
    const mx  = Math.floor(rows / 2);
    const tx  = 1, j0c = 3, j1c = 6;
    const jy  = mx;

    segments.push(new Segment(sId++, tx*TILE+TILE/2,  jy*TILE+TILE/2, j0c*TILE+TILE/2, jy*TILE+TILE/2,  null, 0)); // 0 T→J0
    segments.push(new Segment(sId++, j0c*TILE+TILE/2, jy*TILE+TILE/2, j1c*TILE+TILE/2, jy*TILE+TILE/2,  0,    1)); // 1 J0→J1
    segments.push(new Segment(sId++, j0c*TILE+TILE/2, jy*TILE+TILE/2, j0c*TILE+TILE/2, (jy-2)*TILE+TILE/2, 0, null)); // 2 J0→S0
    segments.push(new Segment(sId++, j1c*TILE+TILE/2, jy*TILE+TILE/2, j1c*TILE+TILE/2, (jy-2)*TILE+TILE/2, 1, null)); // 3 J1→S1
    segments.push(new Segment(sId++, j1c*TILE+TILE/2, jy*TILE+TILE/2, (j1c+2)*TILE+TILE/2, jy*TILE+TILE/2, 1, null)); // 4 J1→dead

    junctions.push(new Junction(0, j0c, jy, [0, 1], [0, 2]));
    junctions.push(new Junction(1, j1c, jy, [1, 4], [1, 3]));

    stations.push(new Station(0, j0c, jy-2, usedColors[0].color, usedColors[0].name, 2));
    stations.push(new Station(1, j1c, jy-2, usedColors[1].color, usedColors[1].name, 3));

    tunnel = new Tunnel(tx, jy, 0);
    return { segments, junctions, stations, tunnel, W, H, cfg, usedColors };
  }

  // ── NORMAL : 3 couleurs, 3 jonctions ──
  if (numColors === 3 && numJunctions === 3) {
    //
    //    [S0]       [S1]   [S2]
    //     |          |      |
    // [T]-[J0]------[J1]--[J2]--[dead]
    //
    const mx  = Math.floor(rows / 2);
    const tx  = 1, j0c = 3, j1c = 6, j2c = 9;

    segments.push(new Segment(sId++, tx*TILE+TILE/2,  mx*TILE+TILE/2, j0c*TILE+TILE/2, mx*TILE+TILE/2,  null, 0)); // 0
    segments.push(new Segment(sId++, j0c*TILE+TILE/2, mx*TILE+TILE/2, j1c*TILE+TILE/2, mx*TILE+TILE/2,  0,    1)); // 1
    segments.push(new Segment(sId++, j1c*TILE+TILE/2, mx*TILE+TILE/2, j2c*TILE+TILE/2, mx*TILE+TILE/2,  1,    2)); // 2
    segments.push(new Segment(sId++, j0c*TILE+TILE/2, mx*TILE+TILE/2, j0c*TILE+TILE/2, (mx-2)*TILE+TILE/2, 0, null)); // 3 →S0
    segments.push(new Segment(sId++, j1c*TILE+TILE/2, mx*TILE+TILE/2, j1c*TILE+TILE/2, (mx-2)*TILE+TILE/2, 1, null)); // 4 →S1
    segments.push(new Segment(sId++, j2c*TILE+TILE/2, mx*TILE+TILE/2, j2c*TILE+TILE/2, (mx-2)*TILE+TILE/2, 2, null)); // 5 →S2
    segments.push(new Segment(sId++, j2c*TILE+TILE/2, mx*TILE+TILE/2, (j2c+2)*TILE+TILE/2, mx*TILE+TILE/2, 2, null)); // 6 →dead

    junctions.push(new Junction(0, j0c, mx, [0, 1], [0, 3]));
    junctions.push(new Junction(1, j1c, mx, [1, 2], [1, 4]));
    junctions.push(new Junction(2, j2c, mx, [2, 6], [2, 5]));

    stations.push(new Station(0, j0c, mx-2, usedColors[0].color, usedColors[0].name, 3));
    stations.push(new Station(1, j1c, mx-2, usedColors[1].color, usedColors[1].name, 4));
    stations.push(new Station(2, j2c, mx-2, usedColors[2].color, usedColors[2].name, 5));

    tunnel = new Tunnel(tx, mx, 0);
    return { segments, junctions, stations, tunnel, W, H, cfg, usedColors };
  }

  // ── DIFFICILE : 4 couleurs, 4 jonctions ──
  {
    //
    //    [S0]              [S2]
    //     |                 |
    // [T]-[J0]---[J1]---[J2]--[dead]
    //             |
    //            [J3]
    //           /     \
    //        [S3]     [S1]
    //
    const mx  = Math.floor(rows / 2);
    const tx  = 1, j0c = 3, j1c = 6, j2c = 9, j3c = 6;
    const j3r = mx + 2;
    const s1c = j3c + 3, s1r = j3r;
    const s3c = j3c - 3, s3r = j3r;

    segments.push(new Segment(sId++, tx*TILE+TILE/2,  mx*TILE+TILE/2, j0c*TILE+TILE/2, mx*TILE+TILE/2,  null, 0)); // 0 T→J0
    segments.push(new Segment(sId++, j0c*TILE+TILE/2, mx*TILE+TILE/2, j1c*TILE+TILE/2, mx*TILE+TILE/2,  0,    1)); // 1 J0→J1
    segments.push(new Segment(sId++, j1c*TILE+TILE/2, mx*TILE+TILE/2, j2c*TILE+TILE/2, mx*TILE+TILE/2,  1,    2)); // 2 J1→J2
    segments.push(new Segment(sId++, j0c*TILE+TILE/2, mx*TILE+TILE/2, j0c*TILE+TILE/2, (mx-2)*TILE+TILE/2, 0, null)); // 3 J0→S0
    segments.push(new Segment(sId++, j2c*TILE+TILE/2, mx*TILE+TILE/2, j2c*TILE+TILE/2, (mx-2)*TILE+TILE/2, 2, null)); // 4 J2→S2
    segments.push(new Segment(sId++, j1c*TILE+TILE/2, mx*TILE+TILE/2, j1c*TILE+TILE/2, j3r*TILE+TILE/2, 1,   3)); // 5 J1→J3
    segments.push(new Segment(sId++, j3c*TILE+TILE/2, j3r*TILE+TILE/2, s3c*TILE+TILE/2, s3r*TILE+TILE/2, 3, null)); // 6 J3→S3 (gauche)
    segments.push(new Segment(sId++, j3c*TILE+TILE/2, j3r*TILE+TILE/2, s1c*TILE+TILE/2, s1r*TILE+TILE/2, 3, null)); // 7 J3→S1 (droite)
    segments.push(new Segment(sId++, j2c*TILE+TILE/2, mx*TILE+TILE/2, (j2c+2)*TILE+TILE/2, mx*TILE+TILE/2, 2, null)); // 8 J2→dead

    junctions.push(new Junction(0, j0c, mx,  [0, 1], [0, 3]));
    junctions.push(new Junction(1, j1c, mx,  [1, 2], [1, 5]));
    junctions.push(new Junction(2, j2c, mx,  [2, 8], [2, 4]));
    junctions.push(new Junction(3, j3c, j3r, [5, 7], [5, 6]));

    stations.push(new Station(0, j0c, mx-2, usedColors[0].color, usedColors[0].name, 3));
    stations.push(new Station(1, s1c, s1r,  usedColors[1].color, usedColors[1].name, 7));
    stations.push(new Station(2, j2c, mx-2, usedColors[2].color, usedColors[2].name, 4));
    stations.push(new Station(3, s3c, s3r,  usedColors[3].color, usedColors[3].name, 6));

    tunnel = new Tunnel(tx, mx, 0);
    return { segments, junctions, stations, tunnel, W, H, cfg, usedColors };
  }
}

// ─────────────────────────────────────────────────────────────
// CLASSE : Game
// ─────────────────────────────────────────────────────────────

class Game {
  constructor(diff) {
    this.diff = diff;

    const map        = generateMap(diff);
    this.segments    = map.segments;
    this.junctions   = map.junctions;
    this.stations    = map.stations;
    this.tunnel      = map.tunnel;
    this.W           = map.W;
    this.H           = map.H;
    this.cfg         = map.cfg;
    this.usedColors  = map.usedColors;

    this.trains      = [];
    this.score       = 0;
    this.delivered   = 0;
    this.trainsSent  = 0;
    this.trainTimer  = 0;
    this.timeLeft    = 60; // durée de la partie en secondes
    this.gameOver    = false;
    this.lastTime    = null;
    this.animId      = null;

    // Initialisation du canvas
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
    document.getElementById('canvas-container').style.width = this.W + 'px';

    this.canvas.addEventListener('click',      e => this.onClick(e));
    this.canvas.addEventListener('mousemove',  e => this.onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.junctions.forEach(j => j.hover = false);
    });

    this.updateHUD();
  }

  // ── Interactions ──

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (this.canvas.width  / rect.width);
    const my   = (e.clientY - rect.top)  * (this.canvas.height / rect.height);
    for (const j of this.junctions) {
      const d = Math.sqrt((mx - j.x) ** 2 + (my - j.y) ** 2);
      if (d <= JUNCTION_RADIUS + 8) {
        j.toggle();
        showToast(`Jonction ${j.id + 1} → ${j.state === 0 ? 'Voie A' : 'Voie B'}`, 'neutral');
        return;
      }
    }
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (this.canvas.width  / rect.width);
    const my   = (e.clientY - rect.top)  * (this.canvas.height / rect.height);
    let any = false;
    for (const j of this.junctions) {
      const d = Math.sqrt((mx - j.x) ** 2 + (my - j.y) ** 2);
      j.hover = d <= JUNCTION_RADIUS + 8;
      if (j.hover) any = true;
    }
    this.canvas.style.cursor = any ? 'pointer' : 'default';
  }

  // ── Gestion des trains ──

  spawnTrain() {
    const c = this.usedColors[Math.floor(Math.random() * this.usedColors.length)];
    const t = new Train(this.trainsSent, c.color, c.name, this.tunnel.segmentId, 1);
    t.t = 0;
    this.trains.push(t);
    this.trainsSent++;
    this.updateHUD();
  }

  trainArrived(train, station, good) {
    train.active  = false;
    train.arrived = true;
    station.trigger(good);
    if (good) {
      this.score++;
      showToast(`+1 · Train ${train.colorName} → Gare ${station.colorName} ✓`, 'good');
    } else {
      showToast(`Mauvaise gare ! Train ${train.colorName} → Gare ${station.colorName}`, 'bad');
    }
    this.delivered++;
    this.updateHUD();
  }

  // ── HUD ──

  updateHUD() {
    document.getElementById('hud-score').textContent = this.score;
    document.getElementById('hud-done').textContent  = this.delivered;

    const secs    = Math.ceil(this.timeLeft);
    const m       = Math.floor(secs / 60);
    const s       = secs % 60;
    const timerEl = document.getElementById('hud-timer');
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (secs <= 10) timerEl.classList.add('danger');
    else            timerEl.classList.remove('danger');
  }

  // ── Fin de partie ──

  endGame() {
    this.gameOver = true;
    cancelAnimationFrame(this.animId);
    document.getElementById('final-score').textContent  = this.score;
    document.getElementById('final-detail').textContent =
      `${this.score} train${this.score > 1 ? 's' : ''} correctement acheminé${this.score > 1 ? 's' : ''} sur ${this.delivered} envoyés`;
    showScreen('over-screen');
  }

  // ── Boucle de mise à jour ──

  update(dt) {
    // Décompte du timer
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.updateHUD();
      this.endGame();
      return;
    }
    this.updateHUD();

    // Spawn de trains à intervalles réguliers
    this.trainTimer -= dt;
    if (this.trainTimer <= 0) {
      const firstSeg = this.tunnel.segmentId;
      const occupied = this.trains.some(
        t => t.active && t.segmentId === firstSeg && t.t < 0.3
      );
      if (!occupied) {
        this.spawnTrain();
        this.trainTimer = this.cfg.interval / 1000;
      }
    }

    for (const t of this.trains)    t.update(dt, this.segments, this.junctions, this.stations, this);
    for (const j of this.junctions) j.update(dt);
    for (const s of this.stations)  s.update(dt);
  }

  // ── Rendu ──

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Grille de points
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let c = 0; c <= this.W / TILE; c++) {
      for (let r = 0; r <= this.H / TILE; r++) {
        ctx.beginPath();
        ctx.arc(c * TILE, r * TILE, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const s of this.segments)  s.draw(ctx);
    for (const s of this.stations)  s.draw(ctx);
    this.tunnel.draw(ctx);
    for (const j of this.junctions) j.draw(ctx);
    for (const t of this.trains)    t.draw(ctx, this.segments);

    // Indicateur des trains en route
    const activeTrains = this.trains.filter(t => t.active).slice(0, 8);
    ctx.font         = '10px Space Mono';
    ctx.fillStyle    = 'rgba(100,100,150,0.8)';
    ctx.textAlign    = 'left';
    ctx.fillText('EN ROUTE:', 8, 14);
    for (let i = 0; i < activeTrains.length; i++) {
      ctx.fillStyle = activeTrains[i].color;
      ctx.beginPath();
      ctx.roundRect(8 + i * 18, 18, 14, 9, 2);
      ctx.fill();
    }
  }

  // ── Boucle principale ──

  loop(ts) {
    if (this.gameOver) return;
    if (this.lastTime === null) this.lastTime = ts;
    const dt      = Math.min((ts - this.lastTime) / 1000, 0.1);
    this.lastTime = ts;
    this.update(dt);
    this.draw();
    this.animId = requestAnimationFrame(t => this.loop(t));
  }

  start() {
    this.trainTimer = 1.0; // délai avant le premier train
    this.animId = requestAnimationFrame(t => this.loop(t));
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let toastTimer = null;
function showToast(msg, type = 'neutral') {
  const el  = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'show ' + (type === 'good' ? 'good' : type === 'bad' ? 'bad' : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 1800);
}

// ─────────────────────────────────────────────────────────────
// INITIALISATION & ÉVÉNEMENTS
// ─────────────────────────────────────────────────────────────

let selectedDiff = 'easy';

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDiff = btn.dataset.diff;
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  if (G) { G.destroy(); G = null; }
  showScreen('game-screen');
  G = new Game(selectedDiff);
  G.start();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  if (G) { G.destroy(); G = null; }
  showScreen('game-screen');
  G = new Game(selectedDiff);
  G.start();
});

document.getElementById('btn-menu').addEventListener('click', () => {
  if (G) { G.destroy(); G = null; }
  showScreen('menu-screen');
  document.getElementById('hud-score').textContent = '0';
  document.getElementById('hud-timer').textContent = '1:00';
  document.getElementById('hud-done').textContent  = '0';
});
