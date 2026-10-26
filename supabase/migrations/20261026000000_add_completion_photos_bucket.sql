-- Job completion photos live in a private bucket at {user_id}/{estimate_id}/{uuid}.jpg.
-- The bucket limits enforce the same image MIME list as completionPhotoSchema.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'completion-photos',
  'completion-photos',
  false,
  409600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Insert only: uploads never upsert, so photos are write-once. Reads go through server-signed URLs (service role).
drop policy if exists "completion photos: owner insert" on storage.objects;
create policy "completion photos: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'completion-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
