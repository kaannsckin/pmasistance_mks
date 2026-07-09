import React, { useEffect, useState } from 'react';
import { UserRole, WorkspaceData } from '../types';
import { ROLE_LABELS } from '../utils/allocations';
import {
  clearConflictFlag, CloudConfig, createCloudWorkspace, getMyCloudRole, getUserEmail,
  hasPendingConflict, loadCloudConfig, pullWorkspace, pushWorkspace, saveCloudConfig,
  signIn, signOut, signUp,
} from '../utils/cloudSync';

interface CloudSyncModalProps {
  workspace: WorkspaceData;
  onReplaceWorkspace: (updater: (local: WorkspaceData) => WorkspaceData) => void;
  onClose: () => void;
}

const inputCls = 'w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-[12px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary';
const btnPrimary = 'text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-40';
const btnGhost = 'text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:text-primary transition-all disabled:opacity-40';

const SectionTitle: React.FC<{ step: string; title: string }> = ({ step, title }) => (
  <div className="flex items-center space-x-2 mb-3">
    <span className="w-6 h-6 rounded-lg text-white text-[10px] font-black flex items-center justify-center" style={{ backgroundColor: 'var(--app-primary)' }}>{step}</span>
    <h4 className="text-[10px] font-black text-gray-500 dark:text-gray-300 uppercase tracking-widest">{title}</h4>
  </div>
);

const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ workspace, onReplaceWorkspace, onClose }) => {
  const existing = loadCloudConfig();
  const [url, setUrl] = useState(existing?.url || '');
  const [anonKey, setAnonKey] = useState(existing?.anonKey || '');
  const [configSaved, setConfigSaved] = useState(!!existing);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState(existing?.workspaceId || '');
  const [linkedId, setLinkedId] = useState(existing?.workspaceId || '');
  const [cloudRole, setCloudRole] = useState<UserRole | null>(null);
  const [autoSync, setAutoSync] = useState(existing?.autoSync !== false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [conflict, setConflict] = useState(hasPendingConflict());

  const config = loadCloudConfig();

  const refreshSession = async () => {
    setUserEmail(await getUserEmail());
    const cfg = loadCloudConfig();
    if (cfg?.workspaceId) {
      setCloudRole(await getMyCloudRole(cfg.workspaceId));
    }
  };

  useEffect(() => { refreshSession(); }, [configSaved]); // eslint-disable-line react-hooks/exhaustive-deps

  const note = (kind: 'ok' | 'err', text: string) => setMessage({ kind, text });

  const handleSaveConfig = () => {
    const cleanUrl = url.trim().replace(/\/$/, '');
    if (!cleanUrl.startsWith('https://') || !anonKey.trim()) {
      note('err', 'Geçerli bir Project URL (https://…supabase.co) ve anon anahtarı girin.');
      return;
    }
    saveCloudConfig({ ...(loadCloudConfig() || { autoSync: true }), url: cleanUrl, anonKey: anonKey.trim(), autoSync });
    setConfigSaved(true);
    note('ok', 'Bağlantı ayarları kaydedildi. Şimdi giriş yapın.');
  };

  const handleAuth = async (mode: 'in' | 'up') => {
    setBusy(true);
    setMessage(null);
    const err = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (err) { note('err', err); return; }
    await refreshSession();
    note('ok', mode === 'in' ? 'Giriş yapıldı.' : 'Kayıt tamamlandı. (E-posta doğrulaması açıksa gelen kutunuzu kontrol edin.)');
  };

  const handleCreateCloud = async () => {
    if (!window.confirm('Mevcut yerel çalışma alanınız buluta YENİ bir çalışma alanı olarak yazılacak. Devam edilsin mi?')) return;
    setBusy(true);
    const result = await createCloudWorkspace('PlanAsistan Çalışma Alanı', workspace);
    setBusy(false);
    if ('error' in result) { note('err', result.error); return; }
    const cfg = loadCloudConfig()!;
    saveCloudConfig({ ...cfg, workspaceId: result.id, coreVersion: 1, privateVersion: 1, lastSyncAt: new Date().toISOString(), autoSync });
    setLinkedId(result.id);
    setWorkspaceId(result.id);
    await refreshSession();
    note('ok', 'Çalışma alanı buluta taşındı. ID panoya kopyalanabilir — ekip üyeleriyle paylaşın.');
  };

  const handleConnectExisting = async () => {
    const id = workspaceId.trim();
    if (!id) return;
    const cfg = loadCloudConfig();
    if (!cfg) { note('err', 'Önce bağlantı ayarlarını kaydedin.'); return; }
    saveCloudConfig({ ...cfg, workspaceId: id, coreVersion: 0, privateVersion: 0, autoSync });
    setBusy(true);
    const result = await pullWorkspace();
    setBusy(false);
    if (!result.ok || !result.workspace) { note('err', result.message || 'Bağlantı hatası.'); return; }
    onReplaceWorkspace(result.workspace);
    setLinkedId(id);
    await refreshSession();
    note('ok', `Bağlanıldı ve veri indirildi.${result.privateVisible ? '' : ' (Rolünüz gereği notlar/istekler görünmez.)'}`);
  };

  const handlePush = async () => {
    setBusy(true);
    const result = await pushWorkspace(workspace);
    setBusy(false);
    if (result.ok) {
      clearConflictFlag();
      setConflict(false);
      note('ok', 'Veri buluta gönderildi.');
    } else if (result.reason === 'conflict') {
      setConflict(true);
      note('err', 'Çakışma: bulutta daha yeni veri var. Önce "Buluttan Çek" yapın (yerel değişiklikleriniz buluttakiyle DEĞİŞTİRİLİR).');
    } else {
      note('err', result.message || 'Gönderim başarısız.');
    }
  };

  const handlePull = async () => {
    if (!window.confirm('Buluttaki veri indirilecek ve yerel çalışma alanının YERİNE geçecek. Devam edilsin mi?')) return;
    setBusy(true);
    const result = await pullWorkspace();
    setBusy(false);
    if (!result.ok || !result.workspace) { note('err', result.message || 'İndirme hatası.'); return; }
    onReplaceWorkspace(result.workspace);
    clearConflictFlag();
    setConflict(false);
    note('ok', 'Bulut verisi indirildi.');
  };

  const handleAutoSyncToggle = (value: boolean) => {
    setAutoSync(value);
    const cfg = loadCloudConfig();
    if (cfg) saveCloudConfig({ ...cfg, autoSync: value });
  };

  const handleSignOut = async () => {
    await signOut();
    setUserEmail(null);
    setCloudRole(null);
    note('ok', 'Oturum kapatıldı. (Veriler cihazda durmaya devam eder.)');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-black text-gray-800 dark:text-white">Bulut Senkronizasyonu</h3>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Supabase · Yerel-Öncelikli · Ücretsiz Katman</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
        </div>

        <div className="p-6 space-y-6">
          {message && (
            <div className={`rounded-2xl px-4 py-3 text-[11px] font-bold ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300'}`}>
              {message.text}
            </div>
          )}
          {conflict && (
            <div className="rounded-2xl px-4 py-3 text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              <i className="fa-solid fa-triangle-exclamation mr-2"></i>
              Bekleyen çakışma var: bulutta sizden yeni veri yazılmış. "Buluttan Çek" ile eşitleyin.
            </div>
          )}

          {/* 1: Bağlantı */}
          <section>
            <SectionTitle step="1" title="Supabase Bağlantısı" />
            <div className="space-y-2">
              <input className={inputCls} placeholder="Project URL — https://xxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
              <input className={inputCls} placeholder="anon public anahtarı (eyJ…)" value={anonKey} onChange={e => setAnonKey(e.target.value)} />
              <div className="flex items-center justify-between">
                <a className="text-[10px] font-bold underline" style={{ color: 'var(--app-primary)' }} href="https://github.com/kaannsckin/pmasistance_mks/blob/main/supabase/KURULUM.md" target="_blank" rel="noreferrer">
                  Kurulum kılavuzu (10 dk)
                </a>
                <button onClick={handleSaveConfig} className={btnPrimary} style={{ backgroundColor: 'var(--app-primary)' }}>Kaydet</button>
              </div>
            </div>
          </section>

          {/* 2: Hesap */}
          <section className={configSaved ? '' : 'opacity-40 pointer-events-none'}>
            <SectionTitle step="2" title="Hesap" />
            {userEmail ? (
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3">
                <div>
                  <p className="text-[11px] font-black text-gray-700 dark:text-gray-200">{userEmail}</p>
                  {cloudRole && <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Bulut rolü: {ROLE_LABELS[cloudRole]}</p>}
                </div>
                <button onClick={handleSignOut} className={btnGhost}>Çıkış</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input className={inputCls} type="email" placeholder="E-posta" value={email} onChange={e => setEmail(e.target.value)} />
                <input className={inputCls} type="password" placeholder="Şifre (en az 6 karakter)" value={password} onChange={e => setPassword(e.target.value)} />
                <div className="flex items-center space-x-2">
                  <button disabled={busy} onClick={() => handleAuth('in')} className={btnPrimary} style={{ backgroundColor: 'var(--app-primary)' }}>Giriş Yap</button>
                  <button disabled={busy} onClick={() => handleAuth('up')} className={btnGhost}>Kayıt Ol</button>
                </div>
              </div>
            )}
          </section>

          {/* 3: Çalışma alanı */}
          <section className={userEmail ? '' : 'opacity-40 pointer-events-none'}>
            <SectionTitle step="3" title="Çalışma Alanı" />
            {linkedId ? (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Bağlı Çalışma Alanı ID</p>
                <div className="flex items-center space-x-2">
                  <code className="text-[10px] text-gray-600 dark:text-gray-300 break-all flex-1">{linkedId}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(linkedId); note('ok', 'ID kopyalandı.'); }} className="w-8 h-8 rounded-lg text-gray-400 hover:text-primary flex-none" title="Kopyala">
                    <i className="fa-solid fa-copy text-xs"></i>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Ekip üyeleri bu ID ile bağlanır (üyelikleri eklendikten sonra — bkz. kılavuz).</p>
              </div>
            ) : (
              <div className="space-y-3">
                <button disabled={busy} onClick={handleCreateCloud} className={`${btnPrimary} w-full`} style={{ backgroundColor: 'var(--app-primary)' }}>
                  <i className="fa-solid fa-cloud-arrow-up mr-2"></i>Bu çalışma alanını buluta taşı (yeni)
                </button>
                <div className="flex items-center space-x-2">
                  <input className={inputCls} placeholder="…veya mevcut Çalışma Alanı ID'sine bağlan" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} />
                  <button disabled={busy || !workspaceId.trim()} onClick={handleConnectExisting} className={btnGhost}>Bağlan</button>
                </div>
              </div>
            )}
          </section>

          {/* 4: Senkron */}
          <section className={linkedId && userEmail ? '' : 'opacity-40 pointer-events-none'}>
            <SectionTitle step="4" title="Senkronizasyon" />
            <div className="space-y-3">
              <label className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 cursor-pointer">
                <span className="text-[11px] font-black text-gray-700 dark:text-gray-200">Otomatik senkron (değişiklikten ~4 sn sonra)</span>
                <input type="checkbox" checked={autoSync} onChange={e => handleAutoSyncToggle(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              </label>
              <div className="flex items-center space-x-2">
                <button disabled={busy} onClick={handlePush} className={`${btnPrimary} flex-1`} style={{ backgroundColor: 'var(--app-primary)' }}>
                  <i className="fa-solid fa-cloud-arrow-up mr-2"></i>Şimdi Gönder
                </button>
                <button disabled={busy} onClick={handlePull} className={`${btnGhost} flex-1`}>
                  <i className="fa-solid fa-cloud-arrow-down mr-2"></i>Buluttan Çek
                </button>
              </div>
              {config?.lastSyncAt && (
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">
                  Son eşitleme: {new Date(config.lastSyncAt).toLocaleString('tr-TR')}
                </p>
              )}
            </div>
          </section>

          <p className="text-[10px] text-gray-400 leading-relaxed">
            <i className="fa-solid fa-shield-halved mr-1.5"></i>
            Notlar ve müşteri istekleri sunucuda ayrı bir tabloda tutulur; Müdür ve PYB Sorumlusu rollerindeki üyeler
            bu veriyi <b>veritabanı politikası (RLS) gereği</b> hiç indiremez. Uygulama çevrimdışı da çalışmaya devam eder.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CloudSyncModal;
