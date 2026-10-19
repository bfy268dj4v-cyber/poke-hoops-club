# Poké Hoops Club

A Kairosoft-style basketball club manager starring Pokémon. Data and sprites come live from [PokéAPI](https://pokeapi.co).

## Run it

```bash
python3 -m http.server 8765 --directory poke-hoops
```

Then open http://localhost:8765. You can also double-click `index.html`, but a local server is more reliable.

## How it plays

- **Regions:** tick the regions (Kanto through Paldea) whose Pokémon can appear in your draft, scouting and rival teams. You can change them anytime in Settings.
- **Difficulty:** Easy, Normal, Hard or Expert. It sets how strong rivals start and grow, how much money you start with and earn, and the opening draft's strength. You can change it anytime in Settings.
- **Draft:** pick 5–6 Pokémon to start your club.
- **Each week:** your Pokémon train on their chosen focus, then you play a league game. Matches are fully simulated and animated on a pixel-art court using the Gen VII party icons: dribbling, passes, jumpers, dunks, blocks, steals and type-colored move effects. You can watch at 1–8× or skip.
- **Ratings** come from base stats: Sp. Atk is outside shooting, Attack is inside scoring, Speed is fast breaks, Def/Sp. Def is defense, and height, weight and HP give rebounding.
- **Special plays** are real moves from each Pokémon's learnset. They unlock at Lv 1/12/25/40, and type matchups apply ("It's super effective!").
- **Abilities** have court effects, e.g. Intimidate, Levitate, Speed Boost, Huge Power.
- **Evolution** happens when a Pokémon reaches its PokéAPI evolution level. An Everstone prevents it.
- **Season:** 14 weeks, then a top-4 playoff. Finishing top 2 or winning the title promotes you: Rookie Cup → Great → Ultra → Master League.
- **Money:** gate receipts and sponsors pay for salaries, scouting and facilities (Gym, Pokémon Center, Scout Office, Arena).
- **Poké Mart:** spend money on held items (one per Pokémon, e.g. Choice Band, Life Orb, Heat Rock, type boosters), medicine (vitamins, Rare Candy, Max Potion) and the Move Tutor, which teaches any learnable move into a chosen slot. Stock and stronger tutor moves unlock as you move up leagues.

## Saves

The game autosaves to the browser after every week. Settings → **Export save file** downloads a `.json` backup, and **Load save file** restores it, including in another browser.

## Code

| File | What |
|---|---|
| `js/data.js` | Regions, type chart, move → play table, ability effects, tiers |
| `js/api.js` | PokéAPI client with localStorage cache |
| `js/game.js` | State, training, economy, league calendar, save/load |
| `js/sim.js` | Possession-by-possession match engine |
| `js/court.js` | Pixel-art canvas renderer that animates the match events |
| `js/ui.js` | All screens and match playback |

A fan project for personal use. Pokémon © Nintendo / Creatures / GAME FREAK.
