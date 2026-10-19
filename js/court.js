/* Pixel-art match renderer. Plays the simulator's event list back as animated basketball on a
   low-res canvas (scaled up with crisp pixels): dribbles, passes, jumpers, dunks, blocks, steals,
   type-colored move effects, net swishes and a cheering crowd. Timing runs on a game clock so
   playback speed and skip work. */
(() => {
  const W = 384, H = 216;
  const COURT = { x0: 14, x1: 370, y0: 56, y1: 208 };
  const MID_X = W / 2, MID_Y = 132;
  const HOOPS = { L: { x: 36, y: MID_Y, side: 'L' }, R: { x: 348, y: MID_Y, side: 'R' } };
  const RIM_Z = 26;
  const CLOCK_RATE = 6; // game-clock seconds that tick per second of animation
  const TEAM = { H: '#4a90ff', A: '#ff5050' };
  const FONT = '8px "Press Start 2P", monospace';
  const BIG_FONT = '16px "Press Start 2P", monospace';
  // Positions when attacking the right hoop (mirrored for the left).
  const SPOTS = [[236, 132], [266, 78], [266, 186], [316, 94], [316, 170]];
  const THREES = [[272, 132], [278, 94], [278, 170], [298, 70], [298, 194]];
  const NEUTRAL = [[178, 132], [152, 98], [152, 166], [120, 114], [120, 150]];
  const FAN_SKIN = ['#ffd7b0', '#e8b48a', '#c68a5e', '#8d5a3b', '#f5c99b'];
  const FAN_SHIRTS = { H: ['#4a90ff', '#2f6fd8', '#9cc4ff', '#ffffff'], A: ['#ff5050', '#d83030', '#ffa0a0', '#ffd23f'] };
  const BALL_PX = ['..kkk..', '.kloak.', 'kloodak', 'kdddddk', 'koodook', '.kodok.', '..kkk..'];
  const BALL_COL = { k: '#4a2200', o: '#f08a24', l: '#ffc070', d: '#8a4310', a: '#f08a24' };

  const { rand, pick } = PH.util;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mirror = ([x, y], tag) => (tag === 'H' ? { x, y } : { x: W - x, y });
  const attackHoop = tag => (tag === 'H' ? HOOPS.R : HOOPS.L);
  const dirOf = tag => (tag === 'H' ? 1 : -1);
  const typeColor = t => (t && PH.TYPE_COLORS[t]) || '#ffffff';

  // ---------- pixel primitives ----------
  function disc(c, cx, cy, r, color) {
    c.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy));
      c.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w + 1, 1);
    }
  }
  function ellipse(c, cx, cy, rx, ry, color) {
    c.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      c.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w + 1, 1);
    }
  }
  function ring(c, cx, cy, rx, ry, color, keep) {
    c.fillStyle = color;
    const seen = new Set();
    const steps = Math.ceil(Math.PI * 2 * Math.max(rx, ry) * 2);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      const k = x * 1000 + y;
      if (seen.has(k) || (keep && !keep(x, y))) continue;
      seen.add(k);
      c.fillRect(x, y, 1, 1);
    }
  }
  function text(c, str, x, y, color, font = FONT, align = 'center') {
    c.font = font;
    c.textAlign = align;
    c.textBaseline = 'top';
    c.fillStyle = '#14122a';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) c.fillText(str, Math.round(x + dx), Math.round(y + dy));
    c.fillStyle = color;
    c.fillText(str, Math.round(x), Math.round(y));
  }
  function pixelCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    return [cv, c];
  }

  // ---------- static art ----------
  function drawCourtBg() {
    const [cv, c] = pixelCanvas(W, H);
    c.fillStyle = '#1b1932';
    c.fillRect(0, 0, W, H);
    // Bleachers.
    for (let y = 0; y < 48; y += 9) {
      c.fillStyle = (y / 9) % 2 ? '#2a2748' : '#24223f';
      c.fillRect(0, y, W, 9);
    }
    // Apron.
    c.fillStyle = '#3d3a6e';
    c.fillRect(COURT.x0 - 8, COURT.y0 - 4, COURT.x1 - COURT.x0 + 16, COURT.y1 - COURT.y0 + 8);
    // Wood planks.
    const { x0, x1, y0, y1 } = COURT;
    for (let x = x0, i = 0; x < x1; x += 10, i++) {
      c.fillStyle = i % 2 ? '#d99550' : '#e2a160';
      c.fillRect(x, y0, Math.min(10, x1 - x), y1 - y0);
      c.fillStyle = '#c47f3e';
      for (let y = y0 + ((i * 17) % 40); y < y1; y += 40) c.fillRect(x, y, 10, 1);
      c.fillRect(x, y0, 1, y1 - y0);
    }
    // Paint and lines.
    const line = '#fbf4e6';
    const keyW = 58, keyH = 44;
    c.fillStyle = 'rgba(200, 70, 60, .55)';
    c.fillRect(x0, MID_Y - keyH / 2, keyW, keyH);
    c.fillRect(x1 - keyW, MID_Y - keyH / 2, keyW, keyH);
    c.fillStyle = line;
    c.fillRect(x0, y0, x1 - x0, 1);
    c.fillRect(x0, y1 - 1, x1 - x0, 1);
    c.fillRect(x0, y0, 1, y1 - y0);
    c.fillRect(x1 - 1, y0, 1, y1 - y0);
    c.fillRect(MID_X, y0, 1, y1 - y0);
    [[x0, x0 + keyW], [x1 - keyW, x1]].forEach(([a, b]) => {
      c.fillRect(a, MID_Y - keyH / 2, b - a, 1);
      c.fillRect(a, MID_Y + keyH / 2, b - a, 1);
    });
    c.fillRect(x0 + keyW, MID_Y - keyH / 2, 1, keyH);
    c.fillRect(x1 - keyW, MID_Y - keyH / 2, 1, keyH);
    ring(c, x0 + keyW, MID_Y, 20, 20, line, x => x >= x0 + keyW);
    ring(c, x1 - keyW, MID_Y, 20, 20, line, x => x <= x1 - keyW);
    // Three-point arcs.
    const R3 = 76;
    ring(c, HOOPS.L.x, MID_Y, R3, R3, line, (x, y) => x >= HOOPS.L.x && y > y0 + 6 && y < y1 - 6);
    ring(c, HOOPS.R.x, MID_Y, R3, R3, line, (x, y) => x <= HOOPS.R.x && y > y0 + 6 && y < y1 - 6);
    [y0 + 6, y1 - 7].forEach(y => {
      const dx = Math.round(Math.sqrt(Math.max(0, R3 * R3 - (y - MID_Y) ** 2)));
      c.fillRect(x0, y, HOOPS.L.x + dx - x0, 1);
      c.fillRect(HOOPS.R.x - dx, y, x1 - (HOOPS.R.x - dx), 1);
    });
    // Center circle with a Poké Ball.
    ring(c, MID_X, MID_Y, 24, 24, line);
    const r = 12;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy));
      c.fillStyle = dy < -1 ? '#e04848' : dy > 1 ? '#f4efe6' : '#222';
      c.fillRect(MID_X - w, MID_Y + dy, 2 * w + 1, 1);
    }
    ring(c, MID_X, MID_Y, r, r, '#222');
    disc(c, MID_X, MID_Y, 3, '#222');
    disc(c, MID_X, MID_Y, 2, '#f4efe6');
    // Benches along the bottom.
    c.fillStyle = '#5b5690';
    c.fillRect(120, 211, 48, 4);
    c.fillRect(216, 211, 48, 4);
    return cv;
  }

  function drawBall() {
    const [cv, c] = pixelCanvas(7, 7);
    BALL_PX.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      c.fillStyle = BALL_COL[ch];
      c.fillRect(x, y, 1, 1);
    }));
    return cv;
  }

  class Court {
    constructor(canvas, opts) {
      this.cv = canvas;
      this.c = canvas.getContext('2d');
      this.c.imageSmoothingEnabled = false;
      this.info = opts.info;
      this.youTag = opts.youTag;
      this.names = opts.names || { H: 'HOME', A: 'AWAY' };
      this.onClock = opts.onClock || (() => {});
      this.clock = 720;
      this.clockTarget = 720;
      this.shownClock = null;
      this.speed = 2;
      this.now = 0;
      this.timers = [];
      this.skipping = false;
      this.dead = false;
      this.players = {};
      this.lineup = { H: [], A: [] };
      this.off = null;
      this.ball = { x: MID_X, y: MID_Y, z: 0, holder: null, flight: null };
      this.particles = [];
      this.popups = [];
      this.banner = null;
      this.shake = 0;
      this.cheer = { H: 0, A: 0 };
      this.net = { L: 0, R: 0 };
      this.rim = { L: 0, R: 0 };
      this.nextWander = 0;
      this.imgs = {};
      this.bg = drawCourtBg();
      this.ballImg = drawBall();
      this.fans = [];
      for (let row = 0; row < 5; row++) {
        for (let x = 4 + (row % 2) * 3; x < W - 4; x += 7) {
          const side = x < MID_X ? 'H' : 'A';
          this.fans.push({
            x, y: 8 + row * 8, side, phase: Math.random() * 6,
            skin: pick(FAN_SKIN), shirt: Math.random() < 0.8 ? pick(FAN_SHIRTS[side]) : pick(FAN_SHIRTS[side === 'H' ? 'A' : 'H']),
          });
        }
      }
      if (document.fonts && document.fonts.load) document.fonts.load(FONT).catch(() => {});
      this.last = performance.now();
      this.frame = this.frame.bind(this);
      this.raf = requestAnimationFrame(this.frame);
          }

    // ---------- clock ----------
    wait(ms) {
      if (this.skipping || this.dead) return Promise.resolve();
      return new Promise(r => this.timers.push({ at: this.now + ms, r }));
    }
    skip() {
      this.skipping = true;
      this.timers.forEach(t => t.r());
      this.timers = [];
    }
    destroy() {
      this.skip();
      this.dead = true;
      cancelAnimationFrame(this.raf);
    }
    frame(ts) {
      if (this.dead) return;
      const dt = Math.min(50, ts - this.last) * this.speed;
      this.last = ts;
      this.now += dt;
      this.update(dt);
      this.draw();
      const due = this.timers.filter(t => t.at <= this.now);
      if (due.length) {
        this.timers = this.timers.filter(t => t.at > this.now);
        due.forEach(t => t.r());
      }
      this.raf = requestAnimationFrame(this.frame);
    }

    // ---------- entities ----------
    // Party menu icon (Gen VII, #1–809) drawn at native pixel size; falls back to the
    // regular sprite, scaled, for Pokémon without an icon.
    img(id, fallback) {
      const key = id + '|' + fallback;
      if (!this.imgs[key]) {
        const im = new Image();
        im.isIcon = !!id;
        im.onerror = () => {
          if (im.isIcon && fallback) {
            im.isIcon = false;
            im.src = fallback;
          } else {
            im.failed = true;
          }
        };
        im.src = id ? PH.iconUrl(id) : fallback;
        this.imgs[key] = im;
      }
      return this.imgs[key];
    }
    spawn(uid, tag, x, y) {
      const inf = this.info[uid] || { name: '?', sprite: '' };
      const p = {
        uid, tag, name: inf.name, im: this.img(inf.id, inf.sprite), x, y, tx: x, ty: y, z: 0, run: 70,
        face: dirOf(tag), jump: null, aura: null, busy: false, leaving: false, guard: null, homeX: x, homeY: y,
        size: 30,
      };
      this.players[uid] = p;
      return p;
    }
    homeSpot(tag, i) {
      if (this.off === null) return mirror(NEUTRAL[i] || NEUTRAL[0], tag);
      if (tag === this.off) return mirror(SPOTS[i] || SPOTS[0], tag);
      const s = mirror(SPOTS[i] || SPOTS[0], this.off), h = attackHoop(this.off);
      return { x: lerp(s.x, h.x, 0.25), y: lerp(s.y, h.y, 0.25) };
    }
    setLineup(tag, uids, instant) {
      const keep = new Set(uids);
      Object.values(this.players).forEach(p => {
        if (p.tag !== tag || keep.has(p.uid) || p.leaving) return;
        p.leaving = true;
        p.busy = true;
        p.guard = null;
        p.run = 90;
        p.tx = tag === 'H' ? 144 : 240;
        p.ty = H + 30;
        if (this.ball.holder === p.uid) this.ball.holder = uids[0];
      });
      uids.forEach((u, i) => {
        const existing = this.players[u];
        if (existing && !existing.leaving) return;
        const s = instant ? this.homeSpot(tag, i) : { x: tag === 'H' ? 144 : 240, y: H + 16 };
        this.spawn(u, tag, s.x, s.y);
      });
      this.lineup[tag] = uids.slice();
      this.layout();
    }
    layout() {
      ['H', 'A'].forEach(tag => this.lineup[tag].forEach((u, i) => {
        const p = this.players[u];
        if (!p || p.leaving) return;
        const s = this.homeSpot(tag, i);
        p.homeX = s.x;
        p.homeY = s.y;
        if (this.off !== null && tag !== this.off) {
          p.guard = this.lineup[this.off][i] || this.lineup[this.off][0];
        } else {
          p.guard = null;
          if (!p.busy) { p.tx = s.x; p.ty = s.y; }
        }
      }));
    }
    onCourt(tag) {
      return this.lineup[tag].map(u => this.players[u]).filter(p => p && !p.leaving);
    }

    // ---------- actions ----------
    go(p, x, y, run = 80) {
      p.busy = true;
      p.tx = Math.max(COURT.x0 + 6, Math.min(COURT.x1 - 6, x));
      p.ty = Math.max(COURT.y0 + 8, Math.min(COURT.y1 - 2, y));
      p.run = run;
      return this.wait(Math.hypot(p.tx - p.x, p.ty - p.y) / run * 1000 + 40);
    }
    jump(p, h, dur) {
      if (p) p.jump = { t0: this.now, dur, h };
    }
    fly(x, y, z, dur, arc) {
      const b = this.ball;
      b.flight = { x0: b.x, y0: b.y, z0: b.z, x1: x, y1: y, z1: z, t0: this.now, dur, arc };
      b.holder = null;
      return this.wait(dur);
    }
    async passTo(p) {
      if (!p || this.ball.holder === p.uid) return;
      const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
      await this.fly(p.x + p.face * 7, p.y, 12, 160 + d * 2.2, 4 + d * 0.06);
      this.ball.holder = p.uid;
    }
    burst(x, y, color, n = 12, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (20 + Math.random() * 60) * power;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30 * power, life: 0, max: 500 + Math.random() * 500, color, size: Math.random() < 0.3 ? 2 : 1 });
      }
    }
    popup(str, x, y, color, big) {
      this.popups.push({ str, x, y: Math.max(COURT.y0 + 18, y), color, big, t0: this.now, dur: big ? 1100 : 900 });
    }
    showBanner(str, sub, color, dur = 1200) {
      this.banner = { str, sub, color, t0: this.now, dur };
    }

    async ensureOffense(off) {
      if (!off || this.off === off) return;
      const first = this.off === null;
      this.off = off;
      this.layout();
      const holder = this.players[this.ball.holder];
      if (!holder || holder.tag !== off) {
        const pg = this.onCourt(off)[0];
        if (pg) await this.passTo(pg);
      }
      Object.values(this.players).forEach(p => { if (!p.leaving) p.run = 130; });
      await this.wait(first ? 300 : 650);
    }

    async perform(ev, nextOff) {
      if (ev.clock != null) {
        if (ev.kind === 'quarter') this.clock = ev.clock;
        this.clockTarget = ev.clock;
      }
      if (ev.fire) Object.values(this.players).forEach(p => { p.fire = ev.fire.includes(p.uid); });
      if (ev.kind === 'quarter') await this.doQuarter(ev, nextOff);
      else if (ev.kind === 'sub') await this.doSub(ev);
      else {
        await this.ensureOffense(ev.off);
        if (ev.kind === 'move') await this.doMove(ev);
        else if (ev.kind === 'score' || ev.kind === 'miss') await this.doShot(ev);
        else if (ev.kind === 'block') await this.doBlock(ev);
        else if (ev.kind === 'steal') await this.doSteal(ev);
        else if (ev.kind === 'hot') await this.doHot(ev);
        else if (ev.kind === 'cool') {
          const p = this.players[ev.actor];
          if (p) this.popup('cooled off', p.x, p.y - 40, '#9ad0ff');
          await this.wait(350);
        }
      }
      this.ball.fire = false;
      Object.values(this.players).forEach(p => {
        if (p.leaving) return;
        p.busy = false;
        p.run = 70;
        p.carry = false;
      });
      this.layout();
    }

    async doQuarter(ev, nextOff) {
      this.showBanner(ev.q > 4 ? 'OVERTIME!' : `QUARTER ${ev.q}`, null, '#ffd23f', 1500);
      this.off = null;
      const fresh = !this.lineup.H.length;
      if (ev.lineups) ['H', 'A'].forEach(t => ev.lineups[t] && this.setLineup(t, ev.lineups[t], fresh));
      this.layout();
      Object.values(this.players).forEach(p => { if (!p.leaving) p.run = 120; });
      const b = this.ball;
      b.holder = null;
      b.flight = null;
      Object.assign(b, { x: MID_X, y: MID_Y, z: 0 });
      await this.wait(fresh ? 400 : 800);
      const a = this.players[this.lineup.H[0]], z = this.players[this.lineup.A[0]];
      if (a && z) {
        this.go(a, MID_X - 9, MID_Y, 120);
        this.go(z, MID_X + 9, MID_Y, 120);
        await this.wait(350);
        b.z = 14;
        await this.fly(MID_X, MID_Y, 56, 420, 0);
        this.jump(a, 24, 520);
        this.jump(z, 22, 520);
        await this.wait(220);
        const winner = this.onCourt(nextOff || pick(['H', 'A']))[1];
        this.burst(MID_X, MID_Y - 50, '#ffffff', 8, 0.6);
        if (winner) await this.passTo(winner);
      }
      this.cheer.H = this.cheer.A = 0.6;
    }

    async doSub(ev) {
      const p = this.players[ev.actor];
      if (ev.lineups && ev.lineups[ev.side]) this.setLineup(ev.side, ev.lineups[ev.side], false);
      const np = this.players[ev.actor] || p;
      if (np) this.popup('SUB IN', np.x, np.y - 46, TEAM[ev.side]);
      await this.wait(450);
    }

    async doMove(ev) {
      const p = this.players[ev.actor];
      if (!p) return this.wait(400);
      const color = typeColor(ev.type);
      p.aura = { color, until: this.now + 1000 };
      this.burst(p.x, p.y - p.size / 2 - p.z, color, 22, 1.1);
      this.showBanner((ev.short || '').replace(/!$/, '').toUpperCase(), p.name.toUpperCase(), color, 950);
      this.jump(p, 8, 320);
      if (ev.mkind === 'rally') {
        this.onCourt(p.tag).forEach((q, i) => setTimeout(() => this.jump(q, 10, 380), i * 60 / this.speed));
        this.cheer[p.tag] = 0.8;
      } else if (ev.mkind === 'rest') {
        this.popup('Zzz', p.x + 10, p.y - p.size - 4, '#b8d8ff');
      }
      await this.wait(650);
    }

    async spotUp(s, hoop, kind) {
      const tag = this.off, dir = dirOf(tag);
      if (kind === 'shot') {
        const spots = THREES.map(xy => mirror(xy, tag));
        const best = spots.reduce((a, b) => (Math.hypot(b.x - s.x, b.y - s.y) < Math.hypot(a.x - s.x, a.y - s.y) ? b : a));
        await this.go(s, best.x + rand(-3, 3), best.y + rand(-3, 3), 110);
        await this.wait(100);
      } else if (kind === 'dunk') {
        await this.go(s, hoop.x - dir * 15, hoop.y + rand(-7, 7), 130);
      } else {
        await this.go(s, hoop.x - dir * 22, hoop.y + rand(-16, 16), 165);
      }
    }

    async release(s, hoop, kind) {
      if (kind === 'shot') {
        this.jump(s, 13, 620);
        await this.wait(170);
        await this.fly(hoop.x, hoop.y, RIM_Z + 2, 680, 44);
      } else if (kind === 'dunk') {
        s.carry = true;
        this.jump(s, RIM_Z + 4, 640);
        await this.wait(270);
        s.carry = false;
        await this.fly(hoop.x, hoop.y, RIM_Z + 3, 120, 0);
      } else {
        this.jump(s, 14, 460);
        await this.wait(130);
        await this.fly(hoop.x, hoop.y, RIM_Z + 2, 330, 12);
      }
    }

    async swish(hoop, pts, tag, type, kind) {
      this.net[hoop.side] = 1;
      if (kind === 'dunk') {
        this.rim[hoop.side] = 1;
        this.shake = 4;
        this.burst(hoop.x, hoop.y - RIM_Z, '#ffd23f', 18, 1.3);
      }
      if (type) this.burst(hoop.x, hoop.y - RIM_Z, typeColor(type), 20, 1);
      await this.fly(hoop.x, hoop.y + 2, 0, 260, 0);
      this.popup(`+${pts}`, hoop.x, hoop.y - RIM_Z - 26, TEAM[tag], true);
      this.cheer[tag] = 1;
      await this.fly(hoop.x - dirOf(tag) * 8, hoop.y + 4, 0, 220, 6);
      await this.wait(150);
    }

    async clank(hoop, rebounder) {
      this.rim[hoop.side] = 0.7;
      this.burst(hoop.x, hoop.y - RIM_Z, '#cfcfe0', 6, 0.5);
      const dir = hoop === HOOPS.R ? -1 : 1;
      const rx = hoop.x + dir * rand(12, 30), ry = hoop.y + rand(-22, 22);
      if (rebounder) {
        this.go(rebounder, rx, ry, 150);
        setTimeout(() => this.jump(rebounder, 12, 380), 160 / this.speed);
      }
      await this.fly(rx, ry, 16, 460, 22);
      if (rebounder) {
        this.ball.holder = rebounder.uid;
        this.popup('REB', rebounder.x, rebounder.y - rebounder.size - 6, '#ffffff');
      }
      await this.wait(100);
    }

    defenderOf(p) {
      return Object.values(this.players).find(q => q.guard === p.uid && !q.leaving);
    }

    // Screen action shared by pick & roll / pick & pop: the screener plants next to the
    // handler's defender, who gets hung up while the handler comes off the screen.
    async screen(screener, handler, hoop) {
      const dir = dirOf(this.off);
      await this.go(handler, hoop.x - dir * 96, hoop.y + rand(-12, 12), 90);
      const dH = this.defenderOf(handler);
      const side = handler.y < hoop.y ? 1 : -1;
      const sx = handler.x + dir * 12, sy = handler.y + side * 9;
      if (dH) { dH.busy = true; dH.tx = dH.x; dH.ty = dH.y; }
      await this.go(screener, sx, sy, 125);
      this.popup('SCREEN!', screener.x, screener.y - 40, '#ffffff');
      this.shake = 1.5;
      if (dH) { dH.tx = sx - dir * 5; dH.ty = sy; dH.run = 35; }
      this.go(handler, handler.x + dir * 28, handler.y - side * 24, 120);
      await this.wait(220);
    }

    async runPlay(play, shooter, helper, hoop) {
      const dir = dirOf(this.off);
      const label = { pnr: 'PICK & ROLL', pnp: 'PICK & POP', gng: 'GIVE & GO', oop: 'ALLEY-OOP' }[play];
      this.showBanner(label, null, '#ffffff', 1300);
      if (play === 'pnr' || play === 'pnp') {
        await this.passTo(helper);
        await this.screen(shooter, helper, hoop);
        if (play === 'pnr') {
          await this.go(shooter, hoop.x - dir * 32, hoop.y + rand(-8, 8), 135);
          await this.passTo(shooter);
          await this.go(shooter, hoop.x - dir * 15, hoop.y + rand(-5, 5), 130);
          this.ball.fire = shooter.fire;
          await this.release(shooter, hoop, 'dunk');
        } else {
          this.popup('POP!', shooter.x, shooter.y - 40, '#ffffff');
          await this.spotUp(shooter, hoop, 'shot');
          await this.passTo(shooter);
          this.ball.fire = shooter.fire;
          await this.release(shooter, hoop, 'shot');
        }
      } else if (play === 'gng') {
        await this.passTo(shooter);
        await this.go(shooter, hoop.x - dir * 92, hoop.y + rand(-10, 10), 90);
        await this.passTo(helper);
        this.popup('CUT!', shooter.x, shooter.y - 40, '#ffffff');
        await this.go(shooter, hoop.x - dir * 34, hoop.y + rand(-12, 12), 175);
        await this.passTo(shooter);
        await this.go(shooter, hoop.x - dir * 20, shooter.y, 160);
        this.ball.fire = shooter.fire;
        await this.release(shooter, hoop, 'drive');
      } else {
        // Alley-oop: lob toward the rim while the finisher sprints in and catches it in the air.
        await this.passTo(helper);
        await this.go(helper, hoop.x - dir * 96, hoop.y + rand(-12, 12), 90);
        const wing = hoop.y + (shooter.y < hoop.y ? -46 : 46);
        await this.go(shooter, hoop.x - dir * 64, wing, 140);
        this.go(shooter, hoop.x - dir * 10, hoop.y + 2, 175);
        const lobDur = 720;
        this.ball.fire = shooter.fire;
        const lob = this.fly(hoop.x - dir * 9, hoop.y + 2, RIM_Z + 24, lobDur, 34);
        await this.wait(lobDur - 380);
        this.jump(shooter, RIM_Z + 12, 640);
        await lob;
        this.ball.holder = shooter.uid;
        shooter.carry = true;
        this.popup('OOP!', shooter.x, shooter.y - shooter.z - 44, '#ffd23f');
        await this.wait(110);
        shooter.carry = false;
        await this.fly(hoop.x, hoop.y, RIM_Z + 3, 110, 0);
      }
    }

    async doHot(ev) {
      const p = this.players[ev.actor];
      if (!p) return this.wait(300);
      p.fire = true;
      this.showBanner('ON FIRE!', p.name.toUpperCase(), '#ff8a00', 1400);
      ['#ff3d00', '#ff8a00', '#ffd23f'].forEach(col => this.burst(p.x, p.y - 16 - p.z, col, 14, 1.2));
      this.jump(p, 10, 360);
      this.cheer[p.tag] = 1;
      this.shake = 2;
      await this.wait(1000);
    }

    async doShot(ev) {
      const shooter = this.players[ev.putback ? ev.shooter : ev.actor];
      if (!shooter) return this.wait(500);
      const hoop = attackHoop(ev.off);
      const kind = ev.shot || 'dunk';
      const helper = this.players[ev.helper];
      if (ev.play && helper && helper !== shooter) {
        await this.runPlay(ev.play, shooter, helper, hoop);
      } else {
        if (helper && helper !== shooter) await this.passTo(helper);
        await this.passTo(shooter);
        await this.spotUp(shooter, hoop, kind);
        if (this.ball.holder !== shooter.uid) await this.passTo(shooter);
        this.ball.fire = shooter.fire;
        await this.release(shooter, hoop, kind);
      }

      if (ev.kind === 'score' && !ev.putback) {
        await this.swish(hoop, ev.pts, ev.off, ev.type, kind);
        if (ev.pts === 3 && kind === 'dunk') this.popup('AND ONE!', shooter.x, shooter.y - 54, '#ffd23f');
        return;
      }
      if (ev.putback) {
        const r = this.players[ev.actor];
        await this.clank(hoop, r);
        if (r) {
          this.jump(r, 16, 420);
          await this.wait(120);
          await this.fly(hoop.x, hoop.y, RIM_Z + 2, 260, 8);
        }
        await this.swish(hoop, 2, ev.off, null, 'drive');
        return;
      }
      const reb = this.players[ev.reb];
      await this.clank(hoop, reb);
      if (ev.oreb && reb) {
        // Offensive board, but the putback rims out to a defender.
        this.jump(reb, 14, 400);
        await this.wait(120);
        await this.fly(hoop.x, hoop.y, RIM_Z + 2, 260, 8);
        const d = pick(this.onCourt(ev.off === 'H' ? 'A' : 'H'));
        await this.clank(hoop, d);
      }
    }

    async doBlock(ev) {
      const s = this.players[ev.victim], b = this.players[ev.actor];
      if (!s || !b) return this.wait(500);
      const hoop = attackHoop(ev.off), dir = dirOf(ev.off);
      await this.passTo(s);
      await this.spotUp(s, hoop, ev.shot === 'shot' ? 'shot' : 'drive');
      this.go(b, s.x + dir * 10, s.y + 2, 170);
      this.jump(s, 12, 560);
      await this.wait(170);
      this.jump(b, 22, 560);
      await this.fly(s.x + dir * 10, s.y, s.size * 0.6 + 24, 200, 4);
      this.shake = 3;
      this.burst(this.ball.x, this.ball.y - this.ball.z, '#ffffff', 14, 1);
      this.popup('BLOCKED!', b.x, b.y - b.size - 30, '#ffffff', true);
      this.cheer[b.tag] = 1;
      const mates = this.onCourt(b.tag).filter(p => p !== b);
      const t = mates.length ? pick(mates) : b;
      const d = Math.hypot(t.x - this.ball.x, t.y - this.ball.y);
      await this.fly(t.x, t.y, 10, 200 + d * 2, 10);
      this.ball.holder = t.uid;
      await this.wait(150);
    }

    async doSteal(ev) {
      const v = this.players[ev.victim], s = this.players[ev.actor];
      if (!v || !s) return this.wait(500);
      const dir = dirOf(ev.off);
      await this.passTo(v);
      this.go(v, v.x + dir * 14, v.y + rand(-6, 6), 60);
      await this.wait(150);
      await this.go(s, v.x + dir * 12, v.y + 3, 170);
      await this.fly(s.x, s.y, 10, 150, 8);
      this.ball.holder = s.uid;
      this.jump(s, 8, 300);
      this.burst(s.x, s.y - 14, '#ffd23f', 12, 0.8);
      this.popup('STEAL!', s.x, s.y - s.size - 24, '#ffd23f', true);
      this.cheer[s.tag] = 0.8;
      await this.wait(200);
    }

    async run(events, onEvent) {
      for (let i = 0; i < events.length; i++) {
        if (this.skipping) break;
        const ev = events[i];
        let nextOff = null;
        for (let j = i + 1; j < events.length && !nextOff; j++) nextOff = events[j].off || null;
        try {
          await this.perform(ev, nextOff);
        } catch (e) {
          console.error(e);
        }
        if (!this.skipping) onEvent(ev);
      }
    }

    // ---------- simulation step ----------
    update(dt) {
      const now = this.now;
      // Run the game clock down toward the current play's time, then hold there.
      if (this.clock > this.clockTarget) this.clock = Math.max(this.clockTarget, this.clock - dt / 1000 * CLOCK_RATE);
      const secs = Math.ceil(this.clock);
      if (secs !== this.shownClock) {
        this.shownClock = secs;
        this.onClock(secs);
      }
      if (this.off && now > this.nextWander) {
        this.nextWander = now + 650;
        this.onCourt(this.off).forEach(p => {
          if (p.busy) return;
          p.tx = p.homeX + rand(-10, 10);
          p.ty = p.homeY + rand(-8, 8);
          p.run = Math.max(55, p.run * 0.98);
        });
      }
      const holder = this.players[this.ball.holder];
      Object.values(this.players).forEach(p => {
        if (p.guard && !p.busy) {
          const man = this.players[p.guard], hoop = attackHoop(this.off);
          if (man) {
            const tight = man === holder ? 0.16 : 0.25;
            p.tx = lerp(man.x, hoop.x, tight);
            p.ty = lerp(man.y, hoop.y, tight);
            p.run = 100;
          }
        }
        const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
        const step = p.run * dt / 1000;
        if (dist > 0.5) {
          const k = Math.min(1, step / dist);
          p.x += dx * k;
          p.y += dy * k;
        }
        if (Math.abs(dx) > 2 && dist > 3) p.face = Math.sign(dx);
        else if (this.off) p.face = p.tag === this.off ? dirOf(this.off) : -dirOf(this.off);
        p.moving = dist > 1;
        if (p.jump) {
          const t = (now - p.jump.t0) / p.jump.dur;
          if (t >= 1) { p.jump = null; p.z = 0; } else p.z = p.jump.h * Math.sin(Math.PI * t);
        }
        if (p.leaving && p.y > H + 8) {
          delete this.players[p.uid];
        }
      });

      const b = this.ball;
      if (b.flight) {
        const f = b.flight;
        const t = Math.min(1, (now - f.t0) / f.dur);
        b.x = lerp(f.x0, f.x1, t);
        b.y = lerp(f.y0, f.y1, t);
        b.z = lerp(f.z0, f.z1, t) + f.arc * 4 * t * (1 - t);
        if (b.fire && Math.random() < 0.8) {
          this.particles.push({ x: b.x + rand(-1, 1), y: b.y - b.z + rand(-1, 1), vx: 0, vy: -10, life: 0, max: 300, color: pick(['#ff3d00', '#ff8a00', '#ffd23f']), size: 2, float: true });
        }
        if (t >= 1) b.flight = null;
      } else if (holder) {
        b.x = holder.x + holder.face * 7;
        b.y = holder.y + 1;
        if (holder.z > 0 || holder.carry) b.z = holder.z + holder.size * 0.55;
        else b.z = Math.abs(Math.sin(now / (holder.moving ? 95 : 140))) * 11;
      }

      this.particles = this.particles.filter(q => {
        q.life += dt;
        q.x += q.vx * dt / 1000;
        q.y += q.vy * dt / 1000;
        if (!q.float) q.vy += 160 * dt / 1000;
        return q.life < q.max;
      });
      this.popups = this.popups.filter(q => now - q.t0 < q.dur);
      if (this.banner && now - this.banner.t0 > this.banner.dur) this.banner = null;
      const decay = dt / 1000;
      this.cheer.H = Math.max(0, this.cheer.H - decay * 0.6);
      this.cheer.A = Math.max(0, this.cheer.A - decay * 0.6);
      this.shake = Math.max(0, this.shake - decay * 12);
      ['L', 'R'].forEach(s => {
        this.net[s] = Math.max(0, this.net[s] - decay * 2);
        this.rim[s] = Math.max(0, this.rim[s] - decay * 3);
      });
    }

    // ---------- rendering ----------
    draw() {
      const c = this.c, now = this.now;
      c.save();
      if (this.shake > 0) c.translate(Math.round(rand(-1, 1) * this.shake / 2), Math.round(rand(-1, 1) * this.shake / 2));
      c.drawImage(this.bg, 0, 0);
      this.drawCrowd(c, now);
      this.drawMarquee(c, now);
      Object.values(this.players).forEach(p => this.drawShadow(c, p));
      ellipse(c, Math.round(this.ball.x), Math.round(this.ball.y) + 1, Math.max(1, 3 - Math.round(this.ball.z / 20)), 1, 'rgba(0,0,0,.35)');
      this.drawHoop(c, HOOPS.L, now);
      this.drawHoop(c, HOOPS.R, now);
      // Depth-sort players and the ball; a held ball draws just in front of its holder.
      const holder = this.players[this.ball.holder];
      const items = Object.values(this.players).map(p => ({ y: p.y, draw: () => this.drawPlayer(c, p, now) }));
      items.push({ y: holder ? holder.y + 0.5 : this.ball.y, draw: () => this.drawBallSprite(c) });
      items.sort((a, b) => a.y - b.y).forEach(it => it.draw());
      this.particles.forEach(q => {
        c.globalAlpha = Math.max(0, 1 - q.life / q.max);
        c.fillStyle = q.color;
        c.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
      });
      c.globalAlpha = 1;
      this.popups.forEach(q => {
        const t = (now - q.t0) / q.dur;
        c.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        text(c, q.str, q.x, q.y - t * 14, q.color, q.big ? BIG_FONT : FONT);
      });
      c.globalAlpha = 1;
      if (this.banner) this.drawBanner(c, now);
      c.restore();
    }

    drawCrowd(c, now) {
      const flashes = this.cheer.H > 0.6 || this.cheer.A > 0.6;
      this.fans.forEach(f => {
        const ch = this.cheer[f.side];
        const bob = ch > 0 ? Math.round(Math.abs(Math.sin(now / 90 + f.phase)) * 3 * ch) : (Math.sin(now / 700 + f.phase * 3) > 0.97 ? 1 : 0);
        c.fillStyle = f.shirt;
        c.fillRect(f.x - 2, f.y + 2 - bob, 5, 5);
        c.fillStyle = f.skin;
        c.fillRect(f.x - 1, f.y - 2 - bob, 3, 3);
        if (ch > 0.5 && Math.sin(f.phase * 7) > 0.6) {
          c.fillStyle = f.shirt;
          c.fillRect(f.x - 3, f.y - 4 - bob, 1, 3);
          c.fillRect(f.x + 3, f.y - 4 - bob, 1, 3);
        }
      });
      if (flashes) {
        c.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) c.fillRect(rand(4, W - 6), rand(4, 40), 2, 2);
      }
    }

    drawMarquee(c, now) {
      c.fillStyle = '#100f22';
      c.fillRect(0, 44, W, 9);
      c.save();
      c.beginPath();
      c.rect(0, 44, W, 9);
      c.clip();
      const msg = `★ ${this.names.H.toUpperCase()} VS ${this.names.A.toUpperCase()} ★ POKé HOOPS CLUB `;
      c.font = FONT;
      const w = Math.max(80, c.measureText(msg).width);
      const off = -((now / 28) % w);
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillStyle = '#ffd23f';
      for (let x = off; x < W; x += w) c.fillText(msg, Math.round(x), 45);
      c.restore();
    }

    drawHoop(c, h, now) {
      const s = h.side, dir = s === 'L' ? -1 : 1;
      const rimY = Math.round(h.y - RIM_Z + Math.sin(now / 25) * this.rim[s] * 1.5);
      const poleX = h.x + dir * 22;
      ellipse(c, h.x + dir * 8, h.y + 1, 9, 2, 'rgba(0,0,0,.25)');
      c.fillStyle = '#55557a';
      c.fillRect(poleX - 1, rimY - 6, 3, h.y - rimY + 8);
      c.fillRect(poleX - 4, h.y + 1, 9, 3);
      c.fillRect(Math.min(poleX, h.x + dir * 9), rimY - 6, Math.abs(poleX - (h.x + dir * 9)), 2);
      // Backboard.
      const bx = h.x + dir * 9;
      c.fillStyle = '#14122a';
      c.fillRect(bx - 2, rimY - 18, 5, 22);
      c.fillStyle = '#f2f2ff';
      c.fillRect(bx - 1, rimY - 17, 3, 20);
      c.fillStyle = '#e04848';
      c.fillRect(bx - 1, rimY - 8, 3, 6);
      // Rim and net.
      ring(c, h.x, rimY, 6, 2, '#ff6a1f');
      c.fillStyle = '#ff6a1f';
      c.fillRect(Math.min(h.x + dir * 6, bx), rimY, Math.abs(bx - (h.x + dir * 6)), 1);
      const sw = this.net[s];
      c.fillStyle = '#ffffff';
      for (let r = 1; r <= 7; r++) {
        const half = Math.round(6 - r * 0.45);
        const wob = Math.round(Math.sin(now / 35 + r) * sw * 2);
        const y = rimY + r + Math.round(sw * r * 0.4);
        for (let x = -half; x <= half; x += 2) c.fillRect(h.x + x + (r % 2) + wob, y, 1, 1);
      }
    }

    drawShadow(c, p) {
      const rx = Math.round(p.size * 0.22), x = Math.round(p.x), y = Math.round(p.y);
      ellipse(c, x, y, rx, 2, 'rgba(20,18,42,.45)');
      ring(c, x, y, rx + 2, 3, TEAM[p.tag]);
    }

    drawPlayer(c, p, now) {
      const s = p.size, x = Math.round(p.x), y = Math.round(p.y - p.z);
      if (p.aura && now < p.aura.until) {
        const pulse = 1 + Math.round(Math.sin(now / 60) * 2);
        c.globalAlpha = 0.45;
        disc(c, x, y - Math.round(s * 0.42), Math.round(s * 0.42) + pulse, p.aura.color);
        c.globalAlpha = 1;
        if (Math.random() < 0.5) {
          this.particles.push({ x: x + rand(-10, 10), y: y - rand(4, s), vx: 0, vy: -30, life: 0, max: 400, color: p.aura.color, size: 1 });
        }
      }
      if (p.fire) {
        c.globalAlpha = 0.28 + Math.sin(now / 80) * 0.08;
        disc(c, x, y - 12, 15, '#ff6a00');
        c.globalAlpha = 1;
        if (Math.random() < 0.8) {
          this.particles.push({ x: x + rand(-9, 9), y: y - rand(0, 18), vx: rand(-6, 6), vy: -40 - Math.random() * 30, life: 0, max: 380 + Math.random() * 200, color: pick(['#ff3d00', '#ff8a00', '#ffd23f']), size: Math.random() < 0.4 ? 2 : 1, float: true });
        }
      }
      const im = p.im;
      if (im && im.complete && im.naturalWidth && !im.failed) {
        c.save();
        c.translate(x, y);
        if (p.face > 0) c.scale(-1, 1);
        if (im.isIcon) {
          const w = im.naturalWidth, h = im.naturalHeight;
          c.drawImage(im, -Math.round(w / 2), -h + 2);
        } else {
          const big = 44;
          c.drawImage(im, -big / 2, -big + 6, big, big);
        }
        c.restore();
      } else {
        disc(c, x, y - 8, 6, '#e04848');
        c.fillStyle = '#f4efe6';
        c.fillRect(x - 6, y - 8, 13, 7);
        c.fillStyle = '#222';
        c.fillRect(x - 6, y - 8, 13, 1);
      }
      // Small arrow over your own team's players.
      if (p.tag === this.youTag) {
        const top = y - (im && im.isIcon ? im.naturalHeight - 2 : s + 6) - 4;
        c.fillStyle = '#14122a';
        c.fillRect(x - 3, top - 1, 7, 4);
        c.fillStyle = '#ffd23f';
        c.fillRect(x - 2, top, 5, 1);
        c.fillRect(x - 1, top + 1, 3, 1);
        c.fillRect(x, top + 2, 1, 1);
      }
    }

    drawBallSprite(c) {
      const b = this.ball;
      c.drawImage(this.ballImg, Math.round(b.x) - 3, Math.round(b.y - b.z) - 6);
    }

    drawBanner(c, now) {
      const bn = this.banner;
      const t = (now - bn.t0) / bn.dur;
      const slide = t < 0.12 ? (1 - t / 0.12) * -30 : t > 0.85 ? ((t - 0.85) / 0.15) * -30 : 0;
      c.font = FONT;
      const w = Math.max(c.measureText(bn.str).width, bn.sub ? c.measureText(bn.sub).width : 0) + 20;
      const h = bn.sub ? 26 : 16;
      const x = Math.round(MID_X - w / 2), y = Math.round(58 + slide);
      c.fillStyle = '#14122a';
      c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = bn.color;
      c.fillRect(x, y, w, h);
      c.fillStyle = '#14122a';
      c.fillRect(x + 2, y + 2, w - 4, h - 4);
      if (bn.sub) {
        text(c, bn.sub, MID_X, y + 4, '#ffffff');
        text(c, bn.str, MID_X, y + 14, bn.color);
      } else {
        text(c, bn.str, MID_X, y + 4, bn.color);
      }
    }
  }

  PH.Court = Court;
})();
