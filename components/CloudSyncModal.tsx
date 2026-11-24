import React, { useEffect, useRef, useState } from 'react';
import type { WorkspaceData } from '../types';
import { ROLE_LABELS } from '../utils/allocations';
import { normalizeCloudConnection } from '../utils/cloudConnection';
import {
  applyCloudMembership, checkCloudConnection, clearConflictFlag, CloudWorkspaceOption,
  createCloudWorkspace, CLOUD_SCHEMA_MESSAGE, getCloudUser, getDeploymentCloudConnection,
  hasPendingConflict, listCloudWorkspaces, loadCloudConfig, pullWorkspace, pushWorkspace, saveCloudConfig,
  requestCloudCode,
  signInCloudWithPassword, signOut, verifyCloudCode,
} from '../utils/cloudSync';
import schema from '../supabase/schema.sql?raw';
import CloudAccessManager from './CloudAccessManager';

interface CloudSyncModalProps {
  workspace: WorkspaceData;
  onReplaceWorkspace: (updater: (local: WorkspaceData) => WorkspaceData) => void;
  onDisconnect: () => void;
  onBackup?: () => void;
  initialProblem?: string;
  onClose: () => void;
}

const inputCls = 'w-full min-w-0 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary';
const primary = 'text-white text-sm font-semibold px-4 py-2.5 rounded-lg bg-[var(--app-primary)] hover:opacity-90 disabled:opacity-40';
const secondary = 'text-sm font-semibold px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:text-primary disabled:opacity-40';
const panel = 'space-y-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-4';
const label = 'block text-sm font-medium text-gray-700 dark:text-gray-200';
const help = 'text-xs leading-relaxed text-gray-600 dark:text-gray-300';
const summary = 'cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-200';

const downloadSchema = () => {
  const url = URL.createObjectURL(new Blob([schema], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'planasistan-schema.sql';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ workspace, onReplaceWorkspace, onDisconnect, onBackup, initialProblem, onClose }) => {
  const [config, setConfig] = useState(loadCloudConfig);
  const [url, setUrl] = useState(config?.url ?? '');
  const [key, setKey] = useState(config?.anonKey ?? '');
  const [user, setUser] = useState<Awaited<ReturnType<typeof getCloudUser>>>(null);
  const [options, setOptions] = useState<CloudWorkspaceOption[]>([]);
  const [selected, setSelected] = useState('');
  const [manualId, setManualId] = useState('');
  const [name, setName] = useState('PlanAsistan Çalışma Alanı');
  const [email, setEmail] = useState('');
  const [codeEmail, setCodeEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [canResendAfter, setCanResendAfter] = useState(0);
  const [untilResend, setUntilResend] = useState(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(initialProblem ? { kind: 'err', text: initialProblem } : null);
  const [conflict, setConflict] = useState(hasPendingConflict);
  const [needsSchema, setNeedsSchema] = useState(false);
  const attempt = useRef<{ id: string; name: string; workspace: WorkspaceData } | undefined>(undefined);

  const note = (kind: 'ok' | 'err', text: string) => {
    if (text.includes(CLOUD_SCHEMA_MESSAGE)) setNeedsSchema(true);
    setMessage({ kind, text });
  };

  const refreshWorkspaces = async (signedIn: NonNullable<typeof user>, signal?: AbortSignal) => {
    const current = loadCloudConfig();
    const linked = current?.workspaceId && (!current.linkedUserId || current.linkedUserId === signedIn.id) ? current.workspaceId : '';
    const result = await listCloudWorkspaces();
    if (signal?.aborted) return;
    if ('error' in result) {
      if (result.needsSchema) setNeedsSchema(true);
      note('err', result.error);
      return;
    }
    setOptions(result.workspaces);
    setSelected(id => result.workspaces.some(ws => ws.id === id) ? id : !linked && result.workspaces.length === 1 ? result.workspaces[0].id : '');
  };

  useEffect(() => {
    if (!canResendAfter) return;
    const tick = () => setUntilResend(Math.max(0, Math.ceil((canResendAfter - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [canResendAfter]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        if (!loadCloudConfig()) {
          const defaults = await getDeploymentCloudConnection(AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]));
          if (controller.signal.aborted) return;
          if (defaults && !loadCloudConfig()) {
            const configured = { ...defaults, autoSync: true };
            saveCloudConfig(configured);
            setConfig(configured);
            setUrl(defaults.url);
            setKey(defaults.anonKey);
          }
        }
        const signedIn = await getCloudUser();
        if (controller.signal.aborted) return;
        setUser(signedIn);
        if (signedIn) await refreshWorkspaces(signedIn, controller.signal);
      } catch {
        if (!controller.signal.aborted) note('err', 'Bulut oturumu kontrol edilemedi. Bağlantıyı kontrol edip tekrar deneyin.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch {
      note('err', 'İşlem tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const connectDatabase = async () => {
    const connection = normalizeCloudConnection(url, key);
    if (!connection) {
      note('err', 'Supabase proje adresini ve Publishable veya anon public anahtarını girin.');
      return;
    }
    let valid = false;
    try {
      valid = await checkCloudConnection(connection, AbortSignal.timeout(8000));
    } catch { /* Hata aşağıda aynı bağlantı alanında gösterilir. */ }
    if (!valid) {
      note('err', 'Supabase bağlantısı doğrulanamadı. Proje adresini ve herkese açık anahtarı kontrol edin.');
      return;
    }
    const current = loadCloudConfig();
    const next = current?.url === connection.url && current.anonKey === connection.anonKey
      ? current : { ...connection, autoSync: current?.autoSync ?? true };
    saveCloudConfig(next);
    setConfig(next);
    setNeedsSchema(false);
    const signedIn = await getCloudUser();
    setUser(signedIn);
    if (signedIn) await refreshWorkspaces(signedIn);
    else note('ok', 'Veritabanı bağlantısı doğrulandı. E-posta adresinizle devam edin.');
  };

  const sendCode = async () => {
    const address = codeEmail || email.trim();
    if (!address || (codeEmail && Date.now() < canResendAfter)) return;
    const error = await requestCloudCode(address);
    if (error) { note('err', error); return; }
    setCodeEmail(address);
    setCode('');
    setUntilResend(60);
    setCanResendAfter(Date.now() + 60_000);
    note('ok', 'Tek kullanımlık kod e-posta adresinize gönderildi.');
  };

  const passwordSignIn = async () => {
    const address = email.trim();
    if (!address || !password) return;
    const error = await signInCloudWithPassword(address, password);
    if (error) { note('err', error); return; }
    const signedIn = await getCloudUser();
    if (!signedIn) { note('err', 'Oturum doğrulanamadı. Tekrar deneyin.'); return; }
    setUser(signedIn);
    setPassword('');
    await refreshWorkspaces(signedIn);
  };

  const authenticate = async () => {
    if (!/^\d{6,10}$/.test(code)) return;
    const error = await verifyCloudCode(codeEmail, code);
    if (error) { note('err', error); return; }
    const signedIn = await getCloudUser();
    if (!signedIn) { note('err', 'Oturum doğrulanamadı. Yeni kod isteyip tekrar deneyin.'); return; }
    setUser(signedIn);
    setCodeEmail('');
    setCode('');
    await refreshWorkspaces(signedIn);
  };

  const migrate = async () => {
    const cleanName = name.trim();
    if (!cleanName || !user) return;
    if (attempt.current?.name !== cleanName || attempt.current.workspace !== workspace) {
      attempt.current = { id: crypto.randomUUID(), name: cleanName, workspace };
    }
    const result = await createCloudWorkspace(attempt.current.id, cleanName, workspace);
    if ('error' in result) { note('err', result.error); return; }
    const next = loadCloudConfig();
    setConfig(next);
    const membership = next?.membership;
    if (membership) onReplaceWorkspace(ws => applyCloudMembership(ws, membership, result.id));
    setOptions(items => [...items.filter(item => item.id !== result.id), { id: result.id, name: cleanName }]);
    setConflict(false);
    setNeedsSchema(false);
    note('ok', 'Çalışma alanı veritabanına aktarıldı.');
  };

  const openWorkspace = async (id: string, refresh = false, confirm = true) => {
    const target = id.trim();
    if (!target || !user) return;
    const confirmed = !confirm || window.confirm(refresh
      ? 'Buluttaki güncel veri bu cihazdaki çalışma alanının yerine geçecek. Devam edilsin mi?'
      : 'Seçilen bulut çalışma alanı bu cihazdaki çalışma alanının yerine geçecek. Devam edilsin mi?');
    if (!confirmed) return;
    const result = await pullWorkspace(target);
    if (!result.ok || !result.workspace) { note('err', result.message || 'Çalışma alanı indirilemedi.'); return; }
    onReplaceWorkspace(result.workspace);
    setConfig(loadCloudConfig());
    setSelected('');
    setManualId('');
    clearConflictFlag();
    setConflict(false);
    note('ok', 'Bulut çalışma alanı açıldı.');
    await refreshWorkspaces(user);
  };

  const send = async () => {
    const result = await pushWorkspace(workspace);
    setConfig(loadCloudConfig());
    if (result.ok) {
      clearConflictFlag();
      setConflict(false);
      note('ok', 'Veri veritabanına gönderildi.');
    } else {
      if (result.reason === 'conflict') setConflict(true);
      note('err', result.message || 'Gönderim başarısız.');
    }
  };

  const endSession = async () => {
    const hadWorkspace = !!loadCloudConfig()?.workspaceId || !!workspace.cloudMembership;
    if (hadWorkspace && workspace.cloudMembership) {
      const result = await pushWorkspace(workspace);
      if (!result.ok && !window.confirm('Son yerel değişiklikler eşitlenemedi. Bu oturum kapatılsın mı?')) {
        note('err', result.message || 'Eşitleme tamamlanamadı. Oturum açık kaldı.');
        return;
      }
    }
    const error = await signOut();
    if (error) { note('err', error); return; }
    setConfig(loadCloudConfig());
    setUser(null);
    if (hadWorkspace) onDisconnect();
    setOptions([]);
    setSelected('');
    clearConflictFlag();
    setConflict(false);
    note('ok', 'Oturum kapatıldı. Yeniden giriş yaptığınızda çalışma alanınızı listeden açabilirsiniz.');
  };

  const linkedId = user && (!config?.linkedUserId || config.linkedUserId === user.id) ? config?.workspaceId : undefined;
  const membership = linkedId ? workspace.cloudMembership : undefined;
  const currentName = options.find(option => option.id === linkedId)?.name;
  const available = options.filter(option => option.id !== linkedId);
  const supabaseRef = config?.url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1];
  const sqlEditor = supabaseRef ? `https://supabase.com/dashboard/project/${supabaseRef}/sql/new` : 'https://supabase.com/dashboard';
  const handleClose = () => { if (!busy) onClose(); };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4" onClick={handleClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cloud-title" onKeyDown={e => { if (e.key === 'Escape') handleClose(); }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <h3 id="cloud-title" className="text-lg font-semibold text-gray-900 dark:text-white">Bulut veritabanı</h3>
          <button type="button" disabled={busy} aria-label="Kapat" onClick={handleClose} className="w-9 h-9 rounded-lg text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
            <i aria-hidden="true" className="fa-solid fa-times"></i>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {busy && <p role="status" className={help}>İşlem sürüyor…</p>}
          {message && (
            <div role={message.kind === 'err' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}>
              {message.text}
            </div>
          )}
          {conflict && (
            <p className="rounded-xl px-4 py-3 text-sm bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              Bulutta daha yeni veri var. Yerel değişikliklerinizi yedekleyip güncel veriyi çekebilirsiniz.
            </p>
          )}

          {config && !user && (
            <form className={panel} onSubmit={e => { e.preventDefault(); void run(codeEmail ? authenticate : password ? passwordSignIn : sendCode); }}>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">E-posta koduyla giriş</h4>
              {codeEmail ? <>
                <p className={help}>{codeEmail} adresine gelen kodu girin.</p>
                <label className={label}>Tek kullanımlık kod<input className={inputCls} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" required maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
              </> : <>
                <label className={label}>E-posta<input className={inputCls} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
                <label className={label}>Parola (isteğe bağlı)<input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
                <p className={help}>Supabase panelinde parolası tanımlı hesaplar parolayla kod beklemeden girer. Parola boşsa e-postanıza kod gönderilir.</p>
              </>}
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={busy || (!!codeEmail && code.length < 6)} className={primary}>{codeEmail ? 'Kodu doğrula' : password ? 'Parolayla giriş yap' : 'Kod gönder'}</button>
                {codeEmail && <>
                  <button type="button" disabled={busy || untilResend > 0} onClick={() => void run(sendCode)} className={secondary}>{untilResend ? 'Yeniden gönder (' + untilResend + ' sn)' : 'Kodu yeniden gönder'}</button>
                  <button type="button" disabled={busy} className={secondary} onClick={() => { setCodeEmail(''); setCode(''); setMessage(null); }}>E-postayı değiştir</button>
                </>}
              </div>
            </form>
          )}

          {user && (
            <section className={panel} aria-label="Bulut oturumu">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className={`${label} break-all`}>{user.email}</p>
                  {membership && <p className={help}>{ROLE_LABELS[membership.role]}{membership.accessAdmin ? ' · Erişim yöneticisi' : ''}</p>}
                </div>
                <button type="button" disabled={busy} className={secondary} onClick={() => void run(endSession)}>Çıkış yap</button>
              </div>
            </section>
          )}

          {needsSchema && user && (
            <section className={panel}>
              <h4 className={label}>PlanAsistan şemasını kurun</h4>
              <p className={help}>Kurulum SQL’ini Supabase SQL Editor’da bir kez çalıştırın. Aynı SQL mevcut şemayı da günceller.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={primary} onClick={async () => {
                  try { await navigator.clipboard.writeText(schema); note('ok', 'Kurulum SQL’i kopyalandı.'); }
                  catch { downloadSchema(); }
                }}>SQL’i kopyala</button>
                <button type="button" className={secondary} onClick={downloadSchema}>SQL’i indir</button>
                <a className={secondary} href={sqlEditor} target="_blank" rel="noreferrer">SQL Editor’ı aç</a>
              </div>
            </section>
          )}

          {linkedId && (
            <section className={panel} aria-label="Bağlı çalışma alanı">
              <h4 className={label}>{currentName ?? 'Bağlı çalışma alanı'}</h4>
              <label className={`${label} flex items-center gap-2`}>
                <input type="checkbox" checked={config?.autoSync !== false} disabled={busy} onChange={e => {
                  const latest = loadCloudConfig();
                  if (!latest) return;
                  const next = { ...latest, autoSync: e.target.checked };
                  saveCloudConfig(next);
                  setConfig(next);
                }} /> Otomatik eşitleme
              </label>
              {config?.lastSyncAt && <p className={help}>Son eşitleme {new Date(config.lastSyncAt).toLocaleString('tr-TR')}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy} onClick={() => void run(send)}>Şimdi gönder</button>
                <button type="button" className={secondary} disabled={busy} onClick={() => void run(() => openWorkspace(linkedId, true))}>Buluttan çek</button>
                {onBackup && <button type="button" className={secondary} disabled={busy} onClick={onBackup}>Yerel yedek al</button>}
              </div>
              {membership?.accessAdmin && user && (
                <details>
                  <summary className={summary}>Kullanıcı ve proje erişimleri</summary>
                  <CloudAccessManager key={linkedId} workspaceId={linkedId} userId={user.id} workspace={workspace}
                    onOwnAccessChanged={() => openWorkspace(linkedId, true, false)} />
                </details>
              )}
            </section>
          )}

          {user && (
            <section className={panel} aria-label="Çalışma alanı seçimi">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className={label}>{linkedId ? 'Başka bir çalışma alanı aç' : 'Çalışma alanını aç'}</h4>
                <button type="button" disabled={busy} className={secondary} onClick={() => void run(async () => { setNeedsSchema(false); await refreshWorkspaces(user); })}>Listeyi yenile</button>
              </div>
              {available.length > 0 ? (
                <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void run(() => openWorkspace(selected)); }}>
                  <select className={`${inputCls} flex-1 basis-48`} aria-label="Bulut çalışma alanı" value={selected} onChange={e => setSelected(e.target.value)}>
                    <option value="">Çalışma alanı seçin</option>
                    {available.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <button className={primary} disabled={busy || !selected}>Çalışma alanını aç</button>
                </form>
              ) : !needsSchema && !busy && <p className={help}>{linkedId ? 'Erişiminiz olan başka çalışma alanı yok.' : 'Hesabınız doğrulandı. Yöneticiniz çalışma alanı ve rol atadığında burada görünecek.'}</p>}
              <details>
                <summary className={summary}>Çalışma alanı kimliğiyle aç</summary>
                <form className="mt-2 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void run(() => openWorkspace(manualId)); }}>
                  <input aria-label="Çalışma alanı kimliği" className={`${inputCls} flex-1 basis-48`} value={manualId} onChange={e => setManualId(e.target.value)} />
                  <button className={secondary} disabled={busy || !manualId.trim()}>Aç</button>
                </form>
              </details>
              {!linkedId && onBackup && <button type="button" className={secondary} onClick={onBackup} disabled={busy}>Yerel yedek al</button>}
            </section>
          )}

          {user && !linkedId && (
            <form className={panel} onSubmit={e => { e.preventDefault(); void run(migrate); }}>
              <h4 className={label}>Bu cihazdaki verileri buluta taşı</h4>
              <p className={help}>{workspace.projects.length} proje ve {workspace.projects.reduce((total, project) => total + project.tasks.length, 0)} görev yeni çalışma alanına aktarılır.</p>
              <label className={label}>Yeni çalışma alanının adı<input className={inputCls} value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></label>
              <button className={primary} disabled={busy || !name.trim()}>Verileri aktar ve bağlan</button>
            </form>
          )}

          {!user && !config && !busy && <p className={help}>İlk kurulum için Supabase proje bağlantısını bir kez kaydedin.</p>}
          {!user && (!busy || config) && (
            <details key={config ? 'configured' : 'setup'} open={!config ? true : undefined} className={panel}>
              <summary className={summary}>{config ? 'Supabase bağlantı ayarları' : 'Supabase bağlantısı kur'}</summary>
              <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void run(connectDatabase); }}>
                <label className={label}>Proje adresi<input className={inputCls} type="url" placeholder="https://proje.supabase.co" required value={url} onChange={e => setUrl(e.target.value)} /></label>
                <label className={label}>Publishable veya anon public anahtarı<input className={inputCls} required value={key} onChange={e => setKey(e.target.value)} /></label>
                <div className="flex flex-wrap items-center gap-2">
                  <button className={primary} disabled={busy}>Bağlantıyı doğrula</button>
                  <a className={secondary} href="https://github.com/kaannsckin/pmasistance_mks/blob/main/supabase/KURULUM.md" target="_blank" rel="noreferrer">Kurulum kılavuzu</a>
                </div>
              </form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default CloudSyncModal;
