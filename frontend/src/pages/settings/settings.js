import { settingsIcon } from "./settings-layout.js";

const rows = [
  {
    icon: "account",
    title: "Account & Profile",
    description: "Name, username, bio and avatar.",
    href: "/settings/profile"
  },
  {
    icon: "privacy",
    title: "Privacy",
    description: "Who can see your profile and your library.",
    href: "/settings/privacy"
  },
  {
    icon: "appearance",
    title: "Appearance",
    description: "Light, dark or system theme.",
    href: "/settings/appearance"
  },
  {
    icon: "notifications",
    title: "Notifications",
    description: "The updates Mosaic can send you.",
    href: "/settings/notifications"
  },
  {
    icon: "data",
    title: "Your Data",
    description: "Your account details and data controls.",
    href: "/settings/account"
  }
];

function rowMarkup(row) {
  return `
    <li>
      <a class="settings-row" href="${row.href}">
        <span class="settings-row-icon">${settingsIcon(row.icon)}</span>
        <span class="settings-row-body">
          <span class="settings-row-title">${row.title}</span>
          <span class="settings-row-description">${row.description}</span>
        </span>
        <span class="settings-row-chevron" aria-hidden="true">›</span>
      </a>
    </li>`;
}

export function renderSettingsOverview(container) {
  container.classList.remove("explore-shell");
  container.innerHTML = `
    <section class="settings-page" aria-labelledby="settings-page-title">
      <header class="settings-heading">
        <div>
          <p class="eyebrow">Settings</p>
          <h1 id="settings-page-title">Settings</h1>
          <p class="muted">Manage your Mosaic experience and personal information.</p>
        </div>
      </header>
      <div class="settings-card">
        <ul class="settings-rows">
          ${rows.map(rowMarkup).join("")}
        </ul>
      </div>
    </section>`;
}
