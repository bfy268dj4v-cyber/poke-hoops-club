/* Static data for Poké Hoops Club: regions, type chart, move → basketball play mapping, ability effects. */
window.PH = window.PH || {};

(() => {
  PH.util = {
    rand: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: arr => arr[Math.floor(Math.random() * arr.length)],
    shuffle: arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    uid: () => Math.random().toString(36).slice(2, 10),
    weighted: (arr, weightFn) => {
      const ws = arr.map(x => Math.max(0, weightFn(x)));
      let r = Math.random() * ws.reduce((s, w) => s + w, 0);
      for (let i = 0; i < arr.length; i++) {
        r -= ws[i];
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    },
  };

  // National Dex ranges per region. These are what the region checkboxes toggle.
  PH.REGIONS = [
    { key: 'kanto',  name: 'Kanto',          gen: 1, from: 1,   to: 151 },
    { key: 'johto',  name: 'Johto',          gen: 2, from: 152, to: 251 },
    { key: 'hoenn',  name: 'Hoenn',          gen: 3, from: 252, to: 386 },
    { key: 'sinnoh', name: 'Sinnoh',         gen: 4, from: 387, to: 493 },
    { key: 'unova',  name: 'Unova',          gen: 5, from: 494, to: 649 },
    { key: 'kalos',  name: 'Kalos',          gen: 6, from: 650, to: 721 },
    { key: 'alola',  name: 'Alola',          gen: 7, from: 722, to: 809 },
    { key: 'galar',  name: 'Galar & Hisui',  gen: 8, from: 810, to: 905 },
    { key: 'paldea', name: 'Paldea',         gen: 9, from: 906, to: 1025 },
  ];

  PH.TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
    'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

  PH.TYPE_COLORS = {
    normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#E6B800', grass: '#5FAE36',
    ice: '#5BC4C0', fighting: '#C22E28', poison: '#A33EA1', ground: '#C9A047', flying: '#8E73E8',
    psychic: '#F95587', bug: '#94A617', rock: '#A8932C', ghost: '#735797', dragon: '#6F35FC',
    dark: '#705746', steel: '#8F8FB0', fairy: '#D06BA0',
  };

  const TYPE_CHART = {
    normal:   { se: [], nve: ['rock', 'steel'], no: ['ghost'] },
    fire:     { se: ['grass', 'ice', 'bug', 'steel'], nve: ['fire', 'water', 'rock', 'dragon'], no: [] },
    water:    { se: ['fire', 'ground', 'rock'], nve: ['water', 'grass', 'dragon'], no: [] },
    electric: { se: ['water', 'flying'], nve: ['electric', 'grass', 'dragon'], no: ['ground'] },
    grass:    { se: ['water', 'ground', 'rock'], nve: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'], no: [] },
    ice:      { se: ['grass', 'ground', 'flying', 'dragon'], nve: ['fire', 'water', 'ice', 'steel'], no: [] },
    fighting: { se: ['normal', 'ice', 'rock', 'dark', 'steel'], nve: ['poison', 'flying', 'psychic', 'bug', 'fairy'], no: ['ghost'] },
    poison:   { se: ['grass', 'fairy'], nve: ['poison', 'ground', 'rock', 'ghost'], no: ['steel'] },
    ground:   { se: ['fire', 'electric', 'poison', 'rock', 'steel'], nve: ['grass', 'bug'], no: ['flying'] },
    flying:   { se: ['grass', 'fighting', 'bug'], nve: ['electric', 'rock', 'steel'], no: [] },
    psychic:  { se: ['fighting', 'poison'], nve: ['psychic', 'steel'], no: ['dark'] },
    bug:      { se: ['grass', 'psychic', 'dark'], nve: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'], no: [] },
    rock:     { se: ['fire', 'ice', 'flying', 'bug'], nve: ['fighting', 'ground', 'steel'], no: [] },
    ghost:    { se: ['psychic', 'ghost'], nve: ['dark'], no: ['normal'] },
    dragon:   { se: ['dragon'], nve: ['steel'], no: ['fairy'] },
    dark:     { se: ['psychic', 'ghost'], nve: ['fighting', 'dark', 'fairy'], no: [] },
    steel:    { se: ['ice', 'rock', 'fairy'], nve: ['fire', 'water', 'electric', 'steel'], no: [] },
    fairy:    { se: ['fighting', 'dragon', 'dark'], nve: ['fire', 'poison', 'steel'], no: [] },
  };

  PH.typeMult = (atk, defTypes) => defTypes.reduce((m, t) => {
    const c = TYPE_CHART[atk];
    if (!c) return m;
    if (c.no.includes(t)) return 0;
    if (c.se.includes(t)) return m * 2;
    if (c.nve.includes(t)) return m * 0.5;
    return m;
  }, 1);

  // How a move plays on the court.
  PH.KINDS = {
    shot:  { label: '3PT Shot',   icon: '🎯', side: 'off' },
    dunk:  { label: 'Power Dunk', icon: '💥', side: 'off' },
    drive: { label: 'Fast Break', icon: '💨', side: 'off' },
    rally: { label: 'Team Rally', icon: '📣', side: 'off' },
    rest:  { label: 'Recover',    icon: '💤', side: 'off' },
    block: { label: 'Block',      icon: '🛡️', side: 'def' },
    steal: { label: 'Steal',      icon: '🖐️', side: 'def' },
  };

  // type: move kind power, ... (names match PokéAPI move names)
  const MOVE_TABLE = `
normal: tackle dunk 40, quick-attack drive 40, extreme-speed drive 80, body-slam dunk 85, double-edge dunk 120, take-down dunk 90, headbutt dunk 70, slam dunk 80, giga-impact dunk 150, hyper-beam shot 150, hyper-voice shot 90, swift shot 60, boomburst shot 140, tri-attack shot 80, protect block 80, swords-dance rally 40, recover rest 50, rest rest 100, slack-off rest 50, soft-boiled rest 50, fake-out steal 40, covet steal 60
fire: ember shot 40, flamethrower shot 90, fire-blast shot 110, heat-wave shot 95, overheat shot 130, flame-charge drive 50, flame-wheel drive 60, flare-blitz dunk 120, fire-punch dunk 75, fire-fang dunk 65, will-o-wisp steal 50, sunny-day rally 50
water: water-gun shot 40, bubble-beam shot 65, surf shot 90, hydro-pump shot 110, scald shot 80, aqua-jet drive 40, waterfall dunk 80, aqua-tail dunk 90, crabhammer dunk 100, liquidation dunk 85, rain-dance rally 50, shell-smash rally 70, aqua-ring rest 40, withdraw block 50
electric: thunder-shock shot 40, thunderbolt shot 90, thunder shot 110, discharge shot 80, spark drive 65, volt-switch drive 70, volt-tackle dunk 120, wild-charge dunk 90, thunder-punch dunk 75, thunder-wave steal 60, nuzzle steal 40, electric-terrain rally 50
grass: vine-whip shot 45, razor-leaf shot 55, energy-ball shot 90, solar-beam shot 120, leaf-storm shot 130, leaf-blade dunk 90, power-whip dunk 120, wood-hammer dunk 120, seed-bomb dunk 80, sleep-powder steal 70, spore steal 90, giga-drain rest 60, mega-drain rest 40, leech-seed rest 50, synthesis rest 50
ice: powder-snow shot 40, ice-beam shot 90, blizzard shot 110, freeze-dry shot 70, ice-shard drive 40, ice-punch dunk 75, icicle-crash dunk 85, avalanche block 60, aurora-veil block 70, icy-wind steal 55, hail rally 40
fighting: karate-chop dunk 50, low-kick dunk 60, brick-break dunk 75, cross-chop dunk 100, dynamic-punch dunk 100, close-combat dunk 120, superpower dunk 120, high-jump-kick dunk 130, mach-punch drive 40, vacuum-wave drive 40, aura-sphere shot 80, focus-blast shot 120, drain-punch rest 60, bulk-up rally 50, counter block 70, detect block 70
poison: poison-sting shot 30, acid shot 40, sludge shot 65, venoshock shot 65, sludge-bomb shot 90, gunk-shot shot 120, poison-jab dunk 80, cross-poison dunk 70, toxic steal 70, poison-powder steal 50
ground: mud-slap shot 30, mud-shot shot 55, bonemerang shot 50, earth-power shot 90, bone-club dunk 65, dig dunk 80, stomping-tantrum dunk 75, high-horsepower dunk 95, earthquake dunk 100, bulldoze drive 60, drill-run drive 80, sand-attack steal 40, spikes block 50
flying: gust shot 40, air-slash shot 75, hurricane shot 110, peck drive 35, acrobatics drive 55, wing-attack drive 60, aerial-ace drive 60, drill-peck dunk 80, bounce dunk 85, fly dunk 90, brave-bird dunk 120, sky-attack dunk 140, feather-dance steal 50, tailwind rally 60, roost rest 50
psychic: confusion shot 50, psybeam shot 65, psyshock shot 80, extrasensory shot 80, psychic shot 90, future-sight shot 120, psycho-cut dunk 70, zen-headbutt dunk 80, teleport drive 50, agility drive 60, hypnosis steal 60, reflect block 70, light-screen block 70, amnesia block 50, calm-mind rally 50
bug: pin-missile shot 50, signal-beam shot 75, bug-buzz shot 90, bug-bite dunk 60, x-scissor dunk 80, lunge dunk 80, megahorn dunk 120, fury-cutter drive 40, u-turn drive 70, first-impression drive 90, string-shot steal 50, leech-life rest 60, quiver-dance rally 60
rock: rock-throw shot 50, rock-blast shot 60, ancient-power shot 60, rock-slide shot 75, power-gem shot 80, stone-edge shot 100, head-smash dunk 150, rollout drive 50, accelerock drive 40, rock-tomb steal 60, stealth-rock block 60, sandstorm rally 40
ghost: night-shade shot 60, hex shot 65, shadow-ball shot 80, shadow-claw dunk 70, phantom-force dunk 90, poltergeist dunk 110, shadow-sneak drive 40, shadow-punch drive 60, lick steal 30, confuse-ray steal 60, destiny-bond block 80, curse rally 50
dragon: twister shot 40, dragon-rage shot 40, dragon-breath shot 60, dragon-pulse shot 85, draco-meteor shot 130, dual-chop dunk 70, dragon-claw dunk 80, dragon-rush dunk 100, outrage dunk 120, dragon-tail steal 60, dragon-dance rally 70
dark: dark-pulse shot 80, bite dunk 60, night-slash dunk 70, crunch dunk 80, throat-chop dunk 80, foul-play dunk 95, pursuit drive 40, feint-attack drive 60, sucker-punch drive 70, knock-off steal 75, thief steal 60, snarl steal 55, taunt steal 50, nasty-plot rally 60
steel: magnet-bomb shot 60, flash-cannon shot 80, metal-claw dunk 50, iron-head dunk 80, meteor-mash dunk 90, iron-tail dunk 100, heavy-slam dunk 100, bullet-punch drive 40, autotomize drive 60, steel-wing drive 70, gyro-ball drive 80, iron-defense block 70, metal-sound steal 50
fairy: fairy-wind shot 40, disarming-voice shot 40, dazzling-gleam shot 80, moonblast shot 95, spirit-break dunk 75, play-rough dunk 90, charm steal 60, sweet-kiss steal 50, draining-kiss rest 50, moonlight rest 50, misty-terrain rally 50
`;

  PH.MOVES = {};
  MOVE_TABLE.trim().split('\n').forEach(line => {
    const [type, rest] = line.split(':');
    rest.split(',').forEach(entry => {
      const [name, kind, power] = entry.trim().split(/\s+/);
      PH.MOVES[name] = { name, type: type.trim(), kind, power: +power };
    });
  });

  // Used when a Pokémon learns nothing in the move table above.
  PH.TYPE_DEFAULT = {
    normal: 'tackle', fire: 'ember', water: 'water-gun', electric: 'thunder-shock', grass: 'vine-whip',
    ice: 'powder-snow', fighting: 'karate-chop', poison: 'poison-sting', ground: 'mud-shot', flying: 'gust',
    psychic: 'confusion', bug: 'bug-bite', rock: 'rock-throw', ghost: 'lick', dragon: 'twister',
    dark: 'bite', steel: 'metal-claw', fairy: 'fairy-wind',
  };

  // Ability → court effect. Keys:
  // shot/three/inside/drive: shooting bonus · def: defends better · oppShot: aura on rivals · block/steal: chances
  // antiSteal · clutch: bonus when tired · move: special play strength · moveRate: uses plays more often
  // stamSave: tires slower · rec: weekly stamina · speedQ: faster each quarter · immune: type · cash · oppCooldown
  const ab = (fx, desc) => Object.assign({ desc }, fx);
  PH.ABILITIES = {
    'intimidate':     ab({ oppShot: -0.04 }, 'Rivals on court shoot 4% worse'),
    'pressure':       ab({ oppCooldown: 2 }, 'Rival special plays recharge slower'),
    'unnerve':        ab({ oppShot: -0.02, oppCooldown: 1 }, 'Rattles rivals: -2% shooting, slower plays'),
    'cute-charm':     ab({ oppShot: -0.02 }, 'Rivals get distracted (-2% shooting)'),
    'keen-eye':       ab({ three: 0.05 }, '+5% on three-pointers'),
    'sniper':         ab({ three: 0.07 }, '+7% on three-pointers'),
    'mega-launcher':  ab({ three: 0.06 }, '+6% on three-pointers'),
    'compound-eyes':  ab({ shot: 0.04 }, '+4% on every shot'),
    'skill-link':     ab({ shot: 0.04 }, '+4% on every shot'),
    'download':       ab({ shot: 0.03 }, '+3% on every shot'),
    'moxie':          ab({ shot: 0.03 }, '+3% on every shot'),
    'no-guard':       ab({ shot: 0.06, def: -0.04 }, '+6% shooting, but defends 4% worse'),
    'hustle':         ab({ inside: 0.09, three: -0.03 }, '+9% inside, -3% from deep'),
    'huge-power':     ab({ inside: 0.12 }, '+12% on inside shots'),
    'pure-power':     ab({ inside: 0.12 }, '+12% on inside shots'),
    'iron-fist':      ab({ inside: 0.06 }, '+6% on inside shots'),
    'tough-claws':    ab({ inside: 0.06 }, '+6% on inside shots'),
    'strong-jaw':     ab({ inside: 0.05 }, '+5% on inside shots'),
    'sheer-force':    ab({ move: 0.06 }, 'Special plays are 6% stronger'),
    'technician':     ab({ move: 0.06 }, 'Special plays are 6% stronger'),
    'adaptability':   ab({ move: 0.08 }, 'Special plays are 8% stronger'),
    'serene-grace':   ab({ moveRate: 0.12 }, 'Uses special plays far more often'),
    'prankster':      ab({ moveRate: 0.1 }, 'Uses special plays more often'),
    'blaze':          ab({ clutch: 0.08 }, '+8% shooting when tired'),
    'torrent':        ab({ clutch: 0.08 }, '+8% shooting when tired'),
    'overgrow':       ab({ clutch: 0.08 }, '+8% shooting when tired'),
    'swarm':          ab({ clutch: 0.08 }, '+8% shooting when tired'),
    'guts':           ab({ clutch: 0.1 }, '+10% shooting when tired'),
    'justified':      ab({ clutch: 0.05 }, '+5% shooting when tired'),
    'speed-boost':    ab({ speedQ: 0.05 }, 'Gets 5% faster every quarter'),
    'swift-swim':     ab({ drive: 0.06 }, '+6% on fast breaks'),
    'chlorophyll':    ab({ drive: 0.06 }, '+6% on fast breaks'),
    'sand-rush':      ab({ drive: 0.06 }, '+6% on fast breaks'),
    'slush-rush':     ab({ drive: 0.06 }, '+6% on fast breaks'),
    'unburden':       ab({ drive: 0.06 }, '+6% on fast breaks'),
    'quick-feet':     ab({ drive: 0.06 }, '+6% on fast breaks'),
    'run-away':       ab({ drive: 0.04 }, '+4% on fast breaks'),
    'levitate':       ab({ immune: 'ground' }, 'Immune to Ground-type plays'),
    'flash-fire':     ab({ immune: 'fire' }, 'Immune to Fire-type plays'),
    'well-baked-body':ab({ immune: 'fire' }, 'Immune to Fire-type plays'),
    'water-absorb':   ab({ immune: 'water' }, 'Immune to Water-type plays'),
    'storm-drain':    ab({ immune: 'water' }, 'Immune to Water-type plays'),
    'dry-skin':       ab({ immune: 'water' }, 'Immune to Water-type plays'),
    'volt-absorb':    ab({ immune: 'electric' }, 'Immune to Electric-type plays'),
    'lightning-rod':  ab({ immune: 'electric' }, 'Immune to Electric-type plays'),
    'motor-drive':    ab({ immune: 'electric' }, 'Immune to Electric-type plays'),
    'sap-sipper':     ab({ immune: 'grass' }, 'Immune to Grass-type plays'),
    'earth-eater':    ab({ immune: 'ground' }, 'Immune to Ground-type plays'),
    'sturdy':         ab({ block: 0.06 }, '+6% block chance'),
    'thick-fat':      ab({ def: 0.04 }, 'Defends 4% better'),
    'multiscale':     ab({ def: 0.05 }, 'Defends 5% better'),
    'fur-coat':       ab({ def: 0.06 }, 'Defends 6% better'),
    'filter':         ab({ def: 0.04 }, 'Defends 4% better'),
    'solid-rock':     ab({ def: 0.04 }, 'Defends 4% better'),
    'marvel-scale':   ab({ def: 0.04 }, 'Defends 4% better'),
    'battle-armor':   ab({ def: 0.03 }, 'Defends 3% better'),
    'shell-armor':    ab({ def: 0.03 }, 'Defends 3% better'),
    'synchronize':    ab({ def: 0.02 }, 'Defends 2% better'),
    'static':         ab({ steal: 0.04 }, '+4% steal chance (zaps ball handlers)'),
    'flame-body':     ab({ steal: 0.03 }, '+3% steal chance'),
    'poison-point':   ab({ steal: 0.03 }, '+3% steal chance'),
    'effect-spore':   ab({ steal: 0.03 }, '+3% steal chance'),
    'rough-skin':     ab({ steal: 0.03 }, '+3% steal chance'),
    'cursed-body':    ab({ steal: 0.03 }, '+3% steal chance'),
    'inner-focus':    ab({ antiSteal: 0.04 }, 'Hard to strip (-4% rival steals)'),
    'own-tempo':      ab({ antiSteal: 0.04 }, 'Hard to strip (-4% rival steals)'),
    'oblivious':      ab({ antiSteal: 0.03 }, 'Hard to strip (-3% rival steals)'),
    'insomnia':       ab({ antiSteal: 0.03 }, 'Hard to strip (-3% rival steals)'),
    'vital-spirit':   ab({ antiSteal: 0.03 }, 'Hard to strip (-3% rival steals)'),
    'limber':         ab({ antiSteal: 0.03 }, 'Hard to strip (-3% rival steals)'),
    'natural-cure':   ab({ stamSave: 0.15, rec: 10 }, 'Tires slower, +10 stamina each week'),
    'regenerator':    ab({ stamSave: 0.2, rec: 15 }, 'Tires slower, +15 stamina each week'),
    'shed-skin':      ab({ stamSave: 0.15 }, 'Tires 15% slower'),
    'magic-guard':    ab({ stamSave: 0.25 }, 'Tires 25% slower'),
    'hydration':      ab({ stamSave: 0.1 }, 'Tires 10% slower'),
    'early-bird':     ab({ stamSave: 0.1 }, 'Tires 10% slower'),
    'pickup':         ab({ cash: 60 }, 'Finds $60 after every game'),
    'honey-gather':   ab({ cash: 40 }, 'Finds $40 after every game'),
  };

  PH.TIERS = [
    { name: 'Rookie Cup',    lv: [4, 14],  prize: 1500,  maxBst: 440, scoutBst: 400 },
    { name: 'Great League',  lv: [14, 30], prize: 4000,  maxBst: 520, scoutBst: 470 },
    { name: 'Ultra League',  lv: [30, 50], prize: 10000, maxBst: 580, scoutBst: 530 },
    { name: 'Master League', lv: [50, 80], prize: 25000, maxBst: 999, scoutBst: 600 },
  ];

  // Difficulty: rival level offset and growth, rival strength cap shift, starting money,
  // income multiplier, draft strength cap, and a small shooting edge for rival teams.
  PH.DIFFICULTIES = {
    easy:   { name: 'Easy',   desc: 'Weaker rivals, more money. Good for learning the ropes.', rivalLv: -1, growth: 0.85, bst: -20, money: 5000, income: 1.25, draftBst: 420, edge: -0.02 },
    normal: { name: 'Normal', desc: 'The intended balance.', rivalLv: 0, growth: 1, bst: 0, money: 3000, income: 1, draftBst: 400, edge: 0 },
    hard:   { name: 'Hard',   desc: 'Stronger, faster-growing rivals and tighter budgets.', rivalLv: 1, growth: 1.1, bst: 15, money: 2000, income: 0.85, draftBst: 390, edge: 0.01 },
    expert: { name: 'Expert', desc: 'Rivals start ahead and stay ahead. Every dollar counts.', rivalLv: 1, growth: 1.25, bst: 30, money: 1500, income: 0.7, draftBst: 380, edge: 0.015 },
  };

  PH.ARENA_CAP = [0, 300, 800, 2000, 5000, 12000];
  PH.FACILITY_COSTS = [0, 2500, 7000, 18000, 45000]; // index = current level
  PH.FACILITY_MAX = 5;
  PH.FACILITIES = {
    gym:    { name: 'Training Gym',   icon: '🏋️', desc: l => `+${20 + 10 * l} XP per week · stat gains up to +${1 + l}` },
    center: { name: 'Pokémon Center', icon: '🏥', desc: l => `Restores ${25 + 10 * l} stamina per week` },
    scout:  { name: 'Scout Office',   icon: '🔭', desc: l => `${2 + l} prospects per trip · stronger finds (+${15 * (l - 1)} max BST)` },
    arena:  { name: 'Arena',          icon: '🏟️', desc: l => `${PH.ARENA_CAP[l].toLocaleString()} seats · $${8 + 4 * l} tickets` },
  };

  PH.TEAM_NICKS = {
    normal: 'Stompers', fire: 'Blazers', water: 'Tides', electric: 'Sparks', grass: 'Sprouts', ice: 'Glaciers',
    fighting: 'Brawlers', poison: 'Toxics', ground: 'Quakes', flying: 'Gusts', psychic: 'Psychics', bug: 'Swarm',
    rock: 'Boulders', ghost: 'Phantoms', dragon: 'Dragons', dark: 'Shadows', steel: 'Ironclads', fairy: 'Pixies',
  };
  PH.CITIES = ['Pewter', 'Cerulean', 'Vermilion', 'Celadon', 'Saffron', 'Fuchsia', 'Cinnabar', 'Viridian',
    'Goldenrod', 'Ecruteak', 'Olivine', 'Blackthorn', 'Rustboro', 'Lilycove', 'Mossdeep', 'Sootopolis',
    'Veilstone', 'Canalave', 'Snowpoint', 'Castelia', 'Nimbasa', 'Lumiose', 'Hammerlocke', 'Mesagoza'];

  // ---------- Poké Mart ----------
  // tier = league index where it unlocks (0 Rookie, 1 Great, 2 Ultra, 3 Master).
  // Held-item fx use the same keys as abilities, plus: typeBoost (that type's plays +15%),
  // se (super-effective plays stronger), heatGain (hot streak builds faster), xp, train.
  PH.ITEM_SPRITE = name => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name}.png`;
  const held = (name, cost, tier, fx, desc) => ({ name, kind: 'held', cost, tier, fx, desc });
  PH.ITEMS = {
    'scope-lens':    held('Scope Lens', 2000, 0, { shot: 0.03 }, '+3% on every shot'),
    'quick-claw':    held('Quick Claw', 2000, 0, { steal: 0.04 }, '+4% steal chance'),
    'lucky-egg':     held('Lucky Egg', 2500, 0, { xp: 0.5 }, '+50% XP from training and games'),
    'macho-brace':   held('Macho Brace', 3000, 0, { train: 2 }, '+2 extra stat points from training each week'),
    'choice-specs':  held('Choice Specs', 4000, 1, { three: 0.06 }, '+6% on three-pointers'),
    'choice-band':   held('Choice Band', 4000, 1, { inside: 0.06 }, '+6% on inside shots'),
    'choice-scarf':  held('Choice Scarf', 4000, 1, { drive: 0.06, steal: 0.02 }, '+6% on fast breaks, +2% steals'),
    'rocky-helmet':  held('Rocky Helmet', 4000, 1, { block: 0.05 }, '+5% block chance'),
    'assault-vest':  held('Assault Vest', 5000, 1, { def: 0.04 }, 'Defends 4% better'),
    'leftovers':     held('Leftovers', 6000, 1, { stamSave: 0.25, rec: 10 }, 'Tires 25% slower, +10 stamina each week'),
    'expert-belt':   held('Expert Belt', 9000, 2, { se: 0.25 }, 'Super-effective plays are 25% stronger'),
    'life-orb':      held('Life Orb', 10000, 2, { move: 0.12, stamSave: -0.15 }, 'Special plays +12%, but tires 15% faster'),
    'heat-rock':     held('Heat Rock', 10000, 2, { heatGain: 0.5 }, 'Hot streak meter fills 50% faster'),
    'bright-powder': held('Bright Powder', 12000, 2, { oppShot: -0.03 }, 'Rivals on court shoot 3% worse'),
    'kings-rock':    held("King's Rock", 18000, 3, { moveRate: 0.12, move: 0.05 }, 'Uses special plays more often, +5% strength'),
  };
  // Type boosters: one per type, each makes that type's special plays 15% stronger.
  Object.entries({
    normal: 'silk-scarf', fire: 'charcoal', water: 'mystic-water', electric: 'magnet', grass: 'miracle-seed',
    ice: 'never-melt-ice', fighting: 'black-belt', poison: 'poison-barb', ground: 'soft-sand', flying: 'sharp-beak',
    psychic: 'twisted-spoon', bug: 'silver-powder', rock: 'hard-stone', ghost: 'spell-tag', dragon: 'dragon-fang',
    dark: 'black-glasses', steel: 'metal-coat', fairy: 'pixie-plate',
  }).forEach(([type, key]) => {
    PH.ITEMS[key] = held(key.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), 3000, 1, { typeBoost: type }, `${type[0].toUpperCase() + type.slice(1)}-type plays are 15% stronger`);
  });

  // Medicine used on one Pokémon. Vitamins get pricier each time that Pokémon takes one.
  PH.MEDICINE = {
    'calcium':    { name: 'Calcium', stat: 'sht', desc: '+3 Shooting' },
    'protein':    { name: 'Protein', stat: 'ins', desc: '+3 Inside' },
    'carbos':     { name: 'Carbos', stat: 'spe', desc: '+3 Speed' },
    'iron':       { name: 'Iron', stat: 'def', desc: '+3 Defense' },
    'hp-up':      { name: 'HP Up', stat: 'reb', desc: '+3 Rebounding' },
    'rare-candy': { name: 'Rare Candy', desc: '+1 level' },
    'max-potion': { name: 'Max Potion', desc: 'Restores stamina to full' },
  };
  PH.VITAMIN_GAIN = 3;

  // Ability + held item effects, summed (immune/typeBoost carried over as-is).
  PH.fxOf = mon => {
    const out = { ...(PH.ABILITIES[mon.ability] || {}) };
    const item = mon.item && PH.ITEMS[mon.item];
    if (item) {
      Object.entries(item.fx).forEach(([k, v]) => {
        out[k] = typeof v === 'number' ? (out[k] || 0) + v : v;
      });
    }
    return out;
  };

  // Gen VII party menu icons (pixel art, #1–809). Later Pokémon fall back to their regular sprite.
  PH.iconUrl = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/${id}.png`;

  const FORM_SUFFIX = /-(altered|normal|plant|red-striped|land|incarnate|ordinary|aria|male|female|average|baile|midday|solo|red-meteor|disguised|amped|full-belly|single-strike|zero|family-of-four|curly|green-plumage|two-segment|standard|shield|50)$/;
  PH.pretty = name => String(name || '').replace(FORM_SUFFIX, '').split('-')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
})();
