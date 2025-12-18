
import { Task, Resource, Sprint } from '../types';
import { calculatePertFuzzyPert } from './timeline';

// Make Papa and XLSX available from window object
declare const Papa: any;
declare const XLSX: any;

// Helper to trigger file download
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

// 1. Excel Export (General List)
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

    const resourceHeaders = ['Kaynak Adı', 'Katılım Yüzdesi', 'Birim'];
    const resourceData = resources.map(res => [res.name, res.participation, res.unit]);
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
    triggerDownload(blob, 'proje_plani.xlsx');
};

// 2. Sprint Plan Matrix Export (Visual Match)
export const exportSprintPlanToExcel = (sprints: Sprint[]) => {
    // Sürüm 0 (Backlog) dışındakileri al
    const activeSprints = sprints.filter(s => s.id > 0);
    const backlog = sprints.find(s => s.id === 0);
    
    // Matris hazırlığı
    // Sütunlar: Backlog | Sürüm 1 | Test | Sürüm 2 | Test ...
    const matrix: any[][] = [];
    
    // Başlık Satırı (Tarihler)
    const headerRow: string[] = ['Backlog'];
    activeSprints.forEach(s => {
        headerRow.push(`${s.startDate || ''} - ${s.endDate || ''}`);
        headerRow.push('Test ve Canlıya Alma');
    });
    matrix.push(headerRow);
    
    // Veri Satırları
    const maxTasks = Math.max(
        backlog?.tasks.length || 0,
        ...activeSprints.map(s => s.tasks.length)
    );
    
    for (let i = 0; i < maxTasks; i++) {
        const row: string[] = [];
        
        // Backlog hücresi
        row.push(backlog?.tasks[i] ? `${backlog.tasks[i].name} (${backlog.tasks[i].jiraId})` : '');
        
        // Sürüm ve Test hücreleri
        activeSprints.forEach(s => {
            // Sürüm görev hücresi
            row.push(s.tasks[i] ? `${s.tasks[i].name} (${s.tasks[i].jiraId})` : '');
            // Test hücresi (Boş kalacak ama sütun yapısını koruyacak)
            row.push('');
        });
        
        matrix.push(row);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    
    // Hücre Genişlikleri Ayarı
    ws['!cols'] = [
        { wch: 40 }, // Backlog
        ...activeSprints.flatMap(() => [
            { wch: 40 }, // Sürüm
            { wch: 15 }  // Test
        ])
    ];

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

// 3. Jira CSV Export
export const exportToJiraCsv = (tasks: Task[]) => {
    const jiraPriorityMap: Record<Task['priority'], string> = {
        'Blocker': 'Highest',
        'High': 'High',
        'Medium': 'Medium',
        'Low': 'Low',
    };

    const jiraData = tasks.map(task => ({
        'Issue Type': 'Task',
        'Summary': task.name,
        'Description': task.notes,
        'Assignee': task.resourceName === 'Atanmamış' ? '' : task.resourceName,
        'Reporter': '', 
        'Priority': jiraPriorityMap[task.priority],
        'Labels': task.labels?.join(' ') || '',
        'Component/s': task.unit,
        'Issue Key': task.jiraId 
    }));

    const csv = Papa.unparse(jiraData);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'jira_import.csv');
};

// 4. MS Project CSV Export
export const exportToMsProjectCsv = (tasks: Task[]) => {
    const taskIdMap = new Map(tasks.map((task, index) => [task.id, index + 1]));
    
    const projectData = tasks.map(task => {
        const { pert } = calculatePertFuzzyPert(task.time);
        const duration = pert > 0 ? `${pert.toFixed(2)} days` : '0 days';
        const predecessorId = task.predecessor ? taskIdMap.get(task.predecessor) : '';

        return {
            'ID': taskIdMap.get(task.id),
            'Task Name': task.name,
            'Duration': duration,
            'Predecessors': predecessorId,
            'Resource Names': task.resourceName
        };
    });

    const csv = Papa.unparse(projectData);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'ms_project_export.csv');
};
