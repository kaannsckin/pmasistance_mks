import { AiAdminError } from './ai/adminConfig';

/**
 * Yönetici konsolu › Entegrasyonlar: Jira, Teams ve e-posta ayarları
 * (sunucuda şifreli saklanır, .env / planasistan.env değerlerinin üzerine yazılır).
 * Yönetici anahtarı AI bağlantısıyla aynıdır (AI_ADMIN_TOKEN).
 */

export const INTEGRATION_FIELDS = [
    { key: 'JIRA_BASE_URL', group: 'jira', label: 'Jira adresi', placeholder: 'https://jira.kurum.gov.tr' },
    { key: 'JIRA_TOKEN', group: 'jira', label: 'Kişisel erişim jetonu (Jira Server/DC)', secret: true },
    { key: 'JIRA_EMAIL', group: 'jira', label: 'E-posta (yalnız Jira Cloud)' },
    { key: 'JIRA_API_TOKEN', group: 'jira', label: 'API jetonu (yalnız Jira Cloud)', secret: true },
    { key: 'JIRA_ALLOWED_PROJECTS', group: 'jira', label: 'İzinli projeler', placeholder: 'Boş = jetonun eriştiği tümü · ör. MKS, MPS' },
    { key: 'JIRA_ALLOW_UPDATE', group: 'jira', label: 'Uygulamadan Jira\'ya yazma', bool: true },
    { key: 'JIRA_ALLOW_CREATE', group: 'jira', label: 'Uygulamadan Jira kaydı açma', bool: true },
    { key: 'JIRA_STORY_POINTS_FIELD', group: 'jira', label: 'Story point alanı', placeholder: 'Boş = adından bulunur · ör. customfield_10002' },
    { key: 'TEAMS_WEBHOOK_URL', group: 'teams', label: 'Teams webhook adresi', secret: true },
    { key: 'SMTP_HOST', group: 'email', label: 'SMTP sunucusu' },
    { key: 'SMTP_PORT', group: 'email', label: 'Port', placeholder: '587' },
    { key: 'SMTP_SECURE', group: 'email', label: 'TLS (465)', bool: true },
    { key: 'SMTP_USER', group: 'email', label: 'Kullanıcı' },
    { key: 'SMTP_PASS', group: 'email', label: 'Parola', secret: true },
    { key: 'SMTP_FROM', group: 'email', label: 'Gönderen adres' },
    { key: 'NOTIFY_ALLOWED_DOMAINS', group: 'email', label: 'İzinli alıcı alan adları', placeholder: 'Boş = gönderen adresin alanı' },
    { key: 'REPORT_REMINDER_TO', group: 'email', label: 'Haftalık hatırlatma alıcıları', placeholder: 'virgülle' },
] as const;
export type IntegrationKey = typeof INTEGRATION_FIELDS[number]['key'];
export type IntegrationValues = Partial<Record<IntegrationKey, string>>;
export const INTEGRATION_SECRET_KEYS = INTEGRATION_FIELDS.filter(f => 'secret' in f && f.secret).map(f => f.key) as IntegrationKey[];

export interface IntegrationAdminState {
    store: { available: boolean; kind?: string; problem?: string };
    updatedAt?: string;
    panel: IntegrationValues;
    env: IntegrationValues;
    status: { jira: boolean; jiraCreate: boolean; jiraUpdate: boolean; teams: boolean; email: boolean; reminder: boolean };
}
export interface IntegrationTest { jira: { ok: boolean; user?: string; projects?: string[]; error?: string } }

const call = async <T>(action: string, token: string, values?: IntegrationValues): Promise<T> => {
    let res: Response;
    try {
        res = await fetch('/api/ai/admin', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
            body: JSON.stringify({ action, ...(values ? { values } : {}) }),
        });
    } catch {
        throw new AiAdminError('Sunucuya ulaşılamadı.', 0);
    }
    const j = await res.json().catch(() => ({})) as { error?: string; code?: string };
    if (!res.ok) throw new AiAdminError(j.error || `İstek başarısız (${res.status}).`, res.status, j.code);
    return j as T;
};

export const getIntegrationAdmin = (token: string) => call<IntegrationAdminState>('integrations-get', token);
export const testIntegrationAdmin = (token: string, values: IntegrationValues) => call<IntegrationTest>('integrations-test', token, values);
export const saveIntegrationAdmin = (token: string, values: IntegrationValues) => call<{ ok: true }>('integrations-save', token, values);
export const clearIntegrationAdmin = (token: string) => call<{ ok: true }>('integrations-clear', token);

/** Formdan sunucuya: gizli alan boşsa gönderilmez (kayıtlı kalır), silinecekse boş metin */
export const integrationDraft = (form: IntegrationValues, remove: Partial<Record<IntegrationKey, boolean>> = {}): IntegrationValues => {
    const out: IntegrationValues = {};
    INTEGRATION_FIELDS.forEach(f => {
        const v = (form[f.key] || '').trim();
        if (INTEGRATION_SECRET_KEYS.includes(f.key)) {
            if (remove[f.key]) out[f.key] = '';
            else if (v) out[f.key] = v;
        } else out[f.key] = v;
    });
    return out;
};
