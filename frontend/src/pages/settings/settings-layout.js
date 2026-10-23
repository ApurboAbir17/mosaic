// settingsLayout renders the shared chrome for every settings page so the
// section structure stays identical across the settings area.
export const settingsIcons = {
  account: '<path d="M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M5 19.5c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5"/>',
  privacy: '<path d="M12 3.5 5.5 6v6c0 4 2.8 7.3 6.5 8.5 3.7-1.2 6.5-4.5 6.5-8.5V6L12 3.5Z"/><path d="M9.5 12.2l1.8 1.8 3.4-3.6"/>',
  appearance: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15" fill="currentColor" stroke="none"/>',
  notifications: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3 1 4.5 1 4.5h-13s1-1.5 1-4.5Z"/><path d="M10 18a2 2 0 0 0 4 0"/>',
  data: '<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M5 19.5h14"/>'
};

export function settingsIcon(name) {
  return `<svg class="settings-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    ${settingsIcons[name] ?? ""}</svg>`;
}

export function settingsShell({ title, description, body, backHref = "/settings" }) {
  return `
    <section class="settings-page" aria-labelledby="settings-page-title">
      <header class="settings-heading">
        <div>
          <p class="eyebrow">Settings</p>
          <h1 id="settings-page-title">${title}</h1>
          <p class="muted">${description}</p>
        </div>
        <a class="button button-ghost" href="${backHref}">Back to settings</a>
      </header>
      ${body}
    </section>`;
}

export function settingsCard({ title, description, content }) {
  return `
    <section class="settings-card">
      <header class="settings-card-header">
        <h2>${title}</h2>
        ${description ? `<p class="muted">${description}</p>` : ""}
      </header>
      ${content}
    </section>`;
}
