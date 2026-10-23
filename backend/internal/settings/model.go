package settings

import "time"

// NotificationPreferences holds the delivery preferences for the future
// notification module. M14 stores and displays them; it does not deliver
// anything yet.
type NotificationPreferences struct {
	FriendRequests     bool `json:"friend_requests"`
	FriendAccepted     bool `json:"friend_accepted"`
	SocialInteractions bool `json:"social_interactions"`
	SystemUpdates      bool `json:"system_updates"`
}

// Settings is the combined settings response. Profile visibility is read from
// user_profiles, which stays the single authoritative source for it.
type Settings struct {
	ProfileVisibility       string                  `json:"profile_visibility"`
	Theme                   string                  `json:"theme"`
	CollectionVisibility    string                  `json:"collection_visibility"`
	FavoritesVisibility     string                  `json:"favorites_visibility"`
	WatchlistVisibility     string                  `json:"watchlist_visibility"`
	RatingsVisibility       string                  `json:"ratings_visibility"`
	ActivityVisibility      string                  `json:"activity_visibility"`
	NotificationPreferences NotificationPreferences `json:"notification_preferences"`
	UpdatedAt               time.Time               `json:"updated_at"`
}

// Patch is a partial update. A nil field is left unchanged. Notification
// preferences are intentionally not writable: no notification is delivered in
// M14, so accepting a change would be misleading.
type Patch struct {
	ProfileVisibility    *string `json:"profile_visibility"`
	Theme                *string `json:"theme"`
	CollectionVisibility *string `json:"collection_visibility"`
	FavoritesVisibility  *string `json:"favorites_visibility"`
	WatchlistVisibility  *string `json:"watchlist_visibility"`
	RatingsVisibility    *string `json:"ratings_visibility"`
	ActivityVisibility   *string `json:"activity_visibility"`
}

// Empty reports whether the patch asks for any change at all.
func (p Patch) Empty() bool {
	return p.ProfileVisibility == nil &&
		p.Theme == nil &&
		p.CollectionVisibility == nil &&
		p.FavoritesVisibility == nil &&
		p.WatchlistVisibility == nil &&
		p.RatingsVisibility == nil &&
		p.ActivityVisibility == nil
}
