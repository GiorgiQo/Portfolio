-- Run once in your Supabase SQL Editor.
create table public.portfolio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.portfolio_admins enable row level security;
create policy "Admins can read their own membership" on public.portfolio_admins
  for select to authenticated using (user_id = auth.uid());
create function public.is_portfolio_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists(select 1 from public.portfolio_admins where user_id = auth.uid()); $$;
revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  category text not null check (category in ('კომერციული','მოგზაურობა','მუსიკალური','პერსონალური')),
  year integer not null check (year between 1900 and 2100),
  duration text not null default '',
  description text not null default '' check (length(description) <= 2000),
  video_url text not null check (video_url like 'https://%'),
  thumbnail_url text not null check (thumbnail_url like 'https://%'),
  video_path text,
  thumbnail_path text,
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant select on public.portfolio_admins to authenticated;
revoke insert, update, delete on public.portfolio_admins from anon, authenticated;
create policy "Public portfolio" on public.projects for select to anon, authenticated using (true);
create policy "Admin creates projects" on public.projects for insert to authenticated with check (public.is_portfolio_admin());
create policy "Admin edits projects" on public.projects for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy "Admin deletes projects" on public.projects for delete to authenticated using (public.is_portfolio_admin());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('portfolio','portfolio',true,52428800,array['video/mp4','video/webm','image/jpeg','image/png','image/webp']);
create policy "Admin uploads portfolio media" on storage.objects for insert to authenticated
  with check (bucket_id='portfolio' and public.is_portfolio_admin());
create policy "Admin reads portfolio objects" on storage.objects for select to authenticated
  using (bucket_id='portfolio' and public.is_portfolio_admin());
create policy "Admin deletes portfolio media" on storage.objects for delete to authenticated
  using (bucket_id='portfolio' and public.is_portfolio_admin());

-- After creating your user in Authentication > Users, run separately:
-- insert into public.portfolio_admins (user_id)
-- select id from auth.users where email = 'qoridzegiorgi48@gmail.com';
