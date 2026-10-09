/**
 * Balance simulator: plays whole walks on the pure model with the demo-bot policy at several paces and error
 * rates, and prints clear rates. Skipped by `npm test`; run it with
 *     SIM=1 npx vitest run scripts/sim.test.ts
 * Optional env: SIM_SEEDS (default 150), SIM_WALKS (default "1-1,1-2,1-3,2-1,3-1"), SIM_OUT (results file),
 * SIM_PATCH (JSON merged over CONFIG, e.g. '{"levels":{"0":{"pushIntervalMs":5500}}}' patches level 1).
 */
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { CONFIG } from '../src/config';
import { applyMove, chooseMove } from '../src/model/bot';
import { Game } from '../src/model/game';
import { Rng } from '../src/model/rng';

interface Player {
  name: string;
  paceMs: number; // time between taps
  errorRate: number; // chance a tap lands on a random gap instead of the chosen one
}

interface Outcome {
  result: 'clear' | 'timeout' | 'tangled';
  seconds: number;
  score: number;
  home: number;
  target: number;
  maxChain: number;
  twists: number;
}

const PLAYERS: Player[] = [
  { name: 'bot 0.42s', paceMs: 420, errorRate: 0 },
  { name: 'good 0.8s/5%', paceMs: 800, errorRate: 0.05 },
  { name: 'casual 1.1s/12%', paceMs: 1100, errorRate: 0.12 },
  { name: 'new 1.5s/20%', paceMs: 1500, errorRate: 0.2 },
];

type Json = Record<string, unknown>;

/** Deep-merge `patch` into a structured clone of `base`; arrays are patched by index via object keys. */
function patched(base: Json, patch: Json): Json {
  const out: Json = Array.isArray(base) ? ([...(base as unknown[])] as unknown as Json) : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] = v && typeof v === 'object' && cur && typeof cur === 'object' ? patched(cur as Json, v as Json) : v;
  }
  return out;
}

const CFG = (process.env.SIM_PATCH ? patched(CONFIG as unknown as Json, JSON.parse(process.env.SIM_PATCH) as Json) : CONFIG) as typeof CONFIG;

function playWalk(level: number, stage: number, seed: number, p: Player): Outcome {
  const g = new Game(CFG, seed);
  const human = new Rng(seed * 7919 + 17);
  g.startStage(level, stage);
  g.drain();
  const dt = 50;
  let pushTimer = 0;
  let tapTimer = p.paceMs * 0.6; // first tap comes a little quicker
  let elapsed = 0;
  let maxChain = 0;
  let twists = 0;
  const walkMs = g.walkMsLeft;
  while (g.status === 'playing' && elapsed < walkMs + 1000) {
    elapsed += dt;
    pushTimer += dt;
    tapTimer += dt;
    const interval = g.pushIntervalMs;
    if (pushTimer >= interval) {
      pushTimer = 0;
      g.push();
      g.drain();
      if (g.status !== 'playing') break;
    }
    g.tick(dt);
    g.drain();
    if (g.status !== 'playing') break;
    if (tapTimer >= p.paceMs) {
      tapTimer = 0;
      let move = chooseMove(g, 'play');
      if (move.kind === 'act' && human.chance(p.errorRate)) move = { kind: 'act', gap: human.int(g.gapCount) };
      applyMove(g, move);
      for (const e of g.drain()) {
        if (e.type === 'untwist') maxChain = Math.max(maxChain, e.chain);
        if (e.type === 'twist') {
          twists++;
          pushTimer = Math.min(interval - 60, pushTimer + interval * CFG.rules.twistPushPenalty);
        }
        if (e.type === 'ropeRemoved' && e.cause === 'untwist' && CFG.rules.ropeClearResetsPush) pushTimer = 0;
      }
    }
  }
  const result: Outcome['result'] = g.status === 'stageClear' ? 'clear' : g.walkMsLeft <= 0 ? 'timeout' : 'tangled';
  return { result, seconds: elapsed / 1000, score: g.score, home: g.dogsFreed, target: g.walkTarget, maxChain, twists };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe.skipIf(!process.env.SIM)('balance simulation', () => {
  it('prints clear rates per walk and player', () => {
    const seeds = Number(process.env.SIM_SEEDS ?? 150);
    const walks = (process.env.SIM_WALKS ?? '1-1,1-2,1-3,2-1,3-1').split(',').map((w) => w.split('-').map(Number));
    const lines: string[] = [];
    lines.push('walk | player | clear | timeout | tangled | median s (clears) | median home | median twists | max chain');
    for (const [level, stage] of walks) {
      for (const p of PLAYERS) {
        const outs: Outcome[] = [];
        for (let s = 1; s <= seeds; s++) outs.push(playWalk(level, stage, s, p));
        const n = outs.length;
        const pct = (k: Outcome['result']): string => `${Math.round((100 * outs.filter((o) => o.result === k).length) / n)}%`;
        const clears = outs.filter((o) => o.result === 'clear');
        lines.push(
          `${level}-${stage} | ${p.name} | ${pct('clear')} | ${pct('timeout')} | ${pct('tangled')} | ${median(clears.map((o) => o.seconds)).toFixed(0)} | ${median(outs.map((o) => o.home))}/${outs[0].target} | ${median(outs.map((o) => o.twists))} | ${Math.max(...outs.map((o) => o.maxChain))}`,
        );
      }
    }
    writeFileSync(process.env.SIM_OUT ?? 'clips/sim_results.md', lines.join('\n') + '\n');
    console.log('\n' + lines.join('\n') + '\n');
  });
});
