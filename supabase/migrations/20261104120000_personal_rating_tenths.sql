-- Personal ratings are stored to one decimal place by user_media.rating.
-- Replace the former half-point constraint so the API can preserve tenths.
DO $$
BEGIN
  ALTER TABLE public.user_media
    DROP CONSTRAINT IF EXISTS user_media_rating_check;

  ALTER TABLE public.user_media
    ADD CONSTRAINT user_media_rating_check
    CHECK (
      rating IS NULL
      OR (
        rating BETWEEN 1.0 AND 10.0
        AND rating * 10 = trunc(rating * 10)
      )
    );
END $$;
