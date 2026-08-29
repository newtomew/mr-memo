-- Public storage bucket for profile pictures. Public because avatars are
-- non-sensitive and rendered directly via <img src> across the app without
-- a signed-URL round trip on every load (unlike memo attachments).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
