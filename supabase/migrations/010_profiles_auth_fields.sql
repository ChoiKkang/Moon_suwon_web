ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider_sub text,
  ADD COLUMN IF NOT EXISTS is_private_email boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN nickname DROP NOT NULL;

UPDATE public.profiles
SET provider_sub = id::text
WHERE provider_sub IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN provider_sub SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_provider_sub_key
  ON public.profiles (provider, provider_sub);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
