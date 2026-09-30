// The App Store buttons. While Snug is a pre-order each [data-store] spot is a "Pre-order on the App
// Store" button (a "Download" badge would be wrong). Once Apple's lookup shows Snug released (its release
// date has passed), every spot becomes the real "Download" badge, with no site update needed, and the page
// is marked live, which shows the launch gift's "Redeem now" link: offer codes only work on a released app.
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
      // Still a pre-order: keep the pre-order buttons ("Download" would be wrong until release day).
      if (new Date(results[0].releaseDate) > new Date()) return;
      spots.forEach((spot, i) => spot.replaceWith(badge(i > 0)));
      // Once Snug is out: the gift code can be redeemed, and the pre-launch signup (anything marked
      // data-list, like the hero's email field) is done with. The launch section stays for its gift.
      if (new Date(results[0].releaseDate) <= new Date()) {
        document.documentElement.classList.add("live");
        document.querySelectorAll("[data-list]").forEach((el) => el.remove());
      }
    })
    .catch(() => {});
})();
