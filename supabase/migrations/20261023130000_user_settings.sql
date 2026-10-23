-- M14 — Personal preferences and privacy policy.
--
-- Settings live in their own one-to-one table rather than on users or
-- user_profiles. Profile visibility remains authoritative in user_profiles;
-- this table deliberately does not duplicate it.
--
-- Notification preferences are stored for the future notification module. No
-- notification is generated or delivered in M14.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id TEXT PRIMARY KEY
    REFERENCES public.users(id) ON DELETE CASCADE,

  theme TEXT NOT NULL DEFAULT 'system'
    CHECK (theme IN ('light', 'dark', 'system')),

  collection_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (collection_visibility IN ('private', 'public')),
  favorites_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (favorites_visibility IN ('private', 'public')),
  watchlist_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (watchlist_visibility IN ('private', 'public')),
  ratings_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (ratings_visibility IN ('private', 'public')),

  -- friends is reserved for the future friend graph, not implemented yet.
  activity_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (activity_visibility IN ('private', 'friends', 'public')),

  notification_preferences JSONB NOT NULL DEFAULT
    '{"friend_requests":true,"friend_accepted":true,"social_interactions":false,"system_updates":true}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_settings_notification_object_check
    CHECK (jsonb_typeof(notification_preferences) = 'object')
);

-- Every existing account starts private with the system theme.
INSERT INTO public.user_settings (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;
