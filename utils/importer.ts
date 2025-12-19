
import { Task, Resource, TimeEstimate, TaskStatus } from '../types';

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

        const task: Task = {
            id: `jira-imported-${Date.now()}-${i}`,
            name: name,
            jiraId: jiraId,
            notes: notes,
            labels: labels.length > 0 ? labels : undefined,
            resourceName: assignee,
            unit: unit,
            availability: false,
            priority: 'Medium',
            version: 0,
            predecessor: null,
            time: { best: 0, avg: 0, worst: 0 },
            status: TaskStatus.Backlog,
            includeInSprints: true, // Default set to true so they appear on the board
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

    return { tasks, resources };
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