// The App Store buttons. Before launch each [data-store] spot is a "coming" label, because the
// App Store link is a dead end until Apple releases the app. Once Apple's lookup finds Snug (released,
// or open for pre-order), every spot becomes the real badge, with no site update needed.
// After launch, put the badges back in the HTML (and drop the launch list form) and this does nothing.
(() => {
  const spots = document.querySelectorAll("[data-store]");
  if (!spots.length) return;
  const badge = (lazy) => {
    const a = document.createElement("a");
    a.className = "store";
    a.href = "https://apps.apple.com/app/id6815366788";
    a.innerHTML = `<picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/white/en-us">
      <img src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us" width="162" height="54" alt="Download on the App Store"${lazy ? ' loading="lazy"' : ""}>
    </picture>`;
    return a;
  };
  fetch("https://itunes.apple.com/lookup?id=6815366788&country=us")
    .then((r) => r.json())
    .then(({ resultCount, results }) => {
      if (!resultCount) return;
      spots.forEach((spot, i) => spot.replaceWith(badge(i > 0)));
      // The launch list (list.js) is for the wait: once Snug is out, it goes.
      if (new Date(results[0].releaseDate) <= new Date()) document.querySelectorAll("[data-list]").forEach((el) => el.remove());
    })
    .catch(() => {});
})();
