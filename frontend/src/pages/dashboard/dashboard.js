import { imageUrl } from "../../api/tmdb.js";
import { dashboardService } from "../../dashboard/dashboard-service.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { avatarInitials, avatarSource, renderAvatar } from "../../profile/avatar.js";
import { statusLabel } from "../../status/status-config.js";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function mediaTypeLabel(type) {
  return type === "tv" ? "TV Show" : "Movie";
}

function mediaHref(media) {
  return `/media/${media.media_type}/${encodeURIComponent(media.provider_media_id)}`;
}

function posterMarkup(media, title) {
  const poster = media.poster_path ? imageUrl(media.poster_path, "w342") : "";
  if (!poster) {
    return `<span class="dash-poster-fallback">${escapeHtml(title.slice(0, 1).toUpperCase())}</span>`;
  }
  return `<img src="${poster}" alt="${escapeHtml(title)} poster" loading="lazy">`;
}

// statIcon renders a small inline glyph. Inline SVG keeps the dashboard free of
// extra network requests for icons.
function statIcon(name) {
  const paths = {
    collection: '<path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 11.5h8M8 15h5"/>',
    favorites: '<path d="M12 19.5s-7-4.2-7-8.8A3.7 3.7 0 0 1 12 8.6a3.7 3.7 0 0 1 7 2.1c0 4.6-7 8.8-7 8.8Z"/>',
    watching: '<circle cx="12" cy="12" r="8"/><path d="M11 9.5v5l4-2.5-4-2.5Z"/>',
    completed: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
    planned: '<rect x="4.5" y="5.5" width="15" height="13" rx="2"/><path d="M8.5 3.5v4M15.5 3.5v4M8 11h8"/>',
    paused: '<path d="M9.5 5.5v13M14.5 5.5v13"/>',
    dropped: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>',
    rated: '<path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4.5Z"/>',
    reviews: '<path d="M5 6.5h14v9H9l-4 3.2V6.5Z"/><path d="M8.5 10h7"/>'
  };
  return `<svg class="dash-stat-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ""}</svg>`;
}

function statCard({ value, label, icon }) {
  return `
    <article class="dash-stat">
      ${statIcon(icon)}
      <p class="dash-stat-value">${value}</p>
      <p class="dash-stat-label">${label}</p>
    </article>`;
}

function previewCard(item, { showStatus = false, showRating = false } = {}) {
  const media = item.media;
  const title = escapeHtml(media.title);
  const meta = [];
  if (showStatus && item.status) meta.push(escapeHtml(statusLabel(item.status)));
  if (showRating && item.rating !== null && item.rating !== undefined) {
    meta.push(`★ ${Number(item.rating).toFixed(1)}`);
  }
  if (!meta.length) meta.push(mediaTypeLabel(media.media_type));
  return `
    <a class="dash-card" href="${mediaHref(media)}">
      <span class="dash-poster">${posterMarkup(media, media.title)}</span>
      <span class="dash-card-body">
        <span class="dash-card-title">${title}</span>
        <span class="dash-card-meta">${meta.join(" · ")}</span>
      </span>
    </a>`;
}

function ratedRow(item) {
  const media = item.media;
  const rated = item.rated_at ? formatDate(item.rated_at) : "";
  return `
    <a class="dash-row" href="${mediaHref(media)}">
      <span class="dash-row-poster">${posterMarkup(media, media.title)}</span>
      <span class="dash-row-body">
        <span class="dash-row-title">${escapeHtml(media.title)}</span>
        <span class="dash-row-meta">${escapeHtml(mediaTypeLabel(media.media_type))}${rated ? ` · Rated ${escapeHtml(rated)}` : ""}</span>
      </span>
      <span class="dash-rating">★ ${Number(item.rating ?? 0).toFixed(1)}</span>
    </a>`;
}

function reviewRow(item) {
  const media = item.media;
  const updated = item.updated_at ? formatDate(item.updated_at) : "";
  const heading = item.title || media.title;
  return `
    <a class="dash-row" href="${mediaHref(media)}">
      <span class="dash-row-poster">${posterMarkup(media, media.title)}</span>
      <span class="dash-row-body">
        <span class="dash-row-title">${escapeHtml(heading)}</span>
        <span class="dash-row-meta">${escapeHtml(media.title)} · ${escapeHtml(item.visibility === "public" ? "Public" : "Private")}${updated ? ` · Updated ${escapeHtml(updated)}` : ""}</span>
        ${item.excerpt ? `<span class="dash-row-excerpt">${escapeHtml(item.excerpt)}</span>` : ""}
      </span>
    </a>`;
}

function section({ id, title, description, href, linkLabel, items, renderItem, empty }) {
  const list = Array.isArray(items) ? items : [];
  return `
    <section class="dash-section" aria-labelledby="${id}-title">
      <header class="dash-section-header">
        <div>
          <h2 id="${id}-title">${title}</h2>
          ${description ? `<p class="muted">${description}</p>` : ""}
        </div>
        ${href ? `<a class="button button-ghost" href="${href}">${linkLabel}</a>` : ""}
      </header>
      ${list.length
        ? `<div class="dash-grid">${list.map(renderItem).join("")}</div>`
        : `<div class="dash-empty">${empty}</div>`}
    </section>`;
}

function emptyState(title, body, href, label) {
  return `
    <div class="dash-empty-inner">
      <h3>${title}</h3>
      <p class="muted">${body}</p>
      ${href ? `<a class="button button-ghost" href="${href}">${label}</a>` : ""}
    </div>`;
}

function isFreshAccount(stats) {
  const counts = [stats.collection, stats.favorites, stats.watching, stats.rated,
    stats.reviews, stats.planned].map((value) => Number(value ?? 0));
  return counts.every((value) => value === 0);
}

function welcomeMarkup() {
  return `
    <section class="dash-welcome">
      <h2>Your Mosaic starts here.</h2>
      <p class="muted">Save the titles you love, follow what you are watching, and Mosaic keeps everything in one personal space.</p>
      <div class="dash-welcome-actions">
        <a class="button button-primary" href="/explore">Explore titles</a>
        <a class="button button-ghost" href="/watchlist">Open watchlist</a>
      </div>
    </section>`;
}

function pageMarkup(data) {
  const profile = data.profile ?? {};
  const stats = data.stats ?? {};
  const sections = data.sections ?? {};
  const displayName = escapeHtml(profile.display_name || profile.username || "Mosaic User");

  const primaryStats = [
    { value: stats.collection ?? 0, label: "Collected", icon: "collection" },
    { value: stats.favorites ?? 0, label: "Favorites", icon: "favorites" },
    { value: stats.watching ?? 0, label: "In Progress", icon: "watching" },
    { value: stats.completed ?? 0, label: "Completed", icon: "completed" }
  ];
  const secondaryStats = [
    { value: stats.planned ?? 0, label: "Planned", icon: "planned" },
    { value: stats.paused ?? 0, label: "Paused", icon: "paused" },
    { value: stats.dropped ?? 0, label: "Dropped", icon: "dropped" },
    { value: stats.rated ?? 0, label: "Rated", icon: "rated" },
    { value: stats.reviews ?? 0, label: "Reviews", icon: "reviews" }
  ];

  return `
    <section class="dashboard-page" aria-labelledby="dashboard-title">
      <header class="dash-hero">
        <span class="dash-avatar" data-dashboard-avatar></span>
        <div class="dash-hero-copy">
          <p class="eyebrow">Your Mosaic</p>
          <h1 id="dashboard-title">Welcome back, ${displayName}.</h1>
          <p class="muted">Your personal media world, all in one place.</p>
        </div>
      </header>

      <div class="dash-stats" role="list">
        ${primaryStats.map((stat) => `<div role="listitem">${statCard(stat)}</div>`).join("")}
      </div>
      <div class="dash-stats-secondary">
        ${secondaryStats.map((stat) => statCard(stat)).join("")}
      </div>

      ${isFreshAccount(stats) ? welcomeMarkup() : ""}

      ${section({
        id: "dash-continue-watching",
        title: "Continue Watching",
        description: "What you are in the middle of.",
        href: "/watchlist?status=watching",
        linkLabel: "View watchlist",
        items: sections.continue_watching,
        renderItem: (item) => previewCard(item, { showStatus: true }),
        empty: emptyState(
          "Nothing in progress.",
          "Mark a title as In Progress and it will wait for you here.",
          "/watchlist",
          "Open watchlist"
        )
      })}

      ${section({
        id: "dash-watch-next",
        title: "Watch Next",
        description: "Planned and waiting for their turn.",
        href: "/watchlist?status=watchlist",
        linkLabel: "View watchlist",
        items: sections.watch_next,
        renderItem: (item) => previewCard(item, { showStatus: true }),
        empty: emptyState(
          "Your watchlist is empty.",
          "Add a title you want to watch and it will show up here.",
          "/explore",
          "Explore titles"
        )
      })}

      ${section({
        id: "dash-recently-added",
        title: "Recently Added",
        description: "The newest titles in your collection.",
        href: "/collection",
        linkLabel: "View collection",
        items: sections.recently_added,
        renderItem: (item) => previewCard(item),
        empty: emptyState(
          "Your collection is empty.",
          "Save a movie or TV show to start building your library.",
          "/explore",
          "Explore titles"
        )
      })}

      ${section({
        id: "dash-favorites",
        title: "Favorites",
        description: "The titles you keep close.",
        href: "/favorites",
        linkLabel: "View favorites",
        items: sections.favorites,
        renderItem: (item) => previewCard(item),
        empty: emptyState(
          "No favorites yet.",
          "Use the heart on a title to keep it here.",
          "/explore",
          "Explore titles"
        )
      })}

      ${section({
        id: "dash-recently-rated",
        title: "Recently Rated",
        description: "Your own scores for the titles you rated.",
        href: "/ratings",
        linkLabel: "View ratings",
        items: sections.recently_rated,
        renderItem: ratedRow,
        empty: emptyState(
          "You have not rated anything yet.",
          "Rate a title to remember how it felt.",
          "/explore",
          "Explore titles"
        )
      })}

      ${section({
        id: "dash-completed",
        title: "Completed",
        description: "Titles you finished.",
        href: "/watchlist?status=completed",
        linkLabel: "View completed",
        items: sections.completed,
        renderItem: (item) => previewCard(item, { showStatus: true }),
        empty: emptyState(
          "Nothing completed yet.",
          "Mark a title as Completed once you finish it.",
          "/watchlist",
          "Open watchlist"
        )
      })}

      ${section({
        id: "dash-recent-reviews",
        title: "Recent Reviews",
        description: "What you wrote about the titles you watched.",
        href: "/reviews",
        linkLabel: "View reviews",
        items: sections.recent_reviews,
        renderItem: reviewRow,
        empty: emptyState(
          "You have not written a review yet.",
          "Reviews keep your thoughts about a title in one place.",
          "/explore",
          "Explore titles"
        )
      })}
    </section>`;
}

function loadingMarkup() {
  return `
    <section class="dashboard-page" aria-busy="true" aria-live="polite">
      <div class="dash-skeleton dash-skeleton-hero"></div>
      <div class="dash-stats">
        ${[0, 1, 2, 3].map(() => `<div class="dash-skeleton dash-skeleton-stat"></div>`).join("")}
      </div>
      <div class="dash-skeleton dash-skeleton-row"></div>
      <div class="dash-skeleton dash-skeleton-row"></div>
    </section>`;
}

function errorMarkup(message) {
  return `
    <section class="dashboard-page">
      <div class="dash-error" role="alert">
        <h1>We could not load your dashboard.</h1>
        <p class="muted">${escapeHtml(message)}</p>
        <button class="button button-primary" type="button" data-dashboard-retry>Try again</button>
      </div>
    </section>`;
}

export async function renderDashboard(container, { user } = {}) {
  container.classList.remove("explore-shell");
  container.innerHTML = loadingMarkup();
  try {
    const data = await dashboardService.get(user?.id);
    container.innerHTML = pageMarkup(data);
    const avatar = container.querySelector("[data-dashboard-avatar]");
    if (avatar) {
      renderAvatar(avatar, avatarSource(data.profile), {
        imageClass: "dash-avatar-image",
        fallbackClass: "dash-avatar-fallback",
        initials: avatarInitials(data.profile, "MO")
      });
    }
  } catch (error) {
    container.innerHTML = errorMarkup(error.message);
    container.querySelector("[data-dashboard-retry]")?.addEventListener("click", () => {
      renderDashboard(container, { user });
    });
  }
}
