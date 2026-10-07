declare const XLSX: any;
declare const Papa: any;

/** Excel/CSV dosyasını satır dizisine çevirir (ilk sayfa; başlık satırı dahil) */
export const readRows = (file: File): Promise<unknown[][]> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    const csv = file.name.toLowerCase().endsWith('.csv');
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onload = () => {
        try {
            if (csv) {
                if (typeof Papa === 'undefined') throw new Error('CSV kütüphanesi yüklenemedi.');
                resolve(Papa.parse(reader.result as string, { skipEmptyLines: true }).data);
            } else {
                if (typeof XLSX === 'undefined') throw new Error('Excel kütüphanesi yüklenemedi.');
                const wb = XLSX.read(reader.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            }
        } catch (e) {
            reject(e);
        }
    };
    if (csv) reader.readAsText(file); else reader.readAsBinaryString(file);
});
