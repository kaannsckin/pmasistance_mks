import { Task } from '../types';
import { mapJiraIssueType } from './planning/jiraFields';
import { foldTr } from './rag/text';

/**
 * Kayıt türünün panoda / listede görünümü. Uygulamadaki tür (`issueType`)
 * yalnız beş değerdir (planlama ve tahmin için); Jira'daki asıl tür adı
 * (`jiraIssueType`: Sub-task, Change Request, Epic …) varsa görünüm ondan
 * çıkarılır ki "alt görev" ile "görev", "değişiklik talebi" ile "diğer"
 * ayrılsın. Tür uygulamada elle değiştirildiyse (Jira adı artık o türe
 * düşmüyorsa) uygulamadaki tür esas alınır.
 */

export type IssueKind = 'bug' | 'change' | 'story' | 'feature' | 'improvement' | 'task' | 'subtask' | 'test' | 'epic' | 'other';

export interface IssueKindMeta {
    kind: IssueKind;
    label: string;
    icon: string;
    /** Tema değişkeni (açık / koyu temada ayrı tonlar) */
    color: string;
}

const META: Record<IssueKind, Omit<IssueKindMeta, 'kind'>> = {
    bug: { label: 'Hata', icon: 'bug', color: 'var(--viz-8)' },
    change: { label: 'Değişiklik talebi', icon: 'swap', color: 'var(--viz-2)' },
    story: { label: 'Hikâye', icon: 'bookmark', color: 'var(--viz-3)' },
    feature: { label: 'Yeni özellik', icon: 'plus', color: 'var(--viz-3)' },
    improvement: { label: 'İyileştirme', icon: 'arrowUp', color: 'var(--viz-4)' },
    task: { label: 'Görev', icon: 'check', color: 'var(--viz-1)' },
    subtask: { label: 'Alt görev', icon: 'subtask', color: 'color-mix(in srgb, var(--viz-1) 50%, var(--viz-3))' },
    test: { label: 'Test', icon: 'target', color: 'var(--viz-5)' },
    epic: { label: 'Epic', icon: 'zap', color: 'var(--viz-7)' },
    other: { label: 'Diğer', icon: 'circle', color: 'var(--m-label-3)' },
};

/** Pano süzgecinde türlerin sırası */
export const ISSUE_KIND_ORDER: IssueKind[] = ['bug', 'change', 'story', 'feature', 'improvement', 'task', 'subtask', 'test', 'epic', 'other'];

/** Jira tür adı → görünüm türü */
export const kindOfJiraType = (raw: string | undefined): IssueKind | undefined => {
    const s = foldTr(raw || '').trim();
    if (!s) return undefined;
    if (/sub.?task|alt.?gorev/.test(s)) return 'subtask';
    if (/change|degisiklik/.test(s)) return 'change';
    if (/epic/.test(s)) return 'epic';
    // Test senaryosu / doğrulama kaydı ("Test Bug" gibi hata türleri hata sayılır)
    if (/^(test|test case|test senaryosu|dogrulama|verification|validation)$/.test(s)) return 'test';
    if (/story|hikaye/.test(s)) return 'story';
    const mapped = mapJiraIssueType(raw);
    return mapped && mapped !== 'other' ? mapped : 'other';
};

export const issueKind = (t: Pick<Task, 'issueType' | 'jiraIssueType'>): IssueKind | undefined => {
    const fromJira = kindOfJiraType(t.jiraIssueType);
    // Jira adı uygulamadaki türle çelişiyorsa (tür elle değiştirildi) uygulamadaki geçerli
    if (fromJira && (!t.issueType || mapJiraIssueType(t.jiraIssueType) === t.issueType)) return fromJira;
    return t.issueType;
};

export const issueKindMeta = (t: Pick<Task, 'issueType' | 'jiraIssueType'>): IssueKindMeta | undefined => {
    const kind = issueKind(t);
    if (!kind) return undefined;
    const m = META[kind];
    // Bilinmeyen Jira türü: kendi adıyla gösterilir
    const label = kind === 'other' && t.jiraIssueType?.trim() && kindOfJiraType(t.jiraIssueType) === 'other' ? t.jiraIssueType.trim() : m.label;
    return { kind, ...m, label };
};

export const issueKindLabel = (kind: IssueKind): string => META[kind].label;
