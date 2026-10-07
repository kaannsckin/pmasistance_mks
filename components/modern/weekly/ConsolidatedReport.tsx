import React, { useEffect, useMemo, useState } from 'react';
import { Abbreviation, PmoRating, ReportItem, ReportSettings, ReportStage, WeeklyPublication, WeeklyReport, WorkspaceData } from '../../../types';
import { ROLE_LABELS } from '../../../utils/allocations';
import { pmoRatingFor } from '../../../utils/healthModel';
import { describeNotify, IntegrationHealth, sendNotification } from '../../../utils/integrations';
import { Identity } from '../../../utils/rbac';
import { relativeTime } from '../../../utils/recentChanges';
import {
    buildEml, consolidate, glossaryFor, isPyds, itemDisplay, renderReportHtml, renderReportText, reportTitle, weekProgress,
} from '../../../utils/weeklyReport';
import { Icon } from '../icons';
import ScoreScale from '../ScoreScale';
import { EmptyState, copyText, downloadFile, Notice, NoticeState, Pill, printHtml, StagePill } from './shared';

/**
 * Enstitü geneli haftalık rapor: bölüm → proje gruplu "bu hafta gelişmeler"
 * ve "gelecek hafta planlanan". PYB destek önizler, yayınlar ve müdürlere
 * e-posta ile gönderir; müdür / PYB sorumlusu yayınlanan raporu okur; bölüm
 * sorumlusu kendi bölümünün önizlemesini görür.
 */

const Items: React.FC<{ title: string; items: ReportItem[] }> = ({ title, items }) =>
    items.length ? (
        <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold m-text-3">{title}</span>
            <ul className="m-0 pl-5 flex flex-col gap-1">
                {items.map(i => <li key={i.id} className="text-[15px] leading-relaxed m-text">{itemDisplay(i)}</li>)}
            </ul>
        </div>
    ) : null;

/**
 * PMO değerlendirmesi: projeye bu hafta için 1–10 puan (sağlık modelinin hedef
 * değişkeni). Çapa etkisini azaltmak için yanında model skoru ve PY puanı yok.
 */
const PmoRatingRow: React.FC<{ projectName: string; rating?: PmoRating; onRate: (score: number | null, note?: string) => boolean }> = ({ projectName, rating, onRate }) => {
    const [note, setNote] = useState(rating?.note || '');
    useEffect(() => setNote(rating?.note || ''), [rating?.note]);
    return (
        <div className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[13px] font-semibold m-text-2">PMO puanı</span>
                <ScoreScale compact label={`${projectName} için PMO puanı`} value={rating?.score} onChange={v => onRate(v ?? null, note)} />
                {rating && <span className="text-[12.5px] m-text-3">{rating.byName || ROLE_LABELS[rating.byRole]} · {relativeTime(rating.at)}</span>}
            </div>
            {rating && (
                <input
                    aria-label={`${projectName} için PMO gerekçesi`}
                    className="m-input !min-h-[38px] text-[14px]"
                    maxLength={200}
                    value={note}
                    placeholder="Gerekçe (isteğe bağlı) — alandan çıkınca kaydedilir"
                    onChange={e => setNote(e.target.value)}
                    onBlur={() => { if (note.trim() !== (rating.note || '')) onRate(rating.score, note); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
            )}
        </div>
    );
};

export interface ConsolidatedReportProps {
    workspace: WorkspaceData;
    identity: Identity;
    year: number;
    week: number;
    dictionary: Abbreviation[];
    settings: ReportSettings;
    health: IntegrationHealth | null;
    departmentCode?: string;
    publication?: WeeklyPublication;
    onPublish?: () => boolean;
    onUnpublish?: () => boolean;
    onMarkEmailed?: () => void;
    onOpenReport?: (r: WeeklyReport) => void;
    /** PMO rolleri: projeye haftalık 1–10 sağlık puanı */
    onRatePmo?: (projectId: string, score: number | null, note?: string) => boolean;
}

const ConsolidatedReport: React.FC<ConsolidatedReportProps> = ({
    workspace, identity, year, week, dictionary, settings, health, departmentCode, publication, onPublish, onUnpublish, onMarkEmailed, onOpenReport, onRatePmo,
}) => {
    const steward = isPyds(identity.role);
    const [mode, setMode] = useState<'approved' | 'all'>(steward && !publication ? 'all' : 'approved');
    const [notice, setNotice] = useState<NoticeState>(null);
    const [sending, setSending] = useState(false);
    const [alsoTeams, setAlsoTeams] = useState(false);

    const stages: ReportStage[] = departmentCode ? ['bs_review', 'pyds_review', 'approved'] : mode === 'all' ? ['bs_review', 'pyds_review', 'approved'] : ['approved'];
    const sections = useMemo(() => {
        const all = consolidate(workspace, year, week, stages);
        return departmentCode ? all.filter(s => s.code === departmentCode) : all;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace, year, week, departmentCode, stages.join()]);
    const reports = useMemo(() => sections.flatMap(s => [...s.projects.map(p => p.report), ...(s.additions ? [s.additions] : [])]), [sections]);
    const glossary = useMemo(() => glossaryFor(reports, dictionary), [reports, dictionary]);
    const progress = useMemo(() => weekProgress(workspace, year, week).filter(d => !departmentCode || d.code === departmentCode), [workspace, year, week, departmentCode]);
    const expected = progress.reduce((s, d) => s + d.expected, 0);
    const shownProjects = sections.flatMap(s => s.projects.map(p => p.projectId));
    const ratedCount = shownProjects.filter(id => pmoRatingFor(workspace.pmoRatings, id, year, week)).length;
    const approved = progress.reduce((s, d) => s + d.byStage.approved, 0);

    const approvedSections = useMemo(() => consolidate(workspace, year, week, ['approved']), [workspace, year, week]);
    const approvedGlossary = useMemo(() => glossaryFor(approvedSections.flatMap(s => [...s.projects.map(p => p.report), ...(s.additions ? [s.additions] : [])]), dictionary), [approvedSections, dictionary]);
    // Dışarı çıkan metin (kopyala, yazdır, e-posta) PYB destek için daima yalnız onaylı raporlardır
    const html = () => (steward ? renderReportHtml(approvedSections, approvedGlossary, year, week) : renderReportHtml(sections, glossary, year, week));
    const text = () => (steward ? renderReportText(approvedSections, approvedGlossary, year, week) : renderReportText(sections, glossary, year, week));

    const copy = async () => setNotice(await copyText(text()) ? { kind: 'ok', text: 'Rapor metni panoya kopyalandı (Teams ya da e-postaya yapıştırabilirsiniz).' } : { kind: 'error', text: 'Panoya kopyalanamadı.' });
    const print = () => { if (!printHtml(html())) setNotice({ kind: 'error', text: 'Yeni pencere açılamadı (açılır pencere engelleyicisini kontrol edin).' }); };
    const eml = () => {
        downloadFile(`haftalik-rapor-${year}-${String(week).padStart(2, '0')}.eml`, buildEml({ to: settings.directorEmails, subject: reportTitle(year, week), html: html(), text: text() }), 'message/rfc822');
        setNotice({ kind: 'info', text: 'E-posta taslağı indirildi: açınca Outlook\'ta gönderilmeye hazır taslak olarak açılır.' });
    };
    const autoSend = async () => {
        if (!health || !settings.directorEmails.length) return;
        setSending(true);
        setNotice(null);
        try {
            const r = await sendNotification({ subject: reportTitle(year, week), text: text(), html: html(), email: { to: settings.directorEmails }, teams: alsoTeams }, health.authMode);
            const d = describeNotify(r);
            setNotice({ kind: d.ok ? 'ok' : 'error', text: d.text });
            if (r.email === 'sent') onMarkEmailed?.();
        } catch (e) {
            setNotice({ kind: 'error', text: (e as Error).message });
        } finally {
            setSending(false);
        }
    };
    const publish = () => {
        const missing = expected - approved;
        if (missing > 0 && !window.confirm(`${missing} aktif projenin raporu henüz onaylanmadı. Onaylananlarla yayınlansın mı?`)) return;
        if (onPublish?.()) { setMode('approved'); setNotice({ kind: 'ok', text: 'Hafta yayınlandı: müdür ve PYB sorumlusu raporu bölüm bazında görebilir.' }); }
    };

    const exec = !steward && !departmentCode;
    if (exec && !publication) {
        return (
            <EmptyState icon="report" title="Bu haftanın raporu henüz yayınlanmadı">
                <span className="text-[15px] m-text-3 max-w-[56ch]">Proje yöneticileri yazar, bölüm sorumluları ve PYB destek onaylar; yayınlandığında enstitü raporu burada bölüm bazında görünür.</span>
            </EmptyState>
        );
    }

    const canSend = steward || exec;
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                {steward && !departmentCode && (
                    <div className="m-segmented" role="group" aria-label="Kapsam">
                        <button type="button" className="m-segment" aria-pressed={mode === 'approved'} onClick={() => setMode('approved')}>Onaylananlar<span className="m-text-3 m-tabular">{approved}</span></button>
                        <button type="button" className="m-segment" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>İncelemedekiler dahil</button>
                    </div>
                )}
                {publication
                    ? <Pill tone="m-tone-ok"><Icon name="check" size={13} strokeWidth={2.4} />Yayınlandı · {relativeTime(publication.publishedAt)}{publication.emailedAt ? ' · e-postayla gönderildi' : ''}</Pill>
                    : !departmentCode && <Pill tone="m-tone-hold">Yayınlanmadı</Pill>}
                <span className="text-[14px] m-text-3">{approved}/{expected} proje onaylı</span>
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-gray" onClick={copy}><Icon name="copy" size={17} />Metni kopyala</button>
                <button type="button" className="m-btn m-btn-gray" onClick={print}><Icon name="printer" size={17} />Yazdır / PDF</button>
                {canSend && <button type="button" className="m-btn m-btn-gray" onClick={eml}><Icon name="mail" size={17} />E-posta taslağı</button>}
                {steward && !publication && onPublish && (
                    <button type="button" className="m-btn m-btn-primary" disabled={approved === 0} title={approved === 0 ? 'Önce en az bir raporu onaylayın' : undefined} onClick={publish}>
                        <Icon name="send" size={17} />Haftayı yayınla
                    </button>
                )}
                {steward && publication && onUnpublish && (
                    <button type="button" className="m-btn m-btn-plain" onClick={() => { if (window.confirm('Yayından kaldırılsın mı? Müdür ekranından kalkar; raporlar düzeltilebilir.') && onUnpublish()) setNotice({ kind: 'info', text: 'Yayından kaldırıldı.' }); }}>Yayından kaldır</button>
                )}
            </div>

            {steward && publication && (
                <div className="m-surface rounded-2xl p-4 flex flex-wrap items-center gap-3">
                    <Icon name="mail" size={20} />
                    <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
                        <span className="text-[15px] font-semibold m-text">Müdürlere otomatik e-posta</span>
                        <span className="text-[13px] m-text-3">
                            {!settings.directorEmails.length ? 'Ayarlar sekmesinden müdür e-posta adreslerini girin.'
                                : health?.email ? `Alıcılar: ${settings.directorEmails.join(', ')}`
                                    : 'Sunucuda e-posta (SMTP) yapılandırılmadı; “E-posta taslağı” ile Outlook\'tan gönderin.'}
                        </span>
                    </div>
                    {health?.teams && (
                        <label className="inline-flex items-center gap-2 text-[14px] m-text-2">
                            <input type="checkbox" checked={alsoTeams} onChange={e => setAlsoTeams(e.target.checked)} />Teams kanalına da gönder
                        </label>
                    )}
                    <button type="button" className="m-btn m-btn-primary" disabled={sending || !health?.email || !settings.directorEmails.length} onClick={autoSend}>
                        <Icon name="send" size={17} />{sending ? 'Gönderiliyor…' : publication.emailedAt ? 'Yeniden gönder' : 'Gönder'}
                    </button>
                </div>
            )}

            <Notice notice={notice} onClose={() => setNotice(null)} />

            {onRatePmo && shownProjects.length > 0 && (
                <div className="m-surface rounded-2xl px-4 py-3 flex items-start gap-3">
                    <span className="m-accent" style={{ marginTop: 2 }}><Icon name="info" size={18} /></span>
                    <p className="m-0 flex-1 text-[14px] m-text-2">
                        Raporu okurken her projeye bu hafta için <b>1–10 PMO puanı</b> verin ({ratedCount}/{shownProjects.length} puanlandı). Puanlar proje sağlık modelinin hedef değişkenidir; yeterli veri birikince skorun ağırlıkları bu puanlara göre kalibre edilir. Proje yöneticileri puanları görmez.
                    </p>
                </div>
            )}

            {sections.length === 0 ? (
                <EmptyState icon="report" title={mode === 'approved' ? 'Bu hafta onaylanmış rapor yok' : 'Bu hafta incelemeye gönderilmiş rapor yok'}>
                    <span className="text-[15px] m-text-3 max-w-[52ch]">Raporlar proje yöneticisi gönderdikten sonra burada bölüm bazında birleşir.</span>
                </EmptyState>
            ) : (
                <article className="m-surface rounded-2xl p-5 sm:p-7 flex flex-col gap-6">
                    <h2 className="m-0 text-[22px] font-bold m-text">{reportTitle(year, week)}</h2>
                    {sections.map(s => (
                        <section key={s.code || 'none'} aria-label={s.name} className="flex flex-col gap-4">
                            <h3 className="m-0 pb-1.5 text-[18px] font-semibold m-text border-b m-sep" style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
                                {s.name}{s.code && s.name !== s.code ? <span className="m-text-3 font-normal"> ({s.code})</span> : null}
                            </h3>
                            {s.projects.map(p => (
                                <div key={p.projectId} className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {onOpenReport ? (
                                            <button type="button" className="bg-transparent border-0 p-0 text-[16px] font-semibold m-text cursor-pointer hover:underline text-left" onClick={() => onOpenReport(p.report)}>{p.name}</button>
                                        ) : <span className="text-[16px] font-semibold m-text">{p.name}</span>}
                                        <span className="text-[14px] m-text-3">{[p.code, p.pmName ? `PY: ${p.pmName}` : ''].filter(Boolean).join(' · ')}</span>
                                        {(mode === 'all' || departmentCode) && p.report.stage !== 'approved' && <StagePill stage={p.report.stage} />}
                                    </div>
                                    <Items title="Bu hafta" items={p.report.thisWeek} />
                                    <Items title="Gelecek hafta" items={p.report.nextWeek} />
                                    {onRatePmo && <PmoRatingRow projectName={p.name} rating={pmoRatingFor(workspace.pmoRatings, p.projectId, year, week)} onRate={(score, note) => onRatePmo(p.projectId, score, note)} />}
                                </div>
                            ))}
                            {s.additions && (s.additions.thisWeek.length > 0 || s.additions.nextWeek.length > 0) && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[16px] font-semibold m-text">Bölüm genel</span>
                                    <Items title="Bu hafta" items={s.additions.thisWeek} />
                                    <Items title="Gelecek hafta" items={s.additions.nextWeek} />
                                </div>
                            )}
                        </section>
                    ))}
                    {glossary.length > 0 && (
                        <section aria-label="Kısaltmalar" className="flex flex-col gap-1.5">
                            <h3 className="m-0 text-[15px] font-semibold m-text">Kısaltmalar</h3>
                            <p className="m-0 text-[14px] m-text-2">{glossary.map(g => `${g.abbr}: ${g.expansion}`).join(' · ')}</p>
                        </section>
                    )}
                </article>
            )}
        </div>
    );
};

export default ConsolidatedReport;
