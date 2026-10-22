package settings

import (
	"context"
	"os"
	"testing"

	"github.com/MdRasB/mosaic/backend/internal/profile"
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

func TestSettingsServiceUsesPrivateDefaults(t *testing.T) {
	pool := newTestPool(t)
	userID := createTestUser(t, pool, "setdefault")

	service := NewService(pool, profile.NewService(pool))
	result, err := service.Get(context.Background(), userID)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}

	if result.Theme != ThemeSystem {
		t.Errorf("theme = %q, want %q", result.Theme, ThemeSystem)
	}
	if result.ProfileVisibility != VisibilityPrivate {
		t.Errorf("profile visibility = %q, want %q", result.ProfileVisibility, VisibilityPrivate)
	}
	for name, value := range map[string]string{
		"collection": result.CollectionVisibility,
		"favorites":  result.FavoritesVisibility,
		"watchlist":  result.WatchlistVisibility,
		"ratings":    result.RatingsVisibility,
		"activity":   result.ActivityVisibility,
	} {
		if value != VisibilityPrivate {
			t.Errorf("%s visibility = %q, want %q", name, value, VisibilityPrivate)
		}
	}
}

func TestSettingsServiceAppliesOnlySuppliedFields(t *testing.T) {
	pool := newTestPool(t)
	userID := createTestUser(t, pool, "setpatch")
	ctx := context.Background()

	service := NewService(pool, profile.NewService(pool))
	updated, err := service.Update(ctx, userID, Patch{Theme: stringPtr("dark")})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.Theme != "dark" {
		t.Errorf("theme = %q, want dark", updated.Theme)
	}
	if updated.ProfileVisibility != VisibilityPrivate {
		t.Errorf("profile visibility = %q, want it untouched", updated.ProfileVisibility)
	}
	if updated.CollectionVisibility != VisibilityPrivate {
		t.Errorf("collection visibility = %q, want it untouched", updated.CollectionVisibility)
	}
}

func TestSettingsServiceNoOpKeepsTimestamp(t *testing.T) {
	pool := newTestPool(t)
	userID := createTestUser(t, pool, "setnoop")
	ctx := context.Background()

	service := NewService(pool, profile.NewService(pool))
	first, err := service.Get(ctx, userID)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	second, err := service.Update(ctx, userID, Patch{Theme: stringPtr(first.Theme)})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if !second.UpdatedAt.Equal(first.UpdatedAt) {
		t.Errorf("updated_at moved from %v to %v on a no-op update", first.UpdatedAt, second.UpdatedAt)
	}
}

func TestSettingsServiceUpdatesProfileVisibilityInProfileDomain(t *testing.T) {
	pool := newTestPool(t)
	userID := createTestUser(t, pool, "setprofile")
	ctx := context.Background()

	profiles := profile.NewService(pool)
	service := NewService(pool, profiles)

	updated, err := service.Update(ctx, userID, Patch{ProfileVisibility: stringPtr(VisibilityPublic)})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.ProfileVisibility != VisibilityPublic {
		t.Errorf("profile visibility = %q, want public", updated.ProfileVisibility)
	}

	stored, err := profiles.Get(ctx, userID)
	if err != nil {
		t.Fatalf("profile Get() error = %v", err)
	}
	if stored.Visibility != VisibilityPublic {
		t.Errorf("stored profile visibility = %q, want public", stored.Visibility)
	}
}

func TestSettingsServiceRejectsInvalidValues(t *testing.T) {
	pool := newTestPool(t)
	userID := createTestUser(t, pool, "setinvalid")
	ctx := context.Background()

	service := NewService(pool, profile.NewService(pool))
	if _, err := service.Update(ctx, userID, Patch{Theme: stringPtr("sepia")}); err == nil {
		t.Fatal("Update() accepted an invalid theme")
	}
	if _, err := service.Update(ctx, userID, Patch{CollectionVisibility: stringPtr("everyone")}); err == nil {
		t.Fatal("Update() accepted an invalid visibility")
	}
}

func TestSettingsServiceKeepsAccountsSeparate(t *testing.T) {
	pool := newTestPool(t)
	first := createTestUser(t, pool, "setfirst")
	second := createTestUser(t, pool, "setsecond")
	ctx := context.Background()

	service := NewService(pool, profile.NewService(pool))
	if _, err := service.Update(ctx, first, Patch{Theme: stringPtr("dark")}); err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	other, err := service.Get(ctx, second)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if other.Theme != ThemeSystem {
		t.Errorf("other account theme = %q, want %q", other.Theme, ThemeSystem)
	}
}
