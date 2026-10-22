package settings

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrInvalidInput = errors.New("invalid settings input")
	ErrNotFound     = errors.New("settings not found")
)

const (
	ThemeLight  = "light"
	ThemeDark   = "dark"
	ThemeSystem = "system"
)

const (
	VisibilityPrivate = "private"
	VisibilityPublic  = "public"
)

// ActivityVisibilityFriends is reserved for the future friend graph. It is
// accepted by the schema but no access rule consumes it yet.
const ActivityVisibilityFriends = "friends"

func validateTheme(value string) (string, error) {
	theme := strings.ToLower(strings.TrimSpace(value))
	switch theme {
	case ThemeLight, ThemeDark, ThemeSystem:
		return theme, nil
	default:
		return "", fmt.Errorf("%w: theme must be light, dark, or system", ErrInvalidInput)
	}
}

func validateVisibility(value string) (string, error) {
	visibility := strings.ToLower(strings.TrimSpace(value))
	if visibility != VisibilityPrivate && visibility != VisibilityPublic {
		return "", fmt.Errorf("%w: visibility must be private or public", ErrInvalidInput)
	}
	return visibility, nil
}

func validateActivityVisibility(value string) (string, error) {
	visibility := strings.ToLower(strings.TrimSpace(value))
	switch visibility {
	case VisibilityPrivate, ActivityVisibilityFriends, VisibilityPublic:
		return visibility, nil
	default:
		return "", fmt.Errorf("%w: activity visibility must be private, friends, or public", ErrInvalidInput)
	}
}

// normalizePatch validates every supplied field and leaves omitted fields
// untouched. It rejects the whole patch when one field is invalid, so a
// request never applies half of its changes.
func normalizePatch(patch Patch) (Patch, error) {
	if patch.ProfileVisibility != nil {
		value, err := validateVisibility(*patch.ProfileVisibility)
		if err != nil {
			return Patch{}, err
		}
		patch.ProfileVisibility = &value
	}
	if patch.Theme != nil {
		value, err := validateTheme(*patch.Theme)
		if err != nil {
			return Patch{}, err
		}
		patch.Theme = &value
	}
	if patch.CollectionVisibility != nil {
		value, err := validateVisibility(*patch.CollectionVisibility)
		if err != nil {
			return Patch{}, err
		}
		patch.CollectionVisibility = &value
	}
	if patch.FavoritesVisibility != nil {
		value, err := validateVisibility(*patch.FavoritesVisibility)
		if err != nil {
			return Patch{}, err
		}
		patch.FavoritesVisibility = &value
	}
	if patch.WatchlistVisibility != nil {
		value, err := validateVisibility(*patch.WatchlistVisibility)
		if err != nil {
			return Patch{}, err
		}
		patch.WatchlistVisibility = &value
	}
	if patch.RatingsVisibility != nil {
		value, err := validateVisibility(*patch.RatingsVisibility)
		if err != nil {
			return Patch{}, err
		}
		patch.RatingsVisibility = &value
	}
	if patch.ActivityVisibility != nil {
		value, err := validateActivityVisibility(*patch.ActivityVisibility)
		if err != nil {
			return Patch{}, err
		}
		patch.ActivityVisibility = &value
	}
	return patch, nil
}
