/* PokéAPI client. Responses are trimmed to what the game needs and cached in localStorage,
   so each Pokémon is downloaded once per browser. */
(() => {
  const BASE = 'https://pokeapi.co/api/v2';
  const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const PREFIX = 'phc:';
  const mem = new Map();

  function cacheGet(key) {
    if (mem.has(key)) return mem.get(key);
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) {
        const v = JSON.parse(raw);
        mem.set(key, v);
        return v;
      }
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  function cacheSet(key, value) {
    mem.set(key, value);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* quota full: memory only */ }
  }

  async function json(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) return await r.json();
        lastErr = new Error(`PokéAPI ${r.status} for ${url}`);
        if (r.status === 404) break;
      } catch (e) { lastErr = e; }
      await new Promise(res => setTimeout(res, 400 * (i + 1)));
    }
    throw lastErr;
  }

  const idFromUrl = url => +url.match(/\/(\d+)\/?$/)[1];

  async function pokemon(id) {
    const key = 'p:' + id;
    const cached = cacheGet(key);
    if (cached) return cached;
    const p = await json(`${BASE}/pokemon/${id}`);
    const stat = n => (p.stats.find(s => s.stat.name === n) || {}).base_stat || 50;
    const abilities = p.abilities.slice().sort((a, b) => a.is_hidden - b.is_hidden || a.slot - b.slot);
    const data = {
      id: p.id,
      name: p.name,
      types: p.types.slice().sort((a, b) => a.slot - b.slot).map(t => t.type.name),
      base: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed') },
      height: p.height,
      weight: p.weight,
      sprite: p.sprites.front_default || `${SPRITES}/${p.id}.png`,
      abilities: abilities.map(a => a.ability.name),
      learn: [...new Set(p.moves.map(m => m.move.name))].filter(n => PH.MOVES[n]),
    };
    cacheSet(key, data);
    return data;
  }

  // All Pokémon ids (≤ 1025) that have a given type.
  async function typeIds(type) {
    const key = 't:' + type;
    const cached = cacheGet(key);
    if (cached) return cached;
    const t = await json(`${BASE}/type/${type}`);
    const ids = t.pokemon.map(x => idFromUrl(x.pokemon.url)).filter(id => id <= 1025);
    cacheSet(key, ids);
    return ids;
  }

  // Next evolutions for a Pokémon: [{ id, level }]. Non-level evolutions (stones, trades,
  // friendship) are given a stand-in level so every line can evolve through training.
  async function evolutions(id) {
    const key = 'e:' + id;
    const cached = cacheGet(key);
    if (cached) return cached;
    const species = await json(`${BASE}/pokemon-species/${id}`);
    let result = [];
    if (species.evolution_chain) {
      const chain = (await json(species.evolution_chain.url)).chain;
      let found = null;
      (function walk(node, depth) {
        if (found) return;
        if (node.species.name === species.name) { found = { node, depth }; return; }
        node.evolves_to.forEach(n => walk(n, depth + 1));
      })(chain, 0);
      if (found) {
        result = found.node.evolves_to.map(e => {
          const det = e.evolution_details.find(d => d.min_level) || {};
          return { id: idFromUrl(e.species.url), level: det.min_level || (found.depth === 0 ? 22 : 36) };
        }).filter(e => e.id <= 1025);
      }
    }
    cacheSet(key, result);
    return result;
  }

  // Run fn over items with limited concurrency.
  async function pool(items, fn, n = 6) {
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const j = i++;
        out[j] = await fn(items[j], j);
      }
    });
    await Promise.all(workers);
    return out;
  }

  function clearCache() {
    mem.clear();
    try {
      Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  }

  function cacheCount() {
    try { return Object.keys(localStorage).filter(k => k.startsWith(PREFIX + 'p:')).length; } catch (e) { return 0; }
  }

  PH.api = { pokemon, typeIds, evolutions, pool, clearCache, cacheCount };
})();
