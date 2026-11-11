# Labyrinth Run 🏃‍♂️🐂

A **Subway Surfers–style 3D endless runner set inside a living maze**. Dash down torch-lit corridors, dodge
stone gates, slide under spike beams, leap onto slabs and outrun the Minotaur — all rendered in real time with
Three.js (PBR materials, dynamic shadows, bloom, fog, particles) and **no asset downloads**: every texture,
model and sound is generated procedurally.

> Single-page game · zero runtime dependencies on the server · ready for a Render **Web Service (Starter plan)**.

## Play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Switch lane | `←` `→` / `A` `D` | swipe left / right |
| Jump | `↑` / `W` / `Space` | swipe up |
| Roll (slide under beams, or dive-bomb to the floor mid-air) | `↓` / `S` | swipe down |
| Pause | `P` / `Esc` | pause button |

## Rules (Subway Surfers, but in a maze)

* **Endless auto-run on three lanes.** Speed ramps up the longer you survive.
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
  🧲 Magnet · ✖2 Double Points · 👢 Spring Boots (super jump) · 🪽 Wings (fly above the maze collecting a sky-coin trail, invulnerable) · 🛡 Spirit Shield (absorbs one crash).
* **Missions** – three at a time. Finish all three to raise your **permanent score multiplier** (up to ×10) and earn coin rewards.
* **Revive** after a crash by paying coins (price doubles each time, up to 3 revives per run).
* **Shop** – 6 outfits and 4 power-up upgrade tracks (5 levels each).
* **Four biomes** that blend into each other every 1.5 km: *Overgrown Maze → Forgotten Ruins → Crystal Depths → Ember Halls*,
  each with its own materials, lighting, fog, sky and decor. Side openings and arches make the corridor feel like a maze.
* Progress (coins, best score, outfits, upgrades, missions, settings) is saved in `localStorage`.

The generator enforces a **fairness invariant**: wherever you happen to be standing, the next row of obstacles always leaves
a way through, so you can never be handed an unavoidable crash.

## Run locally

```bash
npm start            # http://localhost:3000   (PORT env var is honoured)
```

No build step, no `npm install` needed (there are no dependencies). Three.js r187 is vendored in `public/vendor/three` (MIT).

## Deploy on Render (Starter plan)

**Option A – Blueprint (recommended).** The repo contains a `render.yaml`:

1. Push this repo to GitHub.
2. In the Render dashboard choose **New + → Blueprint**, pick the repo, and apply. It creates the `mazerunner` web service on the `starter` plan.

**Option B – manual.** **New + → Web Service** → connect the repo, then:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm install` (or leave empty) |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Instance type | Starter |

Render injects `PORT`; the server binds `0.0.0.0:$PORT`. Static assets are gzip-compressed and cached (vendored libs for a day,
game code revalidated with ETags, so new deploys show up immediately).

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
    world.js           segment generator, maze decor, obstacle/coin/pick-up spawner with the fairness invariant
    player.js          runner controller + procedural animation
    chaser.js          the Minotaur
    models.js          every 3D model, built from primitives
    textures.js        procedural PBR textures for the four biomes
    fx.js              GPU-friendly particles, ambient embers, starry sky shader
    audio.js           synthesised SFX and a procedural score that intensifies with speed
    input.js           keyboard + swipe controls
    ui.js missions.js storage.js config.js
  vendor/three/        Three.js + post-processing addons
scripts/smoke-test.mjs end-to-end test-suite (see below)
```

## Tuning

All gameplay numbers (lane width, jump height, speed curve, power-up durations, prices, mission goals, biome colours)
live in [`public/js/config.js`](public/js/config.js).

## Tests

`scripts/smoke-test.mjs` drives the real game in headless Chromium: it verifies each rule (ramps, slabs, stumble/caught logic,
shield, wings, boots, magnet, coins, scoring, revive, saving), the shop/missions/settings UI, keyboard and swipe input, that the
canvas actually renders, and fuzzes ~10 simulated minutes of bot play across all four biomes.

```bash
npm i -g playwright && npx playwright install chromium   # one-off, not a runtime dependency
npm test                                                 # add -- --shots to write screenshots to ./screenshots
```

## Performance

Auto quality starts at *High* on desktop / *Medium* on phones and steps down by itself if the frame rate stays under 40 fps
(Settings → Graphics lets players pin a level). Lights, shadows, bloom and pixel ratio are the knobs.

## Credits

Three.js (MIT). Everything else — code, textures, models, music — is original and generated at runtime.
