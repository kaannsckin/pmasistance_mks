import { ProjectSectionKey, View } from '../../types';
import { sectionOfView } from '../viewConfig';

/**
 * Asistanın arayüz komutları (ajan modu): ekran değiştirme, proje / görev /
 * kişi profili açma, uygulama pencerelerini açma. Bunlar VERİ DEĞİŞTİRMEZ —
 * kullanıcının kendisinin menüden yapabileceği gezinmenin aynısıdır; bu yüzden
 * onay beklemeden uygulanır. Yetki, kullanıcının menüde gördüğüyle aynıdır
 * (App.tsx komut paletinin kuralları): yetkisiz ekran açılamaz.
 */

export type ScreenKey =
    | 'portfoy' | 'tahsis' | 'takvim' | 'risk_raporu' | 'beklentiler' | 'haftalik_rapor' | 'gorusmeler' | 'veri_havuzu'
    | 'yonetim' | 'yonetici_konsolu'
    | 'dashboard' | 'genel_bakis' | 'pano' | 'zaman_cizelgesi' | 'gorevler' | 'planlama' | 'riskler' | 'ekip' | 'hedefler'
    | 'istekler' | 'gunluk' | 'asistan';

export type DialogKey = 'veri_sagligi' | 'denetim_gunlugu' | 'is_paketleri' | 'profil';

interface ScreenDef {
    label: string;
    /** Açık bir proje gerektirir (proje çubuğu ekranı) */
    project?: boolean;
    /** Modern / klasik arayüzde karşılık gelen ekran (yoksa o arayüzde bulunmaz) */
    modern?: View;
    classic?: View;
}

export const SCREENS: Record<ScreenKey, ScreenDef> = {
    portfoy: { label: 'Portföy', modern: View.Portfolio, classic: View.Portfolio },
    tahsis: { label: 'İşgücü Tahsisi', modern: View.Allocations, classic: View.Allocations },
    takvim: { label: 'Takvim', modern: View.Calendar, classic: View.Calendar },
    risk_raporu: { label: 'Risk raporu (portföy)', modern: View.RiskReport, classic: View.RiskReport },
    beklentiler: { label: 'Yönetimden beklentiler', modern: View.Expectations, classic: View.Expectations },
    haftalik_rapor: { label: 'Haftalık rapor', modern: View.WeeklyReport, classic: View.WeeklyReport },
    gorusmeler: { label: 'Müşteri görüşmeleri', modern: View.Meetings, classic: View.Meetings },
    veri_havuzu: { label: 'Veri Havuzu', modern: View.DataPool, classic: View.DataPool },
    yonetim: { label: 'Yönetim (EVM, sağlık, baseline)', modern: View.Executive, classic: View.Executive },
    yonetici_konsolu: { label: 'Yönetici konsolu', modern: View.Admin, classic: View.Admin },
    dashboard: { label: 'Proje dashboard\'u', project: true, modern: View.Dashboard, classic: View.Roadmap },
    genel_bakis: { label: 'Proje genel bakış', project: true, modern: View.Overview, classic: View.Roadmap },
    pano: { label: 'Pano', project: true, modern: View.Roadmap, classic: View.Kanban },
    zaman_cizelgesi: { label: 'Zaman çizelgesi / yol haritası', project: true, modern: View.Kanban, classic: View.Roadmap },
    gorevler: { label: 'Görev listesi', project: true, modern: View.Tasks, classic: View.Tasks },
    planlama: { label: 'Planlama asistanı', project: true, modern: View.Planning },
    riskler: { label: 'Proje riskleri', project: true, modern: View.Risks, classic: View.Risks },
    ekip: { label: 'Proje ekibi', project: true, modern: View.Resources, classic: View.Resources },
    hedefler: { label: 'Hedefler (OKR)', project: true, modern: View.Goals, classic: View.Goals },
    istekler: { label: 'Müşteri istekleri', project: true, modern: View.Requests, classic: View.Requests },
    gunluk: { label: 'Günlük (proje notları)', project: true, modern: View.Notes, classic: View.Notes },
    asistan: { label: 'Asistan tam ekran', project: true, modern: View.AI, classic: View.AI },
};
export const SCREEN_KEYS = Object.keys(SCREENS) as ScreenKey[];

export const DIALOGS: Record<DialogKey, string> = {
    veri_sagligi: 'Veri sağlığı denetimi',
    denetim_gunlugu: 'Denetim günlüğü',
    is_paketleri: 'İş paketleri (açık proje)',
    profil: 'Profil (rol / kişi) seçimi',
};
export const DIALOG_KEYS = Object.keys(DIALOGS) as DialogKey[];

export type UiCommand =
    | { type: 'screen'; screen: ScreenKey; projectId?: string }
    | { type: 'task'; projectId: string; taskId: string }
    | { type: 'person'; personId: string }
    | { type: 'dialog'; dialog: DialogKey };

export interface UiResult {
    ok: boolean;
    message: string;
}

/** Komutun uygulanabileceği ortam (App'in güncel yetki/arayüz durumu) */
export interface UiEnv {
    modern: boolean;
    consoleMode: boolean;
    canExecutive: boolean;
    canAdmin: boolean;
    canNotes: boolean;
    canAudit: boolean;
    canDataHealth: boolean;
    /** Admin'in rol için açık bıraktığı proje sekmeleri */
    projectSections: Set<ProjectSectionKey>;
    /** Kullanıcının görebildiği (Portföy'deki) projeler */
    visibleProjectIds: Set<string>;
    /** Komuttan sonra açık olacak proje (komut proje veriyorsa o, yoksa şu an açık olan) */
    activeProjectId: string | null;
}

/** Ekran anahtarını bu arayüz ve yetkiyle açılabilecek View'e çevirir; açılamıyorsa nedeni */
export const resolveScreen = (key: ScreenKey, env: UiEnv): { view: View } | { error: string } => {
    const def = SCREENS[key];
    if (!def) return { error: `Bilinmeyen ekran: ${key}.` };
    if (env.consoleMode) return { error: 'Yönetici (admin) rolü yalnız yönetici konsolunu kullanır.' };
    const view = env.modern ? def.modern : def.classic;
    if (view === undefined) return { error: `${def.label} ekranı yalnız modern arayüzde var (Ayarlar → Arayüz).` };
    if (view === View.Executive && !env.canExecutive) return { error: 'Yönetim ekranı bu rolde açık değil.' };
    if (view === View.Admin && !env.canAdmin) return { error: 'Yönetici konsolu bu rolde açık değil.' };
    if ((view === View.Notes || view === View.Requests) && !env.canNotes) return { error: `${def.label} bu rolde görüntülenemez.` };
    if (def.project) {
        if (!env.activeProjectId) return { error: `${def.label} için önce bir proje açılmalı (proje adını verin).` };
        if (!env.visibleProjectIds.has(env.activeProjectId)) return { error: 'Bu proje kullanıcının yetki kapsamında değil.' };
        const section = env.modern ? sectionOfView(view) : undefined;
        if (section && !env.projectSections.has(section)) return { error: `${def.label} sekmesi bu rol için yönetici tarafından gizlenmiş.` };
    }
    return { view };
};

/** Pencerenin bu rolde açılıp açılamayacağı */
export const dialogProblem = (dialog: DialogKey, env: UiEnv): string | null => {
    if (!DIALOGS[dialog]) return `Bilinmeyen pencere: ${dialog}.`;
    if (env.consoleMode && dialog !== 'profil') return 'Yönetici (admin) rolü yalnız yönetici konsolunu kullanır.';
    if (dialog === 'veri_sagligi' && !env.canDataHealth) return 'Veri sağlığı denetimi bu rolde açık değil.';
    if (dialog === 'denetim_gunlugu' && !env.canAudit) return 'Denetim günlüğü bu rolde açık değil.';
    if (dialog === 'is_paketleri' && !env.activeProjectId) return 'İş paketleri için önce bir proje açılmalı.';
    return null;
};
