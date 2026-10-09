import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Game } from './game';
import type { Knot } from './types';

function fresh(seed = 7): Game {
  const g = new Game(CONFIG, seed);
  g.startStage(1, 1);
  g.drain();
  return g;
}

/** Frame on gap 2, which holds exactly one knot with the given top; adjacent ropes never share a colour. */
function setup(top: 'left' | 'right'): { g: Game; knot: Knot } {
  const g = fresh();
  g.ropes.forEach((r, i) => (r.color = i % 2));
  g.knots = [];
  g.knots.push({ id: 900, left: g.ropes[2].id, right: g.ropes[3].id, top, row: 5, power: 'none' });
  // keep the other ropes alive with far-away knots so nothing vanishes mid-test
  for (let i = 0; i < g.ropes.length - 1; i++) {
    if (i === 1 || i === 2 || i === 3) continue;
    g.knots.push({ id: 901 + i, left: g.ropes[i].id, right: g.ropes[i + 1].id, top: 'left', row: i, power: 'none' });
  }
  g.frameType = 'blue';
  g.moveFrame(2);
  g.drain();
  return { g, knot: g.knots[0] };
}

describe('frame parity', () => {
  it('blue untwists a knot whose RIGHT rope is on top, then flips to red', () => {
    const { g, knot } = setup('right');
    g.frameType = 'blue';
    g.act();
    const ev = g.drain().map((e) => e.type);
    expect(ev).toContain('untwist');
    expect(g.knots.find((k) => k.id === knot.id)).toBeUndefined();
    expect(g.frameType).toBe('red');
  });

  it('blue twists a knot whose LEFT rope is on top (adds a knot above) and still flips', () => {
    const { g, knot } = setup('left');
    const before = g.knots.length;
    g.act();
    const ev = g.drain();
    expect(ev.some((e) => e.type === 'twist')).toBe(true);
    expect(g.knots.length).toBe(before + 1);
    const added = g.knots.find((k) => k.id !== knot.id && k.left === knot.left && k.right === knot.right);
    expect(added?.row).toBe(knot.row - 1);
    expect(added?.top).toBe(knot.top);
    expect(g.frameType).toBe('red');
    expect(g.chain).toBe(0);
  });

  it('a stuck knot is solved by acting elsewhere first', () => {
    const { g, knot } = setup('left');
    g.moveFrame(0);
    g.act(); // whatever happens here, the frame flips to red
    g.moveFrame(2);
    g.drain();
    expect(g.frameType).toBe('red');
    expect(g.wouldUntwist(knot)).toBe(true);
    g.act();
    expect(g.drain().some((e) => e.type === 'untwist')).toBe(true);
  });

  it('same-colour ropes untwist with either frame', () => {
    const { g, knot } = setup('left');
    g.ropes[3].color = g.ropes[2].color;
    expect(g.wouldUntwist(knot, 'blue')).toBe(true);
    expect(g.wouldUntwist(knot, 'red')).toBe(true);
  });

  it('alternate orientation: push layers flip top side, start rows alternate by row parity', () => {
    const g = fresh();
    for (const k of g.knots) expect(k.top).toBe(k.row % 2 === 0 ? 'left' : 'right');
    g.push();
    const first = g.drain().find((e) => e.type === 'push');
    const tops1 = new Set((first && first.type === 'push' ? first.spawned : []).map((k) => k.top));
    expect(tops1.size).toBe(1);
    g.push();
    const second = g.drain().find((e) => e.type === 'push');
    const tops2 = new Set((second && second.type === 'push' ? second.spawned : []).map((k) => k.top));
    expect(tops2.size).toBe(1);
    expect([...tops1][0]).not.toBe([...tops2][0]);
  });

  it('a stage never opens stuck', () => {
    for (let seed = 1; seed < 40; seed++) expect(fresh(seed).readyCount()).toBeGreaterThan(0);
  });

  it('neighbouring ropes never start with the same colour', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = fresh(seed);
      for (let i = 1; i < g.ropes.length; i++) expect(g.ropes[i].color).not.toBe(g.ropes[i - 1].color);
    }
  });

  it('the chain decays when no untwist lands inside the window', () => {
    const { g } = setup('right');
    g.act();
    expect(g.chain).toBe(1);
    g.tick(CONFIG.rules.chainWindowMs + 1);
    expect(g.chain).toBe(0);
    expect(g.drain().some((e) => e.type === 'chain')).toBe(true);
  });

  it('braid: a crossing swaps the two ropes for every row below it', () => {
    const g = fresh();
    g.knots = [{ id: 1, left: g.ropes[1].id, right: g.ropes[2].id, top: 'left', row: 4, power: 'none' }];
    const perms = g.perms();
    expect(perms[4]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(perms[5]).toEqual([0, 2, 1, 3, 4, 5]);
    expect(perms[CONFIG.board.rows]).toEqual([0, 2, 1, 3, 4, 5]);
    // a second crossing of the same pair below undoes the swap
    g.knots.push({ id: 2, left: g.ropes[1].id, right: g.ropes[2].id, top: 'left', row: 7, power: 'none' });
    expect(g.perms()[8]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('same-colour rule uses the ropes that actually meet at the knot', () => {
    const g = fresh();
    g.ropes.forEach((r, i) => (r.color = i)); // all distinct
    // crossing at row 2 swaps ropes 0 and 1; at row 5 columns 1,2 hold ropes 0 and 2
    g.knots = [
      { id: 1, left: g.ropes[0].id, right: g.ropes[1].id, top: 'left', row: 2, power: 'none' },
      { id: 2, left: g.ropes[1].id, right: g.ropes[2].id, top: 'left', row: 5, power: 'none' },
    ];
    const pair = g.ropesAtKnot(g.knots[1]);
    expect(pair?.map((r) => r.id)).toEqual([g.ropes[0].id, g.ropes[2].id]);
    g.ropes[0].color = g.ropes[2].color;
    expect(g.wouldUntwist(g.knots[1], 'blue')).toBe(true);
  });

  it('a bonus flips the frame without acting', () => {
    const g = fresh();
    g.frameType = 'blue';
    g.bonuses = 1;
    expect(g.flipWithBonus()).toBe(true);
    expect(g.frameType).toBe('red');
    expect(g.bonuses).toBe(0);
    expect(g.flipWithBonus()).toBe(false);
  });
});

describe('ropes and pushes', () => {
  it('a rope with no knots left disappears and the gaps close', () => {
    const { g } = setup('right');
    const ropeCount = g.ropes.length;
    g.act();
    const removed = g.drain().filter((e) => e.type === 'ropeRemoved');
    expect(removed.length).toBe(2); // both ropes of the lone knot were otherwise knot-free (setup keeps the rest alive)
    expect(g.ropes.length).toBe(ropeCount - 2);
  });

  it('a push moves every knot one row down and spawns at the top', () => {
    const g = fresh();
    const rows = g.knots.map((k) => k.row);
    g.push();
    const ev = g.drain().find((e) => e.type === 'push');
    expect(ev && ev.type === 'push' && ev.spawned.length).toBeGreaterThan(0);
    const pushedRows = g.knots.slice(0, rows.length).map((k) => k.row);
    expect(pushedRows).toEqual(rows.map((r) => r + 1));
  });

  it('game over when a knot reaches the bottom', () => {
    const g = fresh();
    g.knots[0].row = CONFIG.board.rows - 1;
    g.push();
    expect(g.status).toBe('gameOver');
  });

  it('every rope starts knotted and knots sit in the top third', () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = fresh(seed);
      for (const r of g.ropes) expect(g.knotsOfRope(r.id).length).toBeGreaterThan(0);
      const maxRow = Math.floor(CONFIG.board.rows * CONFIG.board.startRowsFraction);
      for (const k of g.knots) expect(k.row).toBeLessThan(maxRow);
    }
  });

  it('a rope is never in two knots on one row', () => {
    for (let seed = 1; seed < 20; seed++) {
      const g = fresh(seed);
      for (let i = 0; i < 6; i++) g.push();
      const seen = new Set<string>();
      for (const k of g.knots) {
        for (const id of [k.left, k.right]) {
          const key = `${id}:${k.row}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it('clearing the last rope ends the stage and cashes unused bonuses', () => {
    const g = fresh();
    g.ropes = g.ropes.slice(0, 2);
    g.ropes.forEach((r, i) => (r.color = i));
    g.knots = [{ id: 1, left: g.ropes[0].id, right: g.ropes[1].id, top: 'right', row: 3, power: 'none' }];
    g.bonuses = 2;
    g.frameType = 'blue';
    g.moveFrame(0);
    g.drain();
    const before = g.score;
    g.act();
    expect(g.status).toBe('stageClear');
    const s = CONFIG.scoring;
    expect(g.score).toBe(before + s.untwist + 2 * s.ropeRemoved + 2 * s.bonusUnused + s.stageClear);
    g.nextStage();
    expect(g.stage).toBe(2);
    expect(g.status).toBe('playing');
  });
});
