
import { Task, Resource, Sprint } from '../types';
import { calculatePertFuzzyPert } from './timeline';

// Make Papa and XLSX available from window object
declare const Papa: any;
declare const XLSX: any;

const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

export const exportToExcel = (tasks: Task[], resources: Resource[]) => {
    const taskHeaders = [
        'Tasklar', 'Öncelik', 'SÜRÜM', 'Öncül', 'Birim', 'Kaynak Adı', 
        'Zaman', 'Jira Kayıt no', 'NOT', 'Durum', 'İş Paketi ID', 'Etiketler', 'Planlamaya Dahil'
    ];
    const taskData = tasks.map(task => [
        task.name,
        task.priority,
        task.version,
        task.predecessor || '',
        task.unit,
        task.resourceName,
        `${task.time.best},${task.time.avg},${task.time.worst}`,
        task.jiraId,
        task.notes,
        task.status,
        task.workPackageId || '',
        task.labels?.join(', ') || '',
        task.includeInSprints !== false ? 'Evet' : 'Hayır'
    ]);
    const taskSheet = XLSX.utils.aoa_to_sheet([taskHeaders, ...taskData]);

    const resourceHeaders = ['Kaynak Adı', 'Katılım Yüzdesi', 'Birim', 'Ünvan'];
    const resourceData = resources.map(res => [res.name, res.participation, res.unit, res.title]);
    const resourceSheet = XLSX.utils.aoa_to_sheet([resourceHeaders, ...resourceData]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, taskSheet, 'Görevler');
    XLSX.utils.book_append_sheet(wb, resourceSheet, 'Kaynaklar');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    const s2ab = (s: string) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    };
    
    const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
    triggerDownload(blob, 'proje_verileri_yedek.xlsx');
};

export const exportResourcePlanToExcel = (resources: Resource[]) => {
    const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const headers = ['İsim / Kategori', ...MONTHS];
    const matrix: any[][] = [headers];

    const grouped: Record<string, Resource[]> = {};
    resources.forEach(r => {
        const u = r.unit || 'Diğer';
        if (!grouped[u]) grouped[u] = [];
        grouped[u].push(r);
    });

    Object.entries(grouped).forEach(([unit, items]) => {
        // Kategori Başlığı ve Toplamı
        const unitRow = [unit];
        for (let m = 0; m < 12; m++) {
            const sum = items.reduce((acc, r) => acc + (r.monthlyPlan?.[m] || 0), 0);
            unitRow.push(`${sum}%`);
        }
        matrix.push(unitRow);

        // Kişiler
        items.forEach(r => {
            const row = [r.name];
            for (let m = 0; m < 12; m++) {
                row.push(`${r.monthlyPlan?.[m] || 0}%`);
            }
            matrix.push(row);
        });
    });

    // Genel Toplam Satırı
    const totalRow = ['TOPLAM'];
    for (let m = 0; m < 12; m++) {
        const total = resources.reduce((acc, r) => acc + (r.monthlyPlan?.[m] || 0), 0);
        totalRow.push(`${total}%`);
    }
    matrix.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ekip Planı');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    const s2ab = (s: string) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    };
    
    const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
    triggerDownload(blob, `ekip_is_yuku_plani_${new Date().getFullYear()}.xlsx`);
};

export const exportSprintPlanToExcel = (sprints: Sprint[]) => {
    const activeSprints = sprints.filter(s => s.id > 0);
    const backlog = sprints.find(s => s.id === 0);
    const matrix: any[][] = [];
    const headerRow: string[] = ['Backlog'];
    activeSprints.forEach(s => {
        headerRow.push(`${s.startDate || ''} - ${s.endDate || ''}`);
        headerRow.push('Test ve Canlıya Alma');
    });
    matrix.push(headerRow);
    const maxTasks = Math.max(backlog?.tasks.length || 0, ...activeSprints.map(s => s.tasks.length));
    for (let i = 0; i < maxTasks; i++) {
        const row: string[] = [];
        row.push(backlog?.tasks[i] ? `${backlog.tasks[i].name} (${backlog.tasks[i].jiraId})` : '');
        activeSprints.forEach(s => {
            row.push(s.tasks[i] ? `${s.tasks[i].name} (${s.tasks[i].jiraId})` : '');
            row.push('');
        });
        matrix.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    ws['!cols'] = [{ wch: 40 }, ...activeSprints.flatMap(() => [{ wch: 40 }, { wch: 15 }])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sürüm Planı');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    const s2ab = (s: string) => {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    };
    const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
    triggerDownload(blob, `surum_plani_${new Date().toISOString().slice(0,10)}.xlsx`);
};

export const exportToJiraCsv = (tasks: Task[]) => {
    const jiraPriorityMap: Record<Task['priority'], string> = {
        'Blocker': 'Highest', 'High': 'High', 'Medium': 'Medium', 'Low': 'Low',
    };
    const jiraData = tasks.map(task => ({
        'Issue Type': 'Task', 'Summary': task.name, 'Description': task.notes,
        'Assignee': task.resourceName === 'Atanmamış' ? '' : task.resourceName,
        'Priority': jiraPriorityMap[task.priority], 'Labels': task.labels?.join(' ') || '',
        'Component/s': task.unit, 'Issue Key': task.jiraId 
    }));
    const csv = Papa.unparse(jiraData);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'jira_import.csv');
};

export const exportToMsProjectCsv = (tasks: Task[]) => {
    const taskIdMap = new Map(tasks.map((task, index) => [task.id, index + 1]));
    const projectData = tasks.map(task => {
        const { pert } = calculatePertFuzzyPert(task.time);
        const duration = pert > 0 ? `${pert.toFixed(2)} days` : '0 days';
        const predecessorId = task.predecessor ? taskIdMap.get(task.predecessor) : '';
        return {
            'ID': taskIdMap.get(task.id), 'Task Name': task.name, 'Duration': duration,
            'Predecessors': predecessorId, 'Resource Names': task.resourceName
        };
    });
    const csv = Papa.unparse(projectData);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'ms_project_export.csv');
};
