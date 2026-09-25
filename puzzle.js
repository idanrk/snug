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
  if (!board) return;

  const row = i => Math.floor(i / N), col = i => i % N;
  const placed = new Set();
  let solved = false, last = null;

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
    b.addEventListener("click", () => toggle(i));
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
  }

  document.getElementById("again").addEventListener("click", () => {
    solved = false;
    board.classList.remove("won");
    placed.clear();
    cells.forEach(c => c.querySelectorAll("img").forEach(img => img.remove()));
    after.hidden = true;
    update();
    cells.forEach((c, i) => { c.tabIndex = i === 0 ? 0 : -1; });
    cells[0].focus();
  });

  // Pass the puzzle on: the share sheet on phones, a copied link elsewhere.
  const share = document.getElementById("share");
  share.addEventListener("click", async () => {
    const url = "https://idanrk.github.io/snug/#try";
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
