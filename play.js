// A Snug board, playable in the browser. Two pages use it: daily.html plays today's daily (the same
// puzzle the app shows that day), and practice.html plays one of the practice boards ("Lily's school").
// The rules, solver and hints come from engine.js and the puzzles from daily-data.js or
// practice-data.js. This file is the play session, like the app's GameModel and BoardView: marks,
// undo, the clock, hints, the daily's streak, and the board itself. Progress lives in this browser's
// localStorage and nowhere else.
(() => {
  const E = window.SnugEngine;
  const cellsEl = document.getElementById("cells");
  if (!E || !cellsEl) return;
  const { EMPTY, CROSS, CRITTER } = E;
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);

  // MARK: Which puzzle

  // The practice page plays board ?board=N; without one it shows the list (practice.js) and this
  // file stands down. The daily plays today's puzzle; on a local dev host, ?day=N opens another day
  // (and leaves the streak alone).
  const school = document.body.classList.contains("practice") ? window.SnugPractice || [] : null;
  const dailies = window.SnugDailies;
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const lesson = school ? Math.floor(Number(query.get("board")) || 0) : 0;
  if (school ? lesson < 1 || lesson > school.length : !dailies) return;
  const asked = !school && isLocal ? Number(query.get("day")) || 0 : 0;
  const day = school ? 0 : asked >= 1 ? Math.floor(asked) : E.dayNumber();
  const index = school ? lesson - 1 : E.indexForDay(day, dailies.length);
  const raw = school ? school[index] : dailies[index];
  const puzzle = E.makePuzzle(raw, `${school ? "W" : "D"}${index + 1}`);
  puzzle.solution = E.solutions(puzzle, 1)[0];
  const n = puzzle.n, k = puzzle.k, total = n * k;

  // The cast: one of the twelve first friends for each patch, the same for everyone that day.
  const CAST = ["hazel", "oswin", "pip", "poppy", "rowan", "barnaby", "pebble", "peep", "coral", "bandit", "bao", "flossie"];
  const friends = E.shuffled(CAST, E.seeded(`cast|${puzzle.id}`)).slice(0, n);
  const colors = E.patchColors(puzzle);
  const face = (region, mood = "") => `img/cast/${friends[region]}${mood && `-${mood}`}.webp`;

  // The daily gives three step hints. Practice is for learning, so hints never run out there.
  const HINTS_A_DAY = school ? Infinity : 3;
  const KINDS = {
    classic: { name: "Classic", rule: "One critter in every row, column and color. No touching.", long: "Put one critter in every row, every column and every color patch. Two critters can never touch, not even at the corners." },
    pairs: { name: "Pairs", rule: "Two critters in every row, column and color. No touching.", long: "Today is a Pairs board: put two critters in every row, every column and every color patch. Two critters can never touch, not even at the corners." },
    neighbors: { name: "Stumps", rule: "One critter per row, column and color, no touching. Stumps count the critters touching them.", long: "Put one critter in every row, every column and every color patch. Two critters can never touch, not even at the corners. Today's board has stumps: a numbered stump counts the critters touching it, corners included, and a stump never holds a critter." },
  };
  const kind = KINDS[puzzle.variant];
  const LEVELS = ["Gentle", "Gentle", "Easy", "Tricky", "Hard", "Expert"];

  // MARK: Saved state

  // The daily keeps a streak and one game (today's). Practice keeps each board's best result and a
  // game per board, tagged with the board's shape so a regenerated set can't revive old marks.
  const KEY = school ? "snug-practice" : "snug-daily";
  const shape = Math.floor(E.seeded(raw.r)() * 1e9);
  const record = value => (value && typeof value === "object" ? value : {});
  let saved = {};
  try { saved = record(JSON.parse(localStorage.getItem(KEY))); } catch { /* storage blocked or empty */ }
  const store = school
    ? { done: record(saved.done), games: record(saved.games) }
    : { streak: saved.streak | 0, best: saved.best | 0, last: saved.last | 0, wins: saved.wins | 0, game: null };
  const old = school ? store.games[puzzle.id] : saved.game;
  const usable = old && (school ? old.shape === shape : old.day === day)
    && typeof old.marks === "string" && old.marks.length === puzzle.cellCount && /^[012]+$/.test(old.marks);

  let marks = usable ? Array.from(old.marks, Number) : new Array(puzzle.cellCount).fill(EMPTY);
  for (const clue of puzzle.clueCells) marks[clue] = EMPTY;
  let mistakes = usable ? old.mistakes | 0 : 0;
  let hintsUsed = usable ? old.hints | 0 : 0;
  let jarUsed = usable ? Math.min(HINTS_A_DAY, Math.max(0, old.jar | 0)) : 0;
  let lastHintKey = usable && typeof old.hintKey === "string" ? old.hintKey : null;
  let banked = usable ? Math.max(0, Number(old.seconds) || 0) : 0;
  let runningSince = null, started = banked > 0;
  let solved = false, counted = usable && !!old.solved;
  let undoStack = [], redoStack = [];
  let broken = E.conflicts(puzzle, marks), settled = new Set();
  let hint = null, lastPlaced = null;

  function save() {
    const game = { marks: marks.join(""), seconds: Math.floor(elapsed()), mistakes, hints: hintsUsed, jar: jarUsed, hintKey: lastHintKey, solved };
    if (school) store.games[puzzle.id] = { shape, ...game };
    else store.game = { day, ...game };
    if (asked) return;
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked: play on without saving */ }
  }

  // MARK: Clock (runs from the first move, and only while the page is in view)

  const elapsed = () => banked + (runningSince ? (Date.now() - runningSince) / 1000 : 0);
  const clockText = s => {
    const m = Math.floor(s / 60), sec = String(s % 60).padStart(2, "0");
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };
  const clock = $("clock");
  const showClock = () => { clock.textContent = clockText(Math.floor(elapsed())); };
  function resume() {
    if (solved || runningSince) return;
    runningSince = Date.now();
    started = true;
  }
  function pause() {
    if (!runningSince) return;
    banked = elapsed();
    runningSince = null;
  }
  setInterval(() => { if (runningSince) showClock(); }, 500);

  // MARK: The board

  const board = $("board"), paint = $("paint"), tray = $("tray");
  board.style.setProperty("--n", n);
  tray.style.setProperty("--n", n);
  cellsEl.setAttribute("aria-label", `${school ? `Practice board ${lesson}` : `Daily ${day}`}, ${n} by ${n}`);

  // Patches and grid lines are painted once in SVG, like the app's Canvas layers: one shape per
  // patch (no seams), thin lines inside a patch and thick ones between patches.
  {
    const fills = Array.from({ length: n }, () => "");
    let thin = "", thick = "";
    for (let i = 0; i < puzzle.cellCount; i++) {
      const r = Math.floor(i / n), c = i % n;
      fills[puzzle.regions[i]] += `M${c} ${r}h1v1h-1z`;
      if (c < n - 1) {
        const seg = `M${c + 1} ${r}v1`;
        if (puzzle.regions[i] !== puzzle.regions[i + 1]) thick += seg; else thin += seg;
      }
      if (r < n - 1) {
        const seg = `M${c} ${r + 1}h1`;
        if (puzzle.regions[i] !== puzzle.regions[i + n]) thick += seg; else thin += seg;
      }
    }
    paint.setAttribute("viewBox", `0 0 ${n} ${n}`);
    paint.innerHTML = fills.map((d, region) => `<path d="${d}" style="fill: var(--${colors[region]})"/>`).join("")
      + `<path class="thin" d="${thin}"/><path class="thick" d="${thick}"/>`;
  }

  const rowOf = i => Math.floor(i / n), colOf = i => i % n;
  const shown = new Array(puzzle.cellCount).fill(EMPTY); // the mark each square is showing
  const cells = [];
  for (let i = 0; i < puzzle.cellCount; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sq";
    b.tabIndex = i === 0 ? 0 : -1;
    if (puzzle.clues.has(i)) {
      b.classList.add("has-stump");
      b.innerHTML = `<span class="stump">${puzzle.clues.get(i)}</span>`;
    }
    b.addEventListener("keydown", e => onKey(e, i));
    // Pointers are handled on the grid below. A click that didn't come from one (Enter, Space,
    // a screen reader, switch access) cycles the square.
    b.addEventListener("click", e => { if (e.detail === 0) tap(i); });
    cellsEl.append(b);
    cells.push(b);
  }

  // The tray: each patch's critter waits on a cushion in its patch's color. Tapping one shows its patch.
  const pads = friends.map((_, region) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ppad";
    b.tabIndex = -1;
    b.style.setProperty("--c", `var(--${colors[region]})`);
    b.setAttribute("aria-hidden", "true");
    b.innerHTML = `<img src="${face(region)}" alt="" width="96" height="96" draggable="false"><span class="check"></span>`;
    b.addEventListener("click", () => flash(puzzle.unitCells[2 * n + region]));
    tray.append(b);
    return b;
  });

  // MARK: Input (the app's GameModel)

  function pushUndo() {
    undoStack.push(marks.slice());
    if (undoStack.length > 300) undoStack.shift();
    redoStack = [];
  }

  // Tap cycles a square: empty, ✕, critter, empty.
  function tap(cell) {
    if (solved || puzzle.clues.has(cell)) return;
    resume();
    pushUndo();
    if (marks[cell] === EMPTY) marks[cell] = CROSS;
    else if (marks[cell] === CROSS) return place(cell);
    else marks[cell] = EMPTY;
    recompute();
  }

  function place(cell) {
    const breaks = E.placementBreaksRule(puzzle, marks, cell);
    marks[cell] = CRITTER;
    lastPlaced = cell;
    if (breaks) {
      mistakes++;
      bump();
    }
    recompute();
  }

  // Right-click: straight to a critter, or take one off.
  function toggleCritter(cell) {
    if (solved || puzzle.clues.has(cell)) return;
    resume();
    pushUndo();
    if (marks[cell] === CRITTER) { marks[cell] = EMPTY; recompute(); } else place(cell);
  }

  // The X key: ✕ on, or off.
  function toggleCross(cell) {
    if (solved || puzzle.clues.has(cell)) return;
    resume();
    pushUndo();
    marks[cell] = marks[cell] === CROSS ? EMPTY : CROSS;
    recompute();
  }

  // Dragging across squares marks them all with ✕ (or erases ✕ marks), as one undo step.
  function beginStroke() {
    resume();
    pushUndo();
  }
  function stroke(cell, mode) {
    if (solved || puzzle.clues.has(cell)) return;
    if (mode === "cross" && marks[cell] === EMPTY) marks[cell] = CROSS;
    else if (mode === "erase" && marks[cell] === CROSS) marks[cell] = EMPTY;
    else return;
    recompute();
  }
  function endStroke() {
    // A stroke that changed nothing shouldn't cost an undo step.
    const top = undoStack[undoStack.length - 1];
    if (top && top.every((m, i) => m === marks[i])) undoStack.pop();
    render();
  }

  function undo() {
    if (solved || !undoStack.length) return;
    redoStack.push(marks);
    marks = undoStack.pop();
    hint = null;
    recompute(false);
  }
  function redo() {
    if (solved || !redoStack.length) return;
    undoStack.push(marks);
    marks = redoStack.pop();
    recompute(false);
  }
  function restart() {
    if (solved || marks.every(m => m === EMPTY)) return;
    pushUndo();
    marks = new Array(puzzle.cellCount).fill(EMPTY);
    hint = null;
    recompute(false);
  }

  // Re-derives conflicts, settled units and the solved state, then redraws and saves.
  function recompute(announce = true) {
    broken = E.conflicts(puzzle, marks);
    const now = E.settledUnits(puzzle, marks, broken);
    const fresh = [...now].filter(u => !settled.has(u));
    settled = now;
    // Once the player has done everything the hint suggested, it has served its purpose.
    if (hint && hint.changes.size && [...hint.changes].every(([cell, mark]) => marks[cell] === mark)) hint = null;
    if (E.isSolved(puzzle, marks)) {
      pause();
      solved = true;
      hint = null;
      render();
      return win(true);
    }
    if (announce) for (const u of fresh) flash(puzzle.unitCells[u]);
    render();
    save();
  }

  // MARK: Hints

  const jarLeft = () => HINTS_A_DAY - jarUsed;
  function askHint() {
    if (solved) return;
    const next = E.hint(puzzle, marks, colors);
    // Asking again for the same step is free; only a new logic step draws from the daily's three.
    const charges = next.costs && next.key !== lastHintKey;
    if (next.isStep && charges && jarLeft() <= 0) {
      hint = {
        title: "No slips so far", out: true, focus: new Set(), changes: new Map(),
        message: "Everything on the board is right. Today's three hints are used, so the rest is yours: this puzzle can be finished by logic alone. In the app, the hint jar refills while you play.",
      };
      return render();
    }
    resume();
    if (charges) {
      hintsUsed++;
      lastHintKey = next.key;
      if (next.isStep) jarUsed++;
    }
    hint = next;
    render();
    save();
    if (matchMedia("(max-width: 860px)").matches) $("hint-card").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // "Show me": applies the hint's changes as one undoable step.
  function applyHint() {
    if (!hint || !hint.changes.size || solved) { hint = null; return render(); }
    pushUndo();
    const changes = hint.changes;
    hint = null;
    for (const [cell, mark] of changes) {
      marks[cell] = mark;
      if (mark === CRITTER) lastPlaced = cell;
    }
    recompute();
  }

  // MARK: Drawing

  const statusEl = $("status");
  const unitName = u => (u < n ? `row ${u + 1}` : u < 2 * n ? `column ${u - n + 1}` : `the ${colors[u - 2 * n]} patch`);
  const each = k === 1 ? "one" : "two";

  // Why the board is unhappy, in the order a player would notice.
  function trouble() {
    for (const i of broken.critters) {
      if (puzzle.neighbors[i].some(o => marks[o] === CRITTER)) return "Those two are touching. Critters need their own space.";
    }
    for (const u of broken.crowdedUnits) {
      const what = u < n ? "row" : u < 2 * n ? "column" : "color";
      return `Too many critters in ${unitName(u)}. Each ${what} gets just ${each}.`;
    }
    if (broken.crowdedClues.size) return "Too many critters around a stump. Its number is the most it can have.";
    return null;
  }

  function label(i) {
    const base = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}, ${colors[puzzle.regions[i]]} patch`;
    if (puzzle.clues.has(i)) return `${base}, stump, ${puzzle.clues.get(i)}`;
    if (marks[i] === CRITTER) return `${base}, ${broken.critters.has(i) ? "critter, breaking a rule" : "critter"}`;
    return `${base}, ${marks[i] === CROSS ? "crossed out" : "empty"}`;
  }

  function render() {
    const dots = solved ? new Set() : E.helperDots(puzzle, marks);
    const spot = hint && hint.focus.size ? hint : null;
    board.classList.toggle("hinting", !!spot);
    $("play").classList.toggle("hinting", !!hint);
    board.classList.toggle("done", solved);
    cells.forEach((b, i) => {
      const mark = marks[i], bad = broken.critters.has(i);
      if (shown[i] !== mark) {
        if (shown[i] === CRITTER) {
          const gone = b.querySelector("img:not(.out)");
          if (gone) { gone.classList.add("out"); setTimeout(() => gone.remove(), 130); }
        }
        if (shown[i] === CROSS) b.querySelector(".x")?.remove();
        if (mark === CRITTER) {
          const img = document.createElement("img");
          img.alt = "";
          img.draggable = false;
          img.className = "in";
          b.append(img);
        } else if (mark === CROSS) {
          const x = document.createElement("i");
          x.className = "x";
          b.append(x);
        }
        shown[i] = mark;
      }
      if (mark === CRITTER) {
        const img = b.querySelector("img:not(.out)");
        const src = face(puzzle.regions[i], bad ? "grumpy" : solved ? "happy" : "");
        if (img.getAttribute("src") !== src) img.src = src;
      }
      b.classList.toggle("bad", bad);
      b.classList.toggle("dot", mark === EMPTY && dots.has(i));
      b.classList.toggle("dim", !!spot && !spot.focus.has(i));
      b.classList.toggle("ring", !!spot && spot.changes.has(i));
      b.setAttribute("aria-label", label(i));
      if (puzzle.clues.has(i)) {
        const around = puzzle.neighbors[i].filter(o => marks[o] === CRITTER).length;
        const stump = b.firstElementChild;
        stump.classList.toggle("crowded", broken.crowdedClues.has(i));
        stump.classList.toggle("happy", !broken.crowdedClues.has(i) && around === puzzle.clues.get(i));
      }
    });

    // The tray: a friend hops off once its patch is settled, and frowns while its patch breaks a rule.
    pads.forEach((pad, region) => {
      const home = settled.has(2 * n + region);
      const grumpy = !home && puzzle.unitCells[2 * n + region].some(i => broken.critters.has(i));
      pad.classList.toggle("done", home);
      const img = pad.firstElementChild, src = face(region, grumpy ? "grumpy" : "");
      if (img.getAttribute("src") !== src) img.src = src;
    });

    const placed = marks.filter(m => m === CRITTER).length;
    const why = solved ? null : trouble();
    statusEl.classList.toggle("bad", !!why);
    if (why) statusEl.textContent = why;
    else if (solved) statusEl.textContent = "Solved!";
    else if (marks.every(m => m === EMPTY)) statusEl.textContent = "Tap a square once for ✕, twice for a critter.";
    else if (placed >= total) statusEl.textContent = "Every critter is out, but something's not snug yet.";
    else statusEl.textContent = placed === 0 ? `${total} critters to place.` : `${total - placed} to go.`;

    $("undo").disabled = solved || !undoStack.length;
    $("redo").disabled = solved || !redoStack.length;
    $("restart").disabled = solved || marks.every(m => m === EMPTY);
    // The daily: three step hints. Once they're gone the button still checks the board for slips, free.
    const left = jarLeft();
    $("jar").textContent = left;
    $("jar").hidden = !!school || left <= 0;
    $("hint-label").textContent = left > 0 ? "Hint" : "Check";
    $("hint-button").classList.toggle("empty", left <= 0);
    $("hint-button").setAttribute("aria-label", school ? "Hint" : left > 0 ? `Hint. ${left} of ${HINTS_A_DAY} left today` : "Check the board for slips. No hints left today");
    $("tools-note").hidden = left > 0;

    const card = $("hint-card");
    card.hidden = !hint;
    if (hint) {
      $("hint-kicker").textContent = hint.out ? "No hints left today" : hint.key === "done" ? "Hint"
        : !hint.isStep ? (school ? "A slip" : "A slip · no hint used")
        : school ? "Hint" : `Hint ${jarUsed} of ${HINTS_A_DAY}${left > 0 ? "" : " · the last one today"}`;
      $("hint-title").textContent = hint.title;
      $("hint-text").textContent = hint.message;
      $("hint-apply").hidden = !hint.changes.size;
    }
    showClock();
  }

  // A warm glow over a row, column or patch that just got all its critters.
  function flash(list) {
    for (const i of list) {
      const b = cells[i];
      b.classList.remove("flash");
      void b.offsetWidth; // restart the animation
      b.classList.add("flash");
    }
  }
  cellsEl.addEventListener("animationend", e => { if (e.animationName === "glow") e.target.classList.remove("flash"); });

  // The board shakes when a critter lands somewhere it can't be.
  function bump() {
    board.classList.remove("bump");
    void board.offsetWidth;
    board.classList.add("bump");
  }

  // MARK: Solved

  const stars = () => (mistakes === 0 && hintsUsed === 0 ? 3 : hintsUsed <= 1 && mistakes <= 2 ? 2 : 1);
  const liveStreak = () => (store.last >= E.dayNumber() - 1 ? store.streak : 0);

  // The daily's streak, always in view up in the bar: an outline until today's puzzle is solved, lit after.
  function showStreak() {
    const pill = $("streak");
    if (school || !pill) return;
    const streak = asked ? 0 : liveStreak();
    pill.hidden = streak < 1;
    if (streak < 1) return;
    const kept = store.last >= E.dayNumber();
    $("streak-count").textContent = streak;
    pill.classList.toggle("kept", kept);
    pill.title = kept ? `${streak} day streak. Best: ${store.best}.` : `${streak} day streak. Solve today's puzzle to keep it going.`;
    $("streak-text").textContent = kept ? " day streak" : " day streak, today's puzzle still to solve";
  }

  function win(fresh) {
    const seconds = Math.floor(elapsed()), earned = stars();
    if (school) {
      // A practice board keeps its best result: most stars, then the quickest time.
      const best = store.done[puzzle.id];
      if (fresh && !(best && (best.stars > earned || (best.stars === earned && best.seconds <= seconds)))) {
        store.done[puzzle.id] = { stars: earned, seconds };
      }
    } else if (fresh && !counted && !asked) {
      // A daily counts for the day it was opened on, like the app.
      if (store.last === day - 1) store.streak += 1;
      else if (store.last !== day) store.streak = 1;
      store.last = Math.max(store.last, day);
      store.best = Math.max(store.best, store.streak);
      store.wins += 1;
      counted = true;
    }
    save();

    const streak = school || asked ? 0 : liveStreak();
    $("stars").setAttribute("aria-label", `${earned} of 3 stars`);
    [...$("stars").children].forEach((star, i) => star.classList.toggle("on", i < earned));
    $("result-title").textContent = `${school ? `Board ${lesson}` : `Daily #${day}`} solved in ${clockText(seconds)}`;
    const slips = mistakes + (hintsUsed - jarUsed);
    const facts = [
      jarUsed === 0 ? "No hints" : `${jarUsed} ${jarUsed === 1 ? "hint" : "hints"}`,
      slips === 0 ? "No slips" : `${slips} ${slips === 1 ? "slip" : "slips"}`,
    ];
    if (streak > 0) facts.push(`${streak} day streak`);
    $("result-facts").textContent = facts.join(" · ");
    if (school) {
      // On to the next board, or back to the daily once the last one is done.
      const last = lesson >= school.length, next = $("next-board");
      next.textContent = last ? "Play today's daily" : `Board ${lesson + 1}`;
      next.href = last ? "daily.html" : `?board=${lesson + 1}`;
      $("school-done").hidden = !last;
    } else {
      $("result-streaks").hidden = asked > 0 || store.wins < 2;
      $("result-streaks").textContent = `Best streak ${store.best} · ${store.wins} dailies solved`;
      showStreak();
    }

    // Critters hop in a wave, starting from the last one placed.
    const from = lastPlaced ?? puzzle.solution[0];
    cells.forEach((b, i) => {
      if (marks[i] !== CRITTER) return;
      const d = Math.max(Math.abs(rowOf(i) - rowOf(from)), Math.abs(colOf(i) - colOf(from)));
      b.style.setProperty("--d", `${d * 70}ms`);
    });
    if (fresh) board.classList.add("won");

    const result = $("result");
    const reveal = () => {
      $("tools").hidden = true;
      $("meter").hidden = true;
      result.hidden = false;
      if (!school) countdown();
      if (fresh) {
        result.classList.add("arrive");
        result.focus({ preventScroll: true });
        result.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    };
    if (fresh) setTimeout(reveal, 1100); else reveal();
  }

  // Until the next daily: midnight on the player's own clock.
  let ticking = 0;
  function countdown() {
    const next = $("next");
    if (E.dayNumber() !== day) {
      clearInterval(ticking);
      next.innerHTML = `A new puzzle is ready. <a href="daily.html">Play it</a>`;
      next.querySelector("a").addEventListener("click", e => { e.preventDefault(); location.reload(); });
      return;
    }
    const now = new Date();
    const left = Math.max(0, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now);
    const h = Math.floor(left / 36e5), m = Math.floor((left % 36e5) / 6e4);
    next.textContent = h > 0 ? `Next puzzle in ${h}h ${m}m` : m > 0 ? `Next puzzle in ${m}m` : "Next puzzle in under a minute";
    ticking ||= setInterval(countdown, 20000);
  }

  // A practice board can be played again from scratch (its best result stays).
  $("again")?.addEventListener("click", () => {
    delete store.games[puzzle.id];
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked */ }
    solved = true; // nothing more to save on the way out
    location.reload();
  });

  // Pass it on, spoiler free: the share sheet on phones, a copied note elsewhere.
  const share = $("share");
  share?.addEventListener("click", async () => {
    const earned = stars(), streak = liveStreak();
    const lines = [
      `Snug Daily #${day} ${"⭐".repeat(earned)}${"☆".repeat(3 - earned)}`,
      `⏱ ${clockText(Math.floor(elapsed()))}${hintsUsed === 0 ? " · no hints" : ""}`,
    ];
    if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
    lines.push("https://snugpuzzle.com/daily");
    const text = lines.join("\n");
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) return await navigator.share({ text });
      await navigator.clipboard.writeText(text);
      share.textContent = "Copied";
    } catch (error) {
      if (error && error.name === "AbortError") return; // closed the share sheet
      share.textContent = "Couldn't copy";
    }
    setTimeout(() => { share.textContent = "Share your time"; }, 1800);
  });

  // MARK: Pointer, mouse and keyboard

  function cellAt(e) {
    const r = cellsEl.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / (r.width / n)), row = Math.floor((e.clientY - r.top) / (r.height / n));
    return c < 0 || row < 0 || c >= n || row >= n ? null : row * n + c;
  }

  // Squares along the line between two squares, so fast strokes don't skip any.
  function between(a, b) {
    let r = rowOf(a), c = colOf(a);
    const r1 = rowOf(b), c1 = colOf(b);
    const dr = Math.abs(r1 - r), dc = Math.abs(c1 - c), sr = r < r1 ? 1 : -1, sc = c < c1 ? 1 : -1;
    let err = dc - dr;
    const out = [];
    while (r !== r1 || c !== c1) {
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c += sc; }
      if (e2 < dc) { err += dc; r += sr; }
      out.push(r * n + c);
    }
    return out;
  }

  // One drag per finger, so two thumbs can tap in quick succession without one swallowing the other.
  const drags = new Map(); // pointerId → { start, last, mode }
  function focusCell(i, move = true) {
    cells.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; });
    if (move) cells[i].focus({ preventScroll: true });
  }

  cellsEl.addEventListener("pointerdown", e => {
    if (solved) return;
    const i = cellAt(e);
    if (i === null) return;
    if (e.pointerType === "mouse" && (e.button === 2 || (e.button === 0 && e.ctrlKey))) return toggleCritter(i);
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drags.set(e.pointerId, { start: i, last: i, mode: null });
    cells[i].classList.add("pressed");
    focusCell(i, false);
    try { cellsEl.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
  });
  cellsEl.addEventListener("pointermove", e => {
    const drag = drags.get(e.pointerId);
    if (!drag) return;
    const i = cellAt(e);
    if (i === null) return;
    if (!drag.mode) {
      // It becomes a stroke the moment the pointer crosses into another square.
      if (i === drag.start) return;
      drag.mode = marks[drag.start] === CROSS ? "erase" : "cross";
      cells[drag.start].classList.remove("pressed");
      beginStroke();
      stroke(drag.start, drag.mode);
    }
    if (i === drag.last) return;
    for (const cell of between(drag.last, i)) stroke(cell, drag.mode);
    drag.last = i;
  });
  const lift = e => {
    const drag = drags.get(e.pointerId);
    if (!drag) return;
    drags.delete(e.pointerId);
    cells[drag.start].classList.remove("pressed");
    if (drag.mode) endStroke();
    else if (e.type === "pointerup" && cellAt(e) === drag.start) tap(drag.start);
  };
  cellsEl.addEventListener("pointerup", lift);
  cellsEl.addEventListener("pointercancel", lift);
  cellsEl.addEventListener("contextmenu", e => e.preventDefault());
  // On the board two quick taps are a move and a drag is a stroke: never Safari's double-tap zoom
  // or a scroll. touch-action says so in CSS, but iOS Safari still zooms unless the touch is claimed.
  for (const type of ["touchstart", "touchend"]) {
    cellsEl.addEventListener(type, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

  // Arrow keys move between squares (one tab stop for the whole board), X marks, Backspace clears.
  // Enter and Space arrive as a click, above.
  function onKey(e, i) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = rowOf(i), c = colOf(i);
    const to = { ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1] }[e.key];
    if (to) {
      e.preventDefault();
      const clamp = v => Math.min(n - 1, Math.max(0, v));
      return focusCell(clamp(to[0]) * n + clamp(to[1]));
    }
    if (e.key === "x" || e.key === "X") { e.preventDefault(); toggleCross(i); }
    else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (!solved && marks[i] !== EMPTY) { resume(); pushUndo(); marks[i] = EMPTY; recompute(); }
    }
  }
  document.addEventListener("keydown", e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (key === "y") { e.preventDefault(); redo(); }
  });

  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("restart").addEventListener("click", restart);
  $("hint-button").addEventListener("click", askHint);
  $("hint-apply").addEventListener("click", applyHint);
  $("hint-dismiss").addEventListener("click", () => { hint = null; render(); });

  // Leaving the page pauses the clock and saves; coming back the next day brings the next puzzle.
  function leave() {
    pause();
    if (!solved) save();
  }
  function comeBack() {
    if (!school && !asked && E.dayNumber() !== day && (solved || marks.every(m => m === EMPTY))) return location.reload();
    if (started && !solved) resume();
    if (solved && !school) countdown();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) leave(); else comeBack(); });
  addEventListener("pagehide", leave);
  addEventListener("pageshow", e => { if (e.persisted) comeBack(); }); // back from the page cache

  // MARK: Start

  const graded = E.grade(puzzle);
  if (school) {
    $("day-date").innerHTML = `<a href="?">Lily's school</a> · Board ${lesson} of ${school.length}`;
    const teaches = E.lessonOf(puzzle);
    $("day-title").textContent = teaches.name;
    $("tip").textContent = teaches.tip;
    document.title = `Board ${lesson}: ${teaches.name} | Lily's school, by Snug`;
  } else {
    const date = E.dateOfDay(day);
    $("day-date").textContent = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    $("day-title").textContent = `Daily #${day}`;
    $("how-rules").textContent = kind.long;
  }
  $("chips").innerHTML = `<span>${kind.name}</span><span class="chip-size">${n} × ${n}</span><span>${LEVELS[graded.difficulty] || "Tricky"}</span>`;
  $("rule").textContent = kind.rule;

  settled = E.settledUnits(puzzle, marks, broken);
  showStreak();
  if (E.isSolved(puzzle, marks)) {
    solved = true;
    render();
    win(false);
  } else {
    render();
  }

  // The other faces are small: fetch them once the board is up, so a frown never arrives late.
  const warm = () => friends.forEach((_, region) => ["grumpy", "happy"].forEach(mood => { new Image().src = face(region, mood); }));
  if ("requestIdleCallback" in window) requestIdleCallback(warm); else setTimeout(warm, 800);
})();
