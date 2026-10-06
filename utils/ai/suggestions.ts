import { UserRole } from '../../types';
import { isExecViewer } from '../rbac';

/** Boş sohbette gösterilen, role ve bağlama göre örnek sorular */
export const buildSuggestions = (role: UserRole, activeProjectName?: string): { label: string; prompt: string }[] => {
    const list: { label: string; prompt: string }[] = [];
    if (activeProjectName) {
        list.push({ label: `${activeProjectName}: durum özeti`, prompt: `${activeProjectName} projesinin genel durumunu özetle: sağlık, geciken işler, en yüksek riskler ve bu yılın tahsisi.` });
        list.push({ label: 'Geciken görevler', prompt: `${activeProjectName} projesinde geciken görevler hangileri, kimlerde?` });
    }
    list.push({ label: 'Portföyün genel durumu', prompt: 'Portföyün genel durumu nasıl? Dikkat etmem gereken başlıca konular neler?' });
    list.push({ label: 'Kapasitesini aşanlar', prompt: 'Bu yıl hangi aylarda kapasitesini aşan kişiler var? En kritik olanları göster.' });
    if (isExecViewer(role)) {
        list.push({ label: 'Bütçe / takvim sapması (EVM)', prompt: 'EVM göstergelerine göre bütçe ya da takvim sapması olan projeler hangileri?' });
        list.push({ label: 'Personel açığı', prompt: 'Kapasite-talep analizine göre hangi bölüm ve rollerde personel açığı var?' });
    } else {
        list.push({ label: 'Uygun kişi bul', prompt: 'Önümüzdeki 3 ay için her ay en az 0,5 AA boş kapasitesi olan kişiler kimler?' });
        list.push({ label: 'Yıl sonu öngörüsü', prompt: 'Gerçekleşen verilere göre yıl sonu iş yükü öngörüsü plana göre nasıl?' });
    }
    list.push({ label: 'Son 7 günde neler değişti?', prompt: 'Son 7 günde neler değişti? Kısaca özetle.' });
    return list.slice(0, 6);
};
