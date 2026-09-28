// The launch list and its gift. Joining unwraps the pre-launch code on the ticket: an App Store offer
// code for a free month of Snug Club (App Store Connect ▸ Snug Club subscription ▸ Offer Codes, a
// custom code named SNUGEARLY). The form's action says where signups go; see the note on the form.
(() => {
  const form = document.getElementById("signup");
  if (!form) return;
  const card = document.getElementById("launch-card");
  const ticket = document.getElementById("ticket");
  const code = document.getElementById("code");
  const hint = document.getElementById("code-hint");
  const copy = document.getElementById("copy");
  const joined = document.getElementById("joined");
  const byEmail = form.getAttribute("action").startsWith("mailto:");
  const key = "snug-joined";

  // Days to launch, counted in whole calendar days on the visitor's clock.
  const countdown = document.getElementById("countdown");
  const [y, m, d] = countdown.dataset.date.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d) - today) / 864e5);
  if (days > 1) countdown.textContent = `Launching in ${days} days`;
  else if (days === 1) countdown.textContent = "Launching tomorrow";
  else if (days === 0) countdown.textContent = "Launching today";

  function reveal(viaEmail) {
    form.hidden = true;
    joined.hidden = false;
    joined.querySelectorAll(".by-email").forEach(el => { el.hidden = !viaEmail; });
    joined.querySelectorAll(".by-list").forEach(el => { el.hidden = viaEmail; });
    ticket.classList.add("open");
    code.removeAttribute("aria-hidden");
    hint.hidden = true;
    copy.hidden = false;
  }

  // Back again after joining: the code is waiting. (Only for a real list; an unsent email isn't a signup.)
  try { if (localStorage.getItem(key)) reveal(false); } catch { /* storage blocked */ }

  form.addEventListener("submit", e => {
    if (byEmail) {
      e.preventDefault();
      const body = `Please add me to the Snug launch list: ${form.elements.email.value.trim()}`;
      location.href = `${form.getAttribute("action")}&body=${encodeURIComponent(body)}`;
    } else {
      try { localStorage.setItem(key, "1"); } catch { /* storage blocked */ }
    }
    // Next tick, so the browser has already taken the form's data for the list's own tab.
    setTimeout(() => {
      reveal(byEmail);
      card.classList.add("cheer");
      joined.focus();
    });
  });

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      copy.textContent = "Copied";
      setTimeout(() => { copy.textContent = "Copy"; }, 1800);
    } catch {
      getSelection().selectAllChildren(code); // no clipboard: select it for a manual copy
    }
  });

  // Pass the gift on: the share sheet on phones, a copied link elsewhere.
  const share = document.getElementById("gift-share");
  share.addEventListener("click", async () => {
    const url = "https://idanrk.github.io/snug/#launch";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Snug", text: "Snug, a cozy daily logic puzzle, comes to iPhone on October 20. Join the launch list for a free month of Snug Club.", url });
      } else {
        await navigator.clipboard.writeText(url);
        share.textContent = "Link copied";
        setTimeout(() => { share.textContent = "Send a friend the gift"; }, 1800);
      }
    } catch { /* closed the share sheet */ }
  });
})();
