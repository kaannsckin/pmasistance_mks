
import { Task, Resource, TaskStatus, WorkPackage, Objective } from './types';

export const TEST_DAYS = 4; // Her sprint için test günü
export const WORK_DAYS_PER_WEEK = 5;

export const INITIAL_OBJECTIVES: Objective[] = [
    {
        id: 'obj-1',
        name: 'Yeni Kullanıcı Arayüzünü Canlıya Almak',
        description: 'Uygulamanın son kullanıcı deneyimini iyileştirmek için modern ve hızlı bir arayüz sunmak.',
        quarter: 'Q4 2024',
        keyResults: [
            { id: 'kr-1-1', name: 'Giriş ve ana sayfa arayüzünü tamamlama' },
            { id: 'kr-1-2', name: 'Profil sayfası mobilde %99 çökmesiz çalışma oranı' },
        ]
    },
    {
        id: 'obj-2',
        name: 'Altyapı Performansını Artırmak',
        description: 'Sunucu yanıt sürelerini düşürmek ve sistem stabilitesini garanti altına almak.',
        quarter: 'Q4 2024',
        keyResults: [
            { id: 'kr-2-1', name: 'EMS1 sunucusunun stabilitesini sağlama' },
            { id: 'kr-2-2', name: 'Veritabanı sorgu optimizasyonu' }
        ]
    }
];

export const INITIAL_WORK_PACKAGES: WorkPackage[] = [
  { id: 'wp-1', name: 'Altyapı İyileştirmeleri', description: 'Sunucu ve sistem altyapısını etkileyen kritik hataların çözümü.' },
  { id: 'wp-2', name: 'Yeni Kullanıcı Arayüzü', description: 'Uygulamanın ön yüzünün modern teknolojilerle yeniden tasarlanması ve geliştirilmesi.' },
];

export const INITIAL_TASKS: Task[] = [
  {
    id: '1',
    name: 'MEB Canlı Ortamda Kümedeki EMS1 Sunucusunun Hizmet Veremiyor Duruma Gelmesi',
    availability: true,
    priority: 'Blocker',
    version: 3,
    predecessor: null,
    unit: 'EMS',
    resourceName: 'Kaan',
    time: { best: 3, avg: 7, worst: 10 },
    jiraId: 'MPS-4966',
    notes: 'Kayıtlı hata nedeniyle 16.10.2025 Tarihinde Hizmet kesintisi Yaşanmıştır',
    status: TaskStatus.InProgress,
    workPackageId: 'wp-1',
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtasks: [
      { text: 'Logları analiz et', completed: true },
      { text: 'Servisi yeniden başlat', completed: true },
      { text: 'Konfigürasyon dosyasını doğrula', completed: false },
    ],
    keyResultId: 'kr-2-1',
  },
  {
    id: '2',
    name: 'Kullanıcı Giriş Modülü Geliştirme',
    availability: true,
    priority: 'High',
    version: 1,
    predecessor: null,
    unit: 'Frontend',
    resourceName: 'Ayşe Yılmaz',
    time: { best: 5, avg: 8, worst: 15 },
    jiraId: 'PROJ-101',
    notes: 'OAuth 2.0 entegrasyonu yapılacak.',
    status: TaskStatus.InProgress,
    workPackageId: 'wp-2',
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtasks: [
      { text: 'UI Tasarımı', completed: true },
      { text: 'Backend entegrasyonu', completed: false },
    ],
    keyResultId: 'kr-1-1',
  },
  {
    id: '3',
    name: 'Veritabanı Şeması Tasarımı',
    availability: true,
    priority: 'High',
    version: 1,
    predecessor: null,
    unit: 'Backend',
    resourceName: 'Ali Veli',
    time: { best: 4, avg: 6, worst: 9 },
    jiraId: 'PROJ-102',
    notes: 'PostgreSQL kullanılacak, normalizasyon kurallarına dikkat edilmeli.',
    status: TaskStatus.ToDo,
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtasks: [
        { text: 'Tabloları oluştur', completed: false },
        { text: 'İlişkileri tanımla', completed: false },
    ],
    keyResultId: 'kr-2-2',
  },
  {
    id: '4',
    name: 'API Uç Noktalarının Oluşturulması',
    availability: false,
    priority: 'High',
    version: 2,
    predecessor: '3',
    unit: 'Backend',
    resourceName: 'Ali Veli',
    time: { best: 0, avg: 0, worst: 0 }, // Missing data
    jiraId: 'PROJ-103',
    notes: 'Kullanıcı, ürün ve sipariş endpointleri hazırlanacak.',
    status: TaskStatus.ToDo,
    keyResultId: 'kr-2-2',
  },
  {
    id: '5',
    name: 'Ön Yüz Arayüz Tasarımı',
    availability: false,
    priority: 'Medium',
    version: 2,
    predecessor: '2',
    unit: 'Frontend',
    resourceName: 'Ayşe Yılmaz',
    time: { best: 0, avg: 0, worst: 0 },
    jiraId: 'PROJ-104',
    notes: 'React ve Tailwind CSS kullanılacak.',
    status: TaskStatus.ToDo,
    workPackageId: 'wp-2',
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due soon
    keyResultId: 'kr-1-1',
  },
];

// Added missing 'title' property to satisfy the Resource interface requirements
export const INITIAL_RESOURCES: Resource[] = [
  { id: '1', name: 'Kaan', participation: 100, unit: 'EMS', title: 'EMS Uzmanı' },
  { id: '2', name: 'Ayşe Yılmaz', participation: 75, unit: 'Frontend', title: 'Frontend Geliştirici' },
  { id: '3', name: 'Ali Veli', participation: 50, unit: 'Backend', title: 'Backend Geliştirici' },
];

export const STATUS_STYLES: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'border-t-red-500',
    [TaskStatus.ToDo]: 'border-t-gray-400',
    [TaskStatus.InProgress]: 'border-t-blue-500',
    [TaskStatus.Done]: 'border-t-green-500',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog',
    [TaskStatus.ToDo]: 'Yapılacak',
    [TaskStatus.InProgress]: 'Süreçte',
    [TaskStatus.Done]: 'Tamamlandı',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: '#EF4444', // red-500
    [TaskStatus.ToDo]: '#6B7280',     // gray-500
    [TaskStatus.InProgress]: '#3B82F6', // blue-500
    [TaskStatus.Done]: '#22C55E',       // green-500
};
