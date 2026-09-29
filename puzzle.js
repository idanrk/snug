// Sections ease in once as they scroll into view.
(() => {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach(el => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -12% 0px" });
  items.forEach(el => io.observe(el));
})();

// Lily's first puzzle (the app's Level 0, App/Views/Onboarding/Tutorial.swift), playable on the page.
(() => {
  const N = 5;
  const regions = [0, 1, 1, 2, 2,
                   3, 1, 1, 2, 2,
                   3, 3, 4, 4, 2,
                   3, 3, 4, 4, 4,
                   3, 4, 4, 4, 4];
  const patches = [
    { name: "sky", color: "var(--sky)", critter: "oswin" },
    { name: "butter", color: "var(--butter)", critter: "pip" },
    { name: "orchid", color: "var(--orchid)", critter: "hazel" },
    { name: "coral", color: "var(--coral)", critter: "poppy" },
    { name: "teal", color: "var(--teal)", critter: "rowan" },
  ];

  const board = document.getElementById("board");
  const tray = document.getElementById("tray");
  const status = document.getElementById("status");
  const after = document.getElementById("after");
  const demo = document.getElementById("demo");
  if (!board) return;

  const row = i => Math.floor(i / N), col = i => i % N;
  const placed = new Set();
  let solved = false, last = null, teaching = false;

  // Board
  const cells = regions.map((r, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.style.setProperty("--c", patches[r].color);
    if (col(i) === N - 1) b.classList.add("last-c");
    else if (regions[i + 1] !== r) b.classList.add("edge-r");
    if (row(i) === N - 1) b.classList.add("last-r");
    else if (regions[i + N] !== r) b.classList.add("edge-b");
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener("click", () => {
      if (!teaching) toggle(i);
      else if (lesson[step].place === i) advance(); // in the lesson, only the ringed square takes a tap
    });
    b.addEventListener("keydown", e => move(e, i));
    board.append(b);
    return b;
  });

  // Tray: each patch's critter waits under the board, like the app's patch tray.
  const pads = patches.map(p => {
    const d = document.createElement("div");
    d.className = "pad";
    d.style.setProperty("--c", p.color);
    d.innerHTML = `<img src="img/critters/${p.critter}.webp" alt="" width="42" height="42"><span class="check"></span>`;
    tray.append(d);
    return d;
  });

  function toggle(i) {
    if (solved) return;
    const img = cells[i].querySelector("img:not(.out)");
    if (placed.has(i)) {
      placed.delete(i);
      if (img) { img.classList.add("out"); setTimeout(() => img.remove(), 130); }
    } else {
      placed.add(i);
      last = i;
      const c = document.createElement("img");
      c.src = `img/critters/${patches[regions[i]].critter}.webp`;
      c.alt = "";
      c.className = "in";
      cells[i].append(c);
    }
    update();
  }

  function conflict(a, b) {
    if (row(a) === row(b)) return "Two critters in one row. Each row gets just one.";
    if (col(a) === col(b)) return "Two critters in one column. Each column gets just one.";
    if (regions[a] === regions[b]) return `Two critters in the ${patches[regions[a]].name} patch. Each color gets just one.`;
    if (Math.abs(row(a) - row(b)) <= 1 && Math.abs(col(a) - col(b)) <= 1) return "Those two are touching. Critters need their own space.";
    return null;
  }

  function update() {
    const list = [...placed];
    const bad = new Set();
    let reason = null;
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const why = conflict(list[x], list[y]);
        if (why) { bad.add(list[x]); bad.add(list[y]); reason ??= why; }
      }

    cells.forEach((c, i) => {
      const has = placed.has(i);
      c.classList.toggle("bad", bad.has(i));
      // The helper dot: an empty square that a placed critter already rules out.
      c.classList.toggle("dot", !has && list.some(p => conflict(p, i)));
      const p = patches[regions[i]];
      c.setAttribute("aria-label", `Row ${row(i) + 1}, column ${col(i) + 1}, ${p.name} patch${has ? `, ${p.critter[0].toUpperCase() + p.critter.slice(1)} is here` : ""}`);
      c.setAttribute("aria-pressed", has);
    });
    pads.forEach((d, r) => d.classList.toggle("done", list.some(i => regions[i] === r)));

    status.classList.toggle("bad", !!reason);
    const left = N - placed.size;
    if (reason) status.textContent = reason;
    else if (left === 0) win();
    else status.textContent = left === N ? "5 critters to place." : `${left} to go.`;
  }

  function win() {
    solved = true;
    status.textContent = "Solved! There's a new one like it every day.";
    // Critters hop in a wave, starting from the last one placed.
    [...placed].forEach(i => {
      const d = Math.max(Math.abs(row(i) - row(last)), Math.abs(col(i) - col(last)));
      cells[i].querySelector("img").style.setProperty("--d", `${d * 80}ms`);
    });
    board.classList.add("won");
    after.hidden = false;
    demo.hidden = true;
  }

  function reset() {
    stopLesson();
    solved = false;
    board.classList.remove("won");
    placed.clear();
    cells.forEach(c => c.querySelectorAll("img").forEach(img => img.remove()));
    after.hidden = true;
    demo.hidden = false;
    update();
  }

  document.getElementById("again").addEventListener("click", () => {
    reset();
    cells.forEach((c, i) => { c.tabIndex = i === 0 ? 0 : -1; });
    cells[0].focus();
  });

  // "Show me how to play": Lily's lesson on this board, at the player's own pace. First the four rules,
  // then the solve, the way a person would think it through: find a patch with just one open square,
  // put its critter there, and see what that rules out. Next (or tapping the ringed square) moves on,
  // and "Let me try" hands the board back as it is.
  const squares = [...cells.keys()];
  const inRow = r => squares.filter(i => row(i) === r);
  const inCol = c => squares.filter(i => col(i) === c);
  const inPatch = p => squares.filter(i => regions[i] === p);
  const around = i => squares.filter(j => j !== i && Math.abs(row(i) - row(j)) <= 1 && Math.abs(col(i) - col(j)) <= 1);
  const ruledOutBy = i => squares.filter(j => j !== i && conflict(i, j));
  // Each step lights up squares (lit), tints ones that are off limits (ruled), shows a see-through
  // critter (ghost), or rings the square where the next critter goes (place).
  const lesson = [
    { title: "One in every row", text: "Every row gets exactly one critter. There are five rows, so five critters in all.", lit: inRow(2) },
    { title: "One in every column", text: "Every column gets exactly one critter, too.", lit: inCol(2) },
    { title: "One in every color", text: "And every color patch gets exactly one. This teal patch needs a critter, and so does each of the other four.", lit: inPatch(4) },
    { title: "No touching", text: "Critters need their own space: two can never touch, not even at the corners. A critter here would rule out every square around it.", ghost: 12, ruled: around(12) },
    { title: "Start where there's one choice", text: "The sky patch is a single square, and it needs a critter, so its critter has to go right here. Tap the ringed square to place it.", lit: inPatch(0), place: 0 },
    { title: "Dots mark what's ruled out", text: "Now nothing else can go in this critter's row or column, or touch it. The dots mark those squares, so you can skip them.", ruled: ruledOutBy(0) },
    { title: "Only one spot left", text: "Look at the butter patch: three of its four squares have dots. The fourth is the only place its critter can go.", lit: inPatch(1), place: 7 },
    { title: "Keep going", text: "That critter ruled out more squares. Now the orchid patch has just one square without a dot.", lit: inPatch(2), place: 14 },
    { title: "Same trick again", text: "The coral patch is down to one open square, too.", lit: inPatch(3), place: 16 },
    { title: "The last critter", text: "One row, one column and one color are left, and they all meet in this square.", lit: inPatch(4), place: 23 },
  ];
  const box = document.getElementById("lesson");
  const next = document.getElementById("lesson-next");
  let step = 0, run = 0, moving = false;
  const wait = ms => new Promise(done => setTimeout(done, ms));

  function show() {
    const beat = lesson[step];
    board.querySelectorAll(".ghost").forEach(g => g.remove());
    cells.forEach((c, i) => {
      c.classList.toggle("lit", !!beat.lit?.includes(i));
      c.classList.toggle("ruled", !!beat.ruled?.includes(i));
      c.classList.toggle("target", beat.place === i);
    });
    if (beat.ghost !== undefined) {
      const g = document.createElement("img");
      g.src = `img/critters/${patches[regions[beat.ghost]].critter}.webp`;
      g.alt = "";
      g.className = "ghost";
      cells[beat.ghost].append(g);
    }
    document.getElementById("lesson-step").textContent = `Step ${step + 1} of ${lesson.length}`;
    document.getElementById("lesson-title").textContent = beat.title;
    document.getElementById("lesson-text").textContent = beat.text;
    next.textContent = beat.place === undefined ? "Next" : "Place it";
  }

  async function advance() {
    if (moving) return;
    const { place } = lesson[step], me = run;
    if (place !== undefined) {
      cells.forEach(c => c.classList.remove("lit", "ruled", "target"));
      toggle(place);
      if (solved) return finish();
      moving = true;
      await wait(650); // let the critter land and its dots appear
      moving = false;
      if (me !== run) return;
    }
    step++;
    show();
  }

  function stopLesson() {
    run++;
    teaching = false;
    box.hidden = true;
    status.hidden = false;
    demo.hidden = solved;
    board.classList.remove("teaching");
    board.querySelectorAll(".ghost").forEach(g => g.remove());
    cells.forEach(c => c.classList.remove("lit", "ruled", "target"));
  }

  function finish() {
    stopLesson();
    status.textContent = "Solved! That's the whole trick: find a row, column or color with just one open square, and put its critter there. Every Snug puzzle can be solved this way, with no guessing.";
    document.getElementById("again").focus();
  }

  demo.addEventListener("click", () => {
    reset();
    teaching = true;
    step = 0;
    demo.hidden = true;
    status.hidden = true;
    box.hidden = false;
    board.classList.add("teaching");
    show();
    next.focus({ preventScroll: true });
    // On a phone the card sits above the board: bring both into view.
    if (matchMedia("(max-width: 767px)").matches) box.scrollIntoView({ block: "start" });
  });
  next.addEventListener("click", advance);
  document.getElementById("lesson-exit").addEventListener("click", () => {
    stopLesson();
    update();
    cells.find(c => c.tabIndex === 0).focus();
  });

  // Pass the puzzle on: the share sheet on phones, a copied link elsewhere.
  const share = document.getElementById("share");
  share.addEventListener("click", async () => {
    const url = "https://snugpuzzle.com/#try";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Snug", text: "A cozy logic puzzle: one critter in every row, column and color, and no two may touch. Can you solve it?", url });
      } else {
        await navigator.clipboard.writeText(url);
        share.textContent = "Link copied";
        setTimeout(() => { share.textContent = "Send it to a friend"; }, 1800);
      }
    } catch { /* closed the share sheet */ }
  });

  // Arrow keys move between squares (one tab stop for the whole board).
  function move(e, i) {
    const r = row(i), c = col(i);
    const to = { ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1] }[e.key];
    if (!to) return;
    e.preventDefault();
    const [nr, nc] = [Math.min(N - 1, Math.max(0, to[0])), Math.min(N - 1, Math.max(0, to[1]))];
    const j = nr * N + nc;
    cells[i].tabIndex = -1;
    cells[j].tabIndex = 0;
    cells[j].focus();
  }

  update();
})();
