-- Gestión de ausencias con acceso exclusivo para administradores.
create extension if not exists btree_gist;

create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  absence_type text not null check (absence_type in ('vacation', 'sick_leave')),
  starts_on date not null,
  ends_on date not null,
  admin_note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint absences_dates_valid check (ends_on >= starts_on)
);

alter table public.absences add column if not exists admin_note text;
alter table public.absences add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();
alter table public.absences add column if not exists created_at timestamptz not null default now();

-- No permite solapamientos para un mismo trabajador, incluyendo los extremos del intervalo.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'absences_no_worker_overlap' and conrelid = 'public.absences'::regclass) then
    alter table public.absences add constraint absences_no_worker_overlap
      exclude using gist (worker_id with =, daterange(starts_on, ends_on, '[]') with &&);
  end if;
end $$;

alter table public.absences enable row level security;
do $$ declare policy_row record; begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'absences' loop
    execute format('drop policy if exists %I on public.absences', policy_row.policyname);
  end loop;
end $$;
create policy "Admins read absences" on public.absences for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active = true));
create policy "Admins insert absences" on public.absences for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active = true));
create policy "Admins update absences" on public.absences for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active = true));
create policy "Admins delete absences" on public.absences for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.active = true));

-- La tabla de perfiles solo permite que el administrador activo gestione perfiles de trabajadores.
drop policy if exists "Admins update worker profiles" on public.profiles;
create policy "Admins update worker profiles" on public.profiles for update to authenticated
  using (exists (select 1 from public.profiles admin_profile where admin_profile.id = auth.uid() and admin_profile.role = 'admin' and admin_profile.active = true) and role = 'worker')
  with check (exists (select 1 from public.profiles admin_profile where admin_profile.id = auth.uid() and admin_profile.role = 'admin' and admin_profile.active = true) and role = 'worker');
