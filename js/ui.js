/* All screens: title, draft, club hub tabs, match playback and reports. */
(() => {
  const G = PH.game;
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');

  let started = false;
  let tab = 'club';
  let viewTeam = null;
  let scoutRegion = '';
  let martMon = null;
  let tutorSlot = 0;
  let busy = false;
  let speed = 2;
  let ngRegions = { kanto: true };
  let ngDifficulty = 'normal';
  const draftSel = new Set();
  try { speed = +localStorage.getItem('pokehoops.speed') || 2; } catch (e) { /* ignore */ }

  // ---------- helpers ----------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = n => esc(PH.pretty(n));
  const $m = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString();
  const FALLBACK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M3 16a13 13 0 0 1 26 0z" fill="#ef5350"/><path d="M3 16a13 13 0 0 0 26 0z" fill="#fff"/><circle cx="16" cy="16" r="13" fill="none" stroke="#24243a" stroke-width="2"/><path d="M3 16h26" stroke="#24243a" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="#fff" stroke="#24243a" stroke-width="2"/></svg>');
  const img = (src, cls = '') => `<img class="spr ${cls}" src="${esc(src || FALLBACK)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;
  const icon = info => `<img class="icon" src="${esc(PH.iconUrl(info.id))}" alt="" onerror="this.onerror=null;this.src='${esc(info.sprite || FALLBACK)}';this.classList.add('big')">`;
  const itemImg = (key, cls = '') => `<img class="item-ic ${cls}" src="${esc(PH.ITEM_SPRITE(key))}" alt="" loading="lazy">`;
  const typeBadge = t => `<span class="type" style="background:${PH.TYPE_COLORS[t] || '#888'}">${esc(t)}</span>`;
  const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  const staminaCls = v => (v >= 70 ? 'good' : v >= 40 ? 'mid' : 'low');
  const FOCI = [['balanced', 'Balanced'], ['sht', 'Shooting'], ['ins', 'Inside'], ['spe', 'Speed'], ['def', 'Defense'], ['reb', 'Rebounding'], ['rest', 'Rest (full stamina, no XP)']];
  const STAT_LABELS = [['sht', 'SHT'], ['ins', 'INS'], ['spe', 'SPD'], ['def', 'DEF'], ['reb', 'REB']];

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function loading(msg) {
    const el = document.createElement('div');
    el.className = 'overlay loading';
    el.innerHTML = `<div class="panel load-box"><div class="ball-spin"></div><p class="load-msg">${esc(msg)}</p>${bar(0, 'big')}</div>`;
    document.body.appendChild(el);
    return {
      set(p, m) {
        el.querySelector('.bar i').style.width = Math.round(p * 100) + '%';
        if (m) el.querySelector('.load-msg').textContent = m;
      },
      close() { el.remove(); },
    };
  }

  async function withLoading(msg, fn) {
    if (busy) return;
    busy = true;
    const ld = loading(msg);
    try {
      return await fn(ld);
    } catch (e) {
      console.error(e);
      toast(e.message || 'Something went wrong. Check your connection.', 'bad');
    } finally {
      ld.close();
      busy = false;
    }
  }

  function difficultyPicker(sel, scope) {
    return `<div class="diff-grid">${Object.entries(PH.DIFFICULTIES).map(([k, d]) => `
      <button class="diff diff-${k} ${sel === k ? 'on' : ''}" data-act="pick-diff" data-scope="${scope}" data-key="${k}">
        <b>${esc(d.name)}</b><span class="fine">${esc(d.desc)}</span></button>`).join('')}</div>`;
  }

  // ---------- region picker ----------
  function regionPicker(sel, scope) {
    const total = PH.REGIONS.filter(r => sel[r.key]).reduce((s, r) => s + r.to - r.from + 1, 0);
    return `<div class="regions" data-scope="${scope}">
      <div class="region-grid">${PH.REGIONS.map(r => `
        <label class="region ${sel[r.key] ? 'on' : ''}">
          <input type="checkbox" data-region="${r.key}" data-scope="${scope}" ${sel[r.key] ? 'checked' : ''}>
          <span class="check"></span>
          <span class="rtext"><span class="rname">${esc(r.name)}</span><span class="rmeta">Gen ${r.gen} · #${r.from}–${r.to} · ${r.to - r.from + 1}</span></span>
        </label>`).join('')}
      </div>
      <div class="region-foot">
        <span class="region-total">${total.toLocaleString()} Pokémon in the pool</span>
        <span><button class="btn sm ghost" data-act="regions-all" data-scope="${scope}">All</button>
        ${scope === 'ng' ? `<button class="btn sm ghost" data-act="regions-none" data-scope="${scope}">None</button>` : ''}</span>
      </div>
    </div>`;
  }

  function refreshRegionTotal(container, sel) {
    const total = PH.REGIONS.filter(r => sel[r.key]).reduce((s, r) => s + r.to - r.from + 1, 0);
    const el = container.querySelector('.region-total');
    if (el) el.textContent = `${total.toLocaleString()} Pokémon in the pool`;
  }

  // ---------- cards ----------
  function monCard(m, o = {}) {
    const r = G.ratings(m), ov = G.ovr(m), abil = PH.ABILITIES[m.ability];
    const slots = G.moveSlots(m.level);
    const moves = m.moves.map((n, i) => {
      const mv = PH.MOVES[n];
      if (!mv) return '';
      const kind = PH.KINDS[mv.kind];
      const tip = `${kind.label} · ${mv.type} · power ${mv.power}`;
      return i >= slots
        ? `<span class="move locked" title="Unlocks at Lv ${G.MOVE_UNLOCKS[i]}: ${esc(PH.pretty(n))} (${esc(tip)})">🔒 Lv ${G.MOVE_UNLOCKS[i]}</span>`
        : `<span class="move" style="--tc:${PH.TYPE_COLORS[mv.type]}" title="${esc(tip)}">${kind.icon} ${P(n)}</span>`;
    }).join('');
    const stats = STAT_LABELS.map(([k, l]) => `<div class="stat"><span>${l}</span>${bar(r[k] / 2)}<b>${r[k]}</b></div>`).join('');
    const isRoster = o.mode === 'roster';
    const star = isRoster
      ? `<button class="star ${m.starter ? 'on' : ''}" data-act="star" data-uid="${m.uid}" title="${m.starter ? 'Starter (click to bench)' : 'Bench (click to start)'}">${m.starter ? '★' : '☆'}</button>`
      : '';

    let foot = '';
    if (isRoster) {
      const ppg = m.stats.gp ? (m.stats.pts / m.stats.gp).toFixed(1) : '–';
      foot = `
        <div class="row"><span class="lbl">Stamina</span>${bar(m.stamina, 'stam ' + staminaCls(m.stamina))}<b class="num">${m.stamina}</b></div>
        <label class="row"><span class="lbl">Training</span>
          <select data-focus-uid="${m.uid}">${FOCI.map(([k, l]) => `<option value="${k}" ${m.focus === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${heldItemRow(m)}
        <div class="card-foot">
          <span class="fine">${$m(G.salary(m))}/wk · ${ppg} PPG</span>
          <label class="fine ever" title="Holding an Everstone stops evolution"><input type="checkbox" data-everstone-uid="${m.uid}" ${m.everstone ? 'checked' : ''}> Everstone</label>
          <button class="btn sm ghost" data-act="mart-for" data-uid="${m.uid}" title="Medicine and Move Tutor">🛒 Mart</button>
          <button class="btn sm ghost" data-act="release" data-uid="${m.uid}">Release</button>
        </div>`;
    } else if (o.mode === 'prospect') {
      foot = `<div class="card-foot"><span class="fine">Fee <b>${$m(G.fee(m))}</b> · ${$m(G.salary(m))}/wk</span>
        <button class="btn sm primary" data-act="sign" data-uid="${m.uid}">Sign</button></div>`;
    } else if (o.mode === 'draft') {
      foot = `<div class="card-foot"><span class="fine">BST ${G.bst(m)}</span><span class="pick-tag">${o.selected ? '✓ Picked' : 'Tap to pick'}</span></div>`;
    }

    const xp = isRoster ? `<div class="row"><span class="lbl">XP</span>${bar(m.xp / G.xpNeed(m.level) * 100, 'xp')}<b class="num">${m.xp}/${G.xpNeed(m.level)}</b></div>` : '';
    return `<div class="card mon ${o.selected ? 'sel' : ''} ${o.mode === 'draft' ? 'pickable' : ''}" ${o.mode === 'draft' ? `data-act="draft-pick" data-uid="${m.uid}"` : ''}>
      <div class="mon-head">
        <div class="spr-wrap">${img(m.sprite)}</div>
        <div class="mon-id">
          <div class="mon-name">${P(m.name)} ${star}</div>
          <div class="types">${m.types.map(typeBadge).join('')}</div>
          <div class="lv">Lv <b>${m.level}</b> · OVR <b>${ov}</b> <span class="fine">#${m.id}</span></div>
        </div>
      </div>
      ${xp}
      <div class="stats">${stats}</div>
      <div class="ability" title="${esc(abil ? abil.desc : 'No court effect')}"><b>${P(m.ability)}</b> <span>${esc(abil ? abil.desc : 'No court effect')}</span></div>
      <div class="moves">${moves}</div>
      ${foot}
    </div>`;
  }

  function heldItemRow(m) {
    const S = G.state();
    const bag = Object.entries(S.items || {}).filter(([k, n]) => n > 0 && k !== m.item && PH.ITEMS[k]);
    const cur = m.item && PH.ITEMS[m.item];
    return `<label class="row item-row" title="${esc(cur ? cur.desc : 'Buy held items in the Mart')}"><span class="lbl">Item</span>
      <span class="item-pick">${cur ? itemImg(m.item) : ''}<select data-item-uid="${m.uid}">
        <option value="">${bag.length || cur ? '— None —' : '— None (buy in Mart) —'}</option>
        ${cur ? `<option value="${m.item}" selected>${esc(cur.name)}</option>` : ''}
        ${bag.map(([k, n]) => `<option value="${k}">${esc(PH.ITEMS[k].name)} (×${n})</option>`).join('')}
      </select></span></label>
      ${cur ? `<div class="item-desc fine">${esc(cur.desc)}</div>` : ''}`;
  }

  const miniTeam = (mons, cls = '') => `<div class="mini-team ${cls}">${mons.map(p => `<div class="mini" title="${P(p.name)} · Lv ${p.level}">${img(p.sprite)}<span>Lv${p.level}</span></div>`).join('')}</div>`;

  // ---------- screens ----------
  function renderTitle() {
    const S = G.state();
    app.innerHTML = `<div class="title-screen">
      <div class="panel title-card">
        <div class="logo-ball"></div>
        <h1 class="logo">POKÉ HOOPS<br><span>CLUB</span></h1>
        <p class="tagline">Scout Pokémon. Train them up. Win the league.</p>
        <div class="title-actions">
          ${S && S.phase ? `<button class="btn big primary" data-act="continue">▶ Continue<small>${esc(S.club)} · Season ${S.season} · ${esc(G.weekLabel())}</small></button>` : ''}
          <button class="btn big" data-act="new-game-form">New Game</button>
          <label class="btn big ghost">Load Save File<input type="file" accept=".json,application/json" data-change="import" hidden></label>
        </div>
        <div id="newgame"></div>
        <p class="fine credits">Pokémon data and sprites from <a href="https://pokeapi.co" target="_blank" rel="noopener">PokéAPI</a>. A fan project. Pokémon © Nintendo / Creatures / GAME FREAK.</p>
      </div>
    </div>`;
  }

  function renderNewGameForm(name) {
    $('#newgame').innerHTML = `<div class="panel inset newgame">
      <label class="field"><span>Club name</span><input id="club-name" maxlength="24" value="${esc(name || 'Pallet Town Hoopers')}"></label>
      <h3>Difficulty</h3>
      ${difficultyPicker(ngDifficulty, 'ng')}
      <h3>Regions</h3>
      <p class="fine">Only Pokémon from checked regions show up in your draft, scouting and rival teams. You can change this later in Settings.</p>
      ${regionPicker(ngRegions, 'ng')}
      <button class="btn big primary wide" data-act="start-new">Start Draft ▶</button>
    </div>`;
  }

  function renderDraft() {
    const S = G.state();
    const n = draftSel.size;
    app.innerHTML = `<div class="panel">
      <h2>Opening Draft</h2>
      <p>Pick <b>5 or 6</b> Pokémon to found <b>${esc(S.club)}</b>. Starters for the first season of the ${esc(PH.TIERS[S.tier].name)}.</p>
      <div class="grid">${S.draft.map(m => monCard(m, { mode: 'draft', selected: draftSel.has(m.uid) })).join('')}</div>
      <div class="sticky-actions">
        <button class="btn" data-act="redraft">↻ Re-roll prospects</button>
        <span class="fine">${n}/6 picked</span>
        <button class="btn big primary" data-act="confirm-draft" ${n < 5 ? 'disabled' : ''}>Confirm Team ▶</button>
      </div>
    </div>`;
  }

  function header(S) {
    return `<header class="hud panel">
      <div class="club"><div class="crest">🏀</div><div>
        <div class="club-name">${esc(S.club)}</div>
        <div class="club-sub">${esc(PH.TIERS[S.tier].name)} · Season ${S.season} · ${esc(G.weekLabel())} · ${esc(G.difficulty().name)}</div></div></div>
      <div class="hud-stats">
        <span class="chip ${S.money < 0 ? 'neg' : ''}">💰 ${$m(S.money)}</span>
        <span class="chip">🎟️ ${S.fans.toLocaleString()}</span>
        <button class="chip btn-chip" data-act="save" title="Save to this browser">💾 Save</button>
        <button class="chip btn-chip" data-act="title" title="Back to title screen">⏏</button>
      </div>
    </header>`;
  }

  const TABS = [['club', '🏠 Club'], ['roster', '📋 Roster'], ['scout', '🔭 Scout'], ['mart', '🛒 Mart'], ['facilities', '🏗️ Facilities'], ['league', '🏆 League'], ['settings', '⚙️ Settings']];

  function render() {
    const S = G.state();
    if (!started || !S) return renderTitle();
    if (S.phase === 'draft') return renderDraft();
    app.innerHTML = `${header(S)}
      <nav class="tabs">${TABS.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
      <main>${VIEWS[tab](S)}</main>`;
  }

  // ---------- views ----------
  function viewClub(S) {
    let main;
    if (S.phase === 'offseason') main = offseasonCard(S);
    else {
      const ng = G.nextGame();
      main = ng ? matchupCard(S, ng) : `<div class="panel matchup">
        <div class="mu-title">${esc(G.weekLabel())}</div>
        <p>You're not playing this week. Keep training and watch the bracket.</p>
        <button class="btn big primary wide" data-act="play">▶ Advance week</button></div>`;
    }
    const me = S.league.table.you;
    const st = G.starters(G.myTeam());
    const lastResults = S.league.results.filter(r => r.h === 'you' || r.a === 'you').slice(-5).reverse();
    return `<div class="cols">
      <div>
        ${main}
        <div class="panel">
          <div class="panel-head"><h3>Starting five</h3><a class="link" data-act="tab" data-tab="roster">Manage roster →</a></div>
          <div class="starter-list">${st.map(p => `<div class="starter">
            ${img(p.sprite)}<div class="s-info"><b>${P(p.name)}</b><span class="fine">Lv ${p.level} · OVR ${G.ovr(p)} · ${esc((FOCI.find(f => f[0] === p.focus) || FOCI[0])[1].split(' ')[0])}</span>
            ${bar(p.stamina, 'stam ' + staminaCls(p.stamina))}</div></div>`).join('')}</div>
          <div class="focus-all"><span class="fine">Set whole team to:</span>${FOCI.slice(0, 6).concat([['rest', 'Rest']]).map(([k, l]) => `<button class="btn sm ghost" data-act="focus-all" data-focus="${k}">${l}</button>`).join('')}</div>
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>Record</h3>
          <div class="record"><span>${me.w}<small>W</small></span><span>${me.l}<small>L</small></span><span>${me.pf - me.pa >= 0 ? '+' : ''}${me.pf - me.pa}<small>DIFF</small></span></div>
          ${lastResults.length ? `<ul class="results">${lastResults.map(r => {
            const home = r.h === 'you', mine = home ? r.hs : r.as, theirs = home ? r.as : r.hs;
            return `<li class="${mine > theirs ? 'w' : 'l'}"><b>${mine > theirs ? 'W' : 'L'}</b> ${mine}–${theirs} ${home ? 'vs' : '@'} ${esc(G.team(home ? r.a : r.h).name)}</li>`;
          }).join('')}</ul>` : '<p class="fine">No games yet.</p>'}
        </div>
        <div class="panel">
          <h3>Club news</h3>
          <ul class="news">${S.news.slice(0, 10).map(n => `<li><span class="fine">${esc(n.when)}</span> ${esc(n.text)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>`;
  }

  function matchupCard(S, ng) {
    const myStarters = G.starters(G.myTeam());
    const oppStarters = G.starters(ng.opp);
    const ot = S.league.table[ng.opp.id];
    return `<div class="panel matchup">
      <div class="mu-title">${esc(G.weekLabel())} · ${ng.isHome ? 'Home game' : 'Away game'}</div>
      <div class="mu-row">
        <div class="mu-team"><div class="mu-name">${esc(S.club)}</div>${miniTeam(myStarters, 'home')}<div class="mu-ovr">Team OVR <b>${G.teamOvr(G.myTeam())}</b></div></div>
        <div class="vs">VS</div>
        <div class="mu-team"><div class="mu-name">${esc(ng.opp.name)} ${typeBadge(ng.opp.type)}</div>${miniTeam(oppStarters, 'away')}<div class="mu-ovr">Team OVR <b>${G.teamOvr(ng.opp)}</b> · ${ot.w}–${ot.l}</div></div>
      </div>
      <button class="btn big primary wide" data-act="play" ${S.roster.length < G.ROSTER_MIN ? 'disabled' : ''}>▶ Play ${esc(G.weekLabel())}</button>
    </div>`;
  }

  function offseasonCard(S) {
    const s = S.summary || {};
    const moved = s.move > 0 ? `<p class="good big-msg">⬆ Promoted to the ${esc(PH.TIERS[S.tier].name)}!</p>`
      : s.move < 0 ? `<p class="bad big-msg">⬇ Relegated to the ${esc(PH.TIERS[S.tier].name)}.</p>` : '';
    return `<div class="panel matchup">
      <div class="mu-title">Season ${s.season} complete</div>
      ${s.champ ? '<div class="trophy">🏆</div><p class="big-msg good">LEAGUE CHAMPIONS!</p>' : `<p>Champion: <b>${esc(s.champion || '')}</b></p>`}
      <p>Regular season finish: <b>#${s.rank}</b> · Prize money: <b>${$m(s.prize || 0)}</b></p>
      ${moved}
      ${S.hall.length ? `<p class="fine">Hall of Fame entries: ${S.hall.length}</p>` : ''}
      <p class="fine">Rival rosters for next season are drawn from your current region settings.</p>
      <button class="btn big primary wide" data-act="next-season">Start Season ${S.season + 1} ▶</button>
    </div>`;
  }

  function viewRoster(S) {
    const starters = S.roster.filter(p => p.starter).length;
    const sorted = S.roster.slice().sort((a, b) => (b.starter - a.starter) || (G.ovr(b) - G.ovr(a)));
    return `<div class="panel">
      <div class="panel-head"><h2>Roster</h2>
        <span class="fine">${S.roster.length}/${G.ROSTER_MAX} Pokémon · Starters ${starters}/5 · Salaries ${$m(G.payrollTotal())}/wk</span></div>
      <p class="fine">★ marks a starter. Tired Pokémon get subbed out at quarter breaks. Special plays unlock at Lv ${G.MOVE_UNLOCKS.join(', ')}.</p>
      <div class="grid">${sorted.map(m => monCard(m, { mode: 'roster' })).join('')}</div>
    </div>`;
  }

  function viewScout(S) {
    const enabled = PH.REGIONS.filter(r => S.regions[r.key]);
    if (scoutRegion && !S.regions[scoutRegion]) scoutRegion = '';
    return `<div class="panel">
      <div class="panel-head"><h2>Scouting</h2><span class="fine">Roster ${S.roster.length}/${G.ROSTER_MAX}</span></div>
      <p>Send scouts out to find ${2 + S.facilities.scout} prospects. In the ${esc(PH.TIERS[S.tier].name)} they find Pokémon up to <b>${G.scoutMaxBst()} BST</b> (base stat total). Upgrade the Scout Office or move up a league for stronger finds.</p>
      <div class="scout-bar">
        <label class="field inline"><span>Region</span>
          <select id="scout-region">
            <option value="">Any checked region</option>
            ${enabled.map(r => `<option value="${r.key}" ${scoutRegion === r.key ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
          </select></label>
        <button class="btn primary" data-act="scout" ${S.money < G.scoutCost() ? 'disabled' : ''}>🔭 Scout (${$m(G.scoutCost())})</button>
      </div>
      ${S.prospects.length ? `<div class="grid">${S.prospects.map(m => monCard(m, { mode: 'prospect' })).join('')}</div>`
        : '<p class="fine empty">No prospects right now. Go scouting!</p>'}
    </div>`;
  }

  function viewMart(S) {
    if (!S.roster.some(x => x.uid === martMon)) martMon = S.roster[0] && S.roster[0].uid;
    const p = S.roster.find(x => x.uid === martMon);
    const lockTag = tier => `<span class="lock">🔒 ${esc(PH.TIERS[tier].name)}</span>`;
    const itemCard = ([k, it]) => {
      const open = G.itemUnlocked(k), owned = S.items[k] || 0, held = S.roster.filter(x => x.item === k).length;
      return `<div class="card shop-item ${open ? '' : 'locked'}">
        <div class="si-head">${itemImg(k)}<div><b>${esc(it.name)}</b><div class="fine">${esc(it.desc)}</div></div></div>
        <div class="si-foot"><span class="fine">${owned ? `In bag ×${owned}` : ''}${held ? `${owned ? ' · ' : ''}Held ×${held}` : ''}</span>
          ${open ? `<button class="btn sm primary" data-act="buy-item" data-key="${k}" ${S.money < it.cost ? 'disabled' : ''}>Buy ${$m(it.cost)}</button>` : lockTag(it.tier)}</div>
      </div>`;
    };
    const items = Object.entries(PH.ITEMS).sort((a, b) => a[1].tier - b[1].tier || a[1].cost - b[1].cost);
    const general = items.filter(([, it]) => !it.fx.typeBoost), boosters = items.filter(([, it]) => it.fx.typeBoost);

    let medTutor = '<p class="fine">Sign some Pokémon first.</p>';
    if (p) {
      const slots = G.moveSlots(p.level);
      const meds = Object.entries(PH.MEDICINE).map(([k, med]) => {
        const price = G.medicinePrice(p, k);
        return `<div class="card shop-item">
          <div class="si-head">${itemImg(k)}<div><b>${esc(med.name)}</b><div class="fine">${esc(med.desc)}${med.stat ? ' · pricier each dose' : ''}</div></div></div>
          <div class="si-foot"><span></span><button class="btn sm primary" data-act="use-med" data-key="${k}" ${S.money < price ? 'disabled' : ''}>Use ${$m(price)}</button></div>
        </div>`;
      }).join('');
      if (tutorSlot > 3) tutorSlot = 0;
      const slotChips = p.moves.map((n, i) => {
        const mv = PH.MOVES[n];
        const tutored = p.tutored && p.tutored[i] === n;
        return `<button class="slot-chip ${tutorSlot === i ? 'on' : ''}" data-act="tutor-slot" data-slot="${i}" style="--tc:${PH.TYPE_COLORS[mv.type]}">
          <span class="fine">Slot ${i + 1}${i >= slots ? ` · Lv ${G.MOVE_UNLOCKS[i]}` : ''}${tutored ? ' · tutored' : ''}</span>
          <b>${PH.KINDS[mv.kind].icon} ${P(n)}</b></button>`;
      }).join('');
      const learnable = [...new Set(p.learn)].map(n => PH.MOVES[n]).filter(m => m && !p.moves.includes(m.name))
        .sort((a, b) => G.tutorTier(a) - G.tutorTier(b) || b.power - a.power);
      const rows = learnable.map(m => {
        const price = G.tutorPrice(m), locked = G.tutorTier(m) > S.tier;
        const stab = p.types.includes(m.type);
        return `<div class="tutor-row ${locked ? 'locked' : ''}">
          <span class="move" style="--tc:${PH.TYPE_COLORS[m.type]}">${PH.KINDS[m.kind].icon} ${P(m.name)}</span>
          <span class="fine">${esc(PH.KINDS[m.kind].label)} · power ${m.power}${stab ? ' · <b class="good">same type</b>' : ''}</span>
          ${locked ? lockTag(G.tutorTier(m)) : `<button class="btn sm primary" data-act="teach" data-move="${m.name}" ${S.money < price ? 'disabled' : ''}>Teach ${$m(price)}</button>`}
        </div>`;
      }).join('');
      medTutor = `
        <div class="mon-picker">${S.roster.map(x => `<button class="mp ${x.uid === martMon ? 'on' : ''}" data-act="mart-mon" data-uid="${x.uid}">${icon(x)}<span>${P(x.name)}</span><small>Lv ${x.level}</small></button>`).join('')}</div>
        <h3>Medicine for ${P(p.name)}</h3>
        <div class="grid shop-grid">${meds}</div>
        <h3>Move Tutor</h3>
        <p class="fine">Pick a slot to replace, then teach any move ${P(p.name)} can learn. Tutored moves stay through evolution. Slots still unlock at their level.</p>
        <div class="slot-row">${slotChips}</div>
        <div class="tutor-list">${rows || '<p class="fine">No other moves to learn.</p>'}</div>`;
    }

    return `<div class="panel">
        <div class="panel-head"><h2>Poké Mart</h2><span class="fine">New stock unlocks each time you move up a league</span></div>
        <h3>Held items</h3>
        <p class="fine">Each Pokémon can hold one item. Give items from the roster card's Item menu, and swap them freely.</p>
        <div class="grid shop-grid">${general.map(itemCard).join('')}</div>
        <details class="boosters"><summary>Type boosters (${boosters.length})</summary>
          <div class="grid shop-grid">${boosters.map(itemCard).join('')}</div></details>
      </div>
      <div class="panel">${medTutor}</div>`;
  }

  function viewFacilities(S) {
    return `<div class="panel"><h2>Facilities</h2>
      <div class="grid fac-grid">${Object.entries(PH.FACILITIES).map(([k, f]) => {
        const lvl = S.facilities[k], cost = G.facilityCost(k);
        return `<div class="card fac">
          <div class="fac-icon">${f.icon}</div>
          <div class="fac-name">${esc(f.name)}</div>
          <div class="pips">${Array.from({ length: PH.FACILITY_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
          <p>${esc(f.desc(lvl))}</p>
          ${cost == null ? '<p class="fine good">MAX LEVEL</p>' : `<p class="fine">Next: ${esc(f.desc(lvl + 1))}</p>
            <button class="btn primary" data-act="upgrade" data-key="${k}" ${S.money < cost ? 'disabled' : ''}>Upgrade · ${$m(cost)}</button>`}
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  function viewLeague(S) {
    const L = S.league, T = L.table;
    const table = G.standings().map((t, i) => {
      const r = T[t.id];
      return `<tr class="${t.isPlayer ? 'me' : ''} ${i < 4 ? 'po' : ''}">
        <td>${i + 1}</td>
        <td><a class="link" data-act="view-team" data-id="${t.id}">${esc(t.name)}</a> ${t.type ? typeBadge(t.type) : ''}</td>
        <td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.pf - r.pa >= 0 ? '+' : ''}${r.pf - r.pa}</td><td>${G.teamOvr(t)}</td></tr>`;
    }).join('');

    let bracket = '';
    if (L.playoffs) {
      const res = (h, a) => L.results.find(r => r.phase === 'playoffs' && r.h === h && r.a === a);
      const line = ([h, a]) => {
        const r = res(h, a);
        return `<div class="bracket-game"><span class="${r && r.hs > r.as ? 'win' : ''}">${esc(G.team(h).name)} ${r ? r.hs : ''}</span><span class="${r && r.as > r.hs ? 'win' : ''}">${esc(G.team(a).name)} ${r ? r.as : ''}</span></div>`;
      };
      bracket = `<div class="panel"><h3>Playoffs</h3><div class="bracket">
        <div><div class="fine">Semifinals</div>${L.playoffs.semis.map(line).join('')}</div>
        <div><div class="fine">Final</div>${L.playoffs.final ? line(L.playoffs.final) : '<div class="bracket-game tbd">TBD</div>'}</div>
        <div><div class="fine">Champion</div><div class="bracket-game champ">${L.playoffs.champion ? '🏆 ' + esc(G.team(L.playoffs.champion).name) : 'TBD'}</div></div>
      </div></div>`;
    }

    const mine = L.schedule.map((g, i) => {
      const game = g.find(([h, a]) => h === 'you' || a === 'you');
      const home = game[0] === 'you', opp = G.team(home ? game[1] : game[0]);
      const r = L.results.find(x => x.week === i + 1 && x.phase === 'regular' && (x.h === 'you' || x.a === 'you'));
      let out = '';
      if (r) {
        const ms = home ? r.hs : r.as, ts = home ? r.as : r.hs;
        out = `<b class="${ms > ts ? 'good' : 'bad'}">${ms > ts ? 'W' : 'L'} ${ms}–${ts}</b>`;
      }
      return `<li class="${S.phase === 'regular' && S.week === i + 1 ? 'now' : ''}"><span class="fine">W${i + 1}</span> ${home ? 'vs' : '@'} ${esc(opp.name)} ${out}</li>`;
    }).join('');

    const vt = viewTeam && G.team(viewTeam);
    const detail = vt ? `<div class="panel"><div class="panel-head"><h3>${esc(vt.name)}</h3><a class="link" data-act="view-team" data-id="">Close</a></div>
      <div class="grid">${G.teamRoster(vt).slice().sort((a, b) => G.ovr(b) - G.ovr(a)).map(m => monCard(m, { mode: 'rival' })).join('')}</div></div>` : '';

    return `<div class="cols">
      <div>
        <div class="panel"><div class="panel-head"><h2>${esc(PH.TIERS[S.tier].name)}</h2><span class="fine">Top 4 make the playoffs · top 2 or the champion move up · click a team to scout it</span></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/-</th><th>OVR</th></tr></thead><tbody>${table}</tbody></table></div>
        </div>
        ${bracket}
        ${detail}
      </div>
      <div><div class="panel"><h3>Your schedule</h3><ul class="schedule">${mine}</ul></div></div>
    </div>`;
  }

  function viewSettings(S) {
    return `<div class="cols">
      <div>
        <div class="panel"><h2>Regions</h2>
          <p class="fine">Checked regions supply your scouting prospects right away, and rival rosters from next season on. Evolutions are always allowed.</p>
          ${regionPicker(S.regions, 'settings')}
        </div>
        <div class="panel"><h2>Difficulty</h2>
          <p class="fine">Income and rival shooting change right away. Rival levels and strength update when the next season's league is drawn.</p>
          ${difficultyPicker(S.difficulty || 'normal', 'settings')}
        </div>
        <div class="panel"><h2>Club</h2>
          <label class="field inline"><span>Club name</span><input id="rename" maxlength="24" value="${esc(S.club)}"></label>
          <button class="btn sm" data-act="rename">Rename</button>
        </div>
      </div>
      <div>
        <div class="panel"><h2>Save file</h2>
          <p class="fine">The game autosaves to this browser after every week. Export a save file to back it up or move it to another browser.</p>
          <div class="btn-row">
            <button class="btn" data-act="save">💾 Save now</button>
            <button class="btn" data-act="export">⬇ Export save file</button>
            <label class="btn">⬆ Load save file<input type="file" accept=".json,application/json" data-change="import" hidden></label>
          </div>
        </div>
        <div class="panel"><h2>Data</h2>
          <p class="fine">${PH.api.cacheCount()} Pokémon cached from PokéAPI in this browser.</p>
          <button class="btn sm ghost" data-act="clear-cache">Clear Pokémon cache</button>
        </div>
        <div class="panel danger"><h2>Danger zone</h2>
          <button class="btn sm primary" data-act="reset">Delete save &amp; start over</button>
        </div>
      </div>
    </div>`;
  }

  const VIEWS = { club: viewClub, roster: viewRoster, scout: viewScout, mart: viewMart, facilities: viewFacilities, league: viewLeague, settings: viewSettings };

  // ---------- match playback ----------
  let pb = null;

  function playback(my, report) {
    const { res, home, away } = my;
    const youTag = home.isPlayer ? 'H' : 'A';
    const names = { H: home.name, A: away.name };
    modalRoot.innerHTML = `<div class="overlay match"><div class="match-wrap panel">
      <div class="scoreboard">
        <div class="sb-team H ${youTag === 'H' ? 'you' : ''}">${esc(home.name)}</div>
        <div class="sb-center">
          <div class="sb-clock" id="sClock">12:00</div>
          <div class="sb-score"><span id="sH">0</span><span class="sb-q" id="sQ">Q1</span><span id="sA">0</span></div>
        </div>
        <div class="sb-team A ${youTag === 'A' ? 'you' : ''}">${esc(away.name)}</div>
      </div>
      <div class="match-stage" id="stage">
        <aside class="live-box H" id="lbH"></aside>
        <div class="court-col">
          <div class="court-wrap" id="court"><canvas id="court-canvas" width="384" height="216"></canvas></div>
          <div class="match-controls" id="mctl">
            <span class="fine">Speed</span>
            ${[1, 2, 4, 8].map(s => `<button class="btn sm ${s === speed ? 'on' : 'ghost'}" data-act="speed" data-speed="${s}">${s}×</button>`).join('')}
            <button class="btn sm primary" data-act="skip">Skip ⏭</button>
          </div>
          <div class="ticker" id="ticker"></div>
        </div>
        <aside class="live-box A" id="lbA"></aside>
      </div>
      <div id="match-result"></div>
    </div></div>`;

    // Live box score, tallied from each play as it's shown.
    const order = { H: res.box.H.map(b => b.uid), A: res.box.A.map(b => b.uid) };
    const live = {};
    Object.keys(res.info).forEach(u => { live[u] = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }; });
    let heatNow = {}, fireNow = new Set();
    const onCourt = { H: new Set(), A: new Set() };
    const score = { H: 0, A: 0 };
    let flash = null;

    function renderBox(tag, final) {
      const rows = order[tag].map(u => ({ u, info: res.info[u], s: final ? res.box[tag].find(b => b.uid === u) : live[u] }));
      if (!final) rows.sort((a, b) => onCourt[tag].has(b.u) - onCourt[tag].has(a.u));
      else rows.sort((a, b) => b.s.pts - a.s.pts || b.s.min - a.s.min);
      const sum = k => rows.reduce((t, r) => t + r.s[k], 0);
      $('#lb' + tag).innerHTML = `
        <div class="lb-head ${tag === youTag ? 'you' : ''}"><span>${esc(names[tag])}</span><b>${final ? (tag === 'H' ? res.hs : res.as) : score[tag]}</b></div>
        <table class="lb"><thead><tr><th>${final ? 'Final' : 'On court ●'}</th>${final ? '<th>MIN</th>' : ''}<th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="${!final && onCourt[tag].has(r.u) ? 'on' : ''} ${flash === r.u ? 'flash' : ''}">
          <td class="who">${icon(r.info)}<div class="who-txt"><span class="nm">${!final && fireNow.has(r.u) ? '🔥 ' : ''}${esc(r.info.name)}</span>
            ${final ? '' : `<span class="heat ${fireNow.has(r.u) ? 'fire' : ''}" title="Heat ${heatNow[r.u] || 0}/100"><i style="width:${heatNow[r.u] || 0}%"></i></span>`}</div></td>
          ${final ? `<td>${Math.round(r.s.min / res.totalPoss * 48)}</td>` : ''}
          <td><b>${r.s.pts}</b></td><td>${r.s.reb}</td><td>${r.s.ast}</td><td>${r.s.stl}</td><td>${r.s.blk}</td></tr>`).join('')}
        </tbody><tfoot><tr><td>Team</td>${final ? '<td></td>' : ''}<td>${sum('pts')}</td><td>${sum('reb')}</td><td>${sum('ast')}</td><td>${sum('stl')}</td><td>${sum('blk')}</td></tr></tfoot></table>`;
    }

    function tally(ev) {
      const st = live[ev.actor];
      flash = ev.actor;
      if (ev.kind === 'score' && st) {
        st.pts += ev.pts;
        if (ev.putback) st.reb++;
        else if (live[ev.helper]) live[ev.helper].ast++;
      } else if (ev.kind === 'miss' && live[ev.reb]) {
        live[ev.reb].reb++;
        flash = ev.reb;
      } else if (ev.kind === 'steal' && st) st.stl++;
      else if (ev.kind === 'block' && st) st.blk++;
      else flash = null;
      if (ev.kind === 'hot') flash = ev.actor;
      if (ev.heat) heatNow = ev.heat;
      if (ev.fire) fireNow = new Set(ev.fire);
      if (ev.lineups) ['H', 'A'].forEach(t => { if (ev.lineups[t]) onCourt[t] = new Set(ev.lineups[t]); });
      score.H = ev.score[0];
      score.A = ev.score[1];
    }

    renderBox('H');
    renderBox('A');
    const ticker = $('#ticker');
    const clockEl = $('#sClock');
    const fmtClock = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const court = new PH.Court($('#court-canvas'), { info: res.info, youTag, names, onClock: t => { clockEl.textContent = fmtClock(t); } });
    court.speed = speed;
    pb = { court };

    function onEvent(ev) {
      if (ev.kind === 'quarter') $('#sQ').textContent = ev.q > 4 ? 'OT' : 'Q' + ev.q;
      $('#sH').textContent = ev.score[0];
      $('#sA').textContent = ev.score[1];
      tally(ev);
      renderBox('H');
      renderBox('A');
      const line = document.createElement('div');
      line.className = `tk ${ev.side || ''} tk-${ev.kind}`;
      line.innerHTML = `<span class="tk-num">${ev.score[0]}–${ev.score[1]}</span> ${esc(ev.text)}`;
      ticker.prepend(line);
      while (ticker.children.length > 60) ticker.lastChild.remove();
    }

    return new Promise(resolve => {
      pb.resolve = resolve;
      court.run(res.events, onEvent).then(() => {
        court.destroy();
        $('#sH').textContent = res.hs;
        $('#sA').textContent = res.as;
        $('#sQ').textContent = 'FINAL';
        clockEl.textContent = '0:00';
        flash = null;
        renderBox('H', true);
        renderBox('A', true);
        showMatchResult(my, report, youTag);
      });
    });
  }

  function reportHtml(r) {
    const net = r.money.reduce((s, x) => s + x.amount, 0);
    const parts = [];
    if (r.evolutions.length) {
      parts.push(r.evolutions.map(e => `<div class="evo">
        <p>What? <b>${esc(e.from)}</b> is evolving!</p>
        <div class="evo-row">${img(e.fromSprite)}<span class="arrow">➜</span>${img(e.toSprite, 'evo-new')}</div>
        <p>Congratulations! It evolved into <b>${esc(e.to)}</b>!</p></div>`).join(''));
    }
    if (r.summary) {
      const s = r.summary;
      parts.push(`<div class="season-end"><h3>${s.champ ? '🏆 CHAMPIONS!' : 'Season over'}</h3>
        <p>Finished #${s.rank} · Prize ${$m(s.prize)}${s.move > 0 ? ' · Promoted!' : s.move < 0 ? ' · Relegated' : ''}</p></div>`);
    }
    if (r.note) parts.push(`<p class="note">${esc(r.note)}</p>`);
    const lines = [];
    r.levelUps.forEach(l => lines.push(`<li>${img(l.sprite)} <b>${esc(l.name)}</b> grew to Lv ${l.to}!</li>`));
    r.newMoves.forEach(m => lines.push(`<li>✨ <b>${esc(m.name)}</b> unlocked <b>${esc(m.move)}</b>!</li>`));
    if (lines.length) parts.push(`<ul class="rep-list">${lines.join('')}</ul>`);
    parts.push(`<div class="money-lines">${r.money.map(m => `<div><span>${esc(m.label)}</span><b class="${m.amount < 0 ? 'bad' : 'good'}">${m.amount < 0 ? '' : '+'}${$m(m.amount)}</b></div>`).join('')}
      ${r.fans ? `<div><span>New fans</span><b class="good">+${r.fans}</b></div>` : ''}
      <div class="total"><span>Net this week</span><b class="${net < 0 ? 'bad' : 'good'}">${net < 0 ? '' : '+'}${$m(net)}</b></div></div>`);
    if (r.others.length) {
      parts.push(`<details class="others"><summary>Around the league</summary><ul>${r.others.map(o => `<li>${esc(o.h)} <b>${o.hs}</b> – <b>${o.as}</b> ${esc(o.a)}</li>`).join('')}</ul></details>`);
    }
    return parts.join('');
  }

  function showMatchResult(my, report, youTag) {
    const { res } = my;
    const mine = youTag === 'H' ? res.hs : res.as, theirs = youTag === 'H' ? res.as : res.hs;
    const won = mine > theirs;
    $('#stage').classList.add('done');
    $('#match-result').innerHTML = `<div class="result ${won ? 'win' : 'loss'}">
      <h2>${won ? 'VICTORY!' : 'DEFEAT'}</h2>
      <p class="final">${mine} – ${theirs}${res.periods > 4 ? ' (OT)' : ''}</p>
      ${reportHtml(report)}
      <button class="btn big primary wide" data-act="match-continue">Continue ▶</button>
    </div>`;
    $('#match-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showReport(report) {
    modalRoot.innerHTML = `<div class="overlay"><div class="panel report-box">
      <h2>${esc(report.label)}</h2>
      <p>Your club didn't play this week.</p>
      ${reportHtml(report)}
      <button class="btn big primary wide" data-act="match-continue">Continue ▶</button>
    </div></div>`;
    return new Promise(resolve => { pb = { resolve }; });
  }

  // ---------- actions ----------
  const handlers = {
    tab: el => { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    continue: () => { started = true; tab = 'club'; render(); },
    title: () => { G.save(); started = false; render(); },
    'new-game-form': () => renderNewGameForm(),
    'regions-all': el => {
      if (el.dataset.scope === 'ng') {
        PH.REGIONS.forEach(r => { ngRegions[r.key] = true; });
        renderNewGameForm($('#club-name').value);
      } else {
        G.setRegions(Object.fromEntries(PH.REGIONS.map(r => [r.key, true])));
        render();
      }
    },
    'pick-diff': el => {
      if (el.dataset.scope === 'ng') {
        ngDifficulty = el.dataset.key;
        renderNewGameForm($('#club-name').value);
      } else {
        G.setDifficulty(el.dataset.key);
        render();
        toast(`Difficulty: ${PH.DIFFICULTIES[el.dataset.key].name}`, 'good');
      }
    },
    'regions-none': () => {
      ngRegions = {};
      renderNewGameForm($('#club-name').value);
    },
    'start-new': async () => {
      const name = $('#club-name').value.trim() || 'Pallet Town Hoopers';
      if (!PH.REGIONS.some(r => ngRegions[r.key])) return toast('Check at least one region.', 'bad');
      if (G.state() && G.state().phase && !confirm('Starting a new game replaces your current save in this browser. Export it first from Settings if you want to keep it. Continue?')) return;
      G.newGame(name, ngRegions, ngDifficulty);
      draftSel.clear();
      started = true;
      await withLoading('Scouting draft prospects…', () => G.draftPool());
      render();
    },
    'draft-pick': el => {
      const u = el.dataset.uid;
      if (draftSel.has(u)) draftSel.delete(u);
      else if (draftSel.size < 6) draftSel.add(u);
      else toast('You can pick up to 6.');
      renderDraft();
    },
    redraft: async () => {
      draftSel.clear();
      await withLoading('Re-rolling prospects…', () => G.draftPool());
      renderDraft();
    },
    'confirm-draft': async () => {
      await withLoading('Building the league…', ld => G.confirmDraft([...draftSel], p => ld.set(p, `Recruiting rival teams… ${Math.round(p * 100)}%`)));
      if (G.state().phase !== 'draft') { draftSel.clear(); tab = 'club'; }
      render();
    },
    play: async () => {
      if (busy) return;
      const out = await withLoading('Training & tipping off…', () => G.playWeek());
      if (!out) return render();
      if (out.my) await playback(out.my, out.report);
      else await showReport(out.report);
      render();
    },
    speed: el => {
      speed = +el.dataset.speed;
      try { localStorage.setItem('pokehoops.speed', speed); } catch (e) { /* ignore */ }
      document.querySelectorAll('[data-act="speed"]').forEach(b => {
        b.classList.toggle('on', +b.dataset.speed === speed);
        b.classList.toggle('ghost', +b.dataset.speed !== speed);
      });
      if (pb && pb.court) pb.court.speed = speed;
    },
    skip: () => {
      if (pb && pb.court) pb.court.skip();
    },
    'match-continue': () => {
      modalRoot.innerHTML = '';
      const r = pb && pb.resolve;
      pb = null;
      if (r) r();
    },
    save: () => {
      const ok = G.save();
      toast(ok ? 'Game saved.' : 'Could not save (browser storage blocked?). Try Export save file.', ok ? 'good' : 'bad');
    },
    star: el => { G.toggleStarter(el.dataset.uid); render(); },
    release: el => {
      const p = G.state().roster.find(x => x.uid === el.dataset.uid);
      if (p && confirm(`Release ${PH.pretty(p.name)}? They'll leave the club for good.`)) { G.release(p.uid); render(); }
    },
    'focus-all': el => { G.setAllFocus(el.dataset.focus); render(); toast('Training plan updated.'); },
    scout: async () => {
      await withLoading('Scouts are out in the tall grass…', () => G.scout(scoutRegion));
      render();
    },
    sign: el => { G.sign(el.dataset.uid); render(); toast('Signed! Welcome to the club.', 'good'); },
    'buy-item': el => { G.buyItem(el.dataset.key); render(); toast(`Bought ${PH.ITEMS[el.dataset.key].name}! Give it to a Pokémon from the Roster tab.`, 'good'); },
    'mart-mon': el => { martMon = el.dataset.uid; tutorSlot = 0; render(); },
    'mart-for': el => { martMon = el.dataset.uid; tutorSlot = 0; tab = 'mart'; render(); window.scrollTo(0, 0); },
    'use-med': el => { const msg = G.useMedicine(martMon, el.dataset.key); render(); if (msg) toast(msg, 'good'); },
    'tutor-slot': el => { tutorSlot = +el.dataset.slot; render(); },
    teach: el => { G.teach(martMon, tutorSlot, el.dataset.move); render(); toast(`Learned ${PH.pretty(el.dataset.move)}!`, 'good'); },
    upgrade: el => { G.upgrade(el.dataset.key); render(); toast('Upgrade complete!', 'good'); },
    'view-team': el => { viewTeam = el.dataset.id || null; render(); },
    'next-season': async () => {
      await withLoading('Drawing up next season…', ld => G.startNextSeason(p => ld.set(p, `Recruiting rival teams… ${Math.round(p * 100)}%`)));
      render();
    },
    rename: () => {
      const v = $('#rename').value.trim();
      if (v) { G.rename(v); render(); toast('Club renamed.'); }
    },
    export: () => {
      const S = G.state();
      const blob = new Blob([G.exportSave()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pokehoops-${S.club.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-s${S.season}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    'clear-cache': () => { PH.api.clearCache(); render(); toast('Cache cleared. Pokémon will be re-downloaded as needed.'); },
    reset: () => {
      if (!confirm('Delete your save and start over? This cannot be undone (unless you exported a save file).')) return;
      G.reset();
      started = false;
      render();
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    try {
      const r = fn(el, e);
      if (r && r.catch) r.catch(err => toast(err.message, 'bad'));
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    try {
      if (t.dataset.region) {
        const key = t.dataset.region;
        const container = t.closest('.regions');
        if (t.dataset.scope === 'ng') {
          ngRegions[key] = t.checked;
          refreshRegionTotal(container, ngRegions);
        } else {
          const next = { ...G.state().regions, [key]: t.checked };
          try { G.setRegions(next); } catch (err) { t.checked = true; throw err; }
          refreshRegionTotal(container, next);
        }
        t.closest('.region').classList.toggle('on', t.checked);
      } else if (t.dataset.focusUid) {
        G.setFocus(t.dataset.focusUid, t.value);
      } else if (t.dataset.everstoneUid) {
        G.setEverstone(t.dataset.everstoneUid, t.checked);
      } else if (t.dataset.itemUid) {
        G.equip(t.dataset.itemUid, t.value || null);
        render();
      } else if (t.id === 'scout-region') {
        scoutRegion = t.value;
      } else if (t.dataset.change === 'import' && t.files[0]) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            G.importSave(reader.result);
            started = true;
            tab = 'club';
            render();
            toast('Save file loaded!', 'good');
          } catch (err) { toast(err.message, 'bad'); }
        };
        reader.readAsText(t.files[0]);
        t.value = '';
      }
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  PH.ui = { render, boot: render };
})();
