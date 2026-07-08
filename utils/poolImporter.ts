import { Allocation, Department, Person, Project, RoleCatalogEntry, TitleDef, WorkspaceData } from '../types';
import { createAllocationId } from './allocations';
import { createProject } from './workspace';

// XLSX, index.html'de CDN'den yüklenir (mevcut importer ile aynı yaklaşım)
declare const XLSX: any;

type SheetMatrix = (string | number | null | undefined)[][];
export type PoolSheets = Record<string, SheetMatrix>;

export interface ImportedAllocationRow {
    personName: string;
    sicil?: string;
    projectName: string;
    role?: string;
    workPackageName?: string;
    year: number;
    plan: Record<number, number>;
    actual: Record<number, number>;
}

export interface PoolImportResult {
    people: Person[];
    departments: Department[];
    roleCatalog: RoleCatalogEntry[];
    titles: TitleDef[];
    projects: { shortName: string; sapCode?: string; pmName?: string }[];
    workPackagesByProject: Record<string, string[]>;
    allocationRows: ImportedAllocationRow[];
    warnings: string[];
}

const MONTH_HEADERS = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

const cell = (row: SheetMatrix[number] | undefined, idx: number): string => {
    if (!row || idx < 0 || idx >= row.length) return '';
    const v = row[idx];
    return v === null || v === undefined ? '' : String(v).trim();
};

const num = (row: SheetMatrix[number] | undefined, idx: number): number => {
    if (!row || idx < 0 || idx >= row.length) return 0;
    const v = row[idx];
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const parsed = parseFloat(String(v).replace('%', '').replace(',', '.').trim());
    return isNaN(parsed) ? 0 : parsed;
};

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

const findHeaderRow = (sheet: SheetMatrix, mustInclude: string[]): number =>
    sheet.findIndex(row =>
        mustInclude.every(h => row?.some(c => typeof c === 'string' && trLower(String(c)).includes(trLower(h))))
    );

const headerIndex = (headers: string[], name: string): number =>
    headers.findIndex(h => trLower(h) === trLower(name));

const looksLikeTemplateName = (s: string): boolean => trLower(s).startsWith('yeni ad') || trLower(s).startsWith('yeni soyad');

const createPersonId = (): string => `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * U310 İşgücü Tahsisi Excel formatını (sayfa matrisleri halinde) ayrıştırır.
 * Sayfalar: Personel Listesi, Bölümler, Roller, Diğer Tablolar (ünvanlar),
 * Projeler, İş Paketleri, Veri Girişi. Eksik sayfalar atlanır.
 */
export const parsePoolSheets = (sheets: PoolSheets): PoolImportResult => {
    const warnings: string[] = [];
    const result: PoolImportResult = {
        people: [], departments: [], roleCatalog: [], titles: [],
        projects: [], workPackagesByProject: {}, allocationRows: [], warnings,
    };

    const getSheet = (name: string): SheetMatrix | null => {
        const keys = Object.keys(sheets);
        // Önce tam ad eşleşmesi ("Bölümler" ↔ "Bölümler AA" karışmasın), sonra içerme
        const exact = keys.find(k => trLower(k.trim()) === trLower(name));
        if (exact) return sheets[exact];
        const partial = keys.find(k => trLower(k).includes(trLower(name)));
        return partial ? sheets[partial] : null;
    };

    // ---- Personel Listesi ----
    const personnel = getSheet('Personel Listesi');
    if (personnel) {
        const hIdx = findHeaderRow(personnel, ['SİCİL', 'BÖLÜM']);
        if (hIdx === -1) {
            warnings.push('Personel Listesi: başlık satırı bulunamadı, sayfa atlandı.');
        } else {
            const headers = personnel[hIdx].map(h => String(h ?? '').trim());
            const col = {
                sicil: headerIndex(headers, 'SİCİL'),
                ad: headerIndex(headers, 'AD'),
                soyad: headerIndex(headers, 'SOYAD'),
                emy: headerIndex(headers, 'EMY'),
                bolum: headerIndex(headers, 'BÖLÜM'),
                unvan: headerIndex(headers, 'UNVAN'),
                aa: headers.findIndex(h => trLower(h).includes('kullanılabilir')),
                rolFirst: headers.findIndex(h => trLower(h).startsWith('rol-')),
            };
            for (let i = hIdx + 1; i < personnel.length; i++) {
                const row = personnel[i];
                const ad = cell(row, col.ad);
                const soyad = cell(row, col.soyad);
                if (!ad && !soyad) continue;
                if (looksLikeTemplateName(ad) || looksLikeTemplateName(soyad)) continue;
                const roles: string[] = [];
                if (col.rolFirst > -1) {
                    for (let r = col.rolFirst; r < Math.min(col.rolFirst + 10, row?.length || 0); r++) {
                        const roleName = cell(row, r);
                        if (roleName) {
                            // Aynı hücrede virgül/noktalı virgülle çoklu rol olabilir (Excel makrosuyla aynı kural)
                            roleName.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).forEach(x => {
                                if (!roles.includes(x)) roles.push(x);
                            });
                        }
                    }
                }
                const aaRaw = col.aa > -1 ? num(row, col.aa) : 1;
                result.people.push({
                    id: createPersonId(),
                    sicil: cell(row, col.sicil) || undefined,
                    firstName: ad,
                    lastName: soyad,
                    emy: cell(row, col.emy) || undefined,
                    departmentCode: cell(row, col.bolum) || 'Tanımsız',
                    titleCode: cell(row, col.unvan) || undefined,
                    availableAA: aaRaw > 0 ? aaRaw : 1,
                    roles,
                });
            }
        }
    }

    // ---- Bölümler ----
    const departments = getSheet('Bölümler');
    if (departments) {
        const hIdx = findHeaderRow(departments, ['Kodu']);
        if (hIdx > -1) {
            const headers = departments[hIdx].map(h => String(h ?? '').trim());
            const col = {
                kod: headerIndex(headers, 'Kodu'),
                ad: headerIndex(headers, 'Adı'),
                sorumlu: headers.findIndex(h => trLower(h).includes('sorumlu')),
            };
            for (let i = hIdx + 1; i < departments.length; i++) {
                const row = departments[i];
                const code = cell(row, col.kod);
                if (!code) continue;
                result.departments.push({
                    code,
                    name: cell(row, col.ad) || code,
                    leadName: cell(row, col.sorumlu) || undefined,
                });
            }
        }
    }

    // ---- Roller ----
    const roles = getSheet('Roller');
    if (roles) {
        const hIdx = findHeaderRow(roles, ['BÖLÜM', 'ROLLER']);
        if (hIdx > -1) {
            const headers = roles[hIdx].map(h => String(h ?? '').trim());
            const col = { bolum: headerIndex(headers, 'BÖLÜM'), rol: headerIndex(headers, 'ROLLER') };
            const seen = new Set<string>();
            for (let i = hIdx + 1; i < roles.length; i++) {
                const row = roles[i];
                const dept = cell(row, col.bolum);
                const roleName = cell(row, col.rol);
                if (!dept || !roleName) continue;
                const key = `${trLower(dept)}|${trLower(roleName)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                result.roleCatalog.push({ id: `rolecat-${i}-${Date.now().toString(36)}`, departmentCode: dept, name: roleName });
            }
        }
    }

    // ---- Diğer Tablolar → Ünvanlar ----
    const other = getSheet('Diğer Tablolar');
    if (other) {
        const hIdx = findHeaderRow(other, ['Kısaltma', 'Ünvan']);
        if (hIdx > -1) {
            const headers = other[hIdx].map(h => String(h ?? '').trim());
            const col = { kod: headerIndex(headers, 'Kısaltma'), ad: headerIndex(headers, 'Ünvan') };
            for (let i = hIdx + 1; i < other.length; i++) {
                const row = other[i];
                const code = cell(row, col.kod);
                const name = cell(row, col.ad);
                if (!code || !name) continue;
                result.titles.push({ code, name });
            }
        }
    }

    // ---- Projeler ----
    const projects = getSheet('Projeler');
    if (projects) {
        const hIdx = findHeaderRow(projects, ['Kısa Adı']);
        if (hIdx > -1) {
            const headers = projects[hIdx].map(h => String(h ?? '').trim());
            const col = {
                ad: headerIndex(headers, 'Kısa Adı'),
                sap: headers.findIndex(h => trLower(h).includes('sap')),
                py: headers.findIndex(h => trLower(h).includes('proje yöneticisi')),
            };
            for (let i = hIdx + 1; i < projects.length; i++) {
                const row = projects[i];
                const name = cell(row, col.ad);
                if (!name) continue;
                result.projects.push({
                    shortName: name,
                    sapCode: cell(row, col.sap) || undefined,
                    pmName: cell(row, col.py) || undefined,
                });
            }
        }
    }

    // ---- İş Paketleri (kolon başına bir proje) ----
    const wps = getSheet('İş Paketleri');
    if (wps && wps.length > 0) {
        const headerRow = wps[0] || [];
        for (let c = 0; c < headerRow.length; c++) {
            const projectName = cell(headerRow, c).replace(/^PROJE\s+/i, '').trim();
            if (!projectName) continue;
            const list: string[] = [];
            for (let r = 1; r < wps.length; r++) {
                const wp = cell(wps[r], c);
                if (wp && !list.includes(wp)) list.push(wp);
            }
            if (list.length) result.workPackagesByProject[projectName] = list;
        }
    }

    // ---- Veri Girişi → tahsis satırları ----
    const entry = getSheet('Veri Girişi');
    if (entry) {
        const hIdx = findHeaderRow(entry, ['PROJE', 'OCAK']);
        if (hIdx > -1) {
            const headers = entry[hIdx].map(h => String(h ?? '').trim());
            const col = {
                adSoyad: headers.findIndex(h => trLower(h).replace(/\s/g, '').includes('ad-soyad') || trLower(h) === 'ad soyad'),
                sicil: headerIndex(headers, 'SİCİL'),
                rol: headerIndex(headers, 'ROL'),
                proje: headerIndex(headers, 'PROJE'),
                isPaketi: headers.findIndex(h => trLower(h).includes('paket')),
                yil: headerIndex(headers, 'Yıl'),
            };
            const monthCols = MONTH_HEADERS.map(m => headerIndex(headers, m));
            const actualCols = MONTH_HEADERS.map(m => headerIndex(headers, `${m}.G`));

            for (let i = hIdx + 1; i < entry.length; i++) {
                const row = entry[i];
                const personName = cell(row, col.adSoyad);
                const projectName = cell(row, col.proje);
                if (!personName || !projectName) continue;
                const plan: Record<number, number> = {};
                const actual: Record<number, number> = {};
                MONTH_HEADERS.forEach((_, mIdx) => {
                    const p = num(row, monthCols[mIdx]);
                    const g = num(row, actualCols[mIdx]);
                    if (p > 0) plan[mIdx + 1] = p;
                    if (g > 0) actual[mIdx + 1] = g;
                });
                const yearRaw = num(row, col.yil);
                result.allocationRows.push({
                    personName,
                    sicil: cell(row, col.sicil) || undefined,
                    projectName,
                    role: cell(row, col.rol) || undefined,
                    workPackageName: col.isPaketi > -1 ? (cell(row, col.isPaketi) || undefined) : undefined,
                    year: yearRaw > 1900 ? Math.round(yearRaw) : new Date().getFullYear(),
                    plan,
                    actual,
                });
            }
        }
    }

    return result;
};

export interface PoolApplySummary {
    peopleAdded: number;
    peopleUpdated: number;
    departmentsAdded: number;
    rolesAdded: number;
    titlesAdded: number;
    projectsCreated: number;
    projectsMatched: number;
    workPackagesAdded: number;
    allocationsAdded: number;
    allocationsUpdated: number;
    warnings: string[];
}

/** İçe aktarılan havuz verisini mevcut çalışma alanıyla birleştirir (immutable). */
export const applyPoolImport = (ws: WorkspaceData, imported: PoolImportResult): { workspace: WorkspaceData; summary: PoolApplySummary } => {
    const summary: PoolApplySummary = {
        peopleAdded: 0, peopleUpdated: 0, departmentsAdded: 0, rolesAdded: 0, titlesAdded: 0,
        projectsCreated: 0, projectsMatched: 0, workPackagesAdded: 0,
        allocationsAdded: 0, allocationsUpdated: 0, warnings: [...imported.warnings],
    };

    // ---- Kişiler (sicil > ad-soyad eşleşmesi) ----
    const people = [...ws.people];
    const findPerson = (sicil: string | undefined, fullName: string): Person | undefined => {
        const bySicil = sicil ? people.find(p => p.sicil && p.sicil === sicil) : undefined;
        if (bySicil) return bySicil;
        const key = trLower(fullName).replace(/\s+/g, ' ');
        return people.find(p => trLower(`${p.firstName} ${p.lastName}`).replace(/\s+/g, ' ') === key);
    };
    imported.people.forEach(np => {
        const existing = findPerson(np.sicil, `${np.firstName} ${np.lastName}`);
        if (existing) {
            Object.assign(existing, { ...np, id: existing.id });
            summary.peopleUpdated++;
        } else {
            people.push(np);
            summary.peopleAdded++;
        }
    });

    // ---- Bölümler ----
    const departments = [...ws.departments];
    imported.departments.forEach(nd => {
        const existing = departments.find(d => trLower(d.code) === trLower(nd.code));
        if (existing) {
            existing.name = nd.name || existing.name;
            existing.leadName = nd.leadName ?? existing.leadName;
        } else {
            departments.push(nd);
            summary.departmentsAdded++;
        }
    });

    // ---- Rol kataloğu ----
    const roleCatalog = [...ws.roleCatalog];
    imported.roleCatalog.forEach(nr => {
        const exists = roleCatalog.some(r => trLower(r.departmentCode) === trLower(nr.departmentCode) && trLower(r.name) === trLower(nr.name));
        if (!exists) {
            roleCatalog.push(nr);
            summary.rolesAdded++;
        }
    });

    // ---- Ünvanlar ----
    const titles = [...ws.titles];
    imported.titles.forEach(nt => {
        if (!titles.some(t => trLower(t.code) === trLower(nt.code))) {
            titles.push(nt);
            summary.titlesAdded++;
        }
    });

    // ---- Projeler (ada veya SAP koduna göre eşle; yoksa oluştur) ----
    const projects: Project[] = ws.projects.map(p => ({ ...p, workPackages: [...p.workPackages] }));
    const findProject = (name: string, sap?: string): Project | undefined =>
        projects.find(p =>
            trLower(p.name) === trLower(name) ||
            (!!sap && !!p.code && trLower(p.code) === trLower(sap))
        );
    imported.projects.forEach(ip => {
        const existing = findProject(ip.shortName, ip.sapCode);
        if (existing) {
            summary.projectsMatched++;
            if (ip.sapCode && !existing.code) existing.code = ip.sapCode;
        } else {
            const created = createProject(ip.shortName, { code: ip.sapCode });
            projects.push(created);
            summary.projectsCreated++;
        }
    });

    // ---- İş paketleri (proje adı VEYA koduyla eşleşir) ----
    Object.entries(imported.workPackagesByProject).forEach(([projectName, wpNames]) => {
        const project = findProject(projectName, projectName);
        if (!project) {
            summary.warnings.push(`İş Paketleri: "${projectName}" ad/koduyla eşleşen proje bulunamadı, ${wpNames.length} İP atlandı.`);
            return;
        }
        wpNames.forEach(wpName => {
            if (!project.workPackages.some(wp => trLower(wp.name) === trLower(wpName))) {
                project.workPackages.push({ id: `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: wpName, description: '' });
                summary.workPackagesAdded++;
            }
        });
    });

    // ---- Tahsisler ----
    const allocations: Allocation[] = ws.allocations.map(a => ({ ...a, plan: { ...a.plan }, actual: { ...a.actual } }));
    imported.allocationRows.forEach(rowData => {
        const person = findPerson(rowData.sicil, rowData.personName);
        if (!person) {
            summary.warnings.push(`Veri Girişi: "${rowData.personName}" personel havuzunda bulunamadı, satır atlandı.`);
            return;
        }
        let project = findProject(rowData.projectName, rowData.projectName);
        if (!project) {
            // Tahsiste geçen proje havuzda yoksa otomatik oluştur — satır kaybolmasın
            project = createProject(rowData.projectName);
            projects.push(project);
            summary.projectsCreated++;
            summary.warnings.push(`Veri Girişi: "${rowData.projectName}" projesi havuzda yoktu, otomatik oluşturuldu.`);
        }
        const wp = rowData.workPackageName
            ? project.workPackages.find(w => trLower(w.name) === trLower(rowData.workPackageName!))
            : undefined;
        const existing = allocations.find(a =>
            a.personId === person.id && a.projectId === project.id && a.year === rowData.year &&
            (a.workPackageId || '') === (wp?.id || '') && (a.role || '') === (rowData.role || '')
        );
        if (existing) {
            existing.plan = { ...existing.plan, ...rowData.plan };
            existing.actual = { ...existing.actual, ...rowData.actual };
            summary.allocationsUpdated++;
        } else {
            allocations.push({
                id: createAllocationId(),
                personId: person.id,
                projectId: project.id,
                workPackageId: wp?.id,
                role: rowData.role,
                year: rowData.year,
                plan: rowData.plan,
                actual: rowData.actual,
            });
            summary.allocationsAdded++;
        }
    });

    return {
        workspace: { ...ws, people, departments, roleCatalog, titles, projects, allocations },
        summary,
    };
};

/** Tarayıcıda: File → sayfa matrisleri → parsePoolSheets */
export const parsePoolWorkbook = (file: File): Promise<PoolImportResult> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const workbook = XLSX.read(event.target?.result, { type: 'binary' });
                const sheets: PoolSheets = {};
                workbook.SheetNames.forEach((name: string) => {
                    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as SheetMatrix;
                });
                resolve(parsePoolSheets(sheets));
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        };
        reader.onerror = () => reject(new Error('Dosya okunamadı.'));
        reader.readAsBinaryString(file);
    });
