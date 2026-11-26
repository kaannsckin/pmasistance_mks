-- ===========================================================================
-- PlanAsistan — Supabase şeması (v2: proje satırları + RLS)
-- Supabase Dashboard → SQL Editor'de bu dosyanın tamamını çalıştırın.
-- Dosya tekrar çalıştırılabilir; v1 kurulumunu yükseltmek için de aynısını
-- çalıştırın (mevcut veri korunur, uygulama ilk gönderimde taşır).
--
-- Model:
--   workspaces         : paylaşılan çekirdek veri (havuz, tahsis, kilitler,
--                        snapshot'lar, proje sırası) — tek JSONB belge + sürüm no
--   workspace_projects : her proje ayrı satır, kendi sürüm numarasıyla
--                        (yalnız değişen proje yazılır; farklı projelerde
--                        çalışan kişiler çakışmaz)
--   workspace_private  : PM'e özel veri (notlar, müşteri istekleri) — yönetici
--                        rolleri (mudur, pyb_sorumlu) RLS ile HİÇ OKUYAMAZ
--   workspace_members  : üyelik + rol (RBAC'ın sunucu tarafı kaynağı)
--
--   * proje satırlarında notes/customerRequests alanları boştur; bunlar
--     workspace_private içinde taşınır (istemci birleştirir).
--   * v1'de projeler workspaces.core içindeydi; uygulama bunu okur ve ilk
--     gönderimde satırlara taşır.
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

create table if not exists public.workspace_projects (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    project_id text not null,
    data jsonb not null,
    version bigint not null default 1,
    updated_at timestamptz not null default now(),
    primary key (workspace_id, project_id)
);

do $$ begin
    if not exists (select 1 from pg_constraint where conrelid = 'public.workspace_projects'::regclass and conname = 'project_shared_data') then
        alter table public.workspace_projects add constraint project_shared_data check (
            data->>'id' is not distinct from project_id
            and coalesce(data->'notes', '[]') = '[]'
            and coalesce(data->'customerRequests', '[]') = '[]'
        ) not valid;
    end if;
end $$;

-- Sunucu ayarları (yönetici panelinden AI bağlantısı). RLS açık, POLİTİKA YOK:
-- istemciler (anon / oturumlu) hiç erişemez; yalnız sunucu service role ile
-- okur ve yazar. API anahtarları AI_CONFIG_SECRET ile şifrelenmiş saklanır.
create table if not exists public.app_settings (
    id text primary key,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('mudur','pyb_sorumlu','pyb_destek','py','bolum_sorumlu')),
    added_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

alter table public.workspace_members add column if not exists person_id text;
-- NULL: tüm projeler, boş liste: hiçbir proje.
alter table public.workspace_members add column if not exists project_ids text[];
alter table public.workspace_members add column if not exists access_admin boolean not null default false;
update public.workspace_members m set access_admin = true, project_ids = null
from public.workspaces w where m.workspace_id = w.id and m.user_id = w.created_by
and (not m.access_admin or m.project_ids is not null);

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

create or replace function public.can_access_workspace_project(ws uuid, project text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
        and (m.project_ids is null or project = any(m.project_ids)))
$$;

create or replace function public.has_full_workspace_access(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.project_ids is null)
$$;

create or replace function public.can_edit_workspace_project(ws uuid, project text, pm text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
        and ((m.project_ids is null and (m.access_admin or m.role = 'pyb_destek'))
            or ((m.project_ids is null or project = any(m.project_ids)) and m.role = 'py' and m.person_id = pm)))
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
    insert into public.workspace_members (workspace_id, user_id, role, access_admin)
    values (new.id, new.created_by, 'pyb_destek', true)
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
alter table public.workspace_projects enable row level security;
alter table public.app_settings enable row level security;

-- workspaces: üyeler okur; tüm üyeler yazar (onay/kilit yazımı yönetici
-- rollerinden de gelir; alan bazlı yazma kısıtı normalize şema fazında)
drop policy if exists "workspaces_select_members" on public.workspaces;
create policy "workspaces_select_members" on public.workspaces
    for select using (public.has_full_workspace_access(id));

drop policy if exists "workspaces_insert_auth" on public.workspaces;
create policy "workspaces_insert_auth" on public.workspaces
    for insert with check (auth.uid() = created_by);

drop policy if exists "workspaces_update_members" on public.workspaces;
create policy "workspaces_update_members" on public.workspaces
    for update using (public.has_full_workspace_access(id));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner" on public.workspaces
    for delete using (created_by = auth.uid());

-- workspace_projects: çekirdek belgeyle aynı kural (üyeler okur ve yazar)
drop policy if exists "projects_select_members" on public.workspace_projects;
create policy "projects_select_members" on public.workspace_projects
    for select using (public.can_access_workspace_project(workspace_id, project_id));

drop policy if exists "projects_insert_members" on public.workspace_projects;
create policy "projects_insert_members" on public.workspace_projects
    for insert with check (public.has_full_workspace_access(workspace_id)
        and (public.member_role(workspace_id) = 'py' or public.can_edit_workspace_project(workspace_id, project_id, data->>'pmPersonId')));

drop policy if exists "projects_update_members" on public.workspace_projects;
create policy "projects_update_members" on public.workspace_projects
    for update using (public.can_edit_workspace_project(workspace_id, project_id, data->>'pmPersonId'))
    with check (public.has_full_workspace_access(workspace_id) or public.can_edit_workspace_project(workspace_id, project_id, data->>'pmPersonId'));

drop policy if exists "projects_delete_members" on public.workspace_projects;
create policy "projects_delete_members" on public.workspace_projects
    for delete using (public.has_full_workspace_access(workspace_id) and public.can_edit_workspace_project(workspace_id, project_id, data->>'pmPersonId'));

-- workspace_private: YÖNETİCİ ROLLERİ (mudur, pyb_sorumlu) OKUYAMAZ/YAZAMAZ.
-- "Üst yönetim, notlar gibi PM ekranlarını görmemeli" kuralının sunucu tarafı.
drop policy if exists "private_select_input_roles" on public.workspace_private;
create policy "private_select_input_roles" on public.workspace_private
    for select using (public.has_full_workspace_access(workspace_id) and public.member_role(workspace_id) in ('py','bolum_sorumlu','pyb_destek'));

drop policy if exists "private_update_input_roles" on public.workspace_private;
create policy "private_update_input_roles" on public.workspace_private
    for update using (public.has_full_workspace_access(workspace_id) and public.member_role(workspace_id) in ('py','bolum_sorumlu','pyb_destek'));

drop policy if exists "private_insert_input_roles" on public.workspace_private;
create policy "private_insert_input_roles" on public.workspace_private
    for insert with check (public.has_full_workspace_access(workspace_id) and public.member_role(workspace_id) in ('py','bolum_sorumlu','pyb_destek'));

-- workspace_members: üyeler listeyi görür; üye yönetimi pyb_destek ve mudur'da
drop policy if exists "members_select_members" on public.workspace_members;
create policy "members_select_members" on public.workspace_members
    for select using (user_id = auth.uid());

drop policy if exists "members_manage_admins" on public.workspace_members;

drop policy if exists "members_update_admins" on public.workspace_members;

drop policy if exists "members_delete_admins" on public.workspace_members;

-- Yeni Supabase projelerinde public tablolara API erişimi açıkça tanımlanır.
-- Üye ve rol kısıtları yukarıdaki RLS politikalarıyla uygulanır.
grant select, insert, update, delete on public.workspaces, public.workspace_projects to authenticated;
revoke update on public.workspaces, public.workspace_projects from authenticated, anon;
grant update (name, core, version) on public.workspaces to authenticated;
grant update (data, version) on public.workspace_projects to authenticated;
revoke insert, update, delete on public.workspace_members from authenticated, anon;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.workspace_members to service_role;
grant select, insert, update on public.workspace_private to authenticated;
grant select, insert, update, delete on public.app_settings to service_role;

-- İlk aktarım, özel belge dahil, tek işlemde tamamlanır. Çağıranın RLS kuralları geçerlidir.
create or replace function public.create_planasistan_workspace(
    p_id uuid, p_name text, p_core jsonb, p_projects jsonb, p_private jsonb
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
begin
    begin
        insert into public.workspaces (id, name, core, version)
        values (p_id, p_name, p_core, 1);
    exception when unique_violation then
        if exists (select 1 from public.workspaces where id = p_id and created_by = auth.uid()) then
            return p_id;
        end if;
        raise exception 'Çalışma alanı kimliği kullanılıyor.';
    end;

    insert into public.workspace_projects (workspace_id, project_id, data, version)
    select p_id, project.value ->> 'id', project.value, 1
    from jsonb_array_elements(p_projects) as project(value);

    update public.workspace_private set data = p_private, version = 1
    where workspace_id = p_id and version = 0;
    if not found then
        raise exception 'Özel çalışma alanı verisi yazılamadı.';
    end if;
    return p_id;
end;
$$;

-- auth.users listesini açmadan, yalnız üye yönetme yetkisi olanlara e-posta ile ekleme.
create or replace function public.add_planasistan_workspace_member(p_workspace uuid, p_email text, p_role text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
    member_id uuid;
begin
    if not exists (select 1 from public.workspace_members where workspace_id = p_workspace and user_id = auth.uid() and access_admin) then
        raise exception 'Bu çalışma alanına üye ekleme yetkiniz yok.' using errcode = '42501';
    end if;
    if p_role is null or p_role not in ('mudur','pyb_sorumlu','pyb_destek','py','bolum_sorumlu') then
        raise exception 'Geçerli bir çalışma alanı rolü seçin.';
    end if;
    begin
        select id into strict member_id from auth.users
        where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
    exception
        when no_data_found then raise exception 'Bu e-postayla doğrulanmış bir Supabase hesabı bulunamadı.';
        when too_many_rows then raise exception 'Bu e-postayla birden fazla Supabase hesabı bulundu.';
    end;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace, member_id, p_role)
    on conflict (workspace_id, user_id) do nothing;
    return found;
end;
$$;

revoke execute on function public.create_planasistan_workspace(uuid, text, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.add_planasistan_workspace_member(uuid, text, text) from public, anon;
grant execute on function public.create_planasistan_workspace(uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.add_planasistan_workspace_member(uuid, text, text) to authenticated;

create or replace function public.list_planasistan_workspaces()
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
    select w.id, w.name from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
    where m.user_id = auth.uid() order by w.name, w.id
$$;

create or replace function public.list_planasistan_members(p_workspace uuid)
returns table (user_id uuid, email text, role text, person_id text, project_ids text[], access_admin boolean, owner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid() and m.access_admin) then
        raise exception 'Kullanıcı erişimlerini yönetme yetkiniz yok.' using errcode = '42501';
    end if;
    return query select m.user_id, u.email::text, m.role, m.person_id, m.project_ids, m.access_admin, w.created_by = m.user_id
    from public.workspace_members m join auth.users u on u.id = m.user_id join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace order by u.email, m.user_id;
end;
$$;

create or replace function public.save_planasistan_member(
    p_workspace uuid, p_email text, p_role text, p_person_id text, p_project_ids text[], p_access_admin boolean, p_remove boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
    target_id uuid;
    owner_id uuid;
    existing_admin boolean;
    project_ids_normalized text[];
begin
    -- Serialize changes to the same workspace so two admins cannot overwrite a promotion with stale authority.
    select w.created_by into owner_id from public.workspaces w where w.id = p_workspace for update;
    if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid() and m.access_admin) then
        raise exception 'Kullanıcı erişimlerini yönetme yetkiniz yok.' using errcode = '42501';
    end if;
    begin
        select id into strict target_id from auth.users
        where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
    exception
        when no_data_found then raise exception 'Bu e-posta henüz tek kullanımlık kodla doğrulanmamış.';
        when too_many_rows then raise exception 'Bu e-postayla birden fazla Supabase hesabı bulundu.';
    end;
    select m.access_admin into existing_admin from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = target_id;
    if target_id = owner_id and (auth.uid() <> owner_id or p_remove or p_project_ids is not null or not coalesce(p_access_admin, false)) then
        raise exception 'Çalışma alanı sahibinin yönetici erişimi kaldırılmaz veya daraltılmaz.' using errcode = '42501';
    end if;
    if auth.uid() <> owner_id and (coalesce(existing_admin, false) or p_access_admin) then
        raise exception 'Yönetici erişimini yalnız çalışma alanı sahibi değiştirebilir.' using errcode = '42501';
    end if;
    if p_remove then
        delete from public.workspace_members where workspace_id = p_workspace and user_id = target_id;
        return;
    end if;
    if p_role is null or p_role not in ('mudur','pyb_sorumlu','pyb_destek','py','bolum_sorumlu') then
        raise exception 'Geçerli bir çalışma alanı rolü seçin.';
    end if;
    if p_person_id is not null and not exists (
        select 1 from public.workspaces w, lateral jsonb_array_elements(coalesce(w.core->'people', '[]')) person
        where w.id = p_workspace and person->>'id' = p_person_id
    ) then raise exception 'Seçilen personel çalışma alanında bulunamadı.'; end if;
    if p_project_ids is not null then
        if p_access_admin then raise exception 'Erişim yöneticisi tüm proje kapsamına sahip olmalıdır.'; end if;
        if exists (select 1 from unnest(p_project_ids) wanted(id) where not exists (
            select 1 from public.workspace_projects p where p.workspace_id = p_workspace and p.project_id = wanted.id
        )) then raise exception 'Seçilen projelerden biri çalışma alanında bulunamadı.'; end if;
        select coalesce(array_agg(distinct id order by id), '{}') into project_ids_normalized from unnest(p_project_ids) ids(id);
    end if;
    insert into public.workspace_members (workspace_id, user_id, role, person_id, project_ids, access_admin)
    values (p_workspace, target_id, p_role, p_person_id, project_ids_normalized, coalesce(p_access_admin, false))
    on conflict (workspace_id, user_id) do update set role = excluded.role, person_id = excluded.person_id,
        project_ids = excluded.project_ids, access_admin = excluded.access_admin;
end;
$$;

-- A scoped member receives an explicit projection of the shared document. Raw core and private tables remain closed.
create or replace function public.read_planasistan_workspace(p_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    member public.workspace_members%rowtype;
    stored public.workspaces%rowtype;
    private_row public.workspace_private%rowtype;
    project_rows jsonb;
    workspace_core jsonb;
begin
    select * into member from public.workspace_members where workspace_id = p_workspace and user_id = auth.uid();
    if not found then return null; end if;
    select * into stored from public.workspaces where id = p_workspace;
    select coalesce(jsonb_agg(jsonb_build_object('project_id', p.project_id, 'data', p.data, 'version', p.version) order by p.project_id), '[]')
    into project_rows from public.workspace_projects p where p.workspace_id = p_workspace
        and (member.project_ids is null or p.project_id = any(member.project_ids));
    if member.role in ('py','bolum_sorumlu','pyb_destek') then
        select * into private_row from public.workspace_private where workspace_id = p_workspace;
    end if;
    workspace_core := stored.core;
    if member.project_ids is not null then
        workspace_core := jsonb_build_object(
            'schemaVersion', stored.core->'schemaVersion',
            'projectOrder', to_jsonb(member.project_ids),
            'rolePermissions', stored.core->'rolePermissions', 'rolePermissionsRev', stored.core->'rolePermissionsRev',
            'viewConfig', stored.core->'viewConfig', 'projectSchemes', coalesce(stored.core->'projectSchemes', '[]'),
            'projectRoles', stored.core->'projectRoles',
            'people', (select coalesce(jsonb_agg(value), '[]') from jsonb_array_elements(coalesce(stored.core->'people','[]'))
                where value->>'id' = member.person_id),
            'allocations', (select coalesce(jsonb_agg(value), '[]') from jsonb_array_elements(coalesce(stored.core->'allocations','[]'))
                where value->>'projectId' = any(member.project_ids) and value->>'personId' = member.person_id),
            'planLocks', (select coalesce(jsonb_agg(value), '[]') from jsonb_array_elements(coalesce(stored.core->'planLocks','[]'))
                where value->>'projectId' = any(member.project_ids))
        );
        if private_row.data is not null then
            private_row.data := jsonb_build_object(
                'notes', (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(coalesce(private_row.data->'notes', '{}')) where key = any(member.project_ids)),
                'customerRequests', (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(coalesce(private_row.data->'customerRequests', '{}')) where key = any(member.project_ids))
            );
        end if;
    end if;
    return jsonb_build_object('core', workspace_core, 'version', stored.version, 'projects', project_rows,
        'private', private_row.data, 'privateVersion', private_row.version,
        'membership', jsonb_build_object('role', member.role, 'personId', member.person_id,
            'projectIds', member.project_ids, 'accessAdmin', member.access_admin));
end;
$$;

create or replace function public.save_planasistan_project_private(p_workspace uuid, p_version bigint, p_private jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
    allowed_projects text[];
    updated_version bigint;
begin
    perform 1 from public.workspaces where id = p_workspace for share;
    select array_agg(p.project_id) into allowed_projects from public.workspace_projects p
    join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = auth.uid()
    where p.workspace_id = p_workspace and m.role = 'py' and m.person_id = p.data->>'pmPersonId'
        and p.project_id = any(m.project_ids);
    if allowed_projects is null then raise exception 'Özel proje verilerini düzenleme yetkiniz yok.' using errcode = '42501'; end if;
    update public.workspace_private set version = version + 1, data = jsonb_build_object(
        'notes', (coalesce(data->'notes', '{}') - allowed_projects) ||
            (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(coalesce(p_private->'notes', '{}')) where key = any(allowed_projects)),
        'customerRequests', (coalesce(data->'customerRequests', '{}') - allowed_projects) ||
            (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(coalesce(p_private->'customerRequests', '{}')) where key = any(allowed_projects))
    ) where workspace_id = p_workspace and version = p_version returning version into updated_version;
    return updated_version;
end;
$$;

revoke execute on function public.list_planasistan_workspaces(), public.list_planasistan_members(uuid),
    public.save_planasistan_member(uuid,text,text,text,text[],boolean,boolean), public.read_planasistan_workspace(uuid),
    public.save_planasistan_project_private(uuid,bigint,jsonb) from public, anon;
grant execute on function public.list_planasistan_workspaces(), public.list_planasistan_members(uuid),
    public.save_planasistan_member(uuid,text,text,text,text[],boolean,boolean), public.read_planasistan_workspace(uuid),
    public.save_planasistan_project_private(uuid,bigint,jsonb) to authenticated;

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

drop trigger if exists projects_touch on public.workspace_projects;
create trigger projects_touch before update on public.workspace_projects
    for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Asistan hafızası (hafiza.md): kullanıcıya ÖZEL. Satırı yalnız sahibi okur ve
-- yazar; yönetici rolleri dahil başka hiçbir kullanıcı göremez. Yazmak için
-- çalışma alanı üyeliği gerekir. Bir kullanıcı uygulamada birden çok kimlikle
-- (rol + kişi) çalışabildiği için her kimliğin hafızası ayrı satırdır.
-- İstemci üç yönlü birleştirme yapar; version iyimser kilit içindir.
-- ---------------------------------------------------------------------------
create table if not exists public.assistant_memory (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    identity_key text not null,
    content text not null default '',
    version bigint not null default 1,
    updated_at timestamptz not null default now(),
    primary key (user_id, workspace_id, identity_key),
    constraint assistant_memory_size check (char_length(content) <= 60000),
    constraint assistant_memory_key check (char_length(identity_key) between 1 and 200)
);

alter table public.assistant_memory enable row level security;

drop policy if exists "memory_select_own" on public.assistant_memory;
create policy "memory_select_own" on public.assistant_memory
    for select using (user_id = auth.uid());

drop policy if exists "memory_insert_own" on public.assistant_memory;
create policy "memory_insert_own" on public.assistant_memory
    for insert with check (user_id = auth.uid() and public.member_role(workspace_id) is not null);

drop policy if exists "memory_update_own" on public.assistant_memory;
create policy "memory_update_own" on public.assistant_memory
    for update using (user_id = auth.uid())
    with check (user_id = auth.uid() and public.member_role(workspace_id) is not null);

drop policy if exists "memory_delete_own" on public.assistant_memory;
create policy "memory_delete_own" on public.assistant_memory
    for delete using (user_id = auth.uid());

revoke all on public.assistant_memory from anon;
grant select, insert, delete on public.assistant_memory to authenticated;
revoke update on public.assistant_memory from authenticated;
grant update (content, version) on public.assistant_memory to authenticated;

drop trigger if exists assistant_memory_touch on public.assistant_memory;
create trigger assistant_memory_touch before update on public.assistant_memory
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Whiteboard (FigJam tarzı proje panoları): eş zamanlı düzenleme ve pano erişimi.
-- Her öğe ayrı satır: pano bilgisi (item_id 'meta'), nesne ('n:<id>'),
-- bağlantı ('e:<id>'), oy ('v:<nesne>:<kişi>'). Sürüm (rev_t, rev_by) istemcinin
-- karma mantıksal saatidir; tetikleyici yalnız daha yeni sürümü yazar (son
-- yazan kazanır). Silme, deleted = true ile mezar taşıdır (geç gelen yazım
-- silinen öğeyi diriltmesin). Panolar proje satırına yazılmaz: aynı panoda
-- çalışan kişiler proje sürüm çakışması yaşamaz.
--
-- Erişim (pano bilgisindeki ownerId ve access):
--   yönetir   : projenin PY'si (proje satırını düzenleyebilen) ve panonun sahibi
--   düzenler / görüntüler / göremez: kişi bazında istisna, yoksa "herkes" düzeyi
--   erişimi tanımlanmamış eski pano: herkes görüntüler
-- Pano açmak: projeye erişen ve üyeliğinde kişi (person_id) tanımlı olan herkes;
-- açan, panonun sahibi olur. Erişimi, sahibi değiştirmek ve panoyu silmek
-- yalnız yöneticiye açıktır.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_whiteboard_items (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    project_id text not null,
    board_id text not null,
    item_id text not null,
    kind text not null check (kind in ('meta', 'node', 'edge', 'vote')),
    data jsonb,
    deleted boolean not null default false,
    rev_t bigint not null,
    rev_by text not null,
    updated_at timestamptz not null default now(),
    updated_by uuid default auth.uid(),
    primary key (workspace_id, board_id, item_id),
    constraint wb_item_ids check (char_length(board_id) between 1 and 100 and char_length(item_id) between 1 and 250 and char_length(rev_by) between 1 and 100),
    -- Görsel nesneleri küçültülmüş data URL taşır; tek öğe en çok ~1,5 MB
    constraint wb_item_size check (pg_column_size(data) <= 1500000)
);
create index if not exists workspace_whiteboard_items_project on public.workspace_whiteboard_items (workspace_id, project_id);

create or replace function public.can_edit_workspace_whiteboard(ws uuid, project text)
returns boolean language sql stable security definer set search_path = '' as $$
    select public.can_edit_workspace_project(ws, project,
        (select p.data->>'pmPersonId' from public.workspace_projects p where p.workspace_id = ws and p.project_id = project))
$$;

-- Kullanıcının panodaki düzeyi: 'manage' | 'edit' | 'view' | 'none' | 'gone' (silinmiş pano)
create or replace function public.whiteboard_access_level(ws uuid, project text, board text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
    person text;
    meta jsonb;
    meta_deleted boolean;
    lvl text;
begin
    if not public.can_access_workspace_project(ws, project) then
        return 'none';
    end if;
    if public.can_edit_workspace_whiteboard(ws, project) then
        return 'manage';
    end if;
    select m.person_id into person from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid();
    select i.data, i.deleted into meta, meta_deleted from public.workspace_whiteboard_items i
        where i.workspace_id = ws and i.project_id = project and i.board_id = board and i.item_id = 'meta';
    if meta_deleted is null then
        return 'none';             -- pano yok (henüz açılmamış)
    end if;
    if meta_deleted or meta is null then
        return 'gone';             -- silinmiş pano: yalnız mezar taşı görünür (listeden düşsün)
    end if;
    if person is not null and meta->>'ownerId' = person then
        return 'manage';
    end if;
    lvl := coalesce(case when person is not null then meta->'access'->'people'->>person end, meta->'access'->>'everyone', 'view');
    return case lvl when 'edit' then 'edit' when 'view' then 'view' else 'none' end;
end;
$$;

-- Yeni pano açma: pano bilgisi satırı henüz yok ve sahibi açan kişi (ya da PY)
create or replace function public.can_open_whiteboard(ws uuid, project text, board text, data jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
    person text;
begin
    if not public.can_access_workspace_project(ws, project) then
        return false;
    end if;
    if exists (select 1 from public.workspace_whiteboard_items i where i.workspace_id = ws and i.board_id = board and i.item_id = 'meta') then
        return false;
    end if;
    if public.can_edit_workspace_whiteboard(ws, project) then
        return true;
    end if;
    select m.person_id into person from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid();
    return person is not null and data->>'ownerId' = person;
end;
$$;

-- Son yazan kazanır; kimlik alanları sabit; erişim, sahip ve silme yalnız yöneticide
create or replace function public.whiteboard_item_lww()
returns trigger language plpgsql as $$
begin
    if (new.rev_t, new.rev_by collate "C") <= (old.rev_t, old.rev_by collate "C") then
        return null;
    end if;
    if old.item_id = 'meta' and (
        new.deleted is distinct from old.deleted
        or (new.data->'access') is distinct from (old.data->'access')
        or (new.data->>'ownerId') is distinct from (old.data->>'ownerId')
    ) and public.whiteboard_access_level(old.workspace_id, old.project_id, old.board_id) <> 'manage' then
        raise exception 'Pano erişimini, sahibini değiştirmek ve panoyu silmek için sahibi ya da projenin PY''si olmalısınız.' using errcode = '42501';
    end if;
    new.workspace_id = old.workspace_id;
    new.project_id = old.project_id;
    new.board_id = old.board_id;
    new.item_id = old.item_id;
    new.updated_at = now();
    new.updated_by = auth.uid();
    return new;
end;
$$;

drop trigger if exists whiteboard_item_lww on public.workspace_whiteboard_items;
create trigger whiteboard_item_lww before update on public.workspace_whiteboard_items
    for each row execute function public.whiteboard_item_lww();

alter table public.workspace_whiteboard_items enable row level security;

drop policy if exists "wb_items_select" on public.workspace_whiteboard_items;
-- Okuma: panoyu görebilenler. Upsert (INSERT … ON CONFLICT) eklenen satırı okuma
-- politikasına da sokar: yeni panonun ilk bilgi satırı açılış kuralıyla geçer.
create policy "wb_items_select" on public.workspace_whiteboard_items
    for select using (public.whiteboard_access_level(workspace_id, project_id, board_id) in ('manage', 'edit', 'view')
        or (item_id = 'meta' and public.whiteboard_access_level(workspace_id, project_id, board_id) = 'gone')
        or (item_id = 'meta' and public.can_open_whiteboard(workspace_id, project_id, board_id, data)));

drop policy if exists "wb_items_insert" on public.workspace_whiteboard_items;
create policy "wb_items_insert" on public.workspace_whiteboard_items
    for insert with check (
        public.whiteboard_access_level(workspace_id, project_id, board_id) in ('manage', 'edit')
        or (item_id = 'meta' and kind = 'meta' and public.can_open_whiteboard(workspace_id, project_id, board_id, data)));

drop policy if exists "wb_items_update" on public.workspace_whiteboard_items;
create policy "wb_items_update" on public.workspace_whiteboard_items
    for update using (public.whiteboard_access_level(workspace_id, project_id, board_id) in ('manage', 'edit'))
    with check (public.whiteboard_access_level(workspace_id, project_id, board_id) in ('manage', 'edit'));

revoke all on public.workspace_whiteboard_items from anon;
grant select, insert, update on public.workspace_whiteboard_items to authenticated;

-- Canlı kanallar (Supabase Realtime, özel kanal):
--   'wb:<çalışma alanı>:<proje>'          projede kim var ve pano listesi değişti bildirimi (içerik yok)
--   'wbb:<çalışma alanı>:<proje>:<pano>'  panonun içeriği, imleçler, seçim; yalnız panoyu görebilenler
-- Kalıcı yazım yukarıdaki tablodan (düzenleme yetkisiyle) geçer.
create or replace function public.can_join_whiteboard_topic(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
    parts text[] := string_to_array(topic, ':');
begin
    if coalesce(array_length(parts, 1), 0) < 3 or parts[2] !~* '^[0-9a-f-]{36}$' or parts[3] = '' then
        return false;
    end if;
    if parts[1] = 'wb' and array_length(parts, 1) = 3 then
        return public.can_access_workspace_project(parts[2]::uuid, parts[3]);
    end if;
    if parts[1] = 'wbb' and array_length(parts, 1) = 4 and parts[4] <> '' then
        return public.whiteboard_access_level(parts[2]::uuid, parts[3], parts[4]) in ('manage', 'edit', 'view');
    end if;
    return false;
end;
$$;

do $$
begin
    if to_regclass('realtime.messages') is not null then
        execute 'drop policy if exists "wb_realtime_read" on realtime.messages';
        execute 'create policy "wb_realtime_read" on realtime.messages for select to authenticated using (public.can_join_whiteboard_topic(realtime.topic()))';
        execute 'drop policy if exists "wb_realtime_write" on realtime.messages';
        execute 'create policy "wb_realtime_write" on realtime.messages for insert to authenticated with check (public.can_join_whiteboard_topic(realtime.topic()))';
    end if;
end $$;
