
import { Task, Resource, TimeEstimate, TaskStatus } from '../types';
import { mapJiraIssueType, mapJiraPriority, mapJiraStatus, parseJiraDate, secondsToHours } from './planning/jiraFields';

// Make Papa and XLSX available from window object
declare const Papa: any;
declare const XLSX: any;

const parseTimeEstimate = (timeStr: string): TimeEstimate => {
    if (!timeStr || typeof timeStr !== 'string') return { best: 0, avg: 0, worst: 0 };
    const parts = timeStr.split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
        return { best: parts[0], avg: parts[1], worst: parts[2] };
    }
    return { best: 0, avg: 0, worst: 0 };
};

const mapPriority = (priorityStr: string): 'Blocker' | 'High' | 'Medium' | 'Low' => {
    const p = priorityStr?.toLowerCase() || '';
    if (p.includes('blocker')) return 'Blocker';
    if (p.includes('critical') || p.includes('high')) return 'High';
    if (p.includes('medium')) return 'Medium';
    return 'Low';
};

/** İçe aktarılan kayıtların açılış tarihi bilinmez: yaşam döngüsü bugünün tarihiyle uydurulmasın */
const markImported = (tasks: Task[], at: string = new Date().toISOString()): Task[] => tasks.map(t => (t.importedAt ? t : { ...t, importedAt: at }));

export const parseCustomCsv = (fileContent: string): { tasks: Task[], resources: Resource[] } => {
    // Handle BOM
    if (fileContent.charCodeAt(0) === 0xFEFF) {
        fileContent = fileContent.substring(1);
    }
    
    const result = Papa.parse(fileContent, {
        delimiter: ';',
        skipEmptyLines: true,
    });
    const data = result.data as string[][];

    if (!data || data.length < 2) {
        throw new Error('CSV dosyasında yeterli veri bulunamadı.');
    }

    const headerRowIndex = data.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim().toLocaleLowerCase('tr-TR') === 'tasklar'));
    if (headerRowIndex === -1) {
        throw new Error('CSV dosyasında "Tasklar" başlığı içeren satır bulunamadı.');
    }

    const headers = data[headerRowIndex].map(h => String(h).trim());
    const colMap = {
        name: headers.indexOf('Tasklar'),
        stakeholder: headers.indexOf('Paydaş'),
        topic: headers.indexOf('Konu'),
        unit: headers.indexOf('İş Paketi'),
        priority: headers.indexOf('Öncelik'),
        manDay: headers.indexOf('Adam/Gün Sayısı'),
    };

    if (colMap.name === -1 || colMap.priority === -1 || colMap.manDay === -1) {
        throw new Error('CSV dosyasında gerekli sütunlar (Tasklar, Öncelik, Adam/Gün Sayısı) bulunamadı.');
    }

    const mapPriorityFromScore = (scoreStr: string): 'Blocker' | 'High' | 'Medium' | 'Low' => {
        const score = parseInt(scoreStr, 10);
        if (isNaN(score)) return 'Medium';
        if (score >= 9) return 'Blocker';
        if (score >= 7) return 'High';
        if (score >= 4) return 'Medium';
        return 'Low';
    };

    const tasks: Task[] = [];

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (row.every(cell => !cell || cell.trim() === '')) continue;
        
        const taskName = (row[colMap.name] || '').trim();
        if (!taskName) continue;

        const manDayStr = (row[colMap.manDay] || '0').trim();
        const manDay = parseInt(manDayStr, 10);
        const timeValue = isNaN(manDay) ? 0 : manDay;

        const task: Task = {
            id: `csv-imported-${Date.now()}-${i}`,
            name: taskName,
            availability: timeValue > 0,
            priority: mapPriorityFromScore(row[colMap.priority]),
            version: 0,
            predecessor: null,
            unit: (row[colMap.unit] || 'Genel').trim(),
            resourceName: 'Atanmamış',
            time: { best: timeValue, avg: timeValue, worst: timeValue },
            jiraId: '',
            notes: `Paydaş: ${(row[colMap.stakeholder] || '').trim()}`,
            status: TaskStatus.Backlog,
            labels: [(row[colMap.topic] || '').trim()].filter(Boolean),
            includeInSprints: true,
        };
        tasks.push(task);
    }

    return { tasks: markImported(tasks), resources: [] };
};

export const parseJiraCsv = (fileContent: string): { tasks: Task[], resources: Resource[] } => {
    const result = Papa.parse(fileContent, {
        skipEmptyLines: true,
    });
    const data = result.data as string[][];

    if (!data || data.length < 2) {
        throw new Error('CSV dosyasında yeterli veri bulunamadı.');
    }

    const headers = data[0].map(h => h.trim());
    
    const issueKeyIndex = headers.indexOf('Issue key');
    const summaryIndex = headers.indexOf('Summary');
    const descriptionIndex = headers.indexOf('Description');
    const assigneeIndex = headers.indexOf('Assignee');
    const componentIndices = headers.map((h, i) => h === 'Component/s' ? i : -1).filter(i => i !== -1);
    const labelIndices = headers.map((h, i) => h === 'Labels' ? i : -1).filter(i => i !== -1);
    // Planlama ve AI tahmini için kayıt yaşam döngüsü alanları (yoksa atlanır)
    const col = (...names: string[]) => headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()));
    const typeIndex = col('Issue Type', 'Kayıt Türü', 'Konu Türü');
    const statusIndex = col('Status', 'Durum');
    const priorityIndex = col('Priority', 'Öncelik');
    const createdIndex = col('Created', 'Oluşturuldu', 'Oluşturma');
    const resolvedIndex = col('Resolved', 'Çözüldü', 'Çözüm Tarihi');
    const estimateIndex = col('Original Estimate', 'Orijinal Tahmin');
    const spentIndex = col('Time Spent', 'Harcanan Süre');
    const pointsIndex = col('Custom field (Story Points)', 'Story Points', 'Story point estimate', 'Custom field (Story point estimate)');
    const fixVersionIndex = col('Fix Version/s', 'Fix versions', 'Düzeltme Sürümü');
    const importedAt = new Date().toISOString();

    if (issueKeyIndex === -1 || (summaryIndex === -1 && descriptionIndex === -1)) {
        throw new Error('CSV dosyasında "Issue key" ve ("Summary" veya "Description") sütunlarından biri bulunamadı.');
    }

    const tasks: Task[] = [];
    const resourceMap = new Map<string, { unit: string }>();

    for (let i = 1; i < data.length; i++) {
        const row = data[i];

        const jiraId = (row[issueKeyIndex] || '').trim();
        const summary = (summaryIndex > -1 ? row[summaryIndex] || '' : '').trim();
        const description = (descriptionIndex > -1 ? row[descriptionIndex] || '' : '').trim();

        if (!jiraId && !summary && !description) continue;

        // Prioritize Summary for name. If not present, use truncated description. Fallback to Jira ID.
        const name = summary || (description.substring(0, 80) + (description.length > 80 ? '...' : '')) || jiraId;
        
        const assignee = (assigneeIndex > -1 ? (row[assigneeIndex] || 'Atanmamış') : 'Atanmamış').trim();
        
        let unit = 'Genel';
        for (const index of componentIndices) {
            if (row[index] && row[index].trim()) {
                unit = row[index].trim();
                break;
            }
        }
        
        const labels = labelIndices
            .map(index => (row[index] || '').trim())
            .filter(label => label)
            .flatMap(labelString => labelString.split(/\s+/).filter(Boolean));

        // Use Description for notes.
        const notes = description;

        const cell = (idx: number) => (idx > -1 ? (row[idx] || '').trim() : '');
        const createdAt = parseJiraDate(cell(createdIndex));
        const resolvedAt = parseJiraDate(cell(resolvedIndex));
        const status = statusIndex > -1 || resolvedAt ? mapJiraStatus(cell(statusIndex), resolvedAt) : TaskStatus.Backlog;
        const estimateHours = secondsToHours(cell(estimateIndex));
        const estimateDays = estimateHours ? Math.max(1, Math.round(estimateHours / 8)) : 0;
        const points = Number(cell(pointsIndex).replace(',', '.'));

        const task: Task = {
            id: `jira-imported-${Date.now()}-${i}`,
            name: name,
            jiraId: jiraId,
            notes: notes,
            labels: labels.length > 0 ? labels : undefined,
            resourceName: assignee,
            unit: unit,
            availability: estimateDays > 0,
            priority: priorityIndex > -1 ? mapJiraPriority(cell(priorityIndex)) : 'Medium',
            version: 0,
            predecessor: null,
            // Jira tek tahmin verir: aralık uydurulmaz (iyimser = olası = kötümser); belirsizlik geçmiş verilerden kalibre edilir
            time: { best: estimateDays, avg: estimateDays, worst: estimateDays },
            status,
            includeInSprints: status !== TaskStatus.Done, // kapanmış kayıtlar planlamaya girmez, geçmiş veri olarak kalır
            importedAt,
            ...(createdAt ? { createdAt } : {}),
            ...(status === TaskStatus.Done && resolvedAt ? { resolvedAt } : {}),
            ...(typeIndex > -1 && mapJiraIssueType(cell(typeIndex)) ? { issueType: mapJiraIssueType(cell(typeIndex)) } : {}),
            ...(estimateHours ? { originalEstimateHours: estimateHours, estimateSource: 'jira' as const } : {}),
            ...(secondsToHours(cell(spentIndex)) ? { actualHours: secondsToHours(cell(spentIndex)) } : {}),
            ...(Number.isFinite(points) && points > 0 ? { storyPoints: points } : {}),
            ...(cell(fixVersionIndex) ? { fixVersion: cell(fixVersionIndex) } : {}),
        };
        tasks.push(task);
        
        if (assignee !== 'Atanmamış' && !resourceMap.has(assignee)) {
            resourceMap.set(assignee, { unit: unit });
        }
    }
    
    // Added 'title' property to generated resource objects
    const resources: Resource[] = Array.from(resourceMap.entries()).map(([name, data], index) => ({
        id: `jira-res-imported-${Date.now()}-${index}`,
        name,
        unit: data.unit,
        participation: 100,
        title: 'Uzman',
    }));
    
    return { tasks, resources };
};


const processDataArray = (data: (string|number)[][]): { tasks: Task[], resources: Resource[] } => {
    const tasks: Task[] = [];
    const resourceMap = new Map<string, { unit: string }>();

    const headerRowIndex = data.findIndex(row => row.some(cell => typeof cell === 'string' && cell.includes('Tasklar')));
    if (headerRowIndex === -1) {
        throw new Error('Geçerli başlık satırı (Tasklar içeren) bulunamadı.');
    }

    const headers = data[headerRowIndex].map(h => String(h).trim());
    const colMap: { [key: string]: number } = {
        name: headers.indexOf('Tasklar'),
        priority: headers.indexOf('Öncelik'),
        version: headers.indexOf('SÜRÜM'),
        predecessor: headers.indexOf('Öncül'),
        unit: headers.indexOf('Birim'),
        resourceName: headers.indexOf('Kaynak Adı'),
        time: headers.indexOf('Zaman'),
        jiraId: headers.indexOf('Jira Kayıt no'),
        notes: headers.indexOf('NOT'),
    };
    
    if (colMap.name === -1) {
        throw new Error('"Tasklar" sütunu bulunamadı.');
    }

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        // Safely access cell data
        const getCell = (index: number): string => {
            if (index === -1 || !data[i] || index >= data[i].length) return '';
            return String(data[i][index] || '').trim();
        };

        const taskName = getCell(colMap.name);
        
        if (!taskName) continue;
        if (["İstekler Listesi", "HATALAR", "HATALAR (Genel)"].includes(taskName)) continue;

        const time = parseTimeEstimate(getCell(colMap.time));
        const resourceName = getCell(colMap.resourceName);
        const unit = getCell(colMap.unit);
        
        const versionRaw = getCell(colMap.version);
        // Safely use replace since getCell guarantees a string
        const versionStr = versionRaw.replace('+', '');
        const version = parseInt(versionStr, 10);
        const finalVersion = isNaN(version) ? 0 : version;
        
        const task: Task = {
            id: `imported-${Date.now()}-${Math.random()}`,
            name: taskName,
            availability: time.avg > 0,
            priority: mapPriority(getCell(colMap.priority)),
            version: finalVersion,
            predecessor: null,
            unit: unit || 'Atanmamış',
            resourceName: resourceName || 'Atanmamış',
            time: time,
            jiraId: getCell(colMap.jiraId) || '',
            notes: getCell(colMap.notes) || '',
            status: finalVersion === 0 ? TaskStatus.Backlog : TaskStatus.ToDo,
            includeInSprints: true, // Default set to true so they appear on the board
        };
        tasks.push(task);
        
        if (resourceName && resourceName !== 'Atanmamış' && !resourceMap.has(resourceName)) {
            resourceMap.set(resourceName, { unit: unit || 'Genel' });
        }
    }
    
    // Added 'title' property to generated resource objects
    const resources: Resource[] = Array.from(resourceMap.entries()).map(([name, data], index) => ({
        id: `imported-res-${Date.now()}-${index}`,
        name,
        unit: data.unit,
        participation: 100,
        title: 'Uzman',
    }));

    return { tasks: markImported(tasks), resources };
};

export const parseImportedFile = (file: File): Promise<{ tasks: Task[], resources: Resource[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const fileContent = event.target?.result;
        if (!fileContent) {
          throw new Error('Dosya içeriği okunamadı.');
        }

        let data: (string|number)[][];

        if (file.name.endsWith('.csv')) {
          const result = Papa.parse(fileContent as string, {
            delimiter: ';',
            skipEmptyLines: true,
          });
          data = result.data as string[][];
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(fileContent, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string|number)[][];
        } else {
          throw new Error('Desteklenmeyen dosya formatı. Lütfen .csv veya .xlsx dosyası yükleyin.');
        }

        resolve(processDataArray(data));

      } catch (error) {
        console.error("Dosya işlenirken hata oluştu:", error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    reader.onerror = () => {
      reject(new Error('Dosya okunurken bir hata oluştu.'));
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8');
    } else {
        reader.readAsBinaryString(file);
    }
  });
};
