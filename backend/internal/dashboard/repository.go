package dashboard

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrProfileNotFound = errors.New("dashboard profile not found")

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository { return &Repository{db: db} }

// BeginSnapshot starts a read-only, repeatable-read transaction. Stats and
// previews therefore describe the same moment even if the user is changing
// their library in another request.
func (r *Repository) BeginSnapshot(ctx context.Context) (pgx.Tx, error) {
	return r.db.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
}

func (r *Repository) Profile(ctx context.Context, q querier, userID string) (Profile, error) {
	var profile Profile
	err := q.QueryRow(ctx, `SELECT COALESCE(display_name, 'Mosaic User'), username,
		avatar_url, avatar_image IS NOT NULL, updated_at
		FROM public.user_profiles WHERE user_id = $1`, userID).
		Scan(&profile.DisplayName, &profile.Username, &profile.AvatarURL,
			&profile.HasUploadedAvatar, &profile.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, ErrProfileNotFound
	}
	if err != nil {
		return Profile{}, fmt.Errorf("load dashboard profile: %w", err)
	}
	return profile, nil
}

func (r *Repository) Stats(ctx context.Context, q querier, userID string) (Stats, error) {
	var stats Stats
	err := q.QueryRow(ctx, `SELECT
			count(*) FILTER (WHERE um.in_collection)         AS collection_count,
			count(*) FILTER (WHERE um.is_favorite)           AS favorite_count,
			count(*) FILTER (WHERE um.status = 'watchlist')  AS planned_count,
			count(*) FILTER (WHERE um.status = 'watching')   AS watching_count,
			count(*) FILTER (WHERE um.status = 'paused')     AS paused_count,
			count(*) FILTER (WHERE um.status = 'completed')  AS completed_count,
			count(*) FILTER (WHERE um.status = 'dropped')    AS dropped_count,
			count(*) FILTER (WHERE um.rating IS NOT NULL)    AS rated_count,
			(SELECT count(*)
			   FROM public.media_reviews r
			   JOIN public.user_media um2 ON um2.id = r.user_media_id
			  WHERE um2.user_id = $1)                       AS review_count
		FROM public.user_media um
		WHERE um.user_id = $1`, userID).
		Scan(&stats.Collection, &stats.Favorites, &stats.Planned, &stats.Watching,
			&stats.Paused, &stats.Completed, &stats.Dropped, &stats.Rated, &stats.Reviews)
	if err != nil {
		return Stats{}, fmt.Errorf("load dashboard statistics: %w", err)
	}
	return stats, nil
}

// previewColumns is shared by every UNION branch so the preview shape stays
// identical regardless of which membership rule supplied the row.
const previewColumns = `um.id, um.status, um.rating::float8, um.rated_at,
	um.collected_at, um.favorited_at, um.status_changed_at,
	mi.provider, mi.media_type, mi.provider_media_id, mi.title,
	mi.poster_path, mi.release_date::text`

const previewFrom = `FROM public.user_media um
	JOIN public.media_items mi ON mi.id = um.media_id`

const previewQuery = `WITH candidates AS (
	SELECT 'continue_watching' AS section, ` + previewColumns + `, um.status_changed_at AS sort_at ` + previewFrom + `
	WHERE um.user_id = $1 AND um.status = 'watching'
	UNION ALL
	SELECT 'watch_next', ` + previewColumns + `, um.status_changed_at ` + previewFrom + `
	WHERE um.user_id = $1 AND um.status = 'watchlist'
	UNION ALL
	SELECT 'recently_added', ` + previewColumns + `, um.collected_at ` + previewFrom + `
	WHERE um.user_id = $1 AND um.in_collection = TRUE
	UNION ALL
	SELECT 'favorites', ` + previewColumns + `, um.favorited_at ` + previewFrom + `
	WHERE um.user_id = $1 AND um.is_favorite = TRUE
	UNION ALL
	SELECT 'recently_rated', ` + previewColumns + `, um.rated_at ` + previewFrom + `
	WHERE um.user_id = $1 AND um.rating IS NOT NULL
	UNION ALL
	SELECT 'completed', ` + previewColumns + `, um.status_changed_at ` + previewFrom + `
	WHERE um.user_id = $1 AND um.status = 'completed'
), ranked AS (
	SELECT *, row_number() OVER (
		PARTITION BY section ORDER BY sort_at DESC NULLS LAST, id DESC
	) AS position
	FROM candidates
)
SELECT section, id, status, rating, rated_at, collected_at, favorited_at,
	status_changed_at, provider, media_type, provider_media_id, title,
	poster_path, release_date
FROM ranked
WHERE position <= $2
ORDER BY section, position`

func (r *Repository) Previews(ctx context.Context, q querier, userID string, limit int) (Sections, error) {
	rows, err := q.Query(ctx, previewQuery, userID, limit)
	if err != nil {
		return Sections{}, fmt.Errorf("load dashboard previews: %w", err)
	}
	defer rows.Close()

	sections := newSections()
	for rows.Next() {
		var section string
		var item MediaPreview
		if err := rows.Scan(
			&section, &item.UserMediaID, &item.Status, &item.Rating,
			&item.RatedAt, &item.CollectedAt, &item.FavoritedAt, &item.StatusChangedAt,
			&item.Media.Provider, &item.Media.MediaType, &item.Media.ProviderMediaID,
			&item.Media.Title, &item.Media.PosterPath, &item.Media.ReleaseDate,
		); err != nil {
			return Sections{}, fmt.Errorf("scan dashboard preview: %w", err)
		}
		switch section {
		case "continue_watching":
			sections.ContinueWatching = append(sections.ContinueWatching, item)
		case "watch_next":
			sections.WatchNext = append(sections.WatchNext, item)
		case "recently_added":
			sections.RecentlyAdded = append(sections.RecentlyAdded, item)
		case "favorites":
			sections.Favorites = append(sections.Favorites, item)
		case "recently_rated":
			sections.RecentlyRated = append(sections.RecentlyRated, item)
		case "completed":
			sections.Completed = append(sections.Completed, item)
		default:
			return Sections{}, fmt.Errorf("unknown dashboard section %q", section)
		}
	}
	if err := rows.Err(); err != nil {
		return Sections{}, fmt.Errorf("iterate dashboard previews: %w", err)
	}
	return sections, nil
}

func (r *Repository) RecentReviews(ctx context.Context, q querier, userID string, limit int) ([]ReviewPreview, error) {
	rows, err := q.Query(ctx, `SELECT r.id, um.id,
			mi.provider, mi.media_type, mi.provider_media_id, mi.title,
			mi.poster_path, mi.release_date::text,
			r.title, left(r.body, 180), r.visibility, r.contains_spoilers, r.updated_at
		FROM public.media_reviews r
		JOIN public.user_media um ON um.id = r.user_media_id
		JOIN public.media_items mi ON mi.id = um.media_id
		WHERE um.user_id = $1
		ORDER BY r.updated_at DESC, r.id DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("load recent reviews: %w", err)
	}
	defer rows.Close()

	reviews := make([]ReviewPreview, 0, limit)
	for rows.Next() {
		var item ReviewPreview
		if err := rows.Scan(
			&item.ID, &item.UserMediaID,
			&item.Media.Provider, &item.Media.MediaType, &item.Media.ProviderMediaID,
			&item.Media.Title, &item.Media.PosterPath, &item.Media.ReleaseDate,
			&item.Title, &item.Excerpt, &item.Visibility, &item.ContainsSpoilers, &item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan recent review: %w", err)
		}
		reviews = append(reviews, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent reviews: %w", err)
	}
	return reviews, nil
}
