import { Resource, Task } from '../types';

/**
 * İçe aktarılan görevleri projedeki görevlerle birleştirir (UI-KRC-18, UI-KRC-25).
 *
 * Uygulamanın kendi Excel / Jira CSV dışa aktarımı geri yüklenince her görev bir kez daha
 * ekleniyordu (100 → 200 → 300). Artık projede zaten olan görev eklenmez ve değiştirilmez:
 *  - Jira kayıt numarası olan görev, aynı numaralı görev varsa atlanır;
 *  - numarası olmayan görev, aynı adlı görev varsa atlanır.
 * Aynı dosyada iki kez geçen görev de bir kez eklenir. Var olan görev güncellenmez: dosyadan
 * türetilen durum (sürüm 0 → Bekleyen) gerçek durumu ezerdi.
 *
 * Kaynaklar (ekip) adla eşlenir; var olan kişi yeniden eklenmez.
 */

const norm = (s: string | undefined) => (s || '').trim().toLocaleLowerCase('tr-TR');

const taskKeys = (t: Task): string[] => {
    const keys = [`n:${norm(t.name)}`];
    if (norm(t.jiraId)) keys.push(`j:${norm(t.jiraId)}`);
    return keys;
};

export interface ImportMerge {
    tasks: Task[];
    resources: Resource[];
    /** Eklenmeyen (projede zaten olan ya da dosyada tekrarlanan) görev sayısı */
    skipped: number;
}

export const mergeImport = (existingTasks: Task[], existingResources: Resource[], importedTasks: Task[], importedResources: Resource[]): ImportMerge => {
    const seen = new Set(existingTasks.flatMap(taskKeys));
    const tasks: Task[] = [];
    let skipped = 0;
    for (const t of importedTasks) {
        const key = norm(t.jiraId) ? `j:${norm(t.jiraId)}` : `n:${norm(t.name)}`;
        if (!norm(t.name) || seen.has(key)) { skipped++; continue; }
        taskKeys(t).forEach(k => seen.add(k));
        tasks.push(t);
    }
    const names = new Set(existingResources.map(r => norm(r.name)));
    const resources = importedResources.filter(r => {
        const n = norm(r.name);
        if (!n || names.has(n)) return false;
        names.add(n);
        return true;
    });
    return { tasks, resources, skipped };
};

/** Kullanıcıya gösterilecek özet */
export const importSummary = (added: number, skipped: number): string => {
    if (added === 0 && skipped === 0) return 'Dosyada içe aktarılacak görev bulunamadı.';
    if (added === 0) return `Yeni görev yok: dosyadaki ${skipped} görev bu projede zaten var; değiştirilmedi.`;
    return `${added} yeni görev eklendi.${skipped ? ` ${skipped} görev projede zaten vardı; eklenmedi, değiştirilmedi.` : ''}`;
};
