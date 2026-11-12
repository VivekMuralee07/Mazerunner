# Labyrinth Run 🏃‍♂️🐂

A **Subway Surfers–style 3D endless runner set inside a living maze**. Dash down sunlit hedge, ruin, crystal and canyon corridors, dodge
stone gates, slide under spike beams, leap onto slabs and outrun the Minotaur — all rendered in real time with
Three.js (PBR materials, dynamic shadows, bloom, fog, particles) and **no asset downloads**: every texture,
model and sound is generated procedurally.

> Single-page game · one tiny server dependency (`ws`, for two-player rooms) · ready for a Render **Web Service (Starter plan)**.

## Play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Switch lane | `←` `→` / `A` `D` | swipe left / right |
| Jump | `↑` / `W` / `Space` | swipe up |
| Roll (slide under beams, or dive-bomb to the floor mid-air) | `↓` / `S` | swipe down |
| Pause | `P` / `Esc` | pause button |

## Rules (Subway Surfers, but in a maze)

* **Endless auto-run on three lanes.** Speed ramps up the longer you survive.
* **Temple Run-style corners and zig-zags.** The corridor turns 90° left or right. An arrow warns you (on screen and painted on the floor/wall); **swipe toward the arrow** (← / →) as you reach the junction to turn. Miss it and you hit the wall. Sometimes the corners come back-to-back as a zig-zag. The Spirit Shield, flying and revives turn the corner for you. Junctions are always kept clear of obstacles.
* **Obstacles**
  * 🟠 **Spiked barrier** – jump it. Hitting it is a *stumble*.
  * 🔴 **Spike beam** – roll under it. Jumping into it is a *stumble*.
  * 🚪 **Stone gate** – full-height; switch lane. Hitting it head-on ends the run.
  * 🟩 **Stone slab (the "train")** – climb it via its ramp, or jump onto it, and ride its top for coins.
    Running into the front of a ramp-less slab ends the run; steering into its side just scrapes you back into your lane (stumble).
* **The Minotaur (the guard).** Your first stumble brings it right behind you; a **second stumble while it is close = caught**.
  Stay clean for ~7 seconds and it falls back again.
* **Coins** are everywhere: lines, jump arcs, and rewards on top of slabs. Coins are your currency.
* **Power-ups** (found in the maze) – upgradable in the shop:
  🧲 Magnet · ✖2 Double Points · 👢 Spring Boots (super jump) · 🪽 Wings (fly above the maze for a few seconds) · 🚀 **Jetpack (15 seconds of invulnerable flight, collecting a sky-coin trail)** · 🛡 Spirit Shield (absorbs one crash).
* **Missions** – three at a time. Finish all three to raise your **permanent score multiplier** (up to ×10) and earn coin rewards.
* **Revive** after a crash by paying coins (price doubles each time, up to 3 revives per run).
* **Shop** – 6 outfits and 4 power-up upgrade tracks (5 levels each).
* **Versus (2 players, 2 phones, split screen).** (The HUD stays minimal: your points, multiplier, distance and coins below, your rival's on top; mission claims and "out" notices pop up for 3 seconds.) From the menu choose **Versus**: one player creates a room and gets a 4-letter code, the other joins, the host starts. Both phones run the **same maze** (shared seed) with a **horizontal split screen**: the opponent's live run on the top half, yours on the bottom. Each player runs on their own. **If one crashes they are out but the other keeps going**; the match ends when both are down and **whoever lasted longer wins** (ties go to score). Three **"first to…" missions** are picked per match (coins, distance, jumps, power-ups…); the first player to reach each goal claims it and its coin reward. The bonus car still triggers at 25,000 points on your own score.
* **Godzilla.** Every minute or so a giant kaiju rises out of the corridor far ahead, its dorsal plates charge up blue, and it breathes **two waves of blue fire** down the maze, each covering two of the three lanes (the free lane is the one *without* blue chevrons on the floor). Take the free lane or jump the low flames. A Spirit Shield absorbs one wave, wings, the jetpack and the car pass it safely, and dodging both waves scores +400. It only appears on long straight corridors, so it never ambushes you at a corner.
* **Bonus car at 25,000 points**. A car appears ahead; drive into it for **1 minute** behind the wheel: steer freely (hold ← → or drag; taps nudge), **↑ nitro**, smash through every gate, beam, slab and boulder for bonus points, and the corners turn themselves. When the fuel runs out you get a coin bonus and a short shield; another car is offered 60,000 points later.
* **The Hollow Realm**: an original, eerie 80s-horror-flavoured world (dark red sky and lightning, veined walls with glowing cracks, ash floors, flickering strings of bulbs, drifting spores). It appears in the normal biome rotation, and the whole world slides into it during the car ride, together with a retro synth-wave score.
* **Nine biomes** that blend into each other every 1.5 km: *Sunlit Garden Maze → Cherry Blossom Gardens → Golden Ruins → Autumn Orchard → Hollow Realm → Frozen Crystal Gardens → Overgrown Temple → Ember Canyon → Sunken Coral Palace*,
  each with its own procedural materials, lighting, fog, sky, decor, scattered props (flowers, pebbles, mushrooms, shells) and weather (falling blossom, leaves, snow, fireflies, embers, bubbles). Side openings and arches make the corridor feel like a maze.
* **Colour-coded obstacles** stand out from the muted maze: orange/black hazard barriers (jump), red/white spike beams (roll), crimson sealed gates (dodge), teal chevron slabs (ride).
* **Persistent stats.** Progress (coins, best score, lifetime stats, outfits, upgrades, missions, settings) is saved on the device (`localStorage` + an IndexedDB mirror, with a persistent-storage request) **and** on the server, keyed by an anonymous player id. Players are asked for a name on first launch and appear on a shared **global leaderboard** (top 50, with their own rank), and can change it in Settings; and use their **recovery code** (Settings) to restore progress after switching phones or clearing data.

The generator enforces a **fairness invariant**: wherever you happen to be standing, the next row of obstacles always leaves
a way through, so you can never be handed an unavoidable crash.

## Run locally

```bash
npm start            # http://localhost:3000   (PORT env var is honoured)
```

`npm install` once (it fetches `ws`, the WebSocket library used for two-player rooms), then `npm start`. There is no build step. Three.js r187 is vendored in `public/vendor/three` (MIT).

## Deploy on Render (Starter plan)

**Option A – Blueprint (recommended).** The repo contains a `render.yaml`:

1. Push this repo to GitHub.
2. In the Render dashboard choose **New + → Blueprint**, pick the repo, and apply. It creates the `mazerunner` web service on the `starter` plan.

**Option B – manual.** **New + → Web Service** → connect the repo, then:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm install` (**required** now: it installs `ws` for two-player mode) |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Instance type | Starter |

Render injects `PORT`; the server binds `0.0.0.0:$PORT`. Static assets are gzip-compressed and cached (vendored libs for a day,
game code revalidated with ETags, so new deploys show up immediately).

## Persistent player data (Render disk)

The server stores player saves in `$DATA_DIR/players.json` (default `./data`). On Render this needs a **Disk**, otherwise the file is
wiped on every deploy (players still keep their on-device copy and can re-sync). `render.yaml` already declares it
(`/var/data`, 1 GB, `DATA_DIR=/var/data`). If you created the service by hand: **Service → Disks → Add Disk** (mount path `/var/data`)
and add the env var `DATA_DIR=/var/data`. Disks are available on paid plans such as Starter.

API (same origin): `PUT/GET /api/save/:uuid`, `GET /api/leaderboard?id=:uuid`. Inputs are validated, bodies capped at 24 KB,
names sanitised and requests rate-limited per IP.

## Install as an app / build an Android APK

The game is a PWA (manifest, icons, offline service worker), so players can use "Add to Home Screen" / "Install app".
For an APK: open <https://www.pwabuilder.com>, enter your Render URL, choose **Package for stores → Android**, and install the
generated APK (or upload the AAB to Google Play). For a Play Store build, host the `assetlinks.json` it gives you at
`public/.well-known/assetlinks.json`.

## Project layout

```
server.js              tiny static server (gzip, ETag, path-traversal guard, /healthz)
render.yaml            Render blueprint (Starter plan web service)
public/
  index.html           UI shell (menu, HUD, shop, missions, settings, pause, game over)
  css/style.css
  js/
    main.js            boot + wiring
    game.js            state machine, physics integration, collisions, power-ups, camera, atmosphere, adaptive quality
    net.js coop.js split.js ghost.js post.js  versus: WebSocket client, lobby/match/missions, the opponent's split-screen half, shared post-processing chain
    track.js           the path: straight legs joined by 90° corners (turns, zig-zags, camera swing)
    world.js           segment generator, maze decor, obstacle/coin/pick-up spawner with the fairness invariant
    player.js          runner controller + procedural animation
    chaser.js          the Minotaur
    models.js          every 3D model, built from primitives
    textures.js        procedural PBR textures for the eight biomes
    fx.js              GPU-friendly particles, ambient embers, starry sky shader
    audio.js           synthesised SFX and a procedural score that intensifies with speed
    input.js           keyboard + swipe controls
    ui.js missions.js storage.js cloud.js config.js
  vendor/three/        Three.js + post-processing addons
scripts/smoke-test.mjs end-to-end test-suite (see below)
```

## Tuning

All gameplay numbers (lane width, jump height, speed curve, power-up durations, prices, mission goals, biome colours)
live in [`public/js/config.js`](public/js/config.js).

## Tests

`scripts/smoke-test.mjs` drives the real game in headless Chromium: it verifies each rule (ramps, slabs, stumble/caught logic,
shield, wings, boots, magnet, coins, scoring, revive, saving), the shop/missions/settings UI, keyboard and swipe input, that the
canvas actually renders, drives the room server with raw WebSocket clients, plays a **two-player match across two real browser sessions** (split screen, identical mazes, survivor keeps playing, winner, first-to missions), tests the bonus car, and fuzzes ~10 simulated minutes of bot play across all nine biomes.

```bash
npm install                                              # installs ws
npm i -g playwright && npx playwright install chromium   # one-off, only for the browser tests
npm test                                                 # add -- --shots to write screenshots to ./screenshots
```

## Performance

Auto quality starts at *High* on desktop / *Medium* on phones and steps down by itself if the frame rate stays under 40 fps
(Settings → Graphics lets players pin a level). Lights, shadows, bloom and pixel ratio are the knobs.

## Credits

Three.js (MIT). Everything else — code, textures, models, music — is original and generated at runtime.
