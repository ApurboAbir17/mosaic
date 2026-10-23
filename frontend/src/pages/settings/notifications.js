import { settingsService } from "../../settings/settings-service.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { settingsCard, settingsShell } from "./settings-layout.js";

const categories = [
  {
    key: "friend_requests",
    label: "Friend requests",
    description: "When someone asks to connect with you."
  },
  {
    key: "friend_accepted",
    label: "New connections",
    description: "When a friend request is accepted."
  },
  {
    key: "social_interactions",
    label: "Social interactions",
    description: "Reactions and comments on your reviews."
  },
  {
    key: "system_updates",
    label: "System updates",
    description: "Important changes to Mosaic itself."
  }
];

function categoryMarkup(category, preferences) {
  return `
    <li class="settings-toggle-row">
      <div>
        <span class="settings-locked-title">${category.label}</span>
        <span class="settings-locked-description">${category.description}</span>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" disabled ${preferences[category.key] ? "checked" : ""}>
        <span class="muted">${preferences[category.key] ? "On" : "Off"}</span>
      </label>
    </li>`;
}

export async function renderNotificationsSettings(container) {
  container.classList.remove("explore-shell");
  container.innerHTML = `<section class="settings-state" aria-live="polite"><p>Loading notification settings…</p></section>`;
  try {
    const settings = await settingsService.get();
    container.innerHTML = settingsShell({
      title: "Notifications",
      description: "The updates Mosaic can send you.",
      body: `
        ${settingsCard({
          title: "Notification preferences",
          description: "These are the categories Mosaic will use once notifications are delivered.",
          content: `
            <p class="settings-note">Notifications are not active yet. Mosaic does not send emails or push messages today, and nothing on this page changes what you receive. The preferences below show the values stored for your account.</p>
            <ul class="settings-locked-list">
              ${categories.map((category) => categoryMarkup(category, settings.notification_preferences ?? {})).join("")}
            </ul>`
        })}`
    });
  } catch (error) {
    container.innerHTML = `
      <section class="settings-state" role="alert">
        <h1>Notification settings unavailable</h1>
        <p class="muted">${escapeHtml(error.message)}</p>
        <button class="button button-primary" type="button" data-settings-retry>Try again</button>
      </section>`;
    container.querySelector("[data-settings-retry]")?.addEventListener("click", () => {
      renderNotificationsSettings(container);
    });
  }
}
