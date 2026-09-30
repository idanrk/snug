// The launch list and its gift. Joining unwraps the pre-launch code on the ticket: an App Store offer
// code for a free month of Snug Club Monthly (offer "Launch list gift"; the custom code SNUGEARLY, 25,000
// codes, was attached on 2026-09-30 and works once the app is out on Oct 20).
// The signup forms (the hero's and the launch section's) post to Kit (form 9976568, "Snug launch
// list"), which emails a confirmation link; an address joins the list only once that link is tapped,
// and Kit then opens subscribed.html. Here the post stays on the page. Without JS the browser posts
// the form itself and Kit shows its own "check your email" page.
(() => {
  if (!document.getElementById("signup")) return;
  const forms = [...document.querySelectorAll("form.signup")];
  const card = document.getElementById("launch-card");
  const ticket = document.getElementById("ticket");
  const code = document.getElementById("code");
  const hint = document.getElementById("code-hint");
  const copy = document.getElementById("copy");
  const key = "snug-joined";
  // Where each form says "you're on the list": its data-joined, or the launch section's panel.
  const joinedOf = form => document.getElementById(form.dataset.joined || "joined");

  // Days to launch, counted in whole calendar days on the visitor's clock.
  const countdown = document.getElementById("countdown");
  const [y, m, d] = countdown.dataset.date.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d) - today) / 864e5);
  if (days > 1) countdown.textContent = `Launching in ${days} days`;
  else if (days === 1) countdown.textContent = "Launching tomorrow";
  else if (days === 0) countdown.textContent = "Launching today";

  // Joining anywhere unwraps the gift everywhere: each form gives way to its own "you're on the list",
  // asking to confirm when it's just happened. (store.js may have removed the hero's form by now.)
  function reveal(fresh) {
    for (const form of forms) {
      if (!form.isConnected) continue;
      const joined = joinedOf(form);
      form.hidden = true;
      joined.hidden = false;
      joined.querySelectorAll(".fresh").forEach(el => { el.hidden = !fresh; });
      joined.querySelectorAll(".back").forEach(el => { el.hidden = fresh; });
    }
    ticket.classList.add("open");
    code.removeAttribute("aria-hidden");
    hint.hidden = true;
    copy.hidden = false;
  }

  // Back again after joining: the code is waiting.
  try { if (localStorage.getItem(key)) reveal(false); } catch { /* storage blocked */ }

  for (const form of forms) {
    const button = form.querySelector("button");
    const status = form.querySelector(".form-status");
    const say = (text, tone = "") => {
      status.textContent = text;
      status.className = `form-status ${tone}`.trim();
    };

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      say("Adding you…");
      try {
        const response = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });
        const reply = response.ok ? await response.json() : {};
        if (reply.status === "success") {
          try { localStorage.setItem(key, "1"); } catch { /* storage blocked */ }
          say("");
          reveal(true);
          card.classList.add("cheer");
          document.querySelector(".hero-art")?.classList.add("cheer");
          joinedOf(form).focus();
          return;
        }
        // Kit wants to check this sign-up is a person: its own page runs that check.
        if (reply.status === "quarantined") return form.submit();
        say(reply.errors?.messages?.[0] || "That didn't work. Please try again in a moment.", "bad");
      } catch {
        say("Couldn't reach the list. Please try again in a moment.", "bad");
      }
      button.disabled = false;
    });
  }

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
    const url = "https://snugpuzzle.com/#launch";
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
