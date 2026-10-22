package settings

import (
	"context"
	"fmt"

	"github.com/MdRasB/mosaic/backend/internal/profile"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db       *pgxpool.Pool
	repo     *Repository
	profiles *profile.Service
}

func NewService(db *pgxpool.Pool, profiles *profile.Service) *Service {
	return &Service{db: db, repo: NewRepository(db), profiles: profiles}
}

// Get returns the signed-in user's settings. Profile visibility is read from
// the profile domain so user_profiles stays the only source of truth for it.
func (s *Service) Get(ctx context.Context, userID string) (Settings, error) {
	if err := s.repo.Ensure(ctx, s.db, userID); err != nil {
		return Settings{}, err
	}
	result, err := s.repo.Get(ctx, s.db, userID)
	if err != nil {
		return Settings{}, err
	}
	userProfile, err := s.profiles.Get(ctx, userID)
	if err != nil {
		return Settings{}, err
	}
	result.ProfileVisibility = userProfile.Visibility
	return result, nil
}

// Update applies a partial update. Settings and profile visibility are written
// in one transaction when both change, and a request that changes nothing
// leaves the stored timestamps alone.
func (s *Service) Update(ctx context.Context, userID string, patch Patch) (Settings, error) {
	normalized, err := normalizePatch(patch)
	if err != nil {
		return Settings{}, err
	}
	if normalized.Empty() {
		return s.Get(ctx, userID)
	}

	current, err := s.Get(ctx, userID)
	if err != nil {
		return Settings{}, err
	}

	settingsChanged := false
	if normalized.Theme != nil && *normalized.Theme != current.Theme {
		settingsChanged = true
	}
	if normalized.CollectionVisibility != nil && *normalized.CollectionVisibility != current.CollectionVisibility {
		settingsChanged = true
	}
	if normalized.FavoritesVisibility != nil && *normalized.FavoritesVisibility != current.FavoritesVisibility {
		settingsChanged = true
	}
	if normalized.WatchlistVisibility != nil && *normalized.WatchlistVisibility != current.WatchlistVisibility {
		settingsChanged = true
	}
	if normalized.RatingsVisibility != nil && *normalized.RatingsVisibility != current.RatingsVisibility {
		settingsChanged = true
	}
	if normalized.ActivityVisibility != nil && *normalized.ActivityVisibility != current.ActivityVisibility {
		settingsChanged = true
	}
	profileChanged := normalized.ProfileVisibility != nil &&
		*normalized.ProfileVisibility != current.ProfileVisibility

	if !settingsChanged && !profileChanged {
		return current, nil
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Settings{}, fmt.Errorf("begin settings transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.repo.Ensure(ctx, tx, userID); err != nil {
		return Settings{}, err
	}
	if settingsChanged {
		if err := s.repo.Update(ctx, tx, userID, normalized); err != nil {
			return Settings{}, err
		}
	}
	if profileChanged {
		if err := s.profiles.SetVisibilityTx(ctx, tx, userID, *normalized.ProfileVisibility); err != nil {
			return Settings{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Settings{}, fmt.Errorf("commit settings transaction: %w", err)
	}
	return s.Get(ctx, userID)
}
