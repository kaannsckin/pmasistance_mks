import { View, WorkspaceData } from '../types';
import { awaitingOutcome, isOwnMeeting } from './customerMeetings';
import { can } from './permissions';
import { identityOf, managedDepartmentCode, ownsProject } from './rbac';
import { dueDate, isoWeekOf, isReportSteward, isWeekPublished, reportSettingsOf, weekLabel } from './weeklyReport';

/**
 * Haftalık rapor ve müşteri görüşmeleri için role göre hatırlatmalar:
 * kenar çubuğu rozetleri ve Yapılacaklar paneli maddeleri.
 */

export interface AttentionItem {
    id: string;
    severity: 'danger' | 'warn' | 'info';
    icon: string;
    text: string;
    view: View;
}

export interface ReportAttention {
    reportBadge: number;
    meetingBadge: number;
    items: AttentionItem[];
}

const DAY = 86_400_000;

export const reportAttention = (ws: WorkspaceData, now: Date = new Date()): ReportAttention => {
    const id = identityOf(ws);
    const items: AttentionItem[] = [];
    const reports = (ws.weeklyReports || []).filter(r => !isWeekPublished(ws, r.year, r.week));
    const meetings = ws.customerMeetings || [];
    const { year, week } = isoWeekOf(now);
    let reportBadge = 0;
    let meetingBadge = 0;

    if (id.role === 'py' && id.personId) {
        const mine = ws.projects.filter(p => ownsProject(p, id) && p.status === 'devam');
        const returned = reports.filter(r => r.stage === 'draft' && r.returnNote && mine.some(p => p.id === r.projectId));
        returned.forEach(r => items.push({
            id: `wr-returned-${r.id}`, severity: 'danger', icon: 'fa-rotate-left', view: View.WeeklyReport,
            text: `${ws.projects.find(p => p.id === r.projectId)?.name || 'Proje'} — ${weekLabel(r.year, r.week)} raporu iade edildi`,
        }));
        const unsent = isWeekPublished(ws, year, week) ? [] : mine.filter(p => {
            const r = (ws.weeklyReports || []).find(x => x.kind === 'project' && x.projectId === p.id && x.year === year && x.week === week);
            return !r || (r.stage === 'draft' && !r.returnNote);
        });
        const due = dueDate(year, week, reportSettingsOf(ws).dueWeekday);
        const dueEnd = due.getTime() + DAY;
        if (unsent.length && now.getTime() >= due.getTime() - DAY) {
            items.push({
                id: `wr-unsent-${year}-${week}`, severity: now.getTime() >= dueEnd ? 'danger' : 'warn', icon: 'fa-file-pen', view: View.WeeklyReport,
                text: `${unsent.length} proje için ${weekLabel(year, week)} raporu gönderilmedi (son gün ${due.toLocaleDateString('tr-TR', { weekday: 'long' })})`,
            });
            reportBadge += unsent.length;
        }
        reportBadge += returned.length;
    }

    if (id.role === 'bolum_sorumlu') {
        const dept = managedDepartmentCode(ws, id);
        const waiting = dept ? reports.filter(r => r.stage === 'bs_review' && r.departmentCode === dept).length : 0;
        if (waiting) items.push({ id: 'wr-bs', severity: 'warn', icon: 'fa-file-circle-check', view: View.WeeklyReport, text: `${waiting} haftalık rapor onayınızı bekliyor` });
        reportBadge += waiting;
    }

    if (isReportSteward(id)) {
        const waiting = reports.filter(r => r.stage === 'pyds_review').length;
        if (waiting) items.push({ id: 'wr-pyds', severity: 'warn', icon: 'fa-file-circle-check', view: View.WeeklyReport, text: `${waiting} haftalık rapor format denetiminizi bekliyor` });
        reportBadge += waiting;
        const ready = reports.some(r => r.stage === 'approved' && r.year === year && r.week === week);
        if (ready && now.getTime() >= dueDate(year, week, reportSettingsOf(ws).dueWeekday).getTime()) {
            items.push({ id: `wr-publish-${year}-${week}`, severity: 'info', icon: 'fa-paper-plane', view: View.WeeklyReport, text: `${weekLabel(year, week)} raporu yayınlanmayı bekliyor` });
        }
    }

    if (can(id, 'meeting.review')) {
        const pending = meetings.filter(m => m.status === 'pending');
        if (pending.length) {
            const withMgmt = pending.filter(m => m.managementAttendance).length;
            items.push({
                id: 'mt-pending', severity: 'warn', icon: 'fa-handshake', view: View.Meetings,
                text: `${pending.length} müşteri görüşmesi onayınızı bekliyor${withMgmt ? ` (${withMgmt} tanesinde katılımınız isteniyor)` : ''}`,
            });
        }
        meetingBadge += pending.length;
    }

    // Yönetim ekranını görenlere: enstitü raporu yayınlandı
    if (can(id, 'screen.executive')) {
        const prev = isoWeekOf(new Date(now.getTime() - 7 * DAY));
        const latest = [...(ws.weeklyPublications || [])].sort((a, b) => b.year - a.year || b.week - a.week)[0];
        if (latest && ((latest.year === year && latest.week === week) || (latest.year === prev.year && latest.week === prev.week))) {
            items.push({ id: `wr-published-${latest.year}-${latest.week}`, severity: 'info', icon: 'fa-file-lines', view: View.WeeklyReport, text: `${weekLabel(latest.year, latest.week)} enstitü raporu yayınlandı` });
        }
    }

    if ((id.role === 'py' || id.role === 'bolum_sorumlu') && id.personId) {
        const own = meetings.filter(m => isOwnMeeting(m, id));
        const outcome = own.filter(m => awaitingOutcome(m, now)).length;
        const rejected = own.filter(m => m.status === 'rejected').length;
        if (outcome) items.push({ id: 'mt-outcome', severity: 'warn', icon: 'fa-handshake', view: View.Meetings, text: `${outcome} müşteri görüşmesinin sonucunu (kararları) yazın` });
        if (rejected) items.push({ id: 'mt-rejected', severity: 'info', icon: 'fa-handshake-slash', view: View.Meetings, text: `${rejected} görüşme planınız geri çevrildi` });
        meetingBadge += outcome + rejected;
    }

    return { reportBadge, meetingBadge, items };
};
