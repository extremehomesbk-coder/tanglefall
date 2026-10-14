# Tanglefall (working title)

Mobile-web puzzle game. Untwist the knots between the dogs' leashes and get the dogs home before the walk ends.
Daily walk (same board for everyone, streaks), first-walk coach, pause, offline shell (PWA), local stats only.
Rules, tunables and open assumptions: [docs/GAME_RULES.md](docs/GAME_RULES.md).

Phaser 3 + TypeScript + Vite. `npm run dev` to play locally, `npm run check` before committing.
Balance: `SIM=1 npx vitest run scripts/sim.test.ts`. Clips: `npx vite preview --port 4173`, then
`python scripts/record_clip.py` (hook / chain / fail variants into `clips/`).
Deployed to GitHub Pages from `main` by GitHub Actions.
