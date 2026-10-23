const STORAGE_KEY = "mosaic-theme";

export const THEMES = ["light", "dark", "system"];

const systemPreference = window.matchMedia("(prefers-color-scheme: light)");

let currentTheme = "system";

function isTheme(value) {
  return THEMES.includes(value);
}

export function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

// resolveTheme turns a stored preference into the theme that is actually
// shown. "system" follows the operating system.
export function resolveTheme(theme) {
  const value = isTheme(theme) ? theme : "system";
  if (value === "system") {
    return systemPreference.matches ? "light" : "dark";
  }
  return value;
}

// applyTheme paints the document and remembers the choice. The same value is
// used for guests (local only) and for signed-in users (also saved on the
// account).
export function applyTheme(theme, { persist = true, notify = true } = {}) {
  currentTheme = isTheme(theme) ? theme : "system";
  const resolved = resolveTheme(currentTheme);
  document.documentElement.toggleAttribute("data-theme", resolved === "light");
  document.documentElement.style.colorScheme = resolved;

  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, currentTheme);
    } catch {
      // A browser with storage disabled still gets the theme for this page.
    }
  }
  if (notify) {
    window.dispatchEvent(new CustomEvent("mosaic:theme-changed", {
      detail: { theme: currentTheme, resolved }
    }));
  }
  return currentTheme;
}

export function getTheme() {
  return currentTheme;
}

// initTheme restores the locally known preference before the app renders and
// keeps a "system" theme in step with the operating system.
export function initTheme() {
  currentTheme = readStoredTheme();
  applyTheme(currentTheme, { persist: false, notify: false });
  systemPreference.addEventListener("change", () => {
    if (currentTheme === "system") {
      applyTheme("system", { persist: false });
    }
  });
  return currentTheme;
}
