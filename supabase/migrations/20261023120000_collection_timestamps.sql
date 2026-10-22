-- M13 — Distinguish a collection addition from the creation of the wider
-- user_media relationship.
--
-- A user_media row can exist because of a favorite, watchlist status, rating or
-- review without the title ever being in the collection. created_at therefore
-- cannot answer "when was this added to my collection?". collected_at is the
-- single source of truth for that question.
--
-- Historical collection-add times are approximate: created_at is the best
-- available evidence for rows that existed before this migration.

ALTER TABLE public.user_media
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

UPDATE public.user_media
SET collected_at = created_at
WHERE in_collection = TRUE
  AND collected_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_media_collected_at_check'
  ) THEN
    ALTER TABLE public.user_media
      ADD CONSTRAINT user_media_collected_at_check
      CHECK (
        (in_collection = TRUE AND collected_at IS NOT NULL)
        OR (in_collection = FALSE AND collected_at IS NULL)
      );
  END IF;
END $$;

-- Collection previews and the Collection page order by the moment the title was
-- actually collected, not by the creation of the relationship row.
CREATE INDEX IF NOT EXISTS user_media_collected_recent_idx
  ON public.user_media (user_id, collected_at DESC, id DESC)
  WHERE in_collection = TRUE;

-- Continue Watching, Watch Next and Completed are ordered by the last status
-- transition. The existing watchlist index uses created_at, which is wrong for
-- a status dashboard.
CREATE INDEX IF NOT EXISTS user_media_status_changed_recent_idx
  ON public.user_media (user_id, status_changed_at DESC, id DESC)
  WHERE status IS NOT NULL;
