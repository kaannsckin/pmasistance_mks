import React, { useMemo } from 'react';
import CHANGELOG from '../../CHANGELOG.md?raw';
import { changelogHighlights } from '../../utils/changelog';
import { APP_VERSION } from '../../utils/workspace';
import { useAssistantOptional } from '../assistant/AssistantContext';
import { Icon, IconName } from './icons';
import { Sheet } from './ui';

/**
 * PlanAsistan hakkında: sürüm, bu oturumun durumu (veri nerede, kimlik, yapay
 * zekâ), son yenilikler (CHANGELOG.md) ve kısayollar. Bilgiler sabit metin
 * değil, uygulamanın o anki durumundan okunur.
 */

const Row: React.FC<{ icon: IconName; label: string; value: React.ReactNode; tone?: 'ok' | 'warn' }> = ({ icon, label, value, tone }) => (
    <div className="flex items-center gap-3 min-h-[44px] px-3.5 py-2 border-t m-sep first:border-t-0">
        <span className={`w-8 h-8 rounded-lg grid place-items-center flex-none ${tone === 'ok' ? 'm-tone-ok' : tone === 'warn' ? 'm-tone-warn' : 'm-fill-2 m-text-2'}`}><Icon name={icon} size={16} /></span>
        <span className="flex-1 min-w-0 text-[14px] m-text-2">{label}</span>
        <span className="text-[14px] font-semibold m-text text-right min-w-0 truncate">{value}</span>
    </div>
);

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <kbd className="inline-flex items-center h-6 px-1.5 rounded-md border m-sep text-[12px] font-sans m-text-2 m-fill-2">{children}</kbd>
);

const SHORTCUTS: [React.ReactNode, string][] = [
    [<><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></>, 'Ara: proje, görev, kişi, ekran'],
    [<Kbd>/</Kbd>, 'Whiteboard\'da ekle: görev, sprint, şablon'],
    [<><Kbd>Ctrl</Kbd> <Kbd>Z</Kbd></>, 'Whiteboard\'da geri al'],
    [<Kbd>Esc</Kbd>, 'Pencereyi kapat'],
];

export const AboutSheet: React.FC<{
    onClose: () => void;
    cloudLinked: boolean;
    lastSyncAt?: string;
    projectCount: number;
    peopleCount: number;
    /** Oturumdaki kişi ve rol */
    who: string;
    role: string;
    onOpenCloud?: () => void;
    onOpenSettings?: () => void;
}> = ({ onClose, cloudLinked, lastSyncAt, projectCount, peopleCount, who, role, onOpenCloud, onOpenSettings }) => {
    const assistant = useAssistantOptional();
    const news = useMemo(() => changelogHighlights(CHANGELOG, 2, 6), []);
    const aiOn = !!assistant?.enabled;
    const model = assistant?.status?.model;
    const sync = lastSyncAt ? new Date(lastSyncAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : undefined;

    return (
        <Sheet title="PlanAsistan hakkında" onClose={onClose} wide>
            <div className="flex items-center gap-4 p-4 rounded-2xl m-fill-2">
                <span className="w-14 h-14 rounded-2xl grid place-items-center flex-none" style={{ background: 'var(--m-label)', color: 'var(--m-bg)' }}><Icon name="rocket" size={26} strokeWidth={1.8} /></span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2 flex-wrap">
                        <b className="text-[20px] m-text">PlanAsistan</b>
                        <span className="text-[13px] font-semibold m-text-3 m-tabular">v{APP_VERSION}</span>
                    </span>
                    <span className="block text-[14px] m-text-2 leading-snug">Proje, kaynak ve rapor planlama asistanı: portföy ve tahsis, haftalık rapor, risk, Jira eşitlemesi, Whiteboard ve yapay zekâ asistanı.</span>
                </span>
            </div>

            <section aria-labelledby="about-session" className="flex flex-col gap-1.5">
                <h3 id="about-session" className="m-0 text-[13px] font-semibold m-text-3 uppercase tracking-wide">Bu oturum</h3>
                <div className="m-surface rounded-2xl overflow-hidden" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
                    <Row icon="userCog" label="Kimlik" value={<>{who}<span className="m-text-3 font-normal"> · {role}</span></>} />
                    <Row icon={cloudLinked ? 'cloud' : 'database'} label="Veri" tone={cloudLinked ? 'ok' : undefined}
                        value={cloudLinked ? <>Bulutta (Supabase){sync ? <span className="m-text-3 font-normal"> · son eşitleme {sync}</span> : null}</> : 'Yalnız bu tarayıcıda'} />
                    <Row icon="grid" label="Kapsamınızdaki projeler / kişiler" value={<span className="m-tabular">{projectCount} / {peopleCount}</span>} />
                    <Row icon="sparkles" label="Yapay zekâ" tone={aiOn ? 'ok' : 'warn'} value={aiOn ? (model ? `Açık · ${model}` : 'Açık') : 'Kapalı'} />
                </div>
                {(!cloudLinked && onOpenCloud) || onOpenSettings ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {!cloudLinked && onOpenCloud && <button type="button" className="m-btn m-btn-gray !min-h-[36px] text-[14px]" onClick={() => { onClose(); onOpenCloud(); }}><Icon name="cloud" size={15} />Bulut veritabanına bağlan</button>}
                        {onOpenSettings && <button type="button" className="m-btn m-btn-gray !min-h-[36px] text-[14px]" onClick={() => { onClose(); onOpenSettings(); }}><Icon name="sliders" size={15} />Ayarlar</button>}
                    </div>
                ) : null}
                {!cloudLinked && <p className="m-0 text-[13px] m-text-3">Bulut bağlı değilken veriler yalnız bu tarayıcıda tutulur; başka cihaza taşımak için yedek alın ya da bulut veritabanına bağlanın.</p>}
            </section>

            {news.length > 0 && (
                <section aria-labelledby="about-news" className="flex flex-col gap-1.5">
                    <h3 id="about-news" className="m-0 text-[13px] font-semibold m-text-3 uppercase tracking-wide">Son yenilikler</h3>
                    <div className="flex flex-col gap-3">
                        {news.map(sec => (
                            <div key={sec.title} className="flex flex-col gap-1">
                                <span className="text-[13px] font-semibold m-accent">{sec.title === 'Yayımlanmamış' ? 'Bu sürümde yeni' : sec.title}</span>
                                <ul className="m-0 pl-5 list-disc flex flex-col gap-0.5 text-[14px] m-text">
                                    {sec.items.map(it => <li key={it}>{it}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section aria-labelledby="about-keys" className="flex flex-col gap-1.5">
                <h3 id="about-keys" className="m-0 text-[13px] font-semibold m-text-3 uppercase tracking-wide flex items-center gap-1.5"><Icon name="keyboard" size={15} />Kısayollar</h3>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[14px] m-text-2">
                    {SHORTCUTS.map(([k, label]) => <div key={label} className="flex items-center gap-2"><span className="flex-none">{k}</span><span className="min-w-0">{label}</span></div>)}
                </div>
            </section>
        </Sheet>
    );
};

export default AboutSheet;
