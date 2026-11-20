-- Run this file in the EXISTING portfolio project's SQL Editor, after supabase.sql.
-- Safe to run again. No existing projects or files are removed.
begin;
create table if not exists public.project_likes (
  project_id uuid not null references public.projects(id) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, visitor_id)
);
create table if not exists public.project_comments (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  visitor_id uuid not null,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists project_comments_project_date on public.project_comments(project_id, created_at desc, id desc);
create index if not exists project_comments_visitor_date on public.project_comments(visitor_id, created_at desc);
alter table public.project_likes enable row level security;
alter table public.project_comments enable row level security;
-- Only the bounded RPCs below expose guest interaction. Never expose visitor IDs.
revoke all on public.project_likes, public.project_comments from public, anon, authenticated;
grant select (id,project_id,author_name,body,created_at) on public.project_comments to authenticated;
grant delete on public.project_comments to authenticated;
drop policy if exists "Portfolio admin reads comments" on public.project_comments;
create policy "Portfolio admin reads comments" on public.project_comments for select to authenticated using (public.is_portfolio_admin());
drop policy if exists "Portfolio admin deletes comments" on public.project_comments;
create policy "Portfolio admin deletes comments" on public.project_comments for delete to authenticated using (public.is_portfolio_admin());

create or replace function public.portfolio_engagement(p_projects uuid[], p_visitor uuid)
returns table(project_id uuid, likes bigint, comments bigint, liked boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
    (select count(*) from public.project_likes l where l.project_id=p.id),
    (select count(*) from public.project_comments c where c.project_id=p.id),
    exists(select 1 from public.project_likes l where l.project_id=p.id and l.visitor_id=p_visitor)
  from public.projects p where p.id=any(p_projects[1:100]);
$$;
create or replace function public.portfolio_set_like(p_project uuid,p_visitor uuid,p_liked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_visitor is null or p_liked is null then raise exception 'Invalid request'; end if;
  if not exists(select 1 from public.projects where id=p_project) then raise exception 'Project not found'; end if;
  if p_liked then
    insert into public.project_likes(project_id,visitor_id) values(p_project,p_visitor) on conflict do nothing;
  else
    delete from public.project_likes where project_id=p_project and visitor_id=p_visitor;
  end if;
end;
$$;
create or replace function public.portfolio_comments(p_project uuid,p_offset integer default 0)
returns table(id uuid,author_name text,body text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id,c.author_name,c.body,c.created_at from public.project_comments c
  where c.project_id=p_project order by c.created_at desc,c.id desc
  limit 20 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
create or replace function public.portfolio_add_comment(p_id uuid,p_project uuid,p_visitor uuid,p_name text,p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null or p_visitor is null or p_name is null or p_body is null
    or char_length(btrim(p_name)) not between 1 and 60
    or char_length(btrim(p_body)) not between 1 and 1000 then
    raise exception 'Please enter a name and a comment of up to 1,000 characters.';
  end if;
  if not exists(select 1 from public.projects where id=p_project) then raise exception 'Project not found'; end if;
  -- Serialize requests for this browser identifier, including concurrent submissions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor::text,0));
  if exists(select 1 from public.project_comments where id=p_id and visitor_id=p_visitor and project_id=p_project) then return p_id; end if;
  if exists(select 1 from public.project_comments where visitor_id=p_visitor and created_at>now()-interval '30 seconds') then
    raise exception 'Please wait 30 seconds before posting another comment.';
  end if;
  if (select count(*) from public.project_comments where visitor_id=p_visitor and created_at>now()-interval '1 day')>=20 then
    raise exception 'You have reached the daily comment limit. Please try again tomorrow.';
  end if;
  insert into public.project_comments(id,project_id,visitor_id,author_name,body)
    values(p_id,p_project,p_visitor,btrim(p_name),btrim(p_body));
  return p_id;
end;
$$;
revoke all on function public.portfolio_engagement(uuid[],uuid), public.portfolio_set_like(uuid,uuid,boolean), public.portfolio_comments(uuid,integer), public.portfolio_add_comment(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.portfolio_engagement(uuid[],uuid), public.portfolio_set_like(uuid,uuid,boolean), public.portfolio_comments(uuid,integer), public.portfolio_add_comment(uuid,uuid,uuid,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
