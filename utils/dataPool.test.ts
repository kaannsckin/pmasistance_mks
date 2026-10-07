import { describe, expect, it } from 'vitest';
import { Department, Person, TitleDef } from '../types';
import {
    draftToPerson, emptyPersonDraft, filterPeople, issueCounts, personIssues, personToDraft, rolesByDepartment, validateDepartmentCode, validatePerson,
    validateRole, validateTitleCode,
} from './dataPool';

const depts: Department[] = [{ code: 'U310', name: 'Yazılım' }, { code: 'U320', name: 'Altyapı' }];
const titles: TitleDef[] = [{ code: 'UZM', name: 'Uzman', monthlyCost: 100000 }, { code: 'ARŞ', name: 'Araştırmacı' }];
const people: Person[] = [
    { id: 'a', firstName: 'Ayşe', lastName: 'Yılmaz', sicil: '1001', email: 'ayse@kurum.gov.tr', departmentCode: 'U310', titleCode: 'UZM', availableAA: 1, roles: ['Test Mühendisi'] },
    { id: 'b', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U320', titleCode: 'ARŞ', availableAA: 0.5, roles: [] },
    { id: 'c', firstName: 'Can', lastName: 'Öz', departmentCode: '', availableAA: 1, roles: [], email: 'bozuk' },
];

describe('eksik bilgi ve süzme', () => {
    it('kişi eksikleri', () => {
        expect(personIssues(people[0], depts, titles)).toEqual([]);
        expect(personIssues(people[1], depts, titles)).toEqual(['cost', 'email']);
        expect(personIssues(people[2], depts, titles)).toEqual(['department', 'title', 'email']);
        expect(issueCounts(people, depts, titles)).toEqual({ department: 1, title: 1, cost: 1, email: 2, any: 2 });
    });

    it('arama (ad, sicil, rol), bölüm ve eksik süzgeci; ada göre sıralı', () => {
        expect(filterPeople(people, { query: 'test müh' }, depts, titles).map(p => p.id)).toEqual(['a']);
        expect(filterPeople(people, { query: '1001' }, depts, titles).map(p => p.id)).toEqual(['a']);
        expect(filterPeople(people, { department: 'U320' }, depts, titles).map(p => p.id)).toEqual(['b']);
        expect(filterPeople(people, { issue: 'any' }, depts, titles).map(p => p.id)).toEqual(['b', 'c']);
        expect(filterPeople(people, { issue: 'title' }, depts, titles).map(p => p.id)).toEqual(['c']);
        expect(filterPeople(people, {}, depts, titles).map(p => p.id)).toEqual(['b', 'a', 'c']);
    });
});

describe('doğrulama', () => {
    it('kişi: zorunlu alanlar, e-posta, AA, sicil çakışması; aynı ad uyarı', () => {
        expect(validatePerson(emptyPersonDraft(), people).errors).toContain('Ad ve soyad zorunludur.');
        const d = { ...emptyPersonDraft('U310'), firstName: 'Ayşe', lastName: 'Yılmaz', sicil: '1001', email: 'x', availableAA: 2 };
        const r = validatePerson(d, people);
        expect(r.errors).toEqual(['E-posta adresi geçersiz.', 'Kullanılabilir AA 0 ile 1,5 arasında olmalı.', '"1001" sicil numarası başka bir kişide kayıtlı.']);
        expect(r.warnings).toEqual(['Aynı adlı bir kişi havuzda var; sicil ile ayırt edin.']);
        expect(validatePerson(personToDraft(people[0]), people, 'a')).toEqual({ errors: [], warnings: [] });
    });

    it('taslak → kişi (kırpma, küçük harf e-posta, tekrarsız roller); kimlik korunur', () => {
        const p = draftToPerson({ ...personToDraft(people[0]), email: ' AYSE@Kurum.gov.tr ', roles: ['A', ' A', ''] }, people[0]);
        expect(p).toMatchObject({ id: 'a', email: 'ayse@kurum.gov.tr', roles: ['A'] });
        expect(draftToPerson({ ...emptyPersonDraft(), firstName: ' Yeni ', lastName: 'Kişi' }).id).toMatch(/^person-/);
    });

    it('bölüm, ünvan, rol', () => {
        expect(validateDepartmentCode('u310', depts)).toBe('"U310" bölüm kodu zaten var.');
        expect(validateDepartmentCode('U310', depts, 'U310')).toBeNull();
        expect(validateTitleCode('', titles)).toMatch(/zorunlu/);
        expect(validateTitleCode('arş', titles)).toBe('"ARŞ" ünvanı zaten var.');
        expect(validateRole('U310', 'test', [{ id: '1', departmentCode: 'U310', name: 'Test' }])).toMatch(/aynı rol/);
        expect(rolesByDepartment([{ id: '1', departmentCode: 'U320', name: 'B' }, { id: '2', departmentCode: 'U310', name: 'A' }], depts).map(g => g.name)).toEqual(['Yazılım', 'Altyapı']);
    });
});
