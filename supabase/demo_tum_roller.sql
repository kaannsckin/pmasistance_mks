-- ===========================================================================
-- Demo / eğitim hesabı: 1907.sckin@gmail.com tüm rollerde çalışabilsin.
--
-- Önce schema.sql çalıştırılmış olmalı (workspace_members.all_roles sütunu).
-- Hesap Supabase'de en az bir kez e-posta koduyla giriş yapmış olmalı
-- (auth.users satırı oluşur).
--
-- Sonuç: hesap bu Supabase projesindeki her çalışma alanında üyedir; uygulamada
-- "Profil değiştir" ile tüm rollere (Müdür, PYB Sorumlusu, PYB Destek, PY,
-- Bölüm Sorumlusu) ve kişilere geçebilir. Sunucu tarafında erişim yöneticisi
-- (tüm projeler) yetkisindedir. Dosya tekrar çalıştırılabilir.
-- Geri almak için en alttaki bloğu kullanın.
-- ===========================================================================

do $$
declare
    demo_user uuid;
begin
    select id into demo_user from auth.users where lower(email) = lower('1907.sckin@gmail.com');
    if demo_user is null then
        raise exception '1907.sckin@gmail.com Supabase''de bulunamadı: önce uygulamada bu e-postayla kodla giriş yapın.';
    end if;

    -- Henüz üye olmadığı çalışma alanlarına eklenir (yalnız bir çalışma alanı için
    -- aşağıdaki select'e "where w.id = '<çalışma alanı kimliği>'" ekleyin)
    insert into public.workspace_members (workspace_id, user_id, role, access_admin, all_roles, project_ids)
    select w.id, demo_user, 'pyb_destek', true, true, null
    from public.workspaces w
    on conflict (workspace_id, user_id) do nothing;

    -- Var olan üyelikler: tüm roller, tüm projeler, erişim yöneticisi
    update public.workspace_members
    set all_roles = true, access_admin = true, project_ids = null
    where user_id = demo_user;
end $$;

-- Kontrol
select w.name as calisma_alani, m.role, m.all_roles, m.access_admin, m.project_ids
from public.workspace_members m
join public.workspaces w on w.id = m.workspace_id
join auth.users u on u.id = m.user_id
where lower(u.email) = lower('1907.sckin@gmail.com');

-- Geri almak (demo yetkisini kaldırmak; üyelik ve erişim yöneticiliği kalır):
-- update public.workspace_members m set all_roles = false
-- from auth.users u where u.id = m.user_id and lower(u.email) = lower('1907.sckin@gmail.com');
