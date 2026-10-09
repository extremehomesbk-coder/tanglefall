# Tanglefall (working title)

Mobile-web puzzle prototype: untwist knots between coloured ropes with a frame that flips type after every
action. Own repo (`extremehomesbk-coder/tanglefall`), deployed to GitHub Pages by `.github/workflows/deploy.yml`
on every push to `main`. Not an EHM or Halsey project: no EHM data, skills or doc routing apply here.

## Hard rules
- Everything original: no third-party game names, branding, art, sound or music. Placeholder art is drawn with
  Phaser Graphics (bead strands, crossing glyphs) so it can be swapped for sprites later.
- No secrets, analytics, or network calls. The only persistence is `localStorage` via `src/storage.ts` (try/catch).
- Every rule, speed, colour, level, power-up rate and score lives in `src/config.ts`. Do not hard-code tuning elsewhere.
- Rules and the assumption list live in `docs/GAME_RULES.md`; update it when `config.ts` gains a knob.

## Stack
Phaser 3 + TypeScript + Vite. ESLint (flat config, typescript-eslint). Vitest for the model.

## Layout
```
src/config.ts         all tuning
src/model/game.ts     pure rules: state, commands (moveFrame/act/flipWithBonus/push/tick/candleConnect), events
src/model/game.test.ts
src/scenes/           MenuScene (title, two-tap toggle), GameScene (plays model events as animations)
src/view/             Layout (geometry), BraidView (all leashes, morphs between snapshots), KnotView (overlays), FrameView, Hud
docs/GAME_RULES.md    rules, tunables, assumptions
scripts/              make_icons.py (PWA icons), record_clip.py (demo-bot clip; clips/ is git-ignored)
public/               manifest + icons
```
URL params: `?auto=1` demo bot (skips the menu, muted), `?seed=N` reproducible run.
The model never touches Phaser; the scene calls a command, drains `model.drain()` and animates each event.

## Commands
```
npm run dev        # Vite dev server
npm run check      # lint + typecheck + tests + build (run before every commit)
```

## Conventions
- Keep `CLAUDE.md` under 50 lines. Keep the model deterministic (seeded `Rng`) so tests stay stable.
- Design resolution 390x844 portrait, scaled with Phaser FIT; keep tap targets >= 40px.
