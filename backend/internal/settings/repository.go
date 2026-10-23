package settings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

// Ensure creates the settings row for a user when it is missing. Registration
// already inserts one, so this only covers accounts created before the
// settings table existed.
func (r *Repository) Ensure(ctx context.Context, q querier, userID string) error {
	if _, err := q.Exec(ctx,
		`INSERT INTO public.user_settings (user_id) VALUES ($1)
		 ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return fmt.Errorf("ensure user settings: %w", err)
	}
	return nil
}

func (r *Repository) Get(ctx context.Context, q querier, userID string) (Settings, error) {
	var result Settings
	var preferences []byte
	err := q.QueryRow(ctx, `SELECT theme, collection_visibility, favorites_visibility,
			watchlist_visibility, ratings_visibility, activity_visibility,
			notification_preferences, updated_at
		FROM public.user_settings
		WHERE user_id = $1`, userID).
		Scan(&result.Theme, &result.CollectionVisibility, &result.FavoritesVisibility,
			&result.WatchlistVisibility, &result.RatingsVisibility, &result.ActivityVisibility,
			&preferences, &result.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Settings{}, ErrNotFound
	}
	if err != nil {
		return Settings{}, fmt.Errorf("load settings: %w", err)
	}
	if len(preferences) > 0 {
		if err := json.Unmarshal(preferences, &result.NotificationPreferences); err != nil {
			return Settings{}, fmt.Errorf("read notification preferences: %w", err)
		}
	}
	return result, nil
}

// Update writes the supplied values. Every parameter is optional: a NULL
// argument keeps the stored value.
func (r *Repository) Update(ctx context.Context, q querier, userID string, patch Patch) error {
	_, err := q.Exec(ctx, `UPDATE public.user_settings SET
			theme = COALESCE($2::text, theme),
			collection_visibility = COALESCE($3::text, collection_visibility),
			favorites_visibility = COALESCE($4::text, favorites_visibility),
			watchlist_visibility = COALESCE($5::text, watchlist_visibility),
			ratings_visibility = COALESCE($6::text, ratings_visibility),
			activity_visibility = COALESCE($7::text, activity_visibility),
			updated_at = now()
		WHERE user_id = $1`,
		userID, patch.Theme, patch.CollectionVisibility, patch.FavoritesVisibility,
		patch.WatchlistVisibility, patch.RatingsVisibility, patch.ActivityVisibility)
	if err != nil {
		return fmt.Errorf("update settings: %w", err)
	}
	return nil
}
