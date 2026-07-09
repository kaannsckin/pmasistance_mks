-- ===========================================================================
-- PlanAsistan — Supabase şeması (v1: belge senkronizasyonu + RLS)
-- Supabase Dashboard → SQL Editor'de bu dosyanın tamamını çalıştırın.
--
-- Model:
--   workspaces         : paylaşılan çekirdek veri (projeler*, havuz, tahsis,
--                        kilitler, snapshot'lar) — tek JSONB belge + sürüm no
--   workspace_private  : PM'e özel veri (notlar, müşteri istekleri) — yönetici
--                        rolleri (mudur, pyb_sorumlu) RLS ile HİÇ OKUYAMAZ
--   workspace_members  : üyelik + rol (RBAC'ın sunucu tarafı kaynağı)
--
--   * çekirdek belgedeki projelerde notes/customerRequests alanları boştur;
--     bunlar workspace_private içinde taşınır (istemci birleştirir).
-- ===========================================================================

create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null default 'PlanAsistan Çalışma Alanı',
    core jsonb not null default '{}'::jsonb,
    version bigint not null default 0,
    updated_at timestamptz not null default now(),
    created_by uuid not null default auth.uid() references auth.users(id)
);

create table if not exists public.workspace_private (
    workspace_id uuid primary key references public.workspaces(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    version bigint not null default 0,
    updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('mudur','pyb_sorumlu','pyb_destek','py','bolum_sorumlu')),
    added_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Yardımcı: kullanıcının bir çalışma alanındaki rolü (RLS döngüsünü kırmak
-- için security definer)
-- ---------------------------------------------------------------------------
create or replace function public.member_role(ws uuid)
returns text
language sql stable security definer
set search_path = public
as $$
    select role from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
    limit 1
$$;

-- ---------------------------------------------------------------------------
-- Çalışma alanı oluşturana otomatik üyelik (kurulumu yapan kişi veri havuzu
-- sorumlusu olarak başlar; rolü sonradan değiştirilebilir)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'pyb_destek')
    on conflict do nothing;
    insert into public.workspace_private (workspace_id)
    values (new.id)
    on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
    after insert on public.workspaces
    for each row execute function public.handle_new_workspace();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_private enable row level security;
alter table public.workspace_members enable row level security;

-- workspaces: üyeler okur; tüm üyeler yazar (onay/kilit yazımı yönetici
-- rollerinden de gelir; alan bazlı yazma kısıtı normalize şema fazında)
drop policy if exists "workspaces_select_members" on public.workspaces;
create policy "workspaces_select_members" on public.workspaces
    for select using (public.member_role(id) is not null);

drop policy if exists "workspaces_insert_auth" on public.workspaces;
create policy "workspaces_insert_auth" on public.workspaces
    for insert with check (auth.uid() = created_by);

drop policy if exists "workspaces_update_members" on public.workspaces;
create policy "workspaces_update_members" on public.workspaces
    for update using (public.member_role(id) is not null);

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner" on public.workspaces
    for delete using (created_by = auth.uid());

-- workspace_private: YÖNETİCİ ROLLERİ (mudur, pyb_sorumlu) OKUYAMAZ/YAZAMAZ.
-- "Üst yönetim, notlar gibi PM ekranlarını görmemeli" kuralının sunucu tarafı.
drop policy if exists "private_select_input_roles" on public.workspace_private;
create policy "private_select_input_roles" on public.workspace_private
    for select using (public.member_role(workspace_id) in ('py','bolum_sorumlu','pyb_destek'));

drop policy if exists "private_update_input_roles" on public.workspace_private;
create policy "private_update_input_roles" on public.workspace_private
    for update using (public.member_role(workspace_id) in ('py','bolum_sorumlu','pyb_destek'));

drop policy if exists "private_insert_input_roles" on public.workspace_private;
create policy "private_insert_input_roles" on public.workspace_private
    for insert with check (public.member_role(workspace_id) in ('py','bolum_sorumlu','pyb_destek'));

-- workspace_members: üyeler listeyi görür; üye yönetimi pyb_destek ve mudur'da
drop policy if exists "members_select_members" on public.workspace_members;
create policy "members_select_members" on public.workspace_members
    for select using (public.member_role(workspace_id) is not null);

drop policy if exists "members_manage_admins" on public.workspace_members;
create policy "members_manage_admins" on public.workspace_members
    for insert with check (public.member_role(workspace_id) in ('pyb_destek','mudur'));

drop policy if exists "members_update_admins" on public.workspace_members;
create policy "members_update_admins" on public.workspace_members
    for update using (public.member_role(workspace_id) in ('pyb_destek','mudur'));

drop policy if exists "members_delete_admins" on public.workspace_members;
create policy "members_delete_admins" on public.workspace_members
    for delete using (public.member_role(workspace_id) in ('pyb_destek','mudur'));

-- ---------------------------------------------------------------------------
-- updated_at bakımı
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists workspaces_touch on public.workspaces;
create trigger workspaces_touch before update on public.workspaces
    for each row execute function public.touch_updated_at();

drop trigger if exists private_touch on public.workspace_private;
create trigger private_touch before update on public.workspace_private
    for each row execute function public.touch_updated_at();
