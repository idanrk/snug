// Slight 3D: cards lean toward the pointer, and the hero phone turns to look at it while the color
// patches and Lily drift at their own depths. This only tracks where the pointer is (--px and --py,
// from -0.5 to 0.5); style.css turns that into tilt, glare and parallax, and eases it.
// This half is mouse and trackpad only, the second half is touch, and neither runs with Reduce Motion.
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

// Touch (iPhone): no pointer to follow, so the hero phone answers the scroll instead. --sp runs from 1 as
// it comes up the screen to -1 as it leaves; style.css turns that into tilt, sheen and parallax, and it plays
// its entrance when it first scrolls into view. Nothing else moves it.
(() => {
  if (!matchMedia("(hover: none), (pointer: coarse)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const art = document.querySelector(".hero-art");
  if (!art) return;

  // Scroll: where the phone is on the screen, and whether it's on the screen at all.
  let frame = 0;
  function measure() {
    frame = 0;
    const r = art.getBoundingClientRect();
    const sp = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2 + r.height / 2);
    art.style.setProperty("--sp", Math.max(-1, Math.min(1, sp)).toFixed(3));
  }
  const onScroll = () => { frame ||= requestAnimationFrame(measure); };

  if (!("IntersectionObserver" in window)) {
    art.classList.add("in", "live");
    addEventListener("scroll", onScroll, { passive: true });
  } else {
    let seen = false;
    new IntersectionObserver(([e]) => {
      art.classList.toggle("live", e.isIntersecting);
      if (e.isIntersecting) { addEventListener("scroll", onScroll, { passive: true }); measure(); }
      else removeEventListener("scroll", onScroll);
      if (!seen && e.intersectionRatio >= .3) { seen = true; art.classList.add("in"); }
    }, { threshold: [0, .3] }).observe(art);
  }
})();
