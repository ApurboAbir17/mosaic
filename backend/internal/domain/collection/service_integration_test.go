package collection

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

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

func createTestUser(t *testing.T, pool *pgxpool.Pool, suffix string) string {
	t.Helper()
	ctx := context.Background()
	userID := "test-" + suffix
	if _, err := pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'not-a-real-hash')`,
		userID, "test-"+suffix+"@example.test"); err != nil {
		t.Fatalf("insert test user: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO user_profiles (user_id, username, display_name) VALUES ($1, $2, 'Test User')`,
		userID, "u_"+suffix); err != nil {
		t.Fatalf("insert test profile: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID
}

func testMedia(providerID, title string) MediaInput {
	return MediaInput{
		Provider:        "tmdb",
		MediaType:       "tv",
		ProviderMediaID: providerID,
		Title:           title,
	}
}

func TestCollectionAddMaintainsCollectedAt(t *testing.T) {
	pool := newTestPool(t)
	ctx := context.Background()
	userID := createTestUser(t, pool, "coladd")
	service := NewService(pool)

	added, _, err := service.Add(ctx, userID, testMedia("910001", "Collected Title"), false)
	if err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if !added.InCollection {
		t.Fatal("Add() did not add the title to the collection")
	}
	if added.CollectedAt == nil {
		t.Fatal("Add() did not record collected_at")
	}

	// Adding the same title again keeps the first collection-add time.
	first := *added.CollectedAt
	time.Sleep(10 * time.Millisecond)
	again, _, err := service.Add(ctx, userID, testMedia("910001", "Collected Title"), false)
	if err != nil {
		t.Fatalf("Add() again error = %v", err)
	}
	if again.CollectedAt == nil || !again.CollectedAt.Equal(first) {
		t.Fatalf("collected_at changed on a repeated add: %v -> %v", first, again.CollectedAt)
	}

	// Removing clears the collection state. The relationship row survives
	// because the title is also a favorite.
	if _, err := service.SetFavorite(ctx, userID, added.ID, true); err != nil {
		t.Fatalf("SetFavorite() error = %v", err)
	}
	if err := service.Remove(ctx, userID, added.ID); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	removed, err := service.Get(ctx, userID, added.ID)
	if err != nil {
		t.Fatalf("Get() after remove error = %v", err)
	}
	if removed.InCollection {
		t.Fatal("Remove() left the title in the collection")
	}
	if removed.CollectedAt != nil {
		t.Fatalf("Remove() kept collected_at = %v", removed.CollectedAt)
	}
	if !removed.IsFavorite {
		t.Fatal("Remove() dropped the favorite of the same title")
	}
	readded, _, err := service.Add(ctx, userID, testMedia("910001", "Collected Title"), false)
	if err != nil {
		t.Fatalf("Add() after remove error = %v", err)
	}
	if readded.CollectedAt == nil || !readded.CollectedAt.After(first) {
		t.Fatalf("re-adding did not record a new collected_at: %v", readded.CollectedAt)
	}
}

func TestCollectionFavoriteOnlyDoesNotTouchCollectedAt(t *testing.T) {
	pool := newTestPool(t)
	ctx := context.Background()
	userID := createTestUser(t, pool, "colfav")
	service := NewService(pool)

	favoriteOnly, _, err := service.Add(ctx, userID, testMedia("910002", "Favorite Only Title"), true)
	if err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if favoriteOnly.InCollection {
		t.Fatal("a favorite-only add must not join the collection")
	}
	if favoriteOnly.CollectedAt != nil {
		t.Fatalf("a favorite-only add set collected_at = %v", favoriteOnly.CollectedAt)
	}

	// Favoriting a collected title keeps its collection-add time.
	collected, _, err := service.Add(ctx, userID, testMedia("910003", "Collected Title"), false)
	if err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	first := *collected.CollectedAt
	favorited, err := service.SetFavorite(ctx, userID, collected.ID, true)
	if err != nil {
		t.Fatalf("SetFavorite() error = %v", err)
	}
	if favorited.CollectedAt == nil || !favorited.CollectedAt.Equal(first) {
		t.Fatalf("favoriting changed collected_at: %v -> %v", first, favorited.CollectedAt)
	}
}

func TestCollectionRemoveKeepsPersonalContent(t *testing.T) {
	pool := newTestPool(t)
	ctx := context.Background()
	userID := createTestUser(t, pool, "colkeep")
	service := NewService(pool)

	item, _, err := service.Add(ctx, userID, testMedia("910004", "Rated Title"), false)
	if err != nil {
		t.Fatalf("Add() error = %v", err)
	}
	if _, err := service.SetRating(ctx, userID, item.ID, Rating(16)); err != nil {
		t.Fatalf("SetRating() error = %v", err)
	}
	if err := service.Remove(ctx, userID, item.ID); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	kept, err := service.Get(ctx, userID, item.ID)
	if err != nil {
		t.Fatalf("Get() after remove error = %v", err)
	}
	if kept.Rating == nil {
		t.Fatal("removing a collection entry dropped the personal rating")
	}
	if kept.InCollection || kept.CollectedAt != nil {
		t.Fatal("removing a collection entry left collection state behind")
	}
}
