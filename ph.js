// The hero's Product Hunt link says what is true today. Snug launches there on Tue Oct 20, 12:01 AM Pacific
// (07:01 UTC while it's still daylight time) and stays on the day's list for 24 hours. Before that it's a
// heads-up and links to Snug's page; during it, the link goes to the launch itself; after it's just a link.
// Without this script the markup already reads as the heads-up.
(() => {
  const link = document.querySelector("[data-ph]");
  const text = link && link.querySelector("[data-ph-text]");
  if (!text) return;
  const start = Date.parse("2026-10-20T07:01:00Z");
  const now = Date.now();
  if (now < start) return;
  if (now < start + 24 * 3600 * 1000) {
    text.innerHTML = "We're live on Product Hunt <b>today</b>";
    link.href = "https://www.producthunt.com/products/snug?launch=snug";
  } else {
    text.textContent = "Snug on Product Hunt";
  }
})();
