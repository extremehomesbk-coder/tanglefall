# Tanglefall (working title)

Mobile-web puzzle prototype. Untwist the knots between coloured ropes before the bar pushes them to the floor.
Rules, tunables and open assumptions: [docs/GAME_RULES.md](docs/GAME_RULES.md).

Phaser 3 + TypeScript + Vite. `npm run dev` to play locally, `npm run check` before committing.
Balance: `SIM=1 npx vitest run scripts/sim.test.ts`. Clips: `npx vite preview --port 4173`, then
`python scripts/record_clip.py` (hook / chain / fail variants into `clips/`).
Deployed to GitHub Pages from `main` by GitHub Actions.
