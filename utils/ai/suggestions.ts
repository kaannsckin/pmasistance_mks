import { Project, TaskStatus, UserRole, WorkspaceData } from '../../types';
import { canFor, PermissionHolder } from '../permissions';

export interface Suggestion { label: string; prompt: string }

/**
 * Önerileri veriye göre öne çıkaran durum bilgisi (App hesaplar): açık
 * projede geciken iş, düzenleyebilir mi, havuz eksikleri, worklog var mı.
 */
export interface SuggestionFacts {
    overdue?: number;
    canEditProject?: boolean;
    canEditPool?: boolean;
    titlesWithoutCost?: number;
    peopleWithoutTitle?: number;
    hasWorklogs?: boolean;
}

const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Açık proje ve havuzdan öneri durum bilgisi */
export const suggestionFacts = (
    ws: Pick<WorkspaceData, 'titles' | 'people'>,
    project: Project | undefined,
    o: { canEditProject: boolean; canEditPool: boolean; now?: Date },
): SuggestionFacts => ({
    overdue: project ? project.tasks.filter(t => t.status !== TaskStatus.Done && !!t.dueDate && t.dueDate.slice(0, 10) < localDay(o.now || new Date())).length : 0,
    canEditProject: o.canEditProject,
    canEditPool: o.canEditPool,
    titlesWithoutCost: o.canEditPool ? ws.titles.filter(t => !t.monthlyCost).length : 0,
    peopleWithoutTitle: o.canEditPool ? ws.people.filter(p => !p.titleCode).length : 0,
    hasWorklogs: !!project?.tasks.some(t => t.jiraWorklog?.entries.length),
});

/**
 * Boş sohbette gösterilen öneriler: önce verideki duruma özgü olanlar
 * (geciken iş, havuz eksikleri, iş gücü), sonra role göre genel sorular.
 */
export const buildSuggestions = (who: UserRole | PermissionHolder, activeProjectName?: string, facts: SuggestionFacts = {}): Suggestion[] => {
    const list: Suggestion[] = [];
    const p = activeProjectName;
    // 1) Duruma özgü, eyleme dönük öneriler
    if (p && facts.overdue && facts.canEditProject) {
        list.push({ label: `${facts.overdue} geciken görev: yeni termin öner`, prompt: `${p} projesinde geciken görevleri bul; her biri için gerçekçi yeni termin öner ve hepsini tek öneri kartında hazırla.` });
    } else if (p && facts.overdue) {
        list.push({ label: `${facts.overdue} geciken görev`, prompt: `${p} projesinde geciken görevler hangileri, kimlerde ve ne kadar gecikmiş?` });
    }
    if (facts.canEditPool && facts.titlesWithoutCost) {
        list.push({ label: `${facts.titlesWithoutCost} ünvanın maliyeti eksik`, prompt: 'Aylık maliyeti girilmemiş ünvanları ve bu ünvandaki kişi sayılarını listele.' });
    }
    if (facts.canEditPool && facts.peopleWithoutTitle) {
        list.push({ label: `${facts.peopleWithoutTitle} kişinin ünvanı yok`, prompt: 'Ünvanı girilmemiş kişileri bölümleriyle listele; maliyet hesabına etkisini söyle.' });
    }
    if (p && facts.hasWorklogs) {
        list.push({ label: 'Bu ay kim ne kadar çalıştı?', prompt: `${p} projesinde bu ay kim hangi kayıtta kaç saat çalıştı ve maliyeti ne? Kişi bazında özetle.` });
    }
    // 2) Bağlama göre genel öneriler
    if (p) {
        list.push({ label: `${p}: durum özeti`, prompt: `${p} projesinin genel durumunu özetle: sağlık, geciken işler, en yüksek riskler ve bu yılın tahsisi.` });
        list.push({ label: 'Açık görevleri Excel olarak ver', prompt: `${p} projesinin açık görevlerini (görev, atanan, öncelik, termin, durum) Excel dosyası olarak hazırla.` });
    }
    list.push({ label: 'Portföyün genel durumu', prompt: 'Portföyün genel durumu nasıl? Dikkat etmem gereken başlıca konular neler?' });
    if (canFor(who, 'screen.executive')) {
        list.push({ label: 'Bütçe / takvim sapması (EVM)', prompt: 'EVM göstergelerine göre bütçe ya da takvim sapması olan projeler hangileri?' });
        list.push({ label: 'Yönetici özeti (PDF)', prompt: 'Portföyün yönetici özetini hazırla ve PDF olarak ver: sağlık, sapmalar, kritik riskler, kapasite açıkları.' });
    } else {
        list.push({ label: 'Kapasitesini aşanlar', prompt: 'Bu yıl hangi aylarda kapasitesini aşan kişiler var? En kritik olanları göster.' });
        list.push({ label: 'Uygun kişi bul', prompt: 'Önümüzdeki 3 ay için her ay en az 0,5 AA boş kapasitesi olan kişiler kimler?' });
    }
    list.push({ label: 'Son 7 günde neler değişti?', prompt: 'Son 7 günde neler değişti? Kısaca özetle.' });
    return list.slice(0, 6);
};
