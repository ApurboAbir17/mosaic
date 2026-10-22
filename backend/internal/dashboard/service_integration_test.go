package dashboard

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testDatabaseURL returns the disposable database used by the integration
// tests. The tests are skipped when it is not configured, so `go test ./...`
// stays free of external requirements.
func testDatabaseURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("MOSAIC_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("MOSAIC_TEST_DATABASE_URL is not set")
	}
	return url
}

func newTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), testDatabaseURL(t))
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type testUser struct {
	id    string
	email string
}

func createTestUser(t *testing.T, pool *pgxpool.Pool, suffix string) testUser {
	t.Helper()
	ctx := context.Background()
	user := testUser{
		id:    "test-" + suffix,
		email: "test-" + suffix + "@example.test",
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'not-a-real-hash')`,
		user.id, user.email); err != nil {
		t.Fatalf("insert test user: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO user_profiles (user_id, username, display_name) VALUES ($1, $2, 'Test User')`,
		user.id, "u_"+suffix); err != nil {
		t.Fatalf("insert test profile: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.id)
	})
	return user
}

func insertMedia(t *testing.T, pool *pgxpool.Pool, providerID, title string) int64 {
	t.Helper()
	var mediaID int64
	err := pool.QueryRow(context.Background(), `INSERT INTO media_items
		(provider, media_type, provider_media_id, title, poster_path, release_date)
		VALUES ('tmdb', 'tv', $1, $2, '/poster.jpg', '2020-01-01') RETURNING id`,
		providerID, title).Scan(&mediaID)
	if err != nil {
		t.Fatalf("insert test media: %v", err)
	}
	t.Cleanup(func() {
		// The relationship rows are removed first, because media_items is
		// referenced by user_media.
		_, _ = pool.Exec(context.Background(), `DELETE FROM user_media WHERE media_id = $1`, mediaID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM media_items WHERE id = $1`, mediaID)
	})
	return mediaID
}

func TestDashboardServiceReturnsUserScopedAggregates(t *testing.T) {
	pool := newTestPool(t)
	ctx := context.Background()
	owner := createTestUser(t, pool, "dashowner")
	other := createTestUser(t, pool, "dashother")

	watching := insertMedia(t, pool, "900001", "Watching Title")
	completed := insertMedia(t, pool, "900002", "Completed Title")
	planned := insertMedia(t, pool, "900003", "Planned Title")
	ratedOnly := insertMedia(t, pool, "900004", "Rated Only Title")
	otherMedia := insertMedia(t, pool, "900005", "Someone Else Title")

	now := time.Now().UTC()
	rows := []struct {
		mediaID     int64
		inCollect   bool
		favorite    bool
		status      *string
		rating      *float64
		collectedAt *time.Time
	}{
		{mediaID: watching, inCollect: true, favorite: true, status: stringPtr("watching"), rating: floatPtr(8.5), collectedAt: &now},
		{mediaID: completed, inCollect: true, status: stringPtr("completed"), collectedAt: &now},
		{mediaID: planned, favorite: true, status: stringPtr("watchlist")},
		{mediaID: ratedOnly, rating: floatPtr(6)},
	}
	for _, row := range rows {
		var collected any
		if row.inCollect {
			collected = now
		}
		if _, err := pool.Exec(ctx, `INSERT INTO user_media
			(user_id, media_id, in_collection, collected_at, is_favorite, favorited_at,
			 status, status_changed_at, rating, rated_at)
			VALUES ($1, $2, $3::boolean, $4::timestamptz, $5::boolean,
				CASE WHEN $5::boolean THEN $6::timestamptz ELSE NULL END,
				$7::text, CASE WHEN $7::text IS NULL THEN NULL ELSE $6::timestamptz END,
				$8::numeric, CASE WHEN $8::numeric IS NULL THEN NULL ELSE $6::timestamptz END)`,
			owner.id, row.mediaID, row.inCollect, collected, row.favorite, now,
			row.status, row.rating); err != nil {
			t.Fatalf("insert user media: %v", err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO user_media
		(user_id, media_id, in_collection, collected_at, is_favorite, favorited_at,
		 status, status_changed_at)
		VALUES ($1, $2, TRUE, $3, TRUE, $3, 'watching', $3)`, other.id, otherMedia, now); err != nil {
		t.Fatalf("insert other user media: %v", err)
	}

	reviewBody := "A review that is long enough to satisfy the minimum body length."
	var userMediaID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM user_media WHERE user_id = $1 AND media_id = $2`,
		owner.id, planned).Scan(&userMediaID); err != nil {
		t.Fatalf("load user media id: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO media_reviews
		(user_media_id, title, body, visibility, contains_spoilers)
		VALUES ($1, 'A review title', $2, 'private', FALSE)`, userMediaID, reviewBody); err != nil {
		t.Fatalf("insert review: %v", err)
	}

	service := NewService(pool)
	response, err := service.Get(ctx, owner.id)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}

	if response.Stats.Collection != 2 {
		t.Errorf("collection = %d, want 2", response.Stats.Collection)
	}
	if response.Stats.Favorites != 2 {
		t.Errorf("favorites = %d, want 2", response.Stats.Favorites)
	}
	if response.Stats.Planned != 1 {
		t.Errorf("planned = %d, want 1", response.Stats.Planned)
	}
	if response.Stats.Watching != 1 {
		t.Errorf("watching = %d, want 1", response.Stats.Watching)
	}
	if response.Stats.Completed != 1 {
		t.Errorf("completed = %d, want 1", response.Stats.Completed)
	}
	if response.Stats.Rated != 2 {
		t.Errorf("rated = %d, want 2", response.Stats.Rated)
	}
	if response.Stats.Reviews != 1 {
		t.Errorf("reviews = %d, want 1", response.Stats.Reviews)
	}

	if len(response.Sections.ContinueWatching) != 1 {
		t.Errorf("continue watching = %d, want 1", len(response.Sections.ContinueWatching))
	}
	if len(response.Sections.WatchNext) != 1 {
		t.Errorf("watch next = %d, want 1", len(response.Sections.WatchNext))
	}
	if len(response.Sections.RecentlyAdded) != 2 {
		t.Errorf("recently added = %d, want 2", len(response.Sections.RecentlyAdded))
	}
	if len(response.Sections.Favorites) != 2 {
		t.Errorf("favorites = %d, want 2", len(response.Sections.Favorites))
	}
	if len(response.Sections.RecentlyRated) != 2 {
		t.Errorf("recently rated = %d, want 2", len(response.Sections.RecentlyRated))
	}
	if len(response.Sections.Completed) != 1 {
		t.Errorf("completed = %d, want 1", len(response.Sections.Completed))
	}
	if len(response.Sections.RecentReviews) != 1 {
		t.Errorf("recent reviews = %d, want 1", len(response.Sections.RecentReviews))
	}
	if response.Sections.RecentReviews[0].Title == nil ||
		*response.Sections.RecentReviews[0].Title != "A review title" {
		t.Errorf("recent review title = %v", response.Sections.RecentReviews[0].Title)
	}

	// The other account must not see any of the owner's titles.
	otherResponse, err := service.Get(ctx, other.id)
	if err != nil {
		t.Fatalf("Get(other) error = %v", err)
	}
	if otherResponse.Stats.Collection != 1 || otherResponse.Stats.Watching != 1 {
		t.Errorf("other stats = %+v, want only their own single title", otherResponse.Stats)
	}
	if len(otherResponse.Sections.RecentReviews) != 0 {
		t.Errorf("other account sees %d reviews", len(otherResponse.Sections.RecentReviews))
	}
}

func TestDashboardServiceReturnsEmptyArraysForNewAccount(t *testing.T) {
	pool := newTestPool(t)
	user := createTestUser(t, pool, "dashempty")

	service := NewService(pool)
	response, err := service.Get(context.Background(), user.id)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if response.Stats.Collection != 0 || response.Stats.Reviews != 0 {
		t.Errorf("stats = %+v, want zeros", response.Stats)
	}
	if response.Sections.ContinueWatching == nil || response.Sections.RecentReviews == nil {
		t.Fatal("empty sections must not be nil")
	}
	if len(response.Sections.ContinueWatching) != 0 {
		t.Errorf("continue watching = %d, want 0", len(response.Sections.ContinueWatching))
	}
}

func stringPtr(value string) *string { return &value }

func floatPtr(value float64) *float64 { return &value }
