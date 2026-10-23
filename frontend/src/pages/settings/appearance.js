import { settingsService } from "../../settings/settings-service.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { applyTheme, resolveTheme } from "../../theme/theme.js";
import { settingsCard, settingsShell } from "./settings-layout.js";

const themeOptions = [
  { value: "light", label: "Light", description: "Bright canvas, dark text." },
  { value: "dark", label: "Dark", description: "The Mosaic default." },
  { value: "system", label: "System", description: "Follow your device setting." }
];

function optionMarkup(option, current) {
  return `
    <label class="settings-theme-option">
      <input type="radio" name="theme" value="${option.value}" ${current === option.value ? "checked" : ""}>
      <span class="settings-theme-body">
        <span class="settings-theme-label">${option.label}</span>
        <span class="settings-theme-description">${option.description}</span>
      </span>
    </label>`;
}

function pageMarkup(settings) {
  return settingsShell({
    title: "Appearance",
    description: "Choose how Mosaic looks on this device.",
    body: `
      <form class="settings-form" id="appearance-form">
        ${settingsCard({
          title: "Theme",
          description: "Your choice is saved to your account, so it follows you to any browser you sign in from.",
          content: `
            <fieldset class="settings-theme-options">
              <legend class="settings-legend">Theme</legend>
              ${themeOptions.map((option) => optionMarkup(option, settings.theme)).join("")}
            </fieldset>
            <p class="settings-note">Currently showing the ${escapeHtml(resolveTheme(settings.theme))} theme.</p>`
        })}
        <div class="settings-actions">
          <p class="profile-form-message" id="appearance-message" role="status" aria-live="polite"></p>
          <button class="button button-primary" type="submit">Save theme</button>
        </div>
      </form>`
  });
}

export async function renderAppearanceSettings(container) {
  container.classList.remove("explore-shell");
  container.innerHTML = `<section class="settings-state" aria-live="polite"><p>Loading appearance settings…</p></section>`;
  try {
    let settings = await settingsService.get();
    container.innerHTML = pageMarkup(settings);
    const form = container.querySelector("#appearance-form");
    const message = container.querySelector("#appearance-message");
    const options = [...form.querySelectorAll("input[name=theme]")];

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      const requested = options.find((option) => option.checked)?.value;
      if (!requested || requested === settings.theme) {
        message.textContent = "Nothing changed.";
        return;
      }
      button.disabled = true;
      message.textContent = "Saving…";
      try {
        settings = await settingsService.update({ theme: requested });
        applyTheme(settings.theme);
        options.forEach((option) => { option.checked = option.value === settings.theme; });
        message.textContent = "Theme saved.";
      } catch (error) {
        // Restore the last theme the server confirmed.
        applyTheme(settings.theme);
        options.forEach((option) => { option.checked = option.value === settings.theme; });
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  } catch (error) {
    container.innerHTML = `
      <section class="settings-state" role="alert">
        <h1>Appearance settings unavailable</h1>
        <p class="muted">${escapeHtml(error.message)}</p>
        <button class="button button-primary" type="button" data-settings-retry>Try again</button>
      </section>`;
    container.querySelector("[data-settings-retry]")?.addEventListener("click", () => {
      renderAppearanceSettings(container);
    });
  }
}
