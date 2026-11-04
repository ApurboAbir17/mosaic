import { createSearchSuggestions } from "./components/search/search-suggestions.js";
import { renderExplorePage } from "./pages/explore/explore.js";
import { renderSearchLanding, renderSearchPage } from "./pages/search/search.js";
import { parseMediaRoute, renderMediaDetailsPage } from "./pages/media/media-details.js";
import { authService } from "./auth/auth-service.js";
import { profileService } from "./profile/profile-service.js";
import { avatarInitials, avatarSource, renderAvatar } from "./profile/avatar.js";
import { renderAuthPage } from "./pages/auth/auth.js";
import { renderDashboard } from "./pages/dashboard/dashboard.js";
import { renderProfilePage } from "./pages/profile/profile.js";
import { renderProfileSettings } from "./pages/profile/profile-settings.js";
import { renderCollectionPage } from "./pages/collection/collection.js";
import { renderWatchlistPage } from "./pages/watchlist/watchlist.js";
import { renderRatingsPage } from "./pages/ratings/ratings.js";
import { renderReviewsPage } from "./pages/reviews/reviews.js";
import { loadDeferredExploreMedia } from "./pages/explore/explore.js";
import { saveRecentSearch } from "./utils/recent-searches.js";
import { clearQueryCache } from "./api/query-cache.js";
import { settingsService } from "./settings/settings-service.js";
import { applyTheme, getTheme, initTheme, resolveTheme } from "./theme/theme.js";
import { renderSettingsOverview } from "./pages/settings/settings.js";
import { renderPrivacySettings } from "./pages/settings/privacy.js";
import { renderAppearanceSettings } from "./pages/settings/appearance.js";
import { renderNotificationsSettings } from "./pages/settings/notifications.js";
import { renderAccountSettings } from "./pages/settings/account.js";

const themeToggle = document.querySelector("#theme-toggle");
const appShell = document.querySelector(".app-shell");
const toast = document.querySelector("#toast");
const backendStatus = document.querySelector("#backend-status");
const backendStatusMessage = backendStatus?.querySelector("[data-backend-status-message]");
const sidebar = document.querySelector("#sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarOverlay = document.querySelector("#sidebar-overlay");
const loginButton = document.querySelector("#login-button");
const registerButton = document.querySelector("#register-button");
const topbarLogoutButton = document.querySelector("#topbar-logout-button");
const profileButton = document.querySelector("#profile-button");
const profileDropdownContainer = document.querySelector("#profile-dropdown-container");
const profileDropdownMenu = document.querySelector("#profile-dropdown-menu");
const dropdownAvatar = document.querySelector("#dropdown-avatar");
const dropdownUserName = document.querySelector("#dropdown-user-name");
const dropdownUserEmail = document.querySelector("#dropdown-user-email");
const navLinks = document.querySelectorAll(".nav-link");
const content = document.querySelector("#app-content");
const searchForm = document.querySelector("#global-search-form");
const searchInput = document.querySelector("#global-search");
let currentUser = null;
let currentProfile = null;
let sessionLoaded = false;
let sessionGeneration = 0;
let pendingNewAccountGreeting = false;
let backendReady = false;

function updateThemeToggle() {
  const resolved = resolveTheme(getTheme());
  const isLight = resolved === "light";
  themeToggle.setAttribute("aria-pressed", String(isLight));
  themeToggle.textContent = isLight ? "Use dark theme" : "Use light theme";
}

// applyThemeWithAccountSave applies the theme immediately and, for a signed-in
// user, stores it on the account so it follows them to another browser.
async function applyThemeWithAccountSave(theme, previousTheme) {
  applyTheme(theme);
  if (!currentUser) return;
  try {
    await settingsService.update({ theme });
  } catch (error) {
    applyTheme(previousTheme);
    showMessage(error.message);
  }
}

function openProfileDropdown() {
  if (!currentUser || !profileDropdownMenu) return;
  profileDropdownMenu.hidden = false;
  profileButton.setAttribute("aria-expanded", "true");
}

function closeProfileDropdown() {
  if (!profileDropdownMenu || profileDropdownMenu.hidden) return;
  profileDropdownMenu.hidden = true;
  profileButton.setAttribute("aria-expanded", "false");
}

function toggleProfileDropdown() {
  if (!profileDropdownMenu) return;
  if (profileDropdownMenu.hidden) {
    openProfileDropdown();
  } else {
    closeProfileDropdown();
  }
}

function showToast() {
  toast.classList.add("toast-visible");
  window.setTimeout(() => toast.classList.remove("toast-visible"), 2600);
}

function showMessage(message) {
  toast.textContent = message;
  showToast();
}

async function monitorBackendStatus() {
  if (!backendStatus || !backendStatusMessage) return;

  let retryDelay = 15000;
  const initialStatusDelay = window.setTimeout(() => {
    backendStatus.hidden = false;
  }, 2000);

  while (true) {
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 70000);
    try {
      const response = await fetch("/api/v1/health", {
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.message ?? "The backend health check failed.");
        error.status = response.status;
        error.renderRouting = response.headers.get("x-render-routing") ?? "";
        error.cfChallenge = response.headers.get("cf-mitigated") === "challenge";
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter) {
          const seconds = Number(retryAfter);
          error.retryAfterMs = Number.isFinite(seconds)
            ? seconds * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now());
        }
        throw error;
      }
      const health = payload;
      if (health?.status !== "ok") {
        throw new Error("The backend health check did not return a ready status.");
      }

      window.clearTimeout(initialStatusDelay);
      backendStatus.hidden = true;
      return;
    } catch (error) {
      window.clearTimeout(initialStatusDelay);
      backendStatus.hidden = false;
      backendStatusMessage.textContent = error.message.includes("not configured")
        ? "The backend is not configured for this deployment."
        : error.renderRouting === "hibernate-rate-limited" || error.status === 429
          ? "Render is rate-limiting wake requests. Waiting before retrying."
          : "The backend is unavailable and retrying. Media will load when it is ready.";
      const recommendedDelay = error.retryAfterMs
        ?? (error.renderRouting === "hibernate-rate-limited" ? 120000 : error.status === 429 ? 60000 : retryDelay);
      retryDelay = Math.max(retryDelay, recommendedDelay);
    } finally {
      window.clearTimeout(requestTimeout);
    }

    const jitteredDelay = retryDelay + Math.random() * retryDelay * 0.1;
    await new Promise((resolve) => window.setTimeout(resolve, jitteredDelay));
    retryDelay = Math.min(retryDelay * 2, 300000);
  }
}

function setSidebarCollapsed(isCollapsed) {
  sidebar.classList.toggle("sidebar-collapsed", isCollapsed);
  appShell.classList.toggle("sidebar-is-collapsed", isCollapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
  sidebarToggle.setAttribute("aria-label", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
}

function renderPlaceholder(title) {
  content.innerHTML = `
    <section class="explore-state explore-state-empty page-placeholder">
      <div>
        <p class="eyebrow">Coming in a later module</p>
        <h1>${title}</h1>
        <p class="muted">This route is reserved for the next implementation module.</p>
      </div>
      <a class="button button-primary" href="/explore">Back to Explore</a>
    </section>
  `;
}

function isCurrentNavigationTarget(link) {
  const target = new URL(link.href, window.location.origin);
  const currentPath = window.location.pathname;
  const targetPath = target.pathname;
  const currentExplore = currentPath === "/" || currentPath === "/explore";
  const targetExplore = targetPath === "/" || targetPath === "/explore";

  if (currentExplore && targetExplore) {
    return true;
  }

  return (
    targetPath === currentPath &&
    target.search === window.location.search &&
    target.hash === window.location.hash
  );
}

function topbarInitials() {
  const fallback = currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : "MR";
  return avatarInitials(currentProfile, fallback);
}

function updateAuthControls() {
  loginButton.hidden = Boolean(currentUser);
  registerButton.hidden = Boolean(currentUser);
  if (profileDropdownContainer) {
    profileDropdownContainer.hidden = !currentUser;
  }
  profileButton.hidden = !currentUser;
  closeProfileDropdown();

  if (currentUser) {
    const avatarUrl = avatarSource(currentProfile);
    const initials = topbarInitials();
    renderAvatar(profileButton, avatarUrl, {
      imageClass: "avatar-button-image",
      initials
    });
    if (dropdownAvatar) {
      renderAvatar(dropdownAvatar, avatarUrl, {
        imageClass: "avatar-button-image",
        initials
      });
    }
    if (dropdownUserName) {
      dropdownUserName.textContent = currentProfile?.display_name || currentProfile?.username || (currentUser.email ? currentUser.email.split("@")[0] : "User");
    }
    if (dropdownUserEmail) {
      dropdownUserEmail.textContent = currentUser.email || "";
    }
  } else {
    profileButton.replaceChildren();
    if (dropdownAvatar) {
      dropdownAvatar.replaceChildren();
    }
  }
  profileButton.setAttribute("aria-label", currentUser ? `Open account menu for ${currentUser.email}` : "Open profile menu");
}

async function logout() {
  closeProfileDropdown();
  topbarLogoutButton.disabled = true;
  try {
    await authService.logout();
    clearQueryCache();
    currentUser = null;
    currentProfile = null;
    sessionLoaded = false;
    updateAuthControls();
    window.history.pushState({}, "", "/explore");
    renderRoute();
  } catch (error) {
    showMessage(error.message);
  } finally {
    topbarLogoutButton.disabled = false;
  }
}

function updateNavigationState() {
  const currentPath = window.location.pathname;
  navLinks.forEach((link) => {
    if (link.classList.contains("nav-link-disabled")) return;
    const targetPath = new URL(link.href, window.location.origin).pathname;
    const isExplore = (currentPath === "/" || currentPath === "/explore")
      && (targetPath === "/" || targetPath === "/explore");
    // The Settings entry owns every settings subsection.
    const isSettingsSection = targetPath === "/settings" && currentPath.startsWith("/settings");
    const isActive = isExplore || isSettingsSection || targetPath === currentPath;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function safeRedirectPath(path) {
  return path.startsWith("/") && !path.startsWith("//")
    ? path
    : "/dashboard";
}

async function loadSession() {
  if (sessionLoaded) {
    updateAuthControls();
    return;
  }
  const generation = sessionGeneration;
  let user = null;
  try {
    user = await authService.me();
  } catch {
    user = null;
  }
  if (generation !== sessionGeneration) return;

  currentUser = user;
  let profile = null;
  if (user) {
    try {
      profile = await profileService.get();
    } catch {
      profile = null;
    }
    try {
      // The account theme wins over the local preference once it is known.
      const settings = await settingsService.get();
      applyTheme(settings.theme);
    } catch {
      // A settings failure must not block the page; the local theme stays.
    }
  }
  if (generation !== sessionGeneration) return;

  currentProfile = profile;
  sessionLoaded = true;
  updateAuthControls();
  updateThemeToggle();
}

function renderSettingsRoute(path) {
  switch (path) {
    case "/settings/profile":
      renderProfileSettings(content);
      return;
    case "/settings/privacy":
      renderPrivacySettings(content);
      return;
    case "/settings/appearance":
      renderAppearanceSettings(content);
      return;
    case "/settings/notifications":
      renderNotificationsSettings(content);
      return;
    case "/settings/account":
      renderAccountSettings(content);
      return;
    default:
      renderSettingsOverview(content);
  }
}

function renderRoute() {
  if (!backendReady) return;

  closeProfileDropdown();
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  content.mediaDetailsRenderToken = Symbol("route-change");
  updateNavigationState();

  if (path === "/login" || path === "/register") {
    if (currentUser) {
      window.history.replaceState({}, "", "/dashboard");
      loadSession().then(renderRoute);
      return;
    }
    renderAuthPage(content, path.slice(1), ({ isNewAccount }) => {
      const destination = new URLSearchParams(window.location.search).get("redirect");
      const safeDestination = safeRedirectPath(destination ?? "/dashboard");
      pendingNewAccountGreeting = isNewAccount && safeDestination === "/dashboard";
      window.history.pushState({}, "", safeDestination);
      sessionGeneration += 1;
      sessionLoaded = false;
      loadSession().then(renderRoute);
    });
  } else if (path === "/profile") {
    if (!currentUser) {
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(path)}`);
      loadSession().then(renderRoute);
      return;
    }
    renderProfilePage(content, logout);
  } else if (path === "/settings" || path.startsWith("/settings/")) {
    if (!currentUser) {
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(path)}`);
      renderRoute();
      return;
    }
    renderSettingsRoute(path);
  } else if (path === "/collection" || path === "/favorites" || path === "/watchlist") {
    if (!currentUser) {
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(path)}`);
      renderRoute();
      return;
    }
    if (path === "/watchlist") {
      renderWatchlistPage(content);
    } else {
      renderCollectionPage(content, { favoritePage: path === "/favorites" });
    }
  } else if (path === "/ratings") {
    if (!currentUser) {
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(path)}`);
      renderRoute();
      return;
    }
    renderRatingsPage(content);
  } else if (path === "/reviews") {
    if (!currentUser) {
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(path)}`);
      renderRoute();
      return;
    }
    renderReviewsPage(content);
  } else if (path === "/dashboard") {
    if (!currentUser) {
      window.history.replaceState({}, "", `/login?redirect=${encodeURIComponent(path)}`);
      renderRoute();
      return;
    }
    const isNewAccount = pendingNewAccountGreeting;
    pendingNewAccountGreeting = false;
    renderDashboard(content, { user: currentUser, isNewAccount });
  } else if (path === "/" || path === "/explore") {
    if (currentUser) {
      window.history.replaceState({}, "", "/dashboard");
      renderRoute();
      return;
    }
    renderExplorePage(content);
  } else if (path === "/search") {
    const query = params.get("q")?.trim();

    searchSuggestions.close();

    if (!query) {
      searchInput.value = "";
      renderSearchLanding(content);
      return;
    }

    searchInput.value = query;
    renderSearchPage(content, query, params.get("type"), params.get("sort"));
  } else if (path.startsWith("/media/")) {
    const mediaRoute = parseMediaRoute(path);
    if (!mediaRoute) {
      content.classList.remove("explore-shell");
      content.innerHTML = `
        <section class="explore-state explore-state-empty page-placeholder">
          <div><p class="eyebrow">Invalid media link</p><h1>That title link is not valid.</h1>
          <p class="muted">Choose a movie or TV show from Explore or Search.</p></div>
          <a class="button button-primary" href="/explore">Back to Explore</a>
        </section>`;
      return;
    }
    renderMediaDetailsPage(content, mediaRoute, currentUser);
  } else {
    renderPlaceholder("This page is not available yet.");
  }
}

themeToggle.addEventListener("click", () => {
  const previousTheme = getTheme();
  const resolved = resolveTheme(previousTheme);
  const next = resolved === "light" ? "dark" : "light";
  applyThemeWithAccountSave(next, previousTheme);
});

sidebarToggle.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 800px)").matches) {
    const isOpen = sidebar.classList.toggle("sidebar-mobile-open");
    sidebarOverlay.classList.toggle("sidebar-overlay-visible", isOpen);
    sidebarToggle.setAttribute("aria-expanded", String(isOpen));
    sidebarToggle.setAttribute("aria-label", isOpen ? "Close sidebar" : "Open sidebar");
    return;
  }

  setSidebarCollapsed(!sidebar.classList.contains("sidebar-collapsed"));
});

sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("sidebar-mobile-open");
  sidebarOverlay.classList.remove("sidebar-overlay-visible");
  sidebarToggle.setAttribute("aria-expanded", "false");
  sidebarToggle.setAttribute("aria-label", "Open sidebar");
});

loginButton.addEventListener("click", () => {
  window.location.href = "/login";
});
registerButton.addEventListener("click", () => {
  window.location.href = "/register";
});
topbarLogoutButton.addEventListener("click", logout);

profileButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (currentUser) {
    toggleProfileDropdown();
  } else {
    showMessage("Sign in to open your profile.");
  }
});

if (profileDropdownMenu) {
  const dropdownNavLinks = profileDropdownMenu.querySelectorAll("a.profile-dropdown-item");
  dropdownNavLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      closeProfileDropdown();
      const href = link.getAttribute("href");
      if (href) {
        window.history.pushState({}, "", href);
        renderRoute();
      }
    });
  });
}

document.addEventListener("click", (event) => {
  if (profileDropdownContainer && !profileDropdownContainer.contains(event.target)) {
    closeProfileDropdown();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && profileDropdownMenu && !profileDropdownMenu.hidden) {
    closeProfileDropdown();
    profileButton.focus();
  }
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!link.classList.contains("nav-link-disabled") && isCurrentNavigationTarget(link)) {
      event.preventDefault();
      const label = link.textContent.trim().replace(/\s+/g, " ");
      showMessage(`You are already viewing ${label}.`);
      return;
    }

    if (!link.classList.contains("nav-link-disabled")) {
      event.preventDefault();
      window.history.pushState({}, "", link.href);
      renderRoute();
      return;
    }

    event.preventDefault();
    showMessage("This navigation item is reserved for a future module.");
  });
});

function submitSearchQuery(rawQuery) {
  const query = rawQuery.trim();

  if (!query) {
    showMessage("Enter a title to start searching.");
    return;
  }

  saveRecentSearch(query);
  searchInput.value = query;
  window.history.pushState({}, "", `/search?q=${encodeURIComponent(query)}`);
  loadSession().then(renderRoute);
}

const searchSuggestions = createSearchSuggestions({
  input: searchInput,
  form: searchForm,
  onSelect: (item) => submitSearchQuery(item.title)
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSearchQuery(searchInput.value);
});

window.addEventListener("popstate", () => {
  searchSuggestions.close();
  closeProfileDropdown();
  loadSession().then(renderRoute);
});

window.addEventListener("mosaic:profile-updated", (event) => {
  currentProfile = event.detail ?? null;
  updateAuthControls();
});

initTheme();
updateThemeToggle();
window.addEventListener("mosaic:theme-changed", updateThemeToggle);
if (!window.matchMedia("(max-width: 800px)").matches) {
  setSidebarCollapsed(true);
}

const isPublicExplorePath = () => window.location.pathname === "/" || window.location.pathname === "/explore";
if (isPublicExplorePath()) {
  void renderExplorePage(content, { deferMedia: true });
}

void monitorBackendStatus().then(async () => {
  await loadSession();
  backendReady = true;
  if (isPublicExplorePath() && !currentUser) {
    updateNavigationState();
    await loadDeferredExploreMedia(content);
    return;
  }
  renderRoute();
});
