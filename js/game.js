/* Game state and rules: club, roster, training, economy, league calendar, saving. */
(() => {
  const { rand, pick, shuffle, clamp, uid } = PH.util;
  const SAVE_KEY = 'pokehoops.save.v1';
  const ROSTER_MAX = 8;
  const ROSTER_MIN = 5;
  const REG_WEEKS = 14;
  const STATS = ['sht', 'ins', 'spe', 'def', 'reb'];

  let S = null;

  // ---------- Pokémon ratings ----------
  const bst = p => Object.values(p.base).reduce((s, v) => s + v, 0);
  const scale = (v, lvl) => Math.round(v * (0.4 + lvl / 40));
  const rebBase = p => Math.min(150, 40 + Math.sqrt(p.height) * 12 + Math.sqrt(p.weight) * 0.6 + p.base.hp * 0.2);

  function ratings(p) {
    const L = p.level, b = p.base, B = p.bonus;
    return {
      sht: scale(b.spa, L) + B.sht,
      ins: scale(b.atk, L) + B.ins,
      spe: scale(b.spe, L) + B.spe,
      def: scale((b.def + b.spd) / 2, L) + B.def,
      reb: scale(rebBase(p), L) + B.reb,
    };
  }
  const ovr = p => {
    const r = ratings(p);
    return Math.round(STATS.reduce((s, k) => s + r[k], 0) / STATS.length);
  };

  const MOVE_UNLOCKS = [1, 12, 25, 40];
  const moveSlots = lvl => MOVE_UNLOCKS.filter(l => lvl >= l).length;
  const activeMoves = p => p.moves.slice(0, moveSlots(p.level));
  const xpNeed = lvl => 10 * lvl + 20;
  const fee = p => Math.round((Math.pow(bst(p) / 100, 3) * 40 + p.level * 30) / 10) * 10;
  const salary = p => Math.round(Math.pow(bst(p) / 100, 2) * 2.5 * (1 + p.level / 50));

  // Pick up to 4 plays from the Pokémon's real learnset, weakest first so stronger ones unlock later.
  function chooseMoves(p) {
    let pool = p.learn.map(n => PH.MOVES[n]).filter(Boolean);
    const score = m => m.power + (p.types.includes(m.type) ? 60 : 0);
    const isAttack = m => ['shot', 'dunk', 'drive'].includes(m.kind);
    if (!pool.some(isAttack)) pool = pool.concat(p.types.map(t => PH.MOVES[PH.TYPE_DEFAULT[t]]));
    const off = pool.filter(isAttack).sort((a, b) => score(b) - score(a));
    const sup = pool.filter(m => !isAttack(m)).sort((a, b) => score(b) - score(a));
    // Slot 1 (from Lv 1) is a weak attack, preferring the Pokémon's own type, like a starter move.
    const weakest = off.slice().sort((a, b) => (a.power - (p.types.includes(a.type) ? 30 : 0)) - (b.power - (p.types.includes(b.type) ? 30 : 0)));
    const first = weakest[0];
    // Slots 2–4 are the best varied plays, unlocking weakest-first.
    const rest = [];
    const add = m => { if (m && m !== first && !rest.includes(m) && rest.length < 3) rest.push(m); };
    add(off.find(m => m !== first));
    add(sup[0]);
    add(off.find(m => m !== first && [first, ...rest].every(o => o.kind !== m.kind)));
    add(sup.find(m => rest.every(o => o.kind !== m.kind)));
    [...off, ...sup].forEach(add);
    rest.sort((a, b) => a.power - b.power);
    return [first, ...rest].map(m => m.name);
  }

  function makeMon(d, level) {
    const hiddenRoll = Math.random() < 0.1;
    const slot = d.abilities.length <= 1 ? 0 : hiddenRoll ? d.abilities.length - 1 : rand(0, Math.max(0, d.abilities.length - 2));
    const m = {
      uid: uid(), id: d.id, name: d.name, types: d.types, base: d.base, height: d.height, weight: d.weight,
      sprite: d.sprite, learn: d.learn, abilitySlot: slot, ability: d.abilities[slot] || 'none',
      level, levelF: level, xp: 0, bonus: { sht: 0, ins: 0, spe: 0, def: 0, reb: 0 },
      stamina: 100, focus: 'balanced', starter: false, everstone: false, stats: { gp: 0, pts: 0, reb: 0 },
    };
    m.moves = chooseMoves(m);
    return m;
  }

  // Tutored moves stay in their slot through evolution.
  function applyTutored(p) {
    Object.entries(p.tutored || {}).forEach(([slot, name]) => {
      const i = +slot, dup = p.moves.indexOf(name);
      if (dup !== -1 && dup !== i) p.moves[dup] = p.moves[i];
      p.moves[i] = name;
    });
  }

  function evolve(p, d) {
    Object.assign(p, {
      id: d.id, name: d.name, types: d.types, base: d.base, height: d.height, weight: d.weight,
      sprite: d.sprite, learn: d.learn,
      ability: d.abilities[Math.min(p.abilitySlot, d.abilities.length - 1)] || p.ability,
    });
    p.moves = chooseMoves(p);
    applyTutored(p);
  }

  // ---------- Regions ----------
  const enabledRegions = () => PH.REGIONS.filter(r => S.regions[r.key]);
  const inEnabled = id => enabledRegions().some(r => id >= r.from && id <= r.to);
  function randomId(regionKey) {
    const regions = regionKey ? PH.REGIONS.filter(r => r.key === regionKey) : enabledRegions();
    const total = regions.reduce((s, r) => s + r.to - r.from + 1, 0);
    let n = Math.floor(Math.random() * total);
    for (const r of regions) {
      const size = r.to - r.from + 1;
      if (n < size) return r.from + n;
      n -= size;
    }
    return 25;
  }
  function distinctIds(count, regionKey) {
    const ids = new Set();
    for (let guard = 0; ids.size < count && guard < count * 30; guard++) ids.add(randomId(regionKey));
    return [...ids];
  }
  const fetchMon = id => PH.api.pokemon(id).catch(() => PH.api.pokemon(randomId()));

  // ---------- Setup ----------
  const diff = () => PH.DIFFICULTIES[S.difficulty] || PH.DIFFICULTIES.normal;

  function newGame(club, regions, difficulty = 'normal') {
    S = {
      v: 1, club: club || 'Pallet Hoopers', regions: { ...regions },
      difficulty, money: (PH.DIFFICULTIES[difficulty] || PH.DIFFICULTIES.normal).money, fans: 80, season: 1, week: 1, tier: 0, phase: 'draft',
      facilities: { gym: 1, center: 1, scout: 1, arena: 1 },
      roster: [], draft: [], prospects: [], items: {}, league: null, news: [], hall: [], summary: null,
      created: Date.now(),
    };
    save();
  }

  // Random Pokémon from the checked regions with base stat total ≤ cap. Rerolls ones that are
  // too strong; if a small region pool runs dry, fills with the weakest of the rejects.
  async function findProspects(count, cap, regionKey) {
    const found = [], spare = [], seen = new Set();
    for (let round = 0; round < 5 && found.length < count; round++) {
      const ids = distinctIds(count * 2 + 4, regionKey).filter(id => !seen.has(id));
      ids.forEach(id => seen.add(id));
      if (!ids.length) break;
      const ds = await PH.api.pool(ids, id => PH.api.pokemon(id).catch(() => null));
      ds.filter(Boolean).forEach(d => {
        if (bst(d) > cap) spare.push(d);
        else if (found.length < count) found.push(d);
      });
    }
    spare.sort((a, b) => bst(a) - bst(b));
    while (found.length < count && spare.length) found.push(spare.shift());
    return found;
  }

  const scoutMaxBst = () => PH.TIERS[S.tier].scoutBst + 15 * (S.facilities.scout - 1);

  async function draftPool() {
    const out = (await findProspects(10, diff().draftBst)).map(d => makeMon(d, rand(5, 7)));
    if (out.length < ROSTER_MIN) throw new Error('Could not reach PokéAPI to scout your draft. Check your connection and try again.');
    S.draft = out;
    save();
    return out;
  }

  async function confirmDraft(uids, progress) {
    const picked = S.draft.filter(m => uids.includes(m.uid));
    if (picked.length < ROSTER_MIN || picked.length > 6) throw new Error('Pick 5 or 6 Pokémon.');
    S.roster = picked;
    ensureStarters();
    await genLeague(progress);
    S.draft = [];
    S.phase = 'regular';
    news(`${S.club} is founded! Welcome to the ${PH.TIERS[S.tier].name}.`);
    save();
  }

  async function genLeague(progress) {
    const tier = PH.TIERS[S.tier];
    const types = shuffle(PH.TYPES.slice()).slice(0, 7);
    const cities = shuffle(PH.CITIES.slice());
    const teams = [{ id: 'you', name: S.club, isPlayer: true, type: null }];
    for (let i = 0; i < 7; i++) {
      const type = types[i];
      let ids = [];
      try { ids = shuffle((await PH.api.typeIds(type)).filter(inEnabled)); } catch (e) { /* fall back to random */ }
      teams.push({ id: 't' + i, name: `${cities[i]} ${PH.TEAM_NICKS[type]}`, type, roster: [], ids });
    }
    // Each team draws type-themed Pokémon, skipping ones too strong for this tier (no Rookie Cup legendaries).
    // Rivals start near your team's level, within this tier's range.
    const avg = S.roster.length ? S.roster.reduce((sum, p) => sum + p.level, 0) / S.roster.length : tier.lv[0];
    const startLv = Math.max(2, clamp(Math.round(avg) - 2, tier.lv[0], tier.lv[1] - 6) + diff().rivalLv);
    const maxBst = tier.maxBst + diff().bst;
    const rivalLv = () => rand(startLv, startLv + 3);
    let done = 0;
    const total = 7 * 6;
    await PH.api.pool(teams.slice(1), async t => {
      const spare = [];
      for (let tries = 0; t.roster.length < 6 && tries < 16; tries++) {
        const d = await fetchMon(t.ids.length ? t.ids.shift() : randomId());
        if (t.roster.some(m => m.id === d.id)) continue;
        if (bst(d) > maxBst) { spare.push(d); continue; }
        t.roster.push(makeMon(d, rivalLv()));
        if (progress) progress(++done / total);
      }
      spare.sort((a, b) => bst(a) - bst(b));
      while (t.roster.length < 6) {
        t.roster.push(makeMon(spare.shift() || await fetchMon(randomId()), rivalLv()));
        if (progress) progress(++done / total);
      }
    }, 3);
    teams.forEach(t => delete t.ids);
    S.league = {
      teams,
      schedule: makeSchedule(teams.map(t => t.id)),
      results: [],
      table: Object.fromEntries(teams.map(t => [t.id, { w: 0, l: 0, pf: 0, pa: 0 }])),
      playoffs: null,
    };
  }

  // Double round robin via the circle method: 7 rounds, then the same rounds with home/away flipped.
  function makeSchedule(ids) {
    const n = ids.length;
    const arr = ids.slice();
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const games = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        games.push((r + i) % 2 ? [a, b] : [b, a]);
      }
      rounds.push(games);
      arr.splice(1, 0, arr.pop());
    }
    return rounds.concat(rounds.map(g => g.map(([h, a]) => [a, h])));
  }

  // ---------- Teams ----------
  const team = id => S.league.teams.find(t => t.id === id);
  const myTeam = () => team('you');
  const teamRoster = t => (t.isPlayer ? S.roster : t.roster);

  function ensureStarters() {
    const st = S.roster.filter(p => p.starter);
    if (st.length > 5) st.sort((a, b) => ovr(a) - ovr(b)).slice(0, st.length - 5).forEach(p => { p.starter = false; });
    let need = 5 - S.roster.filter(p => p.starter).length;
    S.roster.filter(p => !p.starter).sort((a, b) => ovr(b) - ovr(a)).forEach(p => {
      if (need > 0) { p.starter = true; need--; }
    });
  }

  function starters(t) {
    if (t.isPlayer) {
      ensureStarters();
      return S.roster.filter(p => p.starter);
    }
    return t.roster.slice().sort((a, b) => ovr(b) - ovr(a)).slice(0, 5);
  }

  const teamOvr = t => {
    const st = starters(t);
    return st.length ? Math.round(st.reduce((s, p) => s + ovr(p), 0) / st.length) : 0;
  };

  function standings() {
    const T = S.league.table;
    const diff = id => T[id].pf - T[id].pa;
    return S.league.teams.slice().sort((a, b) => (T[b.id].w - T[a.id].w) || (diff(b.id) - diff(a.id)));
  }

  function gamesThisWeek() {
    const L = S.league;
    if (S.phase === 'regular') return L.schedule[S.week - 1] || [];
    if (S.phase === 'playoffs') {
      if (S.week === REG_WEEKS + 1) return L.playoffs.semis;
      return L.playoffs.final ? [L.playoffs.final] : [];
    }
    return [];
  }

  function nextGame() {
    if (!S.league) return null;
    const g = gamesThisWeek().find(([h, a]) => h === 'you' || a === 'you');
    if (!g) return null;
    const isHome = g[0] === 'you';
    return { home: team(g[0]), away: team(g[1]), isHome, opp: team(isHome ? g[1] : g[0]) };
  }

  function weekLabel() {
    if (!S) return '';
    if (S.phase === 'draft') return 'Draft';
    if (S.phase === 'offseason') return 'Offseason';
    if (S.phase === 'playoffs') return S.week === REG_WEEKS + 1 ? 'Semifinals' : 'Final';
    return `Week ${S.week}/${REG_WEEKS}`;
  }

  // ---------- Economy ----------
  const arenaCap = () => PH.ARENA_CAP[S.facilities.arena];
  const ticketPrice = () => 8 + 4 * S.facilities.arena;
  const scoutCost = () => 150 + 150 * S.tier;
  const facilityCost = key => (S.facilities[key] >= PH.FACILITY_MAX ? null : PH.FACILITY_COSTS[S.facilities[key]]);
  const payrollTotal = () => S.roster.reduce((s, p) => s + salary(p), 0);
  const sponsorPay = () => 250 * (S.tier + 1);

  function news(text) {
    S.news.unshift({ when: `S${S.season} · ${weekLabel()}`, text });
    S.news = S.news.slice(0, 30);
  }

  // ---------- Week loop ----------
  function train() {
    const gym = S.facilities.gym, center = S.facilities.center;
    for (const p of S.roster) {
      const abil = PH.fxOf(p);
      if (p.focus === 'rest') { p.stamina = 100; continue; }
      p.stamina = Math.min(100, p.stamina + 25 + 10 * center + (abil.rec || 0));
      if (p.focus === 'balanced') {
        shuffle(STATS.slice()).slice(0, 2).forEach(k => { p.bonus[k] += rand(1, Math.ceil((1 + gym) / 2)); });
        if (abil.train) p.bonus[pick(STATS)] += abil.train;
      } else {
        p.bonus[p.focus] += rand(1, 1 + gym) + (abil.train || 0);
      }
      p.xp += Math.round((20 + 10 * gym) * (1 + (abil.xp || 0)));
      p.stamina = Math.max(0, p.stamina - 8);
    }
  }

  function recordResult(H, A, res) {
    const L = S.league;
    L.results.push({ week: S.week, phase: S.phase, h: H.id, a: A.id, hs: res.hs, as: res.as });
    if (S.phase !== 'regular') return;
    const th = L.table[H.id], ta = L.table[A.id];
    th.pf += res.hs; th.pa += res.as; ta.pf += res.as; ta.pa += res.hs;
    if (res.hs > res.as) { th.w++; ta.l++; } else { ta.w++; th.l++; }
  }

  function postMatch(my, report) {
    const { res, isHome } = my;
    const mine = isHome ? res.hs : res.as, theirs = isHome ? res.as : res.hs;
    const won = mine > theirs;
    const opp = isHome ? my.away : my.home;
    my.won = won;
    const gate = Math.round(Math.min(S.fans, arenaCap()) * ticketPrice() * (isHome ? 1 : 0.35) * diff().income);
    let fans = won ? rand(8, 16) + S.tier * 6 : rand(0, 4);
    if (S.phase === 'playoffs') fans *= 2;
    S.money += gate;
    S.fans += fans;
    report.fans = fans;
    report.money.push({ label: isHome ? 'Ticket sales' : 'Away gate share', amount: gate });

    let cash = 0;
    for (const b of res.box[isHome ? 'H' : 'A']) {
      const p = S.roster.find(x => x.uid === b.uid);
      if (!p) continue;
      const played = b.min > 0;
      const fx = PH.fxOf(p);
      p.xp += Math.round((played ? 25 + (won ? 15 : 0) : 10) * (1 + (fx.xp || 0)));
      if (played) p.stats.gp++;
      p.stats.pts += b.pts;
      p.stats.reb += b.reb;
      if (fx.cash) cash += fx.cash;
    }
    if (cash) {
      S.money += cash;
      report.money.push({ label: 'Pickup finds', amount: cash });
    }
    news(`${won ? 'W' : 'L'} ${mine}–${theirs} ${isHome ? 'vs' : '@'} ${opp.name}`);
  }

  function payroll(report) {
    const sponsor = Math.round(sponsorPay() * diff().income);
    S.money += sponsor;
    report.money.push({ label: 'Sponsors', amount: sponsor });
    const total = payrollTotal();
    S.money -= total;
    report.money.push({ label: 'Salaries', amount: -total });
  }

  function growRivals() {
    const tier = PH.TIERS[S.tier];
    const step = Math.max(0.5, (tier.lv[1] - tier.lv[0]) / 16) * diff().growth;
    S.league.teams.filter(t => !t.isPlayer).forEach(t => t.roster.forEach(p => {
      p.levelF = (p.levelF || p.level) + step;
      p.level = Math.min(100, Math.floor(p.levelF));
      p.bonus[pick(STATS)] += rand(0, 2);
      p.stamina = Math.min(100, p.stamina + 45);
    }));
  }

  async function levelUps(report) {
    for (const p of S.roster) {
      const before = p.level, slotsBefore = moveSlots(p.level);
      while (p.level < 100 && p.xp >= xpNeed(p.level)) {
        p.xp -= xpNeed(p.level);
        p.level++;
      }
      if (p.level > before) report.levelUps.push({ name: PH.pretty(p.name), from: before, to: p.level, sprite: p.sprite });
      if (moveSlots(p.level) > slotsBefore) {
        activeMoves(p).slice(slotsBefore).forEach(n => report.newMoves.push({ name: PH.pretty(p.name), move: PH.pretty(n) }));
      }
      if (p.everstone) continue;
      try {
        const ready = (await PH.api.evolutions(p.id)).filter(e => p.level >= e.level);
        if (ready.length) {
          const d = await PH.api.pokemon(pick(ready).id);
          const from = PH.pretty(p.name), fromSprite = p.sprite;
          evolve(p, d);
          report.evolutions.push({ from, to: PH.pretty(p.name), fromSprite, toSprite: p.sprite });
          news(`${from} evolved into ${PH.pretty(p.name)}!`);
        }
      } catch (e) { /* offline: try again next week */ }
    }
  }

  function advance(report) {
    const L = S.league;
    if (S.phase === 'regular') {
      if (S.week >= REG_WEEKS) {
        const st = standings();
        L.playoffs = { semis: [[st[0].id, st[3].id], [st[1].id, st[2].id]], final: null, champion: null };
        S.phase = 'playoffs';
        S.week++;
        const made = st.slice(0, 4).some(t => t.isPlayer);
        report.note = made ? 'You made the playoffs! Semifinals are next.' : 'The regular season is over. You missed the playoffs this time.';
        news(made ? 'Clinched a playoff spot!' : 'Missed the playoffs.');
      } else {
        S.week++;
      }
    } else if (S.phase === 'playoffs') {
      const winners = L.results.filter(r => r.week === S.week && r.phase === 'playoffs').map(r => (r.hs > r.as ? r.h : r.a));
      if (S.week === REG_WEEKS + 1) {
        L.playoffs.final = [winners[0], winners[1]];
        S.week++;
        report.note = `Final: ${team(winners[0]).name} vs ${team(winners[1]).name}`;
      } else {
        L.playoffs.champion = winners[0];
        endSeason(report);
      }
    }
  }

  function endSeason(report) {
    const st = standings();
    const rank = st.findIndex(t => t.isPlayer) + 1;
    const champ = S.league.playoffs.champion === 'you';
    const tier = PH.TIERS[S.tier];
    const prize = Math.round((tier.prize * [4, 2.5, 1.8, 1.4, 1.1, 1, 1, 1][rank - 1] + (champ ? tier.prize * 3 : 0)) * diff().income);
    S.money += prize;
    let move = 0;
    if ((champ || rank <= 2) && S.tier < PH.TIERS.length - 1) move = 1;
    else if (rank === 8 && S.tier > 0) move = -1;
    if (champ && S.tier === PH.TIERS.length - 1) {
      S.hall.push({ season: S.season, roster: S.roster.map(p => ({ name: p.name, sprite: p.sprite, level: p.level })) });
    }
    S.summary = { season: S.season, rank, champ, champion: team(S.league.playoffs.champion).name, prize, fromTier: S.tier, move };
    S.tier += move;
    S.phase = 'offseason';
    report.summary = S.summary;
    news(champ ? `CHAMPIONS of the ${tier.name}! 🏆` : `Season ${S.season} over. Finished #${rank}.`);
  }

  async function playWeek() {
    if (S.roster.length < ROSTER_MIN) throw new Error(`You need at least ${ROSTER_MIN} Pokémon to play.`);
    ensureStarters();
    const report = { label: weekLabel(), levelUps: [], newMoves: [], evolutions: [], money: [], others: [], fans: 0 };
    train();
    let my = null;
    for (const [h, a] of gamesThisWeek()) {
      const H = team(h), A = team(a);
      const mine = H.isPlayer || A.isPlayer;
      const res = PH.sim.play(H, A, { record: mine });
      recordResult(H, A, res);
      if (mine) my = { res, home: H, away: A, isHome: H.isPlayer };
      else report.others.push({ h: H.name, a: A.name, hs: res.hs, as: res.as });
    }
    if (my) postMatch(my, report);
    payroll(report);
    growRivals();
    await levelUps(report);
    advance(report);
    save();
    return { my, report };
  }

  async function startNextSeason(progress) {
    await genLeague(progress);
    S.season++;
    S.week = 1;
    S.phase = 'regular';
    S.summary = null;
    S.prospects = [];
    S.roster.forEach(p => { p.stats = { gp: 0, pts: 0, reb: 0 }; p.stamina = 100; });
    news(`Season ${S.season} tips off in the ${PH.TIERS[S.tier].name}.`);
    save();
  }

  // ---------- Club management ----------
  async function scout(regionKey) {
    const cost = scoutCost();
    if (S.money < cost) throw new Error(`Scouting costs ${cost}. Not enough money.`);
    if (regionKey && !S.regions[regionKey]) regionKey = '';
    const ds = await findProspects(2 + S.facilities.scout, scoutMaxBst(), regionKey || undefined);
    if (!ds.length) throw new Error('Could not reach PokéAPI. Check your connection and try again.');
    S.money -= cost;
    const avg = S.roster.length ? S.roster.reduce((s, p) => s + p.level, 0) / S.roster.length : 5;
    const base = Math.max(PH.TIERS[S.tier].lv[0], Math.round(avg) - 4);
    S.prospects = ds.map(d => makeMon(d, clamp(base + rand(0, 2 * S.facilities.scout + 2), 2, 100)));
    save();
    return S.prospects;
  }

  function sign(uidv) {
    const p = S.prospects.find(x => x.uid === uidv);
    if (!p) return;
    if (S.roster.length >= ROSTER_MAX) throw new Error(`Roster is full (${ROSTER_MAX}). Release someone first.`);
    const cost = fee(p);
    if (S.money < cost) throw new Error(`Signing ${PH.pretty(p.name)} costs $${cost.toLocaleString()}.`);
    S.money -= cost;
    S.roster.push(p);
    S.prospects = S.prospects.filter(x => x !== p);
    ensureStarters();
    news(`Signed ${PH.pretty(p.name)} (Lv ${p.level}).`);
    save();
  }

  function release(uidv) {
    if (S.roster.length <= ROSTER_MIN) throw new Error(`You need at least ${ROSTER_MIN} Pokémon.`);
    const p = S.roster.find(x => x.uid === uidv);
    if (!p) return;
    S.roster = S.roster.filter(x => x !== p);
    ensureStarters();
    news(`Released ${PH.pretty(p.name)}.`);
    save();
  }

  function toggleStarter(uidv) {
    const p = S.roster.find(x => x.uid === uidv);
    if (!p) return;
    if (!p.starter && S.roster.filter(x => x.starter).length >= 5) throw new Error('You already have 5 starters. Bench one first.');
    p.starter = !p.starter;
    save();
  }

  function setFocus(uidv, focus) {
    const p = S.roster.find(x => x.uid === uidv);
    if (p) { p.focus = focus; save(); }
  }
  function setAllFocus(focus) {
    S.roster.forEach(p => { p.focus = focus; });
    save();
  }
  function setEverstone(uidv, on) {
    const p = S.roster.find(x => x.uid === uidv);
    if (p) { p.everstone = !!on; save(); }
  }

  function upgrade(key) {
    const cost = facilityCost(key);
    if (cost == null) throw new Error('Already at max level.');
    if (S.money < cost) throw new Error(`Upgrade costs $${cost.toLocaleString()}.`);
    S.money -= cost;
    S.facilities[key]++;
    news(`${PH.FACILITIES[key].name} upgraded to Lv ${S.facilities[key]}.`);
    save();
  }

  // ---------- Poké Mart ----------
  const itemUnlocked = key => PH.ITEMS[key].tier <= S.tier;
  const vitaminPrice = p => Math.round(1000 * (1 + 0.3 * (p.vitamins || 0)) / 10) * 10;
  function medicinePrice(p, key) {
    if (key === 'rare-candy') return Math.round(60 * Math.pow(p.level, 1.4) / 10) * 10;
    if (key === 'max-potion') return 300 * (S.tier + 1);
    return vitaminPrice(p);
  }
  // Strong moves need a higher league: 100+ power from the Great League, 130+ from the Ultra League.
  const tutorTier = m => (m.power >= 130 ? 2 : m.power >= 100 ? 1 : 0);
  const tutorPrice = m => Math.round(Math.max(40, m.power) * 25 * (1 + S.tier * 0.5) / 10) * 10;

  function spend(cost) {
    if (S.money < cost) throw new Error(`That costs $${cost.toLocaleString()}. Not enough money.`);
    S.money -= cost;
  }

  function buyItem(key) {
    const it = PH.ITEMS[key];
    if (!it) return;
    if (!itemUnlocked(key)) throw new Error(`${it.name} unlocks in the ${PH.TIERS[it.tier].name}.`);
    spend(it.cost);
    S.items[key] = (S.items[key] || 0) + 1;
    save();
  }

  // Give a held item from the bag (or null to take it off); the old item goes back in the bag.
  function equip(uidv, key) {
    const p = S.roster.find(x => x.uid === uidv);
    if (!p || p.item === key) return;
    if (key && !(S.items[key] > 0)) throw new Error('You don\'t have that item.');
    if (p.item) S.items[p.item] = (S.items[p.item] || 0) + 1;
    if (key) S.items[key]--;
    p.item = key || null;
    save();
  }

  function useMedicine(uidv, key) {
    const p = S.roster.find(x => x.uid === uidv);
    const med = PH.MEDICINE[key];
    if (!p || !med) return;
    if (key === 'rare-candy' && p.level >= 100) throw new Error('Already Lv 100.');
    if (key === 'max-potion' && p.stamina >= 100) throw new Error('Stamina is already full.');
    spend(medicinePrice(p, key));
    const name = PH.pretty(p.name);
    if (med.stat) {
      p.bonus[med.stat] += PH.VITAMIN_GAIN;
      p.vitamins = (p.vitamins || 0) + 1;
    } else if (key === 'rare-candy') {
      p.level++;
      p.xp = 0;
    } else {
      p.stamina = 100;
    }
    news(`${name} used ${med.name}.`);
    save();
    return `${name}: ${med.desc}!`;
  }

  function teach(uidv, slot, moveName) {
    const p = S.roster.find(x => x.uid === uidv);
    const m = PH.MOVES[moveName];
    if (!p || !m || !p.learn.includes(moveName)) return;
    if (tutorTier(m) > S.tier) throw new Error(`${PH.pretty(moveName)} can be tutored from the ${PH.TIERS[tutorTier(m)].name}.`);
    if (p.moves.includes(moveName)) throw new Error('It already knows that move.');
    spend(tutorPrice(m));
    const old = p.moves[slot];
    p.moves[slot] = moveName;
    p.tutored = { ...(p.tutored || {}), [slot]: moveName };
    news(`${PH.pretty(p.name)} learned ${PH.pretty(moveName)}${old ? ` in place of ${PH.pretty(old)}` : ''}.`);
    save();
  }

  function setRegions(regions) {
    if (!Object.values(regions).some(Boolean)) throw new Error('Keep at least one region enabled.');
    S.regions = { ...regions };
    save();
  }

  function setDifficulty(key) {
    if (!PH.DIFFICULTIES[key]) return;
    S.difficulty = key;
    news(`Difficulty set to ${PH.DIFFICULTIES[key].name}.`);
    save();
  }

  function rename(name) {
    S.club = name;
    if (S.league) myTeam().name = name;
    save();
  }

  // ---------- Saving ----------
  function save() {
    if (!S) return false;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); S._savedAt = Date.now(); return true; } catch (e) { return false; }
  }
  // Fill in fields added after a save was made.
  function migrate(o) {
    o.items = o.items || {};
    o.difficulty = o.difficulty || 'normal';
    return o;
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { S = migrate(JSON.parse(raw)); return true; }
    } catch (e) { /* corrupt or unavailable */ }
    return false;
  }
  const hasSave = () => !!S;
  const exportSave = () => JSON.stringify(S);
  function importSave(text) {
    const o = JSON.parse(text);
    if (!o || o.v !== 1 || !Array.isArray(o.roster) || !o.regions) throw new Error("That file isn't a Poké Hoops save.");
    S = migrate(o);
    save();
  }
  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    S = null;
  }

  PH.game = {
    ROSTER_MAX, ROSTER_MIN, REG_WEEKS, MOVE_UNLOCKS,
    state: () => S,
    bst, ratings, ovr, moveSlots, activeMoves, xpNeed, fee, salary,
    newGame, draftPool, confirmDraft, playWeek, startNextSeason,
    team, myTeam, teamRoster, starters, teamOvr, standings, nextGame, weekLabel,
    arenaCap, ticketPrice, scoutCost, scoutMaxBst, facilityCost, payrollTotal,
    scout, sign, release, toggleStarter, setFocus, setAllFocus, setEverstone, upgrade, setRegions, setDifficulty, rename, difficulty: () => diff(),
    itemUnlocked, medicinePrice, tutorTier, tutorPrice, buyItem, equip, useMedicine, teach,
    save, load, hasSave, exportSave, importSave, reset,
  };
})();
