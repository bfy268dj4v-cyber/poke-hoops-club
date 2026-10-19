/* Possession-by-possession match simulator. Produces a final score, box score and
   (optionally) an event list the UI plays back on the court. */
(() => {
  const { pick, clamp, weighted } = PH.util;
  const POSS_PER_Q = 14;
  const ratio = (a, b) => (a - b) / Math.max(1, a + b);
  const mvName = m => PH.pretty(m.name);

  function makeSide(team, tag) {
    const G = PH.game;
    const roster = G.teamRoster(team);
    const st = G.starters(team);
    const all = roster.map(mon => ({
      mon, tag,
      name: PH.pretty(mon.name),
      r: G.ratings(mon),
      st: mon.stamina == null ? 100 : mon.stamina,
      cd: {},
      ab: PH.fxOf(mon), // ability + held item
      moves: G.activeMoves(mon).map(n => PH.MOVES[n]).filter(Boolean),
      speedQ: 0,
      heat: 0,
      fire: false,
      box: { uid: mon.uid, name: PH.pretty(mon.name), sprite: mon.sprite, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, min: 0, plays: 0 },
    }));
    const onCourt = st.map(m => all.find(x => x.mon === m)).filter(Boolean);
    // Difficulty gives rival teams a small shooting edge (negative on Easy).
    const edge = team.isPlayer ? 0 : G.difficulty().edge;
    return { team, tag, all, onCourt, bench: all.filter(x => !onCourt.includes(x)), buff: 0, buffLeft: 0, edge };
  }

  // A rating adjusted for fatigue (and Speed Boost-style abilities).
  const eff = (x, k) => x.r[k] * (0.6 + 0.4 * x.st / 100) * (k === 'spe' ? 1 + x.speedQ : 1);

  const typeEffect = (move, target) => (target.ab.immune === move.type ? 0 : PH.typeMult(move.type, target.mon.types));
  const effScale = m => (m === 0 ? 0 : m >= 2 ? 1.6 : m < 1 ? 0.5 : 1);
  function effText(m, target) {
    if (m === 0) return `It doesn't affect ${target.name}...`;
    if (m >= 2) return "It's super effective!";
    if (m < 1) return "It's not very effective...";
    return '';
  }

  const evt = (kind, x, text, short, type, pts, extra) => Object.assign({ kind, side: x.tag, actor: x.mon.uid, text, short, type: type || null, pts: pts || 0 }, extra);
  const pressureOf = side => side.onCourt.reduce((s, x) => s + (x.ab.oppCooldown || 0), 0);

  function useMove(x, kinds, side, pressure) {
    const ready = x.moves.filter(m => kinds.includes(m.kind) && !(x.cd[m.name] > 0)
      && (m.kind !== 'rest' || x.st < 55) && (m.kind !== 'rally' || side.buffLeft === 0));
    if (!ready.length || Math.random() > 0.22 + (x.ab.moveRate || 0) + (x.fire ? 0.1 : 0)) return null;
    const m = pick(ready);
    x.cd[m.name] = (m.kind === 'rally' ? 10 : m.kind === 'rest' ? 8 : 5) + pressure;
    x.box.plays++;
    return m;
  }

  function chooseKind(h) {
    const kinds = ['shot', 'dunk', 'drive'];
    const w = { shot: eff(h, 'sht') ** 2, dunk: eff(h, 'ins') ** 2, drive: eff(h, 'spe') ** 2 * 0.6 };
    return weighted(kinds, k => w[k]);
  }

  // Hot streak meter: makes, steals and blocks build heat; misses and time cool it off.
  // At 100 a Pokémon catches fire and plays better until its heat drops below 40.
  const FIRE_ON = 100, FIRE_OFF = 40;
  function heat(x, amt, log) {
    if (amt > 0 && x.ab.heatGain) amt *= 1 + x.ab.heatGain;
    x.heat = clamp(x.heat + amt, 0, 100);
    if (!x.fire && x.heat >= FIRE_ON) {
      x.fire = true;
      log(evt('hot', x, `🔥 ${x.name} is heating up... ${x.name} is ON FIRE!`, 'ON FIRE!'));
    } else if (x.fire && x.heat < FIRE_OFF) {
      x.fire = false;
      log(evt('cool', x, `${x.name} has cooled off.`, 'Cooled off'));
    }
  }

  // Set plays: who shoots, who sets it up, and how much the play opens up the shot.
  const PLAYS = { pnr: 'Pick and roll', pnp: 'Pick and pop', gng: 'Give and go', oop: 'Alley-oop' };
  function choosePlay(h, o) {
    const mates = o.onCourt.filter(x => x !== h);
    const best = f => mates.reduce((a, b) => (f(b) > f(a) ? b : a));
    const big = best(x => eff(x, 'ins') + eff(x, 'reb'));
    const popper = best(x => eff(x, 'sht'));
    const flyer = best(x => eff(x, 'spe') + eff(x, 'ins'));
    return weighted([
      { play: 'pnr', w: eff(big, 'ins'), shooter: big, helper: h, kind: 'dunk', bonus: 0.08 },
      { play: 'pnp', w: eff(popper, 'sht'), shooter: popper, helper: h, kind: 'shot', bonus: 0.07 },
      { play: 'gng', w: eff(h, 'spe'), shooter: h, helper: pick(mates), kind: 'drive', bonus: 0.08 },
      { play: 'oop', w: (eff(flyer, 'spe') + eff(flyer, 'ins')) * 0.3, shooter: flyer, helper: h, kind: 'dunk', bonus: 0.05 },
    ], c => c.w);
  }
  function playMakeText(play, sh, hp) {
    if (play === 'pnr') return `Pick and roll! ${sh.name} screens for ${hp.name}, rolls to the rim and throws it down!`;
    if (play === 'pnp') return `Pick and pop! ${sh.name} screens for ${hp.name}, pops out and drains the three!`;
    if (play === 'gng') return `Give and go! ${sh.name} hits ${hp.name}, cuts, gets it right back and lays it in!`;
    return `ALLEY-OOP! ${hp.name} lobs it up and ${sh.name} slams it home!`;
  }

  function subs(s, log) {
    for (let i = 0; i < s.onCourt.length; i++) {
      const x = s.onCourt[i];
      if (x.st >= 45) continue;
      const best = s.bench.slice().sort((a, b) => b.st - a.st)[0];
      if (best && best.st > x.st + 15) {
        s.onCourt[i] = best;
        s.bench[s.bench.indexOf(best)] = x;
        log({ kind: 'sub', side: s.tag, actor: best.mon.uid, text: `Sub: ${best.name} checks in for a tired ${x.name}.`, short: 'Sub in!', lineups: { [s.tag]: s.onCourt.map(y => y.mon.uid) } });
      }
    }
  }

  function rebound(o, d, score, log, h, kind, fx, playInfo) {
    const pre = playInfo.play ? `${PLAYS[playInfo.play]}... ` : '';
    const miss = `${pre}${fx ? fx + ' ' : ''}${h.name} misses ${kind === 'shot' ? 'the three' : 'the shot'}.`;
    const oR = o.onCourt.reduce((s, x) => s + eff(x, 'reb'), 0);
    const dR = d.onCourt.reduce((s, x) => s + eff(x, 'reb'), 0);
    if (Math.random() < 0.26 + 0.3 * ratio(oR, dR)) {
      const r = weighted(o.onCourt, x => eff(x, 'reb'));
      r.box.reb++;
      const avgDef = d.onCourt.reduce((s, x) => s + eff(x, 'def'), 0) / d.onCourt.length;
      if (Math.random() < 0.45 + 0.3 * ratio(eff(r, 'ins'), avgDef)) {
        score[o.tag] += 2;
        r.box.pts += 2;
        log(evt('score', r, `${miss} ${r.name} grabs the board and puts it back!`, '+2', null, 2, { shot: kind, shooter: h.mon.uid, putback: true, ...playInfo }));
        heat(r, 24, log);
      } else {
        log(evt('miss', h, `${miss} ${r.name} gets the offensive board but can't convert.`, 'Miss', null, 0, { shot: kind, reb: r.mon.uid, oreb: true, ...playInfo }));
      }
    } else {
      const r = weighted(d.onCourt, x => eff(x, 'reb'));
      r.box.reb++;
      log(evt('miss', h, `${miss} Rebound ${r.name}.`, 'Miss', null, 0, { shot: kind, reb: r.mon.uid, ...playInfo }));
    }
  }

  function possession(o, d, score, log) {
    for (const s of [o, d]) {
      s.all.forEach(x => { for (const k in x.cd) if (x.cd[k] > 0) x.cd[k]--; });
      s.onCourt.forEach(x => {
        x.st = Math.max(0, x.st - 50 / (x.mon.base.hp + 40) * (1 - (x.ab.stamSave || 0)));
        x.box.min++;
        heat(x, x.fire ? -3 : -1.5, log);
      });
      s.bench.forEach(x => {
        x.heat = Math.max(0, x.heat - 4);
        if (x.fire && x.heat < FIRE_OFF) x.fire = false;
      });
    }
    if (o.buffLeft > 0) o.buffLeft--; else o.buff = 0;

    const h = weighted(o.onCourt, x => eff(x, 'sht') + eff(x, 'ins') + eff(x, 'spe'));
    const df = d.onCourt[o.onCourt.indexOf(h)] || pick(d.onCourt);
    const oPress = pressureOf(o), dPress = pressureOf(d);

    // Offensive special play (support plays resolve immediately, attacks shape the shot).
    let move = useMove(h, ['shot', 'dunk', 'drive', 'rally', 'rest'], o, dPress);
    if (move && move.kind === 'rest') {
      h.st = Math.min(100, h.st + move.power / 2);
      log(evt('move', h, `${h.name} used ${mvName(move)}! Stamina restored.`, mvName(move) + '!', move.type, 0, { mkind: 'rest' }));
      move = null;
    } else if (move && move.kind === 'rally') {
      o.buff = move.power / 800;
      o.buffLeft = 5;
      log(evt('move', h, `${h.name} used ${mvName(move)}! The team is fired up!`, mvName(move) + '!', move.type, 0, { mkind: 'rally' }));
      move = null;
    }

    // Steal attempt.
    const sm = useMove(df, ['steal'], d, oPress);
    let pSteal = 0.05 + 0.08 * ratio(eff(df, 'spe'), eff(h, 'spe')) + (df.ab.steal || 0) - (h.ab.antiSteal || 0) + (df.fire ? 0.04 : 0);
    if (sm) {
      const m = typeEffect(sm, h);
      pSteal += sm.power / 250 * effScale(m);
      log(evt('move', df, `${df.name} used ${mvName(sm)}! ${effText(m, h)}`.trim(), mvName(sm) + '!', sm.type, 0, { mkind: 'steal' }));
    }
    if (Math.random() < pSteal) {
      df.box.stl++;
      log(evt('steal', df, `${df.name} steals it from ${h.name}!`, 'STEAL!', null, 0, { victim: h.mon.uid }));
      heat(df, 18, log);
      heat(h, -8, log);
      return;
    }

    // Set play, when the handler isn't already using an attacking special play.
    let shooter = h, helper = null, play = null, playBonus = 0;
    let kind = move ? move.kind : chooseKind(h);
    if (!move && o.onCourt.length > 1 && Math.random() < 0.3) {
      const c = choosePlay(h, o);
      ({ shooter, helper, play, kind } = c);
      playBonus = c.bonus;
    }
    const sdf = d.onCourt[o.onCourt.indexOf(shooter)] || df;
    const key = { shot: 'sht', dunk: 'ins', drive: 'spe' }[kind];
    const pts = kind === 'shot' ? 3 : 2;
    const ab = shooter.ab;
    let p = { shot: 0.33, dunk: 0.5, drive: 0.55 }[kind] + 0.35 * ratio(eff(shooter, key), eff(sdf, kind === 'drive' ? 'spe' : 'def'));
    p += o.buff + (ab.shot || 0) + ({ shot: ab.three, dunk: ab.inside, drive: ab.drive }[kind] || 0)
      + (shooter.st < 50 ? (ab.clutch || 0) : 0) - (sdf.ab.def || 0)
      + d.onCourt.reduce((s, x) => s + (x.ab.oppShot || 0), 0)
      + playBonus + (shooter.fire ? 0.1 : 0) + o.edge;

    let fx = '';
    if (move) {
      const m = typeEffect(move, sdf);
      let bonus = (move.power / 400 + (ab.move || 0)) * effScale(m);
      if (shooter.mon.types.includes(move.type)) bonus *= 1.15;
      if (ab.typeBoost === move.type) bonus *= 1.15;
      if (m >= 2 && ab.se) bonus *= 1 + ab.se;
      p += bonus;
      fx = effText(m, sdf);
      log(evt('move', shooter, `${shooter.name} used ${mvName(move)}!`, mvName(move) + '!', move.type, 0, { mkind: move.kind }));
    } else {
      const m = PH.typeMult(shooter.mon.types[0], sdf.mon.types);
      p += m === 0 ? -0.05 : m >= 2 ? 0.04 : m < 1 ? -0.03 : 0;
    }
    p = clamp(p, 0.05, 0.93);

    // Block attempt (no blocking a fast break, give and go or alley-oop).
    if (kind !== 'drive' && play !== 'oop') {
      const bm = useMove(sdf, ['block'], d, oPress);
      let pBlock = 0.03 + (sdf.ab.block || 0) + 0.05 * ratio(eff(sdf, 'reb'), eff(shooter, key)) + (sdf.fire ? 0.04 : 0);
      if (bm) {
        const m = typeEffect(bm, shooter);
        pBlock += bm.power / 220 * effScale(m);
        log(evt('move', sdf, `${sdf.name} used ${mvName(bm)}! ${effText(m, shooter)}`.trim(), mvName(bm) + '!', bm.type, 0, { mkind: 'block' }));
      }
      if (Math.random() < pBlock) {
        sdf.box.blk++;
        log(evt('block', sdf, `${sdf.name} swats ${shooter.name}'s shot away!`, 'BLOCKED!', null, 0, { victim: shooter.mon.uid, shot: kind }));
        heat(sdf, 18, log);
        heat(shooter, -10, log);
        return;
      }
    }

    const playInfo = { play, helper: helper ? helper.mon.uid : null };
    if (Math.random() < p) {
      let total = pts, extra = '';
      if (move && kind === 'dunk' && move.power >= 100 && Math.random() < 0.3) { total++; extra = ' AND ONE!'; }
      score[o.tag] += total;
      shooter.box.pts += total;
      // Set plays always credit the setter; other buckets are assisted about half the time.
      const mates = o.onCourt.filter(x => x !== shooter);
      const ast = helper || (mates.length && Math.random() < 0.45 ? pick(mates) : null);
      if (ast) ast.box.ast++;
      let text;
      if (play) text = playMakeText(play, shooter, helper);
      else {
        const verb = kind === 'shot' ? 'drains a three' : kind === 'dunk' ? 'throws it down' : 'races in for the layup';
        text = `${fx ? fx + ' ' : ''}${shooter.name} ${verb}!${extra}${ast ? ` (assist ${ast.name})` : ''}`;
      }
      log(evt('score', shooter, text, play === 'oop' ? 'SLAM!' : `+${total}`, move && move.type, total,
        { shot: kind, play, helper: ast ? ast.mon.uid : null }));
      heat(shooter, (kind === 'shot' ? 34 : 24) + (play ? 6 : 0) + (extra ? 10 : 0), log);
    } else {
      rebound(o, d, score, log, shooter, kind, fx, playInfo);
      heat(shooter, shooter.fire ? -20 : -14, log);
    }
  }

  function play(home, away, opts = {}) {
    const rec = !!opts.record;
    const H = makeSide(home, 'H'), A = makeSide(away, 'A');
    const score = { H: 0, A: 0 };
    const events = [];
    const everyone = [...H.all, ...A.all];
    const log = ev => {
      if (!rec) return;
      events.push(Object.assign(ev, {
        score: [score.H, score.A],
        heat: Object.fromEntries(everyone.map(x => [x.mon.uid, Math.round(x.heat)])),
        fire: everyone.filter(x => x.fire).map(x => x.mon.uid),
      }));
    };
    const lineups = () => ({ H: H.onCourt.map(x => x.mon.uid), A: A.onCourt.map(x => x.mon.uid) });

    let q = 1, totalPoss = 0;
    for (; q <= 4 || (score.H === score.A && q <= 9); q++) {
      const qLen = q > 4 ? 300 : 720; // seconds: 12-minute quarters, 5-minute overtimes
      if (q > 1) {
        [H, A].forEach(s => {
          s.bench.forEach(x => { x.st = Math.min(100, x.st + 12); });
          subs(s, ev => log(Object.assign(ev, { clock: qLen })));
        });
      }
      [H, A].forEach(s => s.all.forEach(x => { x.speedQ = (q - 1) * (x.ab.speedQ || 0); }));
      log({ kind: 'quarter', q, text: q > 4 ? `Overtime${q > 5 ? ' ' + (q - 4) : ''}!` : `Quarter ${q}`, lineups: lineups(), clock: qLen });
      const n = q > 4 ? 5 : POSS_PER_Q;
      totalPoss += n * 2;
      for (let i = 0; i < n * 2; i++) {
        const o = (i + q) % 2 === 0 ? H : A;
        // Each possession uses an equal slice of the quarter; its plays happen when it ends.
        const clock = Math.max(0, Math.round(qLen - (i + 1) * qLen / (n * 2)));
        possession(o, o === H ? A : H, score, ev => log(Object.assign(ev, { off: o.tag, clock })));
      }
    }
    if (score.H === score.A) score[Math.random() < 0.5 ? 'H' : 'A'] += 1;

    [H, A].forEach(s => s.all.forEach(x => { x.mon.stamina = Math.round(x.st); }));
    const info = {};
    [H, A].forEach(s => s.all.forEach(x => { info[x.mon.uid] = { id: x.mon.id, name: x.name, sprite: x.mon.sprite, tag: s.tag, height: x.mon.height }; }));
    return {
      hs: score.H, as: score.A, events, info, periods: q - 1,
      totalPoss,
      box: { H: H.all.map(x => x.box), A: A.all.map(x => x.box) },
    };
  }

  PH.sim = { play };
})();
