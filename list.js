// The launch list. The form posts to Kit (form 9976568, "Snug launch list"), which emails a
// confirmation link; an address joins the list only once that link is tapped, and Kit then opens
// subscribed.html. Here the post stays on the page. Without JS the browser posts the form itself
// and Kit shows its own "check your email" page.
(() => {
  const form = document.getElementById("notify");
  if (!form) return;
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const status = document.getElementById("notify-status");
  const say = (text, tone = "") => {
    status.textContent = text;
    status.className = `notify-note ${tone}`.trim();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
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
        input.readOnly = true;
        say("Almost there! Check your inbox (and spam folder, just in case) and tap the button in our email.", "good");
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
})();
