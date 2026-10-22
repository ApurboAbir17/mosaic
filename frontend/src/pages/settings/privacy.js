import { settingsService } from "../../settings/settings-service.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { settingsCard, settingsShell } from "./settings-layout.js";

const lockedSections = [
  {
    label: "Collection",
    description: "The titles you saved in your library."
  },
  {
    label: "Favorites",
    description: "The titles you marked with a heart."
  },
  {
    label: "Watchlist",
    description: "What you plan to watch and what you are watching."
  },
  {
    label: "Ratings",
    description: "The scores you gave to the titles you rated."
  },
  {
    label: "Activity",
    description: "Your future activity feed, including friends-only access."
  }
];

function lockedMarkup() {
  return `
    <ul class="settings-locked-list">
      ${lockedSections.map((section) => `
        <li>
          <div>
            <span class="settings-locked-title">${section.label}</span>
            <span class="settings-locked-description">${section.description}</span>
          </div>
          <span class="badge">Private</span>
        </li>`).join("")}
    </ul>`;
}

function pageMarkup(settings) {
  return settingsShell({
    title: "Privacy",
    description: "Decide what other people can see.",
    body: `
      <form class="settings-form" id="privacy-form">
        ${settingsCard({
          title: "Profile visibility",
          description: "Your profile is the face of your Mosaic account.",
          content: `
            <label class="settings-field">Profile visibility
              <select name="profile_visibility">
                <option value="private" ${settings.profile_visibility === "private" ? "selected" : ""}>Private</option>
                <option value="public" ${settings.profile_visibility === "public" ? "selected" : ""}>Public</option>
              </select>
              <span class="field-help">A public profile can be seen by guests and other members. A private profile stays yours, and your username is never attached to a public review.</span>
            </label>`
        })}
        ${settingsCard({
          title: "Your library",
          description: "Collection, favorites, watchlist, ratings and activity stay private for now.",
          content: `
            ${lockedMarkup()}
            <p class="settings-note">These categories are stored as private by default. They become shareable only when public profiles and their sharing rules are launched, so nothing you keep here can leak by accident.</p>`
        })}
        <div class="settings-actions">
          <p class="profile-form-message" id="privacy-message" role="status" aria-live="polite"></p>
          <button class="button button-primary" type="submit">Save changes</button>
        </div>
      </form>`
  });
}

export async function renderPrivacySettings(container) {
  container.classList.remove("explore-shell");
  container.innerHTML = `<section class="settings-state" aria-live="polite"><p>Loading privacy settings…</p></section>`;
  try {
    let settings = await settingsService.get();
    container.innerHTML = pageMarkup(settings);
    const form = container.querySelector("#privacy-form");
    const message = container.querySelector("#privacy-message");
    const select = form.elements.profile_visibility;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      const requested = select.value;
      if (requested === settings.profile_visibility) {
        message.textContent = "Nothing changed.";
        return;
      }
      button.disabled = true;
      message.textContent = "Saving…";
      try {
        settings = await settingsService.update({ profile_visibility: requested });
        select.value = settings.profile_visibility;
        message.textContent = "Privacy settings saved.";
      } catch (error) {
        // Restore the last value the server confirmed.
        select.value = settings.profile_visibility;
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  } catch (error) {
    container.innerHTML = `
      <section class="settings-state" role="alert">
        <h1>Privacy settings unavailable</h1>
        <p class="muted">${escapeHtml(error.message)}</p>
        <button class="button button-primary" type="button" data-settings-retry>Try again</button>
      </section>`;
    container.querySelector("[data-settings-retry]")?.addEventListener("click", () => {
      renderPrivacySettings(container);
    });
  }
}
