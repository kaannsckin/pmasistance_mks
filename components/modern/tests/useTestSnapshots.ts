import { useEffect, useRef } from 'react';
import { Project, TestBoardItem } from '../../../types';
import { fetchIntegrationHealth } from '../../../utils/integrations';
import { snapshotDue } from '../../../utils/testBoard';
import { fetchTestItems } from '../../../utils/testBoardFetch';

/**
 * Test panosunun haftalık görüntüsü: Cuma 20:00 (Türkiye) geçtiyse ve o
 * haftanın görüntüsü yoksa, uygulama açıkken (yoksa ilk açılışta) filtre
 * Jira'dan yeniden okunur ve görüntü saklanır. Aynı tarayıcıdaki sekmeler
 * yerel kilitle tek kez çalışır; görüntü proje kaydına yazıldığı için başka
 * kullanıcılar da aynı haftayı tekrar almaz.
 */

const lockKey = (projectId: string, week: string) => `pa-test-snapshot:${projectId}:${week}`;
const LOCK_MS = 15 * 60_000;

export const useTestSnapshots = (
    projects: () => Project[],
    apply: (projectId: string, items: TestBoardItem[], due: { week: string; late: boolean }) => void,
): void => {
    const running = useRef(false);
    const getRef = useRef(projects);
    const applyRef = useRef(apply);
    getRef.current = projects;
    applyRef.current = apply;

    useEffect(() => {
        const tick = async () => {
            if (running.current || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
            const now = new Date();
            const due = getRef.current().map(p => ({ p, d: snapshotDue(p.testBoard, now) })).filter(x => !!x.d);
            if (!due.length) return;
            running.current = true;
            try {
                const health = await fetchIntegrationHealth();
                if (!health.jira) return;
                for (const { p, d } of due) {
                    try {
                        const key = lockKey(p.id, d!.week);
                        const held = Number(localStorage.getItem(key) || 0);
                        if (held && Date.now() - held < LOCK_MS) continue;
                        localStorage.setItem(key, String(Date.now()));
                    } catch { /* depolama yok: kilitsiz devam */ }
                    try {
                        const r = await fetchTestItems(p.testBoard!.settings.filterId, health.authMode);
                        applyRef.current(p.id, r.items, { week: d!.week, late: d!.late });
                    } catch { /* sonraki turda yeniden denenir (kilit süresi dolunca) */ }
                }
            } catch { /* sağlık denetimi başarısız: sonraki tur */ } finally { running.current = false; }
        };
        const first = window.setTimeout(tick, 8_000);
        const id = window.setInterval(tick, 5 * 60_000);
        return () => { window.clearTimeout(first); window.clearInterval(id); };
    }, []);
};
