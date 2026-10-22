# Testing

## Test stack and commands

- Backend: Go standard `testing` package and `httptest`.
- Frontend: no test framework; production build is the automated check.
- Repository checks: `make check`.

```bash
make check
# or
cd frontend && npm run build
cd backend && go test ./...
docker compose config --quiet
```

## Test layout

Backend tests sit beside the package under test, for example
`backend/internal/httpserver/server_test.go`. Frontend behavior is currently
manual browser verification.

## Database integration tests

Tests that need a real database live in `*_integration_test.go` files and are
skipped unless `MOSAIC_TEST_DATABASE_URL` points at a disposable database that
already has the migrations applied. `go test ./...` therefore stays free of
external requirements.

```bash
make db-up
make db-migrate
cd backend
MOSAIC_TEST_DATABASE_URL="postgres://mosaic:mosaic@127.0.0.1:5432/mosaic?sslmode=disable" go test ./...
```

The integration tests create their own accounts and titles and delete them
afterwards, so they can run against the local development database.

| File | Covers |
|---|---|
| `backend/internal/domain/collection/service_integration_test.go` | Collection add/remove semantics, `collected_at` maintenance, and that a rating survives a collection removal |
| `backend/internal/dashboard/service_integration_test.go` | Dashboard statistics, every preview section, empty sections for a new account, and account isolation |
| `backend/internal/settings/service_integration_test.go` | Private-by-default settings, partial updates, no-op timestamps, profile visibility authority, and account isolation |

## Current coverage

The health handler and method rejection are covered. Password hashing and
profile/avatar content validation have unit coverage. A local PostgreSQL smoke
test covers registration, session restoration, and logout. There are no
automated browser tests for TMDB requests, route parsing, rendering, responsive
layout, browser history, or multipart upload transport.

Collection media identity and filter validation have unit coverage. Watchlist
status validation and its filter parsing have unit coverage; status history and
transactional database behavior require integration coverage
(`watchlist_test.go`). The collection/favorite/watchlist database
transactions and browser pages still require integration/manual smoke tests.

## Required next tests

The profile upload flow still needs a browser/integration test proving that the
request is multipart and that the authenticated endpoint persists and serves
an avatar. Auth still needs database integration tests for unique emails,
expiry/revocation, malformed input, rate limiting, and token use. The local
migration and endpoint flow can be exercised with `make db-migrate` and the API
running with `DATABASE_URL` configured.

Passwords are accepted from 8 through 128 characters. A local API smoke test
should verify registration, `/auth/me`, logout, and the expected `401` after
logout.

## Evidence

- `backend/internal/auth/password_test.go`
- `backend/internal/httpserver/server_test.go`
- `backend/internal/profile/avatar_test.go`
- `backend/internal/profile/service_test.go`
- `backend/internal/domain/collection/service_test.go`
- `backend/internal/domain/collection/watchlist_test.go`
- `backend/internal/domain/collection/service_integration_test.go`
- `backend/internal/dashboard/service_test.go`
- `backend/internal/dashboard/service_integration_test.go`
- `backend/internal/settings/service_test.go`
- `backend/internal/settings/service_integration_test.go`
- `frontend/package.json`
- `Makefile`
- `frontend/src/pages/media/media-details.js`
- `frontend/src/pages/watchlist/watchlist.js`
- `frontend/src/pages/dashboard/dashboard.js`
- `frontend/src/pages/settings/settings.js`
