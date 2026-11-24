import React, { useEffect, useState } from 'react';
import type { CloudMembership, WorkspaceData } from '../types';
import { ROLE_LABELS } from '../utils/allocations';
import { type CloudMember, listCloudMembers, saveCloudMember } from '../utils/cloudSync';

const ROLES = ['py', 'bolum_sorumlu', 'pyb_destek', 'pyb_sorumlu', 'mudur'] as const;
const input = 'mt-1 w-full min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm';
const button = 'rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-semibold disabled:opacity-40';
const initial: CloudMembership = { role: 'py', personId: null, projectIds: [], accessAdmin: false };

interface Props {
  workspaceId: string;
  userId: string;
  workspace: WorkspaceData;
  onOwnAccessChanged: () => Promise<void>;
}

const CloudAccessManager: React.FC<Props> = ({ workspaceId, userId, workspace, onOwnAccessChanged }) => {
  const [members, setMembers] = useState<CloudMember[]>([]);
  const [email, setEmail] = useState('');
  const [selection, setSelection] = useState<CloudMember | null>(null);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(true);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();

  const reload = async () => {
    const result = await listCloudMembers(workspaceId);
    if ('error' in result) { setFeedback({ error: true, text: result.error }); return false; }
    setMembers(result.members);
    return true;
  };

  useEffect(() => {
    void reload().catch(() => setFeedback({ error: true, text: 'Üyeler yüklenemedi.' })).finally(() => setBusy(false));
  }, [workspaceId]);

  const isOwner = members.some(member => member.id === userId && member.owner);
  const locked = !!selection?.accessAdmin && !isOwner;

  const select = (member: CloudMember | null) => {
    setSelection(member);
    setEmail(member?.email ?? '');
    setDraft(member ?? initial);
    setFeedback(undefined);
  };

  const save = async (remove = false) => {
    if (!email.trim() || locked) return;
    if (remove && !window.confirm(`${email} hesabının bu çalışma alanına erişimi kaldırılsın mı?`)) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      const error = await saveCloudMember(workspaceId, email.trim(), draft, remove);
      if (error) { setFeedback({ error: true, text: error }); return; }
      if (remove) select(null);
      if (await reload()) setFeedback({ error: false, text: remove ? 'Çalışma alanı erişimi kaldırıldı.' : 'Kullanıcı erişimi kaydedildi.' });
      if (selection?.id === userId) await onOwnAccessChanged();
    } catch {
      setFeedback({ error: true, text: 'Erişim işlemi tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const changeProjects = (id: string, checked: boolean) => setDraft(current => ({
    ...current, projectIds: checked ? [...(current.projectIds ?? []), id] : (current.projectIds ?? []).filter(x => x !== id),
  }));

  return (
    <div className="mt-3 space-y-3 text-sm text-gray-800 dark:text-gray-100">
      <label className="block font-medium">Kullanıcı
        <select aria-label="Kullanıcı" className={input} value={selection?.id ?? ''} disabled={busy} onChange={e => select(members.find(member => member.id === e.target.value) ?? null)}>
          <option value="">Yeni kullanıcı ekle</option>
          {members.map(member => <option key={member.id} value={member.id}>{member.email} · {ROLE_LABELS[member.role]}{member.owner ? ' (sahip)' : ''}</option>)}
        </select>
      </label>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset disabled={busy || locked} className="space-y-3">
          {!selection && <label className="block font-medium">Doğrulanmış e-posta
            <input className={input} type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="font-medium">Rol
              <select aria-label="Rol" className={input} value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value as CloudMembership['role'] })}>
                {ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <label className="font-medium">Personel kaydı
              <select aria-label="Personel kaydı" className={input} value={draft.personId ?? ''} onChange={e => setDraft({ ...draft, personId: e.target.value || null })}>
                <option value="">Bağlantı yok</option>
                {workspace.people.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.departmentCode}</option>)}
              </select>
            </label>
          </div>
          <label className="block font-medium">Proje kapsamı
            <select aria-label="Proje kapsamı" className={input} value={draft.projectIds === null ? 'all' : 'selected'} disabled={draft.accessAdmin}
              onChange={e => setDraft({ ...draft, projectIds: e.target.value === 'all' ? null : [] })}>
              <option value="selected">Yalnız seçilen projeler</option>
              <option value="all">Tüm projeler</option>
            </select>
          </label>
          {draft.projectIds !== null && (
            <fieldset className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2">
              <legend className="px-1">Görüntülenebilecek projeler</legend>
              {workspace.projects.map(project => (
                <label key={project.id} className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={draft.projectIds?.includes(project.id)} onChange={e => changeProjects(project.id, e.target.checked)} />
                  <span>{project.name}</span>
                </label>
              ))}
              {workspace.projects.length === 0 && <p>Henüz proje yok.</p>}
            </fieldset>
          )}
          {isOwner && !selection?.owner && <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.accessAdmin} onChange={e => setDraft({ ...draft, accessAdmin: e.target.checked, projectIds: e.target.checked ? null : [] })} />
            Kullanıcı erişimlerini yönetebilir
          </label>}
          <div className="flex flex-wrap gap-2">
            <button disabled={!email.trim()} className={`${button} bg-[var(--app-primary)] text-white`}>Erişimi kaydet</button>
            {selection && !selection.owner && <button type="button" className={`${button} text-red-700 dark:text-red-300`} onClick={() => void save(true)}>Erişimi kaldır</button>}
          </div>
        </fieldset>
      </form>
      {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      {locked && <p>Yönetici erişimini çalışma alanı sahibi düzenler.</p>}
      {!selection && <p className="text-xs text-gray-600 dark:text-gray-300">Kullanıcı önce e-postasına gelen kodla giriş yapmalı. Proje seçilmezse çalışma alanında proje göremez.</p>}
    </div>
  );
};

export default CloudAccessManager;
