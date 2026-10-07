import { IconName } from './icons';

/** Yönetici konsolunun bölümleri (kenar çubuğu ve konsol ekranı ortak kullanır) */
export type AdminSection = 'permissions' | 'views' | 'report' | 'health' | 'ai' | 'profiles' | 'audit' | 'app';

export const ADMIN_SECTIONS: { key: AdminSection; label: string; icon: IconName; description: string }[] = [
    { key: 'permissions', label: 'Yetkiler', icon: 'key', description: 'Rollerin hangi özellikleri kullanacağı' },
    { key: 'views', label: 'Görünüm ve filtreler', icon: 'eye', description: 'Rol bazında sekmeler, kartlar, kayıt süzgeçleri ve sıralamalar' },
    { key: 'report', label: 'Haftalık rapor akışı', icon: 'report', description: 'Onay adımları ve gönderim kuralları' },
    { key: 'health', label: 'Sağlık puanı', icon: 'gauge', description: 'Girdi ağırlıkları ve bant eşikleri' },
    { key: 'ai', label: 'Yapay zekâ', icon: 'sparkles', description: 'Kurum geneli AI kullanımı, özellikler ve puanlamada halüsinasyon güvenceleri' },
    { key: 'profiles', label: 'Profiller', icon: 'users', description: 'Profil değiştirme penceresindeki kişi ↔ rol eşleşmeleri' },
    { key: 'audit', label: 'Denetim günlüğü', icon: 'history', description: 'Kim, ne zaman, ne yaptı' },
    { key: 'app', label: 'Uygulama', icon: 'database', description: 'Yedek, veri sağlığı ve bulut eşitleme' },
];
