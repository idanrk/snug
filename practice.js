// Lily's school (practice.html): the list of practice boards. Each card shows the board's patches, what
// it teaches and how the player did. Picking one reloads the page with ?board=N, and play.js takes over.
(() => {
  const E = window.SnugEngine, boards = window.SnugPractice, list = document.getElementById("boards");
  if (!E || !boards || !list) return;
  const playing = Math.floor(Number(new URLSearchParams(location.search).get("board")) || 0);
  if (playing >= 1 && playing <= boards.length) return;
  // A board number that doesn't exist falls back to the list.
  document.documentElement.classList.replace("playing", "listing");

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("snug-practice")) || {}; } catch { /* storage blocked or empty */ }
  const done = saved.done || {}, games = saved.games || {};
  const KINDS = { classic: "Classic", pairs: "Pairs", neighbors: "Stumps" };
  const LEVELS = ["Gentle", "Gentle", "Easy", "Tricky", "Hard", "Expert"];
  const STAR = "M12 2.6l2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 17.1l-5.7 3.1 1.2-6.4L2.8 9.3l6.4-.8z";
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // The board in small: its patches and the lines between them, never the answer.
  function mini(p) {
    const n = p.n, colors = E.patchColors(p), fills = Array.from({ length: n }, () => "");
    let lines = "";
    for (let i = 0; i < p.cellCount; i++) {
      const r = Math.floor(i / n), c = i % n;
      fills[p.regions[i]] += `M${c} ${r}h1v1h-1z`;
      if (c < n - 1 && p.regions[i] !== p.regions[i + 1]) lines += `M${c + 1} ${r}v1`;
      if (r < n - 1 && p.regions[i] !== p.regions[i + n]) lines += `M${c} ${r + 1}h1`;
    }
    return `<svg class="board-mini" viewBox="0 0 ${n} ${n}" aria-hidden="true" focusable="false">`
      + fills.map((d, region) => `<path d="${d}" style="fill: var(--${colors[region]})"/>`).join("")
      + `<path class="lines" d="${lines}"/></svg>`;
  }

  let next = 0; // the first board not solved yet
  list.innerHTML = boards.map((raw, i) => {
    const id = `W${i + 1}`, p = E.makePuzzle(raw, id), best = done[id], game = games[id];
    const begun = !best && game && typeof game.marks === "string" && /[12]/.test(game.marks);
    if (!best && !next) next = i + 1;
    const state = best
      ? `<span class="board-state" role="img" aria-label="Solved, ${best.stars} of 3 stars, in ${clock(best.seconds | 0)}">`
        + [0, 1, 2].map(star => `<svg viewBox="0 0 24 24" class="${star < best.stars ? "on" : ""}"><path d="${STAR}"/></svg>`).join("")
        + `<span>${clock(best.seconds | 0)}</span></span>`
      : `<span class="board-state">${begun ? "In progress" : next === i + 1 ? "Start here" : ""}</span>`;
    return `<li><a class="board-card${best ? " done" : next === i + 1 ? " next" : ""}" href="?board=${i + 1}">${mini(p)}`
      + `<span class="board-copy"><span class="board-num">Board ${i + 1}</span><strong>${E.lessonOf(p).name}</strong>`
      + `<span class="board-meta">${KINDS[p.variant]} · ${p.n} × ${p.n} · ${LEVELS[E.grade(p).difficulty] || "Tricky"}</span>${state}</span></a></li>`;
  }).join("");

  const solved = boards.filter((_, i) => done[`W${i + 1}`]).length;
  const tally = document.getElementById("school-tally");
  if (tally && solved) tally.textContent = solved === boards.length ? `All ${boards.length} boards solved.` : `${solved} of ${boards.length} solved.`;
})();
