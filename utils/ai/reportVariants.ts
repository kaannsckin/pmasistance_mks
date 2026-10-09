import { ReportPromptVariant, WeeklyReport, WorkspaceData } from '../../types';
import { stripProfileSection, withProfileSection } from './projectProfile';
import { buildReportPrompt, pickStyleReports, REPORT_SYSTEM } from './weeklyReportPrompt';

/**
 * İstem katmanları ve varyantlar. Üretimde (rapor düzenleyici) "full"
 * kullanılır; değerlendirmede katmanların kazancı ölçülsün diye aynı
 * oluşturucu varyantlarla çağrılır. Boş katman isteme bir şey eklemez:
 * ayar yokken "full" istemi eski istemle aynıdır.
 */

export interface VariantLayers {
    fixedExample: boolean; // sabit (kılavuzdaki) örnek girdi → çıktı
    card: boolean; // proje kartı (F3)
    examples: boolean; // kurumda onaylanmış raporlardan üslup örnekleri
    rules: boolean; // kurum/bölüm kılavuzu ve öğrenilmiş kurallar (F4, F7)
}

export const VARIANT_LAYERS: Record<ReportPromptVariant, VariantLayers> = {
    base: { fixedExample: true, card: false, examples: false, rules: false },
    card: { fixedExample: true, card: true, examples: false, rules: false },
    examples: { fixedExample: true, card: true, examples: true, rules: false },
    rules: { fixedExample: true, card: true, examples: false, rules: true },
    full: { fixedExample: true, card: true, examples: true, rules: true },
    ft: { fixedExample: false, card: true, examples: false, rules: true },
};

export const VARIANT_META: Record<ReportPromptVariant, { label: string; hint: string }> = {
    base: { label: 'Temel', hint: 'Varsayılan kılavuz ve sabit örnek' },
    card: { label: '+ Proje kartı', hint: 'Temel + proje kartı' },
    examples: { label: '+ Örnekler', hint: 'Proje kartı + onaylı raporlardan üslup örnekleri' },
    rules: { label: '+ Kılavuz ve kurallar', hint: 'Proje kartı + kurum/bölüm kılavuzu ve öğrenilmiş kurallar' },
    full: { label: 'Tam (üretim)', hint: 'Bütün katmanlar; rapor düzenleyicide kullanılan' },
    ft: { label: 'İnce ayar', hint: 'Örneksiz istem; ince ayarlı model için' },
};

export const REPORT_VARIANTS = Object.keys(VARIANT_LAYERS) as ReportPromptVariant[];

/** Üretimdeki varyant (kalite kapısı bununla değerlendirilir) */
export const PRODUCTION_VARIANT: ReportPromptVariant = 'full';

type VariantWs = Pick<WorkspaceData, 'projects'> & Partial<Pick<WorkspaceData, 'weeklyReports' | 'reportSettings'>>;

/**
 * Bir rapor için sistem istemi ve kullanıcı istemi. Örnekler yalnız raporun
 * haftasından önce onaylanmış raporlardan seçilir; rapor kendisi örnek olmaz
 * (değerlendirmede zaman sızıntısı olmasın).
 */
export const buildVariantRequest = (o: {
    variant: ReportPromptVariant;
    ws: VariantWs;
    report: Pick<WeeklyReport, 'id' | 'year' | 'week' | 'projectId' | 'departmentCode'>;
    input: string;
}): { system: string; prompt: string } => {
    const L = VARIANT_LAYERS[o.variant];
    // Kart katmanı: kartsız varyantta girdiden çıkarılır; kartlı varyantta eski girdide yoksa projenin bugünkü kartı eklenir
    const profile = o.ws.projects.find(p => p.id === o.report.projectId)?.aiProfile;
    const input = L.card ? withProfileSection(o.input, profile) : stripProfileSection(o.input);
    const examples = L.examples ? pickStyleReports(o.ws, o.report) : [];
    return { system: REPORT_SYSTEM, prompt: buildReportPrompt(input, examples, { fixedExample: L.fixedExample }) };
};
