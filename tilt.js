// Slight 3D: cards lean toward the pointer, and the hero phone turns to look at it while the color
// patches and Lily drift at their own depths. This only tracks where the pointer is (--px and --py,
// from -0.5 to 0.5); style.css turns that into tilt, glare and parallax, and eases it.
// Mouse and trackpad only, and never with Reduce Motion.
(() => {
  if (!matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;

  function follow(area, target = area) {
    area.addEventListener("pointermove", e => {
      if (e.pointerType === "touch") return;
      const r = area.getBoundingClientRect();
      target.style.setProperty("--px", ((e.clientX - r.left) / r.width - .5).toFixed(3));
      target.style.setProperty("--py", ((e.clientY - r.top) / r.height - .5).toFixed(3));
      target.classList.add("tilting");
    });
    area.addEventListener("pointerleave", () => {
      target.style.removeProperty("--px");
      target.style.removeProperty("--py");
      target.classList.remove("tilting");
    });
  }

  document.querySelectorAll("[data-tilt]").forEach(el => follow(el));
  const hero = document.querySelector(".hero");
  if (hero) follow(hero, hero.querySelector(".hero-art"));
})();
