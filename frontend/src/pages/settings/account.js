import { authService } from "../../auth/auth-service.js";
import { profileService } from "../../profile/profile-service.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { settingsCard, settingsShell } from "./settings-layout.js";

function memberSince(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function pageMarkup(profile, user) {
  return settingsShell({
    title: "Your Data",
    description: "Your account details and the controls for the data behind it.",
    body: `
      ${settingsCard({
        title: "Account",
        description: "The identity you sign in with.",
        content: `
          <dl class="settings-details">
            <div><dt>Email</dt><dd>${escapeHtml(user.email)}</dd></div>
            <div><dt>Username</dt><dd>@${escapeHtml(profile.username)}</dd></div>
            <div><dt>Display name</dt><dd>${escapeHtml(profile.display_name)}</dd></div>
            <div><dt>Member since</dt><dd>${escapeHtml(memberSince(profile.created_at))}</dd></div>
          </dl>
          <p class="settings-actions-inline"><a class="button button-ghost" href="/settings/profile">Edit profile</a></p>`
      })}
      ${settingsCard({
        title: "Security",
        description: "How you keep your account safe.",
        content: `
          <p class="settings-note">Changing your password is planned for a dedicated security milestone. Until then it is not available here, and no control on this page pretends otherwise. Your session is protected by an HTTP-only cookie and passwords are stored as Argon2id hashes.</p>`
      })}
      ${settingsCard({
        title: "Export and deletion",
        description: "Taking your data with you, or closing your account.",
        content: `
          <p class="settings-note">A full JSON export of your profile, library, ratings and reviews, and a full account deletion, are planned for a later milestone. They are not available today, so nothing here can export or delete your account by accident. Deleting an account needs a confirmation step and a clear explanation of what cannot be undone.</p>`
      })}`
  });
}

export async function renderAccountSettings(container) {
  container.classList.remove("explore-shell");
  container.innerHTML = `<section class="settings-state" aria-live="polite"><p>Loading your account…</p></section>`;
  try {
    const [profile, user] = await Promise.all([profileService.get(), authService.me()]);
    container.innerHTML = pageMarkup(profile, user);
  } catch (error) {
    container.innerHTML = `
      <section class="settings-state" role="alert">
        <h1>Your account is unavailable</h1>
        <p class="muted">${escapeHtml(error.message)}</p>
        <button class="button button-primary" type="button" data-settings-retry>Try again</button>
      </section>`;
    container.querySelector("[data-settings-retry]")?.addEventListener("click", () => {
      renderAccountSettings(container);
    });
  }
}
