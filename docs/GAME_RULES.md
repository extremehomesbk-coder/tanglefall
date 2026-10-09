# Tanglefall: rules and tuning notes

Working title. Original mechanics-inspired puzzle; no third-party names, art, sound or music.
Every number below lives in `src/config.ts`. Lines marked **ASSUMPTION** were not confirmed by the
brief and are the first things to playtest.

## The board

- Several vertical ropes (level 1: 7) hang side by side, each a solid colour. Adjacent ropes may share a colour.
- A **knot** joins two adjacent ropes at one row; one rope crosses on top (`top: left | right`).
- The board has `board.rows` rows (20). Knots start bunched in the top third (`board.startRowsFraction`).
- A rope can be in only one knot per row (physical constraint: it cannot cross both neighbours at once).
- When a rope has no knots left it falls away and the remaining ropes slide together (the group stays
  centred, spacing fixed per stage). **ASSUMPTION:** gaps close; newly adjacent ropes can be knotted by later pushes.
- Every rope starts with at least one knot (otherwise it would vanish at once).

## The frame

- The frame sits in one gap, on the bottom-most knot of that gap.
- Two frame types alternate after **every** action (twist or untwist):
  - **Blue** slants right and untwists knots whose **right** rope is on top.
  - **Red** slants left and untwists knots whose **left** rope is on top.
  - Same-colour ropes: either frame untwists.
- Matching frame = **untwist** (knot removed). Wrong frame = **twist**.
- The HUD shows the current type (NOW) and the next (NEXT); every gap's bottom knot carries a live
  green (will untwist) or red (will twist) outline.
- **ASSUMPTION** `rules.actOnEmptyGapFlips = false`: acting on a gap with no knot does nothing and does not flip.

## What a twist does (`rules.twistMode`)

- `addKnot` (default): one extra knot is stacked in the same gap, in the nearest free row above the acted knot.
  `rules.twistNewKnotTop` says which rope the new knot puts on top: `same` (default), `opposite`, `random`.
  If no row above is free, the knot flips its top rope instead.
- `flipTop`: the knot stays but its top rope flips.

## The bar

- Every `pushIntervalMs` the bar pushes all knots one row down and creates `knotsPerPush` new knots in
  rows `0..spawnRows-1`. A progress bar above the board shows the next push coming (turns amber at 80%).
- Knots in the last `board.dangerRows` rows glow and pulse, faster and brighter the lower they are.
- **Game over** when any knot is pushed past the last row.

## Levels and stages

- `levels[]` gives ropes, colours, push interval, knots per push and initial knots per level.
- **ASSUMPTION** `rules.stagesPerLevel = 3`; a stage clears when all ropes are gone. Each stage after the
  first multiplies the push interval by `rules.stageSpeedup` (0.88).
- Past the last defined level, the last entry repeats with the interval scaled by
  `beyondLastLevel.pushIntervalFactor`, floored at `minPushIntervalMs`.
- **ASSUMPTION** `rules.restartFromLevelOne = true`: game over restarts at 1-1 (`false` = retry the current level at stage 1 with score 0).

## Power-ups (all attached to knots; rolling happens when a knot is created)

- **Sparkling knot** (`powerUps.sparkleRate`): untwisting it grants one bonus. Each unspent bonus is worth
  `scoring.bonusUnused` at stage end, or spend one (FLIP button, or `F`) to flip the frame without acting.
- **Candle** (`powerUps.candleRate`): untwisting it starts a `candleMs` window. A red dot marks one rope at
  the top; a red dot at the bottom marks a slot `rules.candleTargetOffset` positions away (default: one to
  the left). Clear any rope left of the marked one so it slides over the bottom dot, then tap the bottom dot
  (or `C`) while the candle burns: the marked rope burns away with all its knots (`scoring.candleRope`).
  **ASSUMPTION:** this is our reading of "connect the top dot to the bottom dot". Alternative worth trying:
  a braid model where ropes swap columns at each knot, so the marked rope's path has to be re-routed.
- **Paintbrush** (`powerUps.brushRate`): untwisting it recolours the two ropes of that gap.
  **ASSUMPTION** `powerUps.brushMode = 'match'`: the right rope takes the left rope's colour (all remaining
  knots between them become untwistable by either frame). `cycle`: both ropes advance one palette colour.

## Scoring (`scoring`)

| Event | Points |
|---|---|
| Untwist | `untwist` (100) x chain, chain = consecutive untwists capped at `chainMax` (8); a twist resets it |
| Twist | minus `twistPenalty` (0) |
| Rope cleared by untwisting | `ropeRemoved` (500) |
| Rope burned by candle | `candleRope` (300) |
| Stage clear | `stageClear` (1000) + `bonusUnused` (250) per unspent bonus |

High score is kept in `localStorage` (wrapped in try/catch; private mode just loses persistence).

## Controls

- **One-tap** (default): tap a gap, the frame jumps there and acts on the bottom knot.
- **Two-tap** (`rules.twoTapMode`, also toggled on the menu): first tap moves, second tap on the same gap acts.
- Tap zones are the full-height strips between rope centres; taps beyond the outer ropes snap to the outer gaps.
- Desktop: arrows move, space acts, `F` spends a bonus flip, `C` connects the candle, Enter/space dismisses overlays.

## Feel (muted-clip readability)

- Untwist: knot spins open, flattens and vanishes; both ropes wiggle; white burst; floating score.
- Rope removal: white flash, beads scatter upward, camera shake, gaps slide closed.
- Twist: red flash, knot clenches (scale + shake), a new knot pops in above, "TIGHTER!" text, small camera shake.
- Danger: knots in the bottom four rows glow and pulse.
- Push: the bar stamps down from the top; the progress bar refills.

## Tuning checklist for the first playtest

1. Push interval at 1-1 (7 s) and the stage speed-up (0.88).
2. `knotsPerPush` vs how fast a player clears; 2 at level 1.
3. Twist mode: `addKnot` makes mistakes costly; `flipTop` is gentler.
4. Power-up rates (12% / 4% / 4%).
5. Chain cap and whether twists should cost points.
6. Candle offset and window; brush mode.
