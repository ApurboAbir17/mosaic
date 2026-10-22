package dashboard

import (
	"time"

	"github.com/MdRasB/mosaic/backend/internal/domain/collection"
)

// PreviewLimit bounds every dashboard section. The dashboard is a summary, not
// a second Collection page.
const PreviewLimit = 5

type Profile struct {
	DisplayName       string    `json:"display_name"`
	Username          string    `json:"username"`
	HasUploadedAvatar bool      `json:"has_uploaded_avatar"`
	AvatarURL         *string   `json:"avatar_url"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// Stats are overlapping membership counts. They must never be summed into a
// unique media total: one title can be collected, favorited, rated and reviewed
// at the same time.
type Stats struct {
	Collection int `json:"collection"`
	Favorites  int `json:"favorites"`
	Planned    int `json:"planned"`
	Watching   int `json:"watching"`
	Paused     int `json:"paused"`
	Completed  int `json:"completed"`
	Dropped    int `json:"dropped"`
	Rated      int `json:"rated"`
	Reviews    int `json:"reviews"`
}

type MediaPreview struct {
	UserMediaID     int64            `json:"user_media_id"`
	Media           collection.Media `json:"media"`
	Status          *string          `json:"status"`
	Rating          *float64         `json:"rating"`
	RatedAt         *time.Time       `json:"rated_at"`
	CollectedAt     *time.Time       `json:"collected_at"`
	FavoritedAt     *time.Time       `json:"favorited_at"`
	StatusChangedAt *time.Time       `json:"status_changed_at"`
}

type ReviewPreview struct {
	ID               int64            `json:"id"`
	UserMediaID      int64            `json:"user_media_id"`
	Media            collection.Media `json:"media"`
	Title            *string          `json:"title"`
	Excerpt          string           `json:"excerpt"`
	Visibility       string           `json:"visibility"`
	ContainsSpoilers bool             `json:"contains_spoilers"`
	UpdatedAt        time.Time        `json:"updated_at"`
}

type Sections struct {
	ContinueWatching []MediaPreview  `json:"continue_watching"`
	WatchNext        []MediaPreview  `json:"watch_next"`
	RecentlyAdded    []MediaPreview  `json:"recently_added"`
	Favorites        []MediaPreview  `json:"favorites"`
	RecentlyRated    []MediaPreview  `json:"recently_rated"`
	Completed        []MediaPreview  `json:"completed"`
	RecentReviews    []ReviewPreview `json:"recent_reviews"`
}

type Response struct {
	Profile  Profile  `json:"profile"`
	Stats    Stats    `json:"stats"`
	Sections Sections `json:"sections"`
}

// newSections returns initialized slices so an empty dashboard serializes as
// [] rather than null. The frontend can then treat "empty" as a normal state.
func newSections() Sections {
	return Sections{
		ContinueWatching: make([]MediaPreview, 0, PreviewLimit),
		WatchNext:        make([]MediaPreview, 0, PreviewLimit),
		RecentlyAdded:    make([]MediaPreview, 0, PreviewLimit),
		Favorites:        make([]MediaPreview, 0, PreviewLimit),
		RecentlyRated:    make([]MediaPreview, 0, PreviewLimit),
		Completed:        make([]MediaPreview, 0, PreviewLimit),
		RecentReviews:    make([]ReviewPreview, 0, PreviewLimit),
	}
}
