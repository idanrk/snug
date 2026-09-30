// Slight 3D: cards lean toward the pointer, and the hero phone turns to look at it while the color
// patches and Lily drift at their own depths. This only tracks where the pointer is (--px and --py,
// from -0.5 to 0.5); style.css turns that into tilt, glare and parallax, and eases it.
// This half is mouse and trackpad only, the second half is scroll (any device), and neither runs with Reduce Motion.
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

// Scroll, on every device: the hero phone tips as it moves up the screen. --sp runs from 1 as it comes up to
// -1 as it leaves; style.css turns that into tilt, sheen and parallax, on top of the pointer tilt above. Nothing
// hides the phone: it's always painted, even before this script runs. (.scrolling shows the sheen on desktop.)
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const art = document.querySelector(".hero-art");
  if (!art) return;

  let frame = 0, idle = 0, scrolling = false;
  function measure() {
    frame = 0;
    const r = art.getBoundingClientRect();
    const sp = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2 + r.height / 2);
    art.style.setProperty("--sp", Math.max(-1, Math.min(1, sp)).toFixed(3));
  }
  const onScroll = () => {
    frame ||= requestAnimationFrame(measure);
    if (!scrolling) { scrolling = true; art.classList.add("scrolling"); }
    clearTimeout(idle);
    idle = setTimeout(() => { scrolling = false; art.classList.remove("scrolling"); }, 300);
  };

  if (!("IntersectionObserver" in window)) {
    art.classList.add("live");
    addEventListener("scroll", onScroll, { passive: true });
  } else {
    new IntersectionObserver(([e]) => {
      art.classList.toggle("live", e.isIntersecting);
      if (e.isIntersecting) { addEventListener("scroll", onScroll, { passive: true }); measure(); }
      else removeEventListener("scroll", onScroll);
    }).observe(art);
  }
})();
