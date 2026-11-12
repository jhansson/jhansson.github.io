(() => {
  const banner = document.getElementById("install-banner");
  const action = document.getElementById("install-action");
  const dismiss = document.getElementById("install-dismiss");
  const guide = document.getElementById("install-guide");
  if (!banner || !action || !dismiss || !guide) return;

  const dismissalKey = "tips-reduceraren-install-dismissed";
  const dismissalDuration = 14 * 24 * 60 * 60 * 1000;
  const mobile = navigator.userAgentData?.mobile === true ||
    /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
  const ios = /iPhone|iPod/i.test(navigator.userAgent);
  const standalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone === true;
  let installPrompt = null;

  function dismissedRecently() {
    try {
      const dismissedAt = Number(localStorage.getItem(dismissalKey));
      return dismissedAt > 0 && Date.now() - dismissedAt < dismissalDuration;
    } catch {
      return false;
    }
  }

  function updateVisibility() {
    banner.hidden = !mobile || standalone() || dismissedRecently();
  }

  function instruction() {
    if (ios) {
      return "Öppna sidan i Safari, tryck på Dela och välj Lägg till på hemskärmen.";
    }
    return "Öppna webbläsarens meny (⋮) och välj Installera app eller Lägg till på startskärmen.";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    if (!mobile || standalone()) return;
    event.preventDefault();
    installPrompt = event;
    updateVisibility();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    banner.hidden = true;
  });

  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", updateVisibility);
  window.addEventListener("pageshow", updateVisibility);

  dismiss.addEventListener("click", () => {
    try {
      localStorage.setItem(dismissalKey, String(Date.now()));
    } catch {
      // Keep the dismissal for this page even when storage is unavailable.
    }
    banner.hidden = true;
  });

  action.addEventListener("click", async () => {
    if (installPrompt) {
      const pending = installPrompt;
      installPrompt = null;
      try {
        const result = await pending.prompt();
        const choice = result?.outcome ? result : await pending.userChoice;
        if (choice?.outcome === "accepted") {
          banner.hidden = true;
        }
        return;
      } catch {
        // Offer manual instructions when the browser cannot show its prompt.
      }
    }

    const expanded = action.getAttribute("aria-expanded") === "true";
    guide.hidden = expanded;
    if (!expanded) guide.textContent = instruction();
    action.setAttribute("aria-expanded", String(!expanded));
    action.textContent = expanded ? "Spara som app" : "Dölj instruktionen";
  });

  updateVisibility();
})();

