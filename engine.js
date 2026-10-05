// The Snug engine for the website's games (the daily in daily.html, the practice boards in
// practice.html): the rules, the uniqueness solver and the human-technique reasoner that writes the
// hints. A port of Packages/SnugKit (Puzzle, Rules, Solver, Reasoner, Schedule) and App/Game/Hints.swift:
// when one of those changes, change this to match. scripts/web-daily-check.mjs runs it over every
// daily and practice board and compares it with what SnugKit generated.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SnugEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // What the player has put in a square (Mark), and what a solver knows about one (CellValue).
  const EMPTY = 0, CROSS = 1, CRITTER = 2;
  const UNKNOWN = 0, STAR = 1, NONE = 2;
  const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

  const count = (list, test) => { let c = 0; for (const x of list) if (test(x)) c++; return c; };

  // MARK: Schedule

  // Everyone gets the same daily for their local calendar date. Day 1 is 2026-09-01.
  const FIRST_DAY = Date.UTC(2026, 8, 1);
  const dayNumber = (date = new Date()) =>
    Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - FIRST_DAY) / 864e5) + 1;
  const dateOfDay = day => new Date(FIRST_DAY + (day - 1) * 864e5); // read it with the UTC getters
  // Index into a list of `total` dailies; wraps once the list runs out.
  const indexForDay = (day, total) => (((day - 1) % total) + total) % total;

  // MARK: Puzzle

  // From the compact form: {n, k, r: "001122…", c: [[cell, count], …]}. Geometry is worked out once.
  function makePuzzle(raw, id) {
    const n = raw.n, k = raw.k;
    const regions = Array.from(raw.r, ch => DIGITS.indexOf(ch));
    if (regions.length !== n * n || regions.includes(-1)) throw new Error("bad region string");
    const clues = new Map((raw.c || []).slice().sort((a, b) => a[0] - b[0]).map(([cell, value]) => [cell, value]));
    // Units: rows 0..<n, columns n..<2n, regions 2n..<3n.
    const unitCells = Array.from({ length: 3 * n }, () => []);
    const cellUnits = [], neighbors = [], orthogonal = [];
    for (let cell = 0; cell < n * n; cell++) {
      const r = Math.floor(cell / n), c = cell % n;
      unitCells[r].push(cell);
      unitCells[n + c].push(cell);
      unitCells[2 * n + regions[cell]].push(cell);
      cellUnits.push([r, n + c, 2 * n + regions[cell]]);
      const around = [], edge = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          around.push(rr * n + cc);
          if (dr === 0 || dc === 0) edge.push(rr * n + cc);
        }
      }
      neighbors.push(around);
      orthogonal.push(edge);
    }
    const puzzle = {
      id, n, k, regions, clues, clueCells: [...clues.keys()], cellCount: n * n,
      unitCells, cellUnits, neighbors, orthogonal,
      variant: clues.size ? "neighbors" : k === 2 ? "pairs" : "classic",
      solution: null,
    };
    return puzzle;
  }

  const rowOf = (p, cell) => Math.floor(cell / p.n);
  const colOf = (p, cell) => cell % p.n;
  const touching = (p, a, b) => a !== b && Math.abs(rowOf(p, a) - rowOf(p, b)) <= 1 && Math.abs(colOf(p, a) - colOf(p, b)) <= 1;

  // MARK: Rules, applied to the player's board

  function conflicts(p, marks) {
    const critters = new Set(), crowdedUnits = new Set(), crowdedClues = new Set();
    p.unitCells.forEach((cells, u) => {
      const here = cells.filter(c => marks[c] === CRITTER);
      if (here.length > p.k) {
        crowdedUnits.add(u);
        here.forEach(c => critters.add(c));
      }
    });
    for (let cell = 0; cell < p.cellCount; cell++) {
      if (marks[cell] !== CRITTER) continue;
      for (const other of p.neighbors[cell]) {
        if (marks[other] === CRITTER) { critters.add(cell); critters.add(other); }
      }
    }
    for (const [clue, value] of p.clues) {
      const around = p.neighbors[clue].filter(c => marks[c] === CRITTER);
      if (around.length > value) {
        crowdedClues.add(clue);
        around.forEach(c => critters.add(c));
      }
    }
    return { critters, crowdedUnits, crowdedClues, isEmpty: critters.size === 0 && crowdedClues.size === 0 };
  }

  // True when a critter placed at `cell` breaks a rule right away. Used to count slips.
  function placementBreaksRule(p, marks, cell) {
    if (p.clues.has(cell)) return true;
    if (p.neighbors[cell].some(o => marks[o] === CRITTER && o !== cell)) return true;
    for (const u of p.cellUnits[cell]) {
      if (count(p.unitCells[u], c => marks[c] === CRITTER && c !== cell) + 1 > p.k) return true;
    }
    for (const clue of p.neighbors[cell]) {
      if (!p.clues.has(clue)) continue;
      if (count(p.neighbors[clue], c => marks[c] === CRITTER && c !== cell) + 1 > p.clues.get(clue)) return true;
    }
    return false;
  }

  function isSolved(p, marks) {
    for (const cells of p.unitCells) if (count(cells, c => marks[c] === CRITTER) !== p.k) return false;
    for (let cell = 0; cell < p.cellCount; cell++) {
      if (marks[cell] !== CRITTER) continue;
      if (p.clues.has(cell)) return false;
      if (p.neighbors[cell].some(o => marks[o] === CRITTER)) return false;
    }
    for (const [clue, value] of p.clues) {
      if (count(p.neighbors[clue], c => marks[c] === CRITTER) !== value) return false;
    }
    return true;
  }

  // Units that hold exactly their critters, none of them in conflict.
  function settledUnits(p, marks, broken) {
    const settled = new Set();
    p.unitCells.forEach((cells, u) => {
      const here = cells.filter(c => marks[c] === CRITTER);
      if (here.length === p.k && here.every(c => !broken.critters.has(c))) settled.add(u);
    });
    return settled;
  }

  // Open squares that can't hold a critter given the critters already placed: the soft helper dots.
  function helperDots(p, marks) {
    const dots = new Set();
    for (let cell = 0; cell < p.cellCount; cell++) {
      if (marks[cell] === CRITTER) p.neighbors[cell].forEach(o => dots.add(o));
    }
    for (const cells of p.unitCells) {
      if (count(cells, c => marks[c] === CRITTER) >= p.k) cells.forEach(c => dots.add(c));
    }
    for (const [clue, value] of p.clues) {
      if (count(p.neighbors[clue], c => marks[c] === CRITTER) >= value) p.neighbors[clue].forEach(c => dots.add(c));
    }
    for (const cell of [...dots]) if (marks[cell] !== EMPTY || p.clues.has(cell)) dots.delete(cell);
    return dots;
  }

  // MARK: Solver state and propagation

  function initialState(p) {
    const cells = new Array(p.cellCount).fill(UNKNOWN);
    for (const clue of p.clueCells) cells[clue] = NONE; // stumps never hold a critter
    return cells;
  }

  // Applies the always-safe rules until nothing changes. Returns null when the state is still
  // possible, or {broken: target} (a unit, a stump, or null for two critters touching) when it isn't.
  function propagate(p, s) {
    const k = p.k;
    let changed = true;
    while (changed) {
      changed = false;
      for (let cell = 0; cell < p.cellCount; cell++) {
        if (s[cell] !== STAR) continue;
        for (const other of p.neighbors[cell]) {
          if (s[other] === STAR) return { broken: null };
          if (s[other] === UNKNOWN) { s[other] = NONE; changed = true; }
        }
      }
      for (let u = 0; u < p.unitCells.length; u++) {
        const cells = p.unitCells[u];
        let stars = 0, open = 0;
        for (const cell of cells) { if (s[cell] === STAR) stars++; else if (s[cell] === UNKNOWN) open++; }
        if (stars > k || stars + open < k) return { broken: { unit: u } };
        if (!open) continue;
        if (stars === k) {
          for (const cell of cells) if (s[cell] === UNKNOWN) s[cell] = NONE;
          changed = true;
        } else if (stars + open === k) {
          for (const cell of cells) if (s[cell] === UNKNOWN) s[cell] = STAR;
          changed = true;
        }
      }
      for (const [clue, value] of p.clues) {
        const around = p.neighbors[clue];
        let stars = 0, open = 0;
        for (const cell of around) { if (s[cell] === STAR) stars++; else if (s[cell] === UNKNOWN) open++; }
        if (stars > value || stars + open < value) return { broken: { clue } };
        if (!open) continue;
        if (stars === value) {
          for (const cell of around) if (s[cell] === UNKNOWN) s[cell] = NONE;
          changed = true;
        } else if (stars + open === value) {
          for (const cell of around) if (s[cell] === UNKNOWN) s[cell] = STAR;
          changed = true;
        }
      }
    }
    return null;
  }

  // Brute-force search with propagation: up to `limit` answers, each as ascending critter squares.
  function solutions(p, limit = 2) {
    const found = [];
    (function search(start) {
      const s = start.slice();
      if (propagate(p, s)) return;
      // Branch on the tightest unit that still needs critters.
      let bestCell = -1, bestOpen = Infinity;
      for (const cells of p.unitCells) {
        let stars = 0, open = 0, firstOpen = -1;
        for (const cell of cells) {
          if (s[cell] === STAR) stars++;
          else if (s[cell] === UNKNOWN) { open++; if (firstOpen < 0) firstOpen = cell; }
        }
        if (stars < p.k && open > 0 && open < bestOpen) { bestOpen = open; bestCell = firstOpen; }
      }
      if (bestCell < 0) {
        if (!s.includes(UNKNOWN)) found.push(s.flatMap((v, i) => (v === STAR ? [i] : [])));
        return;
      }
      const withStar = s.slice();
      withStar[bestCell] = STAR;
      search(withStar);
      if (found.length >= limit) return;
      const without = s.slice();
      without[bestCell] = NONE;
      search(without);
    })(initialState(p));
    return found;
  }

  // MARK: Reasoner (the next step a person could take)

  // Calls `body` with each m-combination of 0..<n (ascending indices) until it returns true.
  function forEachCombination(n, m, body) {
    if (m <= 0 || m > n) return;
    const picks = Array.from({ length: m }, (_, i) => i);
    for (;;) {
      if (body(picks)) return;
      let i = m - 1;
      while (i >= 0 && picks[i] === n - m + i) i--;
      if (i < 0) return;
      picks[i]++;
      for (let j = i + 1; j < m; j++) picks[j] = picks[j - 1] + 1;
    }
  }

  const step = (reason, level, critters, empties) => ({ reason, level, critters, empties, cells: critters.concat(empties) });

  // Level 0: space around a critter, a unit that's full, a stump that's happy.
  function basic(p, s) {
    for (let cell = 0; cell < p.cellCount; cell++) {
      if (s[cell] !== STAR) continue;
      const open = p.neighbors[cell].filter(o => s[o] === UNKNOWN);
      if (open.length) return step({ type: "touching", critter: cell }, 0, [], open);
    }
    for (let u = 0; u < p.unitCells.length; u++) {
      const cells = p.unitCells[u];
      const open = cells.filter(c => s[c] === UNKNOWN);
      if (count(cells, c => s[c] === STAR) === p.k && open.length) return step({ type: "full", unit: u }, 0, [], open);
    }
    for (const clue of p.clueCells) {
      const around = p.neighbors[clue];
      const open = around.filter(c => s[c] === UNKNOWN);
      if (count(around, c => s[c] === STAR) === p.clues.get(clue) && open.length) return step({ type: "clueFull", clue }, 0, [], open);
    }
    return null;
  }

  // Level 1: every open square left in a unit (or around a stump) must hold a critter.
  function lastSpots(p, s) {
    // Smallest units first: "only one spot left" reads more naturally than a whole row.
    const order = p.unitCells.map((_, u) => u).sort((a, b) => p.unitCells[a].length - p.unitCells[b].length);
    for (const u of order) {
      const cells = p.unitCells[u];
      const stars = count(cells, c => s[c] === STAR);
      const open = cells.filter(c => s[c] === UNKNOWN);
      if (open.length && stars < p.k && stars + open.length === p.k) return step({ type: "lastSpots", unit: u }, 1, open, []);
    }
    for (const clue of p.clueCells) {
      const around = p.neighbors[clue];
      const open = around.filter(c => s[c] === UNKNOWN);
      if (open.length && count(around, c => s[c] === STAR) + open.length === p.clues.get(clue)) {
        return step({ type: "clueNeedsAll", clue }, 1, open, []);
      }
    }
    return null;
  }

  const targetKey = t => (t.unit !== undefined ? `u${t.unit}` : `c${t.clue}`);

  // A critter in `cell` would, through the immediate rules alone, leave some target short.
  function crowdedTarget(p, s, cell) {
    const k = p.k, sim = s.slice();
    sim[cell] = STAR;
    for (const other of p.neighbors[cell]) if (sim[other] === UNKNOWN) sim[other] = NONE;
    for (const u of p.cellUnits[cell]) {
      const cells = p.unitCells[u];
      if (count(cells, c => sim[c] === STAR) >= k) for (const other of cells) if (sim[other] === UNKNOWN) sim[other] = NONE;
    }
    for (const clue of p.neighbors[cell]) {
      if (!p.clues.has(clue)) continue;
      const value = p.clues.get(clue), around = p.neighbors[clue];
      const stars = count(around, c => sim[c] === STAR);
      if (stars > value) return { clue };
      if (stars === value) for (const other of around) if (sim[other] === UNKNOWN) sim[other] = NONE;
    }
    // Report the smallest short unit: it makes for the clearest explanation.
    let best = -1, bestSize = 0;
    for (let u = 0; u < p.unitCells.length; u++) {
      const cells = p.unitCells[u];
      const stars = count(cells, c => sim[c] === STAR), open = count(cells, c => sim[c] === UNKNOWN);
      if ((stars > k || stars + open < k) && (best < 0 || cells.length < bestSize)) { best = u; bestSize = cells.length; }
    }
    if (best >= 0) return { unit: best };
    for (const clue of p.clueCells) {
      const around = p.neighbors[clue];
      if (count(around, c => sim[c] === STAR) + count(around, c => sim[c] === UNKNOWN) < p.clues.get(clue)) return { clue };
    }
    return null;
  }

  // Level 2: squares whose critter would crowd a target out of room.
  function crowding(p, s) {
    const groups = new Map(); // in first-seen order
    for (let cell = 0; cell < p.cellCount; cell++) {
      if (s[cell] !== UNKNOWN) continue;
      const target = crowdedTarget(p, s, cell);
      if (!target) continue;
      const key = targetKey(target);
      if (!groups.has(key)) groups.set(key, { target, cells: [] });
      groups.get(key).cells.push(cell);
    }
    // Prefer the explanation that settles the most squares at once.
    let best = null;
    for (const group of groups.values()) if (!best || group.cells.length > best.cells.length) best = group;
    return best && step({ type: "crowds", target: best.target }, 2, [], best.cells);
  }

  // Critters in all of `way` break no rule on their own or against the board.
  function isPossible(p, s, way) {
    for (let i = 0; i < way.length; i++) for (let j = i + 1; j < way.length; j++) if (touching(p, way[i], way[j])) return false;
    const added = new Map();
    for (const cell of way) for (const u of p.cellUnits[cell]) added.set(u, (added.get(u) || 0) + 1);
    for (const [u, extra] of added) if (count(p.unitCells[u], c => s[c] === STAR) + extra > p.k) return false;
    for (const cell of way) {
      for (const clue of p.neighbors[cell]) {
        if (!p.clues.has(clue)) continue;
        const around = p.neighbors[clue];
        if (count(around, c => s[c] === STAR) + count(around, c => way.includes(c)) > p.clues.get(clue)) return false;
      }
    }
    return true;
  }

  // Whether critters in `way` would rule out `cell`.
  function blocks(p, s, way, cell) {
    if (way.some(w => touching(p, w, cell))) return true;
    for (const u of p.cellUnits[cell]) {
      const cells = p.unitCells[u];
      if (count(cells, c => s[c] === STAR) + count(way, w => cells.includes(w)) >= p.k) return true;
    }
    return false;
  }

  // Level 2, for units still needing two or more critters: list every way to fit them, then keep what
  // all ways agree on (squares always used, never used, and outside squares every way would block).
  function fits(p, s) {
    for (let u = 0; u < p.unitCells.length; u++) {
      const cells = p.unitCells[u];
      const need = p.k - count(cells, c => s[c] === STAR);
      const open = cells.filter(c => s[c] === UNKNOWN);
      if (need < 2 || open.length <= need) continue;
      const ways = [];
      forEachCombination(open.length, need, picks => {
        const way = picks.map(i => open[i]);
        if (isPossible(p, s, way)) ways.push(way);
        return false;
      });
      if (!ways.length) continue;
      const always = open.filter(cell => ways.every(w => w.includes(cell)));
      const never = open.filter(cell => ways.every(w => !w.includes(cell)));
      for (let cell = 0; cell < p.cellCount; cell++) {
        if (s[cell] !== UNKNOWN || cells.includes(cell)) continue;
        if (ways.every(w => blocks(p, s, w, cell))) never.push(cell);
      }
      if (always.length || never.length) return step({ type: "fits", unit: u }, 2, always, never.sort((a, b) => a - b));
    }
    return null;
  }

  const bitCount = mask => { let c = 0; for (; mask; mask &= mask - 1) c++; return c; };

  // Levels 3 and 4: if m units of one family fit inside m units of another, those m units of the
  // second family are fully spoken for, so their other squares are empty. ("Pigeonhole" or "squeeze".)
  function squeeze(p, s, from, to, level) {
    const n = p.n;
    // Unit index range of each family, and which slot of cellUnits names a square's unit in it.
    const families = [{ lo: 2 * n, hi: 3 * n, slot: 2 }, { lo: 0, hi: n, slot: 0 }, { lo: n, hi: 2 * n, slot: 1 }];
    const pairs = [[0, 1], [0, 2], [1, 0], [2, 0], [1, 2], [2, 1]]; // regions, rows, columns in both directions
    for (let m = from; m <= to; m++) {
      for (const [a, b] of pairs) {
        const base = families[b].lo;
        // For each open unit in family a, the set of family-b units its live squares touch.
        const open = [];
        for (let u = families[a].lo; u < families[a].hi; u++) {
          const cells = p.unitCells[u];
          if (!cells.some(c => s[c] === UNKNOWN)) continue;
          let mask = 0;
          for (const cell of cells) if (s[cell] !== NONE) mask |= 1 << (p.cellUnits[cell][families[b].slot] - base);
          open.push({ unit: u, mask });
        }
        if (open.length < m) continue;
        let result = null;
        forEachCombination(open.length, m, picks => {
          let mask = 0;
          for (const i of picks) mask |= open[i].mask;
          if (bitCount(mask) !== m) return false;
          const areas = picks.map(i => open[i].unit);
          const lines = [], empties = [];
          for (let bit = 0; bit < n; bit++) {
            if (!(mask & (1 << bit))) continue;
            lines.push(base + bit);
            for (const cell of p.unitCells[base + bit]) {
              if (s[cell] === UNKNOWN && !p.cellUnits[cell].some(u => areas.includes(u))) empties.push(cell);
            }
          }
          if (!empties.length) return false;
          result = step({ type: "confined", areas, lines }, level, [], empties.sort((x, y) => x - y));
          return true;
        });
        if (result) return result;
      }
    }
    return null;
  }

  // Level 5: trying a critter in a square leads, step by step, to something running out of room.
  function whatIf(p, s) {
    for (let cell = 0; cell < p.cellCount; cell++) {
      if (s[cell] !== UNKNOWN) continue;
      const trial = s.slice();
      trial[cell] = STAR;
      const outcome = propagate(p, trial);
      if (outcome) return step({ type: "whatIf", cell, breaks: outcome.broken }, 5, [], [cell]);
    }
    return null;
  }

  // The easiest available step, or null when stuck (or solved).
  const nextDeduction = (p, s) =>
    basic(p, s) || lastSpots(p, s) || crowding(p, s) || fits(p, s) || squeeze(p, s, 1, 1, 3) || squeeze(p, s, 2, 3, 4) || whatIf(p, s);

  // The named tricks a solve can call for, easiest first, with the line Lily gives a learner.
  // The names are the hint titles, so a practice board's trick and its hints say the same thing.
  const TRICKS = {
    spot: { name: "Only one spot left", tip: "Find a row, column or color with just one open square. Its critter goes there." },
    crowd: { name: "Too crowded", tip: "Some squares would leave a patch with no room if a critter sat there. Those squares stay empty." },
    ways: { name: "Only a few ways", tip: "When a row or patch still needs two critters, picture every way they could fit. What do all the ways agree on?" },
    squeeze: { name: "Squeezed in", tip: "When a whole patch fits inside one row or column, that line's critter must come from the patch." },
    tight: { name: "A tight squeeze", tip: "When two patches fit inside the same two rows or columns, they use those lines up." },
    picture: { name: "Picture it", tip: "Stuck? Picture a critter in a square and follow the rules. If something runs out of room, cross that square out." },
  };
  const KIND_LESSONS = {
    neighbors: { name: "Stumps", tip: "A stump's number counts the critters touching it, corners included. A stump never holds a critter." },
    pairs: { name: "Pairs", tip: "Every row, column and color takes two critters here, and they still can't touch." },
  };
  // What a practice board is there to teach: its kind when it isn't a classic board, else its hardest trick.
  const lessonOf = p => KIND_LESSONS[p.variant] || TRICKS[grade(p).trick];
  const trickOf = reason =>
    reason.type === "crowds" ? "crowd" : reason.type === "fits" ? "ways" : reason.type === "whatIf" ? "picture"
      : reason.type === "confined" ? (reason.areas.length === 1 ? "squeeze" : "tight") : "spot";

  // Solves from scratch with human techniques only, and grades the puzzle 1 to 5 the way the app does.
  // `trick` is the hardest technique the solve needed (the first of them, when several tie).
  function grade(p) {
    const s = initialState(p), steps = [];
    let trick = "spot", top = -1;
    while (s.includes(UNKNOWN)) {
      const next = nextDeduction(p, s);
      if (!next) break;
      for (const cell of next.critters) s[cell] = STAR;
      for (const cell of next.empties) s[cell] = NONE;
      steps.push(next.level);
      if (next.level > top) { top = next.level; trick = trickOf(next.reason); }
    }
    const stars = s.flatMap((v, i) => (v === STAR ? [i] : []));
    const hardest = steps.length ? Math.max(...steps) : 0;
    const hard = count(steps, l => l >= 3);
    let difficulty;
    if (hardest <= 1) difficulty = 1;
    else if (hardest === 2) difficulty = 2;
    else if (hardest === 3) difficulty = hard >= 4 ? 3 : 2;
    else if (hardest === 4) difficulty = hard >= 6 ? 4 : 3;
    else difficulty = count(steps, l => l === 5) >= 3 ? 5 : 4;
    return { complete: !s.includes(UNKNOWN), stars, steps, difficulty, trick };
  }

  // MARK: Hints (teach the next step instead of revealing a square)

  const capitalized = text => text.charAt(0).toUpperCase() + text.slice(1);
  const listed = names =>
    names.length <= 1 ? names.join("") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  // The hint for the board as it stands. `names` are the patch color names, by region.
  // A hint: {title, message, focus: Set, changes: Map(square → mark), key, costs, isStep}.
  function hint(p, marks, names) {
    const answer = new Set(p.solution);
    const unitName = u => (u < p.n ? `row ${u + 1}` : u < 2 * p.n ? `column ${u - p.n + 1}` : `the ${names[u - 2 * p.n] || "colored"} patch`);
    const targetName = t => (t.unit !== undefined ? unitName(t.unit) : "the stump");
    const targetCells = t => new Set(t.unit !== undefined ? p.unitCells[t.unit] : p.neighbors[t.clue].concat([t.clue]));
    const all = Array.from({ length: p.cellCount }, (_, i) => i);

    // 1. Slips first: a critter that breaks a rule or sits in the wrong place, or a ✕ over a critter's home.
    const broken = conflicts(p, marks);
    if (!broken.isEmpty) {
      const wrong = [...broken.critters].filter(c => !answer.has(c));
      return {
        title: "Grumpy critters",
        message: `Some critters are breaking a rule. Look for the grumpy faces. Every critter needs its own ${p.k === 1 ? "row, column and patch" : "space"}, and no touching, not even at the corners.`,
        focus: broken.critters, changes: new Map(wrong.map(c => [c, EMPTY])), key: "conflict", costs: false, isStep: false,
      };
    }
    const misplaced = all.find(c => marks[c] === CRITTER && !answer.has(c));
    if (misplaced !== undefined) {
      return {
        title: "This one's not snug",
        message: "The highlighted critter can't stay there, even though nothing looks wrong yet. Take it out and follow the logic from the other squares.",
        focus: new Set([misplaced]), changes: new Map([[misplaced, EMPTY]]), key: `misplaced-${misplaced}`, costs: true, isStep: false,
      };
    }
    const covered = all.find(c => marks[c] === CROSS && answer.has(c));
    if (covered !== undefined) {
      return {
        title: "A critter's home is crossed out",
        message: "One of your ✕ marks is sitting where a critter belongs. Clear it and look again.",
        focus: new Set([covered]), changes: new Map([[covered, EMPTY]]), key: `covered-${covered}`, costs: true, isStep: false,
      };
    }

    // 2. The next step a person could take from here.
    const s = initialState(p);
    for (const cell of all) {
      if (marks[cell] === CRITTER) s[cell] = STAR;
      else if (marks[cell] === CROSS) s[cell] = NONE;
    }
    for (const cell of helperDots(p, marks)) s[cell] = NONE;
    const next = nextDeduction(p, s);
    if (!next) {
      return {
        title: "Looking good!", message: "Everything on the board is right. Fill in the last critters to finish.",
        focus: new Set(), changes: new Map(), key: "done", costs: false, isStep: false,
      };
    }

    const critters = p.k === 1 ? "critter" : "critters";
    const r = next.reason;
    let title, message, focus;
    switch (r.type) {
      case "touching":
        title = "Personal space";
        message = "Critters don't like to touch, not even at the corners. Every square around this critter can be crossed out.";
        focus = new Set([r.critter]);
        break;
      case "full":
        title = "Already taken";
        message = `${capitalized(unitName(r.unit))} already has its ${critters}, so its other squares stay empty.`;
        focus = new Set(p.unitCells[r.unit]);
        break;
      case "clueFull": {
        const value = p.clues.get(r.clue);
        title = "Stump is happy";
        message = `This stump already has ${value} ${value === 1 ? "critter" : "critters"} around it, so its other neighbors stay empty.`;
        focus = new Set([r.clue]);
        break;
      }
      case "lastSpots": {
        const open = count(p.unitCells[r.unit], c => s[c] === UNKNOWN);
        title = open === 1 ? "Only one spot left" : "Exactly enough room";
        message = open === 1
          ? `${capitalized(unitName(r.unit))} has just one open spot left, so its critter goes right there.`
          : `${capitalized(unitName(r.unit))} needs ${open} more critters and has exactly ${open} open spots, so fill them all.`;
        focus = new Set(p.unitCells[r.unit]);
        break;
      }
      case "clueNeedsAll": {
        const value = p.clues.get(r.clue);
        title = "Every neighbor counts";
        message = `This stump needs ${value} ${value === 1 ? "critter" : "critters"} touching it, and that's exactly how many open squares it has left. They all get critters.`;
        focus = new Set([r.clue]);
        break;
      }
      case "crowds": {
        const many = next.empties.length > 1;
        const squeezeText = p.k === 1
          ? `would touch or share a line with every open spot in ${targetName(r.target)}, leaving it no room`
          : `would crowd out so many spots in ${targetName(r.target)} that its critters couldn't all fit`;
        title = "Too crowded";
        message = `A critter in ${many ? "any highlighted square" : "the highlighted square"} ${squeezeText}. So ${many ? "those squares stay" : "it stays"} empty.`;
        focus = targetCells(r.target);
        break;
      }
      case "fits":
        title = "Only a few ways";
        message = `${capitalized(unitName(r.unit))} can fit its ${critters} in only a few ways. Every one of them agrees on the highlighted squares.`;
        focus = new Set(p.unitCells[r.unit]);
        break;
      case "confined": {
        const areaNames = listed(r.areas.map(unitName)), lineNames = listed(r.lines.map(unitName));
        focus = new Set(r.areas.concat(r.lines).flatMap(u => p.unitCells[u]));
        if (r.areas.length === 1) {
          title = "Squeezed in";
          message = `${capitalized(areaNames)} can only fit inside ${lineNames}. So ${lineNames}'s ${critters} must come from ${areaNames}, and the rest of ${lineNames} stays empty.`;
        } else {
          const total = r.areas.length * p.k;
          title = "A tight squeeze";
          message = `${capitalized(areaNames)} only fit inside ${lineNames}. Those have room for exactly ${total} critters, and ${areaNames} need all ${total}. So every other square in ${lineNames} stays empty.`;
        }
        break;
      }
      default: { // whatIf
        const where = r.breaks ? targetName(r.breaks) : "the board";
        title = "Picture it";
        message = `Imagine a critter in the highlighted square. Following the rules from there, ${where} soon runs out of room. So that square must stay empty.`;
        focus = r.breaks ? targetCells(r.breaks) : new Set();
        focus.add(r.cell);
      }
    }
    for (const cell of next.cells) focus.add(cell);
    const changes = new Map();
    for (const cell of next.critters) changes.set(cell, CRITTER);
    for (const cell of next.empties) changes.set(cell, CROSS);
    return { title, message, focus, changes, key: `step-${next.cells.slice().sort((a, b) => a - b).join(",")}`, costs: true, isStep: true };
  }

  // MARK: Patch colors

  // The app's Cozy board theme (App/Views/Components/Theme.swift). style.css has a variable for each
  // name, with its dark-mode twin.
  const SWATCHES = [
    ["peach", 0xF9CBA7], ["mint", 0xBDE6CB], ["sky", 0xB9DBF3], ["lilac", 0xD8C6EF], ["butter", 0xF7E39B],
    ["rose", 0xF5BFCB], ["pistachio", 0xCDEFAE], ["orchid", 0xF2B8EE], ["coral", 0xF4A596], ["teal", 0x9FDCD3],
  ];

  // A small seeded generator (mulberry32 over an FNV-1a hash), so a puzzle always looks the same.
  function seeded(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    let a = h >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // sRGB hex to OKLab, so similar hues like coral and rose count as close.
  function okLab(hex) {
    const linear = c => { const v = (c & 0xFF) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const r = linear(hex >> 16), g = linear(hex >> 8), b = linear(hex);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }

  // A stable color name for each patch: a seeded shuffle, then swaps until neighboring patches look
  // as different as possible (no mint beside teal). Same idea as the app's BoardTheme.swatches(for:).
  function patchColors(p) {
    const random = seeded(`colors|${p.id}`);
    let order = shuffled(SWATCHES.map((_, i) => i), random);
    const pairs = new Map();
    for (let cell = 0; cell < p.cellCount; cell++) {
      for (const next of p.orthogonal[cell]) {
        const a = p.regions[cell], b = p.regions[next];
        if (a < b) pairs.set(`${a}-${b}`, [a, b]);
      }
    }
    const lab = SWATCHES.map(([, hex]) => okLab(hex));
    const distance = (a, b) => Math.hypot(lab[a][0] - lab[b][0], lab[a][1] - lab[b][1], lab[a][2] - lab[b][2]) * 100;
    // The closest pair of touching patches matters most, then the rest.
    const score = o => {
      const gaps = [...pairs.values()].map(([a, b]) => distance(o[a], o[b]));
      if (!gaps.length) return 0;
      return Math.min(...gaps) * 4 + gaps.reduce((sum, g) => sum + Math.min(g, 12), 0) / gaps.length;
    };
    let best = score(order);
    for (let tries = 0; tries < 300; tries++) {
      const i = Math.floor(random() * p.n), j = Math.floor(random() * order.length);
      if (i === j) continue;
      [order[i], order[j]] = [order[j], order[i]];
      const candidate = score(order);
      if (candidate >= best) best = candidate;
      else [order[i], order[j]] = [order[j], order[i]];
    }
    return Array.from({ length: p.n }, (_, region) => SWATCHES[order[region % order.length]][0]);
  }

  return {
    EMPTY, CROSS, CRITTER,
    dayNumber, dateOfDay, indexForDay, makePuzzle, touching,
    conflicts, placementBreaksRule, isSolved, settledUnits, helperDots,
    solutions, grade, lessonOf, hint, patchColors, seeded, shuffled,
  };
});
