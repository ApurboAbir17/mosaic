package dashboard

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const requestTimeout = 5 * time.Second

type Service struct {
	repo *Repository
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{repo: NewRepository(db)}
}

// Get assembles the authenticated user's dashboard from a consistent
// read-only snapshot. A failure in any critical query is returned to the
// handler: the dashboard never substitutes fabricated zeros.
func (s *Service) Get(ctx context.Context, userID string) (Response, error) {
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()

	tx, err := s.repo.BeginSnapshot(ctx)
	if err != nil {
		return Response{}, fmt.Errorf("begin dashboard snapshot: %w", err)
	}
	defer tx.Rollback(ctx)

	profile, err := s.repo.Profile(ctx, tx, userID)
	if err != nil {
		return Response{}, err
	}
	stats, err := s.repo.Stats(ctx, tx, userID)
	if err != nil {
		return Response{}, err
	}
	sections, err := s.repo.Previews(ctx, tx, userID, PreviewLimit)
	if err != nil {
		return Response{}, err
	}
	reviews, err := s.repo.RecentReviews(ctx, tx, userID, PreviewLimit)
	if err != nil {
		return Response{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Response{}, fmt.Errorf("commit dashboard snapshot: %w", err)
	}
	sections.RecentReviews = reviews

	return Response{
		Profile:  profile,
		Stats:    stats,
		Sections: sections,
	}, nil
}
