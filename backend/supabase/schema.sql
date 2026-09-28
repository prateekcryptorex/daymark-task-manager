create table if not exists public.user_task_lists (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_task_lists
  drop constraint if exists user_task_lists_tasks_array_check;
alter table public.user_task_lists
  add constraint user_task_lists_tasks_array_check check (jsonb_typeof(tasks) = 'array');

alter table public.user_task_lists enable row level security;
revoke all on table public.user_task_lists from public, anon;
grant select, insert, update on table public.user_task_lists to authenticated;

drop policy if exists "Users can read their own task list" on public.user_task_lists;
create policy "Users can read their own task list"
  on public.user_task_lists for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own task list" on public.user_task_lists;
create policy "Users can create their own task list"
  on public.user_task_lists for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own task list" on public.user_task_lists;
create policy "Users can update their own task list"
  on public.user_task_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-evidence', 'task-evidence', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own task evidence" on storage.objects;
create policy "Users can read their own task evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'task-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload their own task evidence" on storage.objects;
create policy "Users can upload their own task evidence"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'task-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own task evidence" on storage.objects;
create policy "Users can delete their own task evidence"
  on storage.objects for delete to authenticated
  using (bucket_id = 'task-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
