## Summary

Implements the dashboard (M13) and the privacy/settings modules (M14).

The dashboard replaces the `/dashboard` placeholder with a real personal home
that aggregates the relationships Mosaic already stores: collection,
favorites, watchlist status, ratings, and reviews. It is read-only and owns no
mutation logic.

The settings area adds a personal preferences and privacy layer. Profile
visibility keeps its single authoritative home in `user_profiles`; a new
`user_settings` table stores the theme, the list visibility preferences, the
reserved activity visibility, and the notification preferences.

## Changes

**Database**
- `supabase/migrations/20261023120000_collection_timestamps.sql` (new) — adds
  `user_media.collected_at`, the moment a title actually joined the collection.
  A `user_media` row can exist because of a favorite, status, rating or review
  without the title ever being collected, so `created_at` cannot answer that
  question. Backfills existing rows from `created_at` (approximate for old
  rows) and adds a check constraint so `in_collection` and `collected_at` can
  never disagree. Adds the `collected_at` and `status_changed_at` indexes the
  dashboard orders by.
- `supabase/migrations/20261023130000_user_settings.sql` (new) — creates
  `user_settings` with check-constrained theme and visibility values, a
  JSONB `notification_preferences` column, and a backfill that gives every
  existing account private-by-default settings. It deliberately has no
  `profile_visibility` column.

**Backend**
- `backend/internal/dashboard/` (new) — `model.go`, `repository.go`,
  `service.go`, `handler.go`, `service_test.go`. The endpoint is read-only: the
  user id comes from the validated session, statistics use one conditional
  aggregate query, previews use one ranked query limited to five rows per
  section, and all of it is read inside a single read-only repeatable-read
  transaction. Empty sections serialize as `[]`, and a failed query returns
  503 instead of fabricated zeros.
- `backend/internal/settings/` (new) — `model.go`, `validation.go`,
  `repository.go`, `service.go`, `handler.go`, `service_test.go`. PATCH applies
  only the supplied fields, rejects unknown fields and invalid values, and
  leaves `updated_at` untouched on a no-op. Profile visibility is written
  through the profile domain inside the same transaction.
- `backend/internal/profile/service.go` — adds `SetVisibility` and
  `SetVisibilityTx` so profile visibility has one home and can be updated
  transactionally.
- `backend/internal/domain/collection/service.go` — maintains `collected_at` on
  add, repeated add, removal, re-add, and favorite-only writes; collection
  listing now orders by `collected_at` instead of `created_at`.
- `backend/internal/auth/service.go` — registration creates the settings row in
  the existing transaction.
- `backend/internal/httpserver/server.go` — registers `/api/v1/dashboard` and
  `/api/v1/settings/me`.

**Frontend**
- `frontend/src/dashboard/dashboard-service.js` (new) — account-scoped,
  30 second dashboard cache with explicit invalidation.
- `frontend/src/pages/dashboard/dashboard.{js,css}` (new) — greeting, four
  primary and five secondary statistics, and seven sections (Continue
  Watching, Watch Next, Recently Added, Favorites, Recently Rated, Completed,
  Recent Reviews), each with its own empty state, plus a loading skeleton and a
  retry panel.
- `frontend/src/settings/settings-service.js` (new).
- `frontend/src/pages/settings/` (new) — overview, privacy, appearance,
  notifications, account pages and `settings.css`.
- `frontend/src/theme/theme.js` (new) — owns light, dark, and system; resolves
  `prefers-color-scheme` and keeps a system theme in step with the OS.
- `index.html` — adds the Dashboard sidebar entry, points the Settings link at
  `/settings`, and applies the stored theme inline before the first paint so
  there is no theme flash.
- `main.js` — routes the new pages, applies the account theme on session
  restore, syncs the topbar theme toggle with the account, and clears the
  query cache on sign-in and sign-out.
- `collection-service.js`, `watchlist-service.js`, `rating-service.js`,
  `review-service.js`, `profile-service.js` — invalidate the dashboard cache
  after every personal mutation, and the settings cache after a profile change.
- `PROJECTDOCS.md`, `docs/codebase/TESTING.md` — document the new routes, the
  privacy policy, the migrations, and the integration test workflow.

## API

```text
GET   /api/v1/dashboard
GET   /api/v1/settings/me
PATCH /api/v1/settings/me
```

`GET /api/v1/dashboard` returns the profile summary, the library statistics,
and the bounded previews in one response:

```json
{
  "profile": { "display_name": "...", "username": "...", "has_uploaded_avatar": false, "avatar_url": null },
  "stats": {
    "collection": 24, "favorites": 8, "planned": 6, "watching": 5,
    "paused": 2, "completed": 12, "dropped": 1, "rated": 14, "reviews": 4
  },
  "sections": {
    "continue_watching": [], "watch_next": [], "recently_added": [],
    "favorites": [], "recently_rated": [], "completed": [], "recent_reviews": []
  }
}
```

`PATCH /api/v1/settings/me` accepts any of `theme`, `profile_visibility`,
`collection_visibility`, `favorites_visibility`, `watchlist_visibility`,
`ratings_visibility`, and `activity_visibility`. An omitted field is
unchanged.

## Behaviour notes

- The statistics are **overlapping** sets. A completed title can be collected,
  favorited, rated, and reviewed at the same time, and is counted once in each
  applicable category. They are never summed into a unique media total.
- "Recently Added" uses `collected_at`, so a title that was rated or favorited
  before it was added to the collection is ordered by the moment it was really
  collected, and re-adding a title starts a new date.
- The dashboard cache is scoped to the signed-in account and is invalidated
  after every collection, favorite, watchlist, status, rating, review, and
  profile change. Signing in or out clears the whole query cache, so one
  account can never see another account's cached pages.
- Profile visibility has exactly one home, `user_profiles.visibility`. A public
  review never exposes the username of a private profile.
- Collection, favorites, watchlist, ratings, and activity have **no public
  read endpoint** yet. Their settings are stored private by default and the
  interface says so plainly, because a toggle that appears to work while
  nothing consumes it is worse than no toggle.
- Notification preferences are stored for the future notification module but
  are not writable, and the page states that Mosaic sends nothing today.
- A failed settings save restores the last server-confirmed value instead of
  pretending the change succeeded.
- The theme follows this order: a signed-in user's saved account theme, then
  the local browser preference for guests, then the system preference.

## Testing

- `gofmt` clean on all changed and new Go files.
- `go build ./...`, `go vet ./...`, and `go test ./...` pass.
- `npm run build` passes (46 modules, 171 kB JS / 70 kB CSS).
- All twelve migrations were applied in order to a clean PostgreSQL 17
  database. This machine has no Docker, so a portable PostgreSQL was started in
  a temporary directory for the run and removed afterwards.
- New integration tests, gated behind `MOSAIC_TEST_DATABASE_URL` and skipped
  when it is not set:
  - `backend/internal/dashboard/service_integration_test.go` — the statistics
    match the seeded rows, all seven preview sections return the right titles,
    a new account returns zero statistics with empty arrays, and a second
    account sees only its own data.
  - `backend/internal/settings/service_integration_test.go` — private-by-default
    values, partial updates, no-op timestamps, profile visibility authority,
    invalid values rejected, and accounts kept separate.
  - `backend/internal/domain/collection/service_integration_test.go` — a
    repeated add preserves `collected_at`, a favorite-only add leaves
    collection state alone, a removal clears the timestamp, a re-add records a
    new one, and a personal rating survives a collection removal.
- The database run caught two real defects, both fixed: the `collected_at`
  constraint correctly rejected an insert that omitted it, and a favorite-only
  add was altering collection membership semantics.

## Out of scope

Public sharing of collections, favorites, watchlists, and ratings; the friend
graph and friend-only activity; notification delivery; JSON data export;
password change; and account deletion. Each needs its own module, and the
settings interface describes the unfinished ones instead of offering controls
that cannot complete.
