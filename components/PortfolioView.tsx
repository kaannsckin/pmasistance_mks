import React, { useMemo, useState } from 'react';
import { Person, Project, ProjectStatus, RagStatus, TaskStatus } from '../types';
import { canAssignProjectOwner, canCreateProject, canEditProjectContent, Identity } from '../utils/rbac';

interface PortfolioViewProps {
  projects: Project[];
  activeProjectId: string | null;
  identity: Identity;
  people: Person[];
  needsPerson: boolean;
  onOpenProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onSetRag: (id: string, rag: RagStatus | undefined, note?: string) => void;
  onSetStatus: (id: string, status: ProjectStatus) => void;
  onSetOwner: (id: string, personId: string | undefined) => void;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  devam: 'Devam Eden',
  teklif: 'Teklif Aşaması',
  beklemede: 'Beklemede',
  tamamlandi: 'Tamamlandı',
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  devam: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  teklif: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
  beklemede: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  tamamlandi: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const RAG_COLORS: Record<RagStatus, string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

const RAG_LABELS: Record<RagStatus, string> = {
  green: 'Yolunda',
  amber: 'Riskli',
  red: 'Kritik',
};

const StatChip: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center space-x-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
      <i className={`fa-solid ${icon} text-xs`}></i>
    </div>
    <div className="flex flex-col leading-none">
      <span className="text-[11px] font-semibold text-gray-400 mb-1">{label}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-white">{value}</span>
    </div>
  </div>
);

const ProjectCard: React.FC<{
  project: Project;
  isActive: boolean;
  people: Person[];
  canEditContent: boolean;
  canManageOwner: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onSetRag: (rag: RagStatus | undefined, note?: string) => void;
  onSetStatus: (status: ProjectStatus) => void;
  onSetOwner: (personId: string | undefined) => void;
}> = ({ project, isActive, people, canEditContent, canManageOwner, onOpen, onDelete, onRename, onSetRag, onSetStatus, onSetOwner }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(project.name);
  const [ragNote, setRagNote] = useState(project.ragNote || '');

  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')),
    [people],
  );
  const owner = project.pmPersonId ? people.find(p => p.id === project.pmPersonId) : undefined;
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : undefined;

  const total = project.tasks.length;
  const done = project.tasks.filter(t => t.status === TaskStatus.Done).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const backlog = project.tasks.filter(t => t.version === 0 && t.status !== TaskStatus.Done).length;

  const saveName = () => {
    const name = tempName.trim();
    if (name && name !== project.name) onRename(name);
    setIsEditingName(false);
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm hover:shadow-xl transition-all p-5 flex flex-col ${isActive ? 'border-primary ring-2' : 'border-gray-100 dark:border-gray-700'}`}
         style={isActive ? { borderColor: 'var(--app-primary)', ['--tw-ring-color' as string]: 'var(--app-ring)' } : {}}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          {isEditingName ? (
            <input
              autoFocus
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setIsEditingName(false); }}
              className="w-full text-lg font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-gray-800 dark:text-white focus:outline-none"
            />
          ) : (
            <button onClick={onOpen} className="text-left w-full group" title="Projeyi aç">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white leading-tight truncate group-hover:text-primary transition-colors">
                {project.name}
              </h3>
            </button>
          )}
          <div className="flex items-center space-x-2 mt-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${STATUS_STYLES[project.status]}`}>
              {STATUS_LABELS[project.status]}
            </span>
            {project.rag && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: RAG_COLORS[project.rag] }}>
                {RAG_LABELS[project.rag]}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1 ml-2 flex-none">
          {canEditContent && (
            <button onClick={() => { setTempName(project.name); setIsEditingName(true); }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" title="Yeniden adlandır">
              <i className="fa-solid fa-pen text-xs"></i>
            </button>
          )}
          {canManageOwner && (
            <button onClick={() => { if (window.confirm(`"${project.name}" projesi ve tüm verileri silinecek. Emin misiniz?`)) onDelete(); }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Projeyi sil">
              <i className="fa-solid fa-trash text-xs"></i>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-[11px] font-semibold text-gray-400 flex-none"><i className="fa-solid fa-user-tie mr-1"></i>Proje Yön.</span>
        {canManageOwner ? (
          <select
            value={project.pmPersonId || ''}
            onChange={(e) => onSetOwner(e.target.value || undefined)}
            className="flex-1 min-w-0 text-[11px] font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300 focus:outline-none"
            title="Proje sahibini havuzdan ata (RBAC sahipliği)"
          >
            <option value="">Sahip atanmadı</option>
            {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
          </select>
        ) : (
          <span className={`text-[11px] font-semibold truncate ${ownerName ? 'text-gray-600 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
            {ownerName || 'Sahip atanmadı'}
          </span>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-gray-400">İlerleme</span>
          <span className="text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>%{progress}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, backgroundColor: 'var(--app-primary)' }}></div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { icon: 'fa-list-check', value: total, label: 'Görev' },
          { icon: 'fa-inbox', value: backlog, label: 'Backlog' },
          { icon: 'fa-users', value: project.resources.length, label: 'Kaynak' },
          { icon: 'fa-bullseye', value: project.objectives.length, label: 'Hedef' },
        ].map(({ icon, value, label }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-900/50 rounded-xl px-2 py-2 text-center">
            <i className={`fa-solid ${icon} text-xs text-gray-400 mb-1`}></i>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 leading-none">{value}</div>
            <div className="text-[10px] font-semibold text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-semibold text-gray-400">Haftalık Durum</span>
          <div className="flex items-center space-x-1">
            {(Object.keys(RAG_COLORS) as RagStatus[]).map(rag => (
              <button
                key={rag}
                disabled={!canEditContent}
                onClick={() => onSetRag(project.rag === rag ? undefined : rag, ragNote || undefined)}
                className={`w-4 h-4 rounded-full border-2 transition-all disabled:cursor-not-allowed ${project.rag === rag ? 'scale-110 border-gray-400 dark:border-white' : 'border-transparent opacity-40 hover:opacity-100 disabled:hover:opacity-40'}`}
                style={{ backgroundColor: RAG_COLORS[rag] }}
                title={canEditContent ? RAG_LABELS[rag] : 'Yalnızca proje sahibi düzenler'}
              />
            ))}
          </div>
        </div>
        <select
          value={project.status}
          disabled={!canEditContent}
          onChange={(e) => onSetStatus(e.target.value as ProjectStatus)}
          className="text-xs font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-500 dark:text-gray-300 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <input
        value={ragNote}
        disabled={!canEditContent}
        onChange={(e) => setRagNote(e.target.value)}
        onBlur={() => { if (ragNote !== (project.ragNote || '')) onSetRag(project.rag, ragNote); }}
        placeholder={canEditContent ? 'Haftalık durum notu (yönetim ekranında görünür)...' : 'Haftalık durum notu (salt-okunur)'}
        className="w-full text-[11px] bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-600 dark:text-gray-300 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:border-primary mb-4 disabled:opacity-70 disabled:cursor-not-allowed"
      />

      <div className="mt-auto flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-300 dark:text-gray-600">
          <i className="fa-solid fa-clock-rotate-left mr-1"></i>
          {new Date(project.updatedAt).toLocaleDateString('tr-TR')}
        </span>
        <button
          onClick={onOpen}
          className="text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md hover:opacity-90 transition-all"
          style={{ backgroundColor: 'var(--app-primary)' }}
        >
          Aç <i className="fa-solid fa-arrow-right ml-1"></i>
        </button>
      </div>
    </div>
  );
};

const PortfolioView: React.FC<PortfolioViewProps> = ({ projects, activeProjectId, identity, people, needsPerson, onOpenProject, onCreateProject, onDeleteProject, onRenameProject, onSetRag, onSetStatus, onSetOwner }) => {
  const [newName, setNewName] = useState('');

  const wsLike = useMemo(() => ({ people, projects, allocations: [] }), [people, projects]);
  const canCreate = canCreateProject(identity);

  const stats = useMemo(() => {
    const allTasks = projects.flatMap(p => p.tasks);
    const done = allTasks.filter(t => t.status === TaskStatus.Done).length;
    const uniqueResources = new Set(projects.flatMap(p => p.resources.map(r => r.name.toLocaleLowerCase('tr-TR')))).size;
    const atRisk = projects.filter(p => p.rag === 'red' || p.rag === 'amber').length;
    return {
      projectCount: projects.length,
      taskCount: allTasks.length,
      progress: allTasks.length > 0 ? Math.round((done / allTasks.length) * 100) : 0,
      uniqueResources,
      atRisk,
    };
  }, [projects]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewName('');
  };

  return (
    <div className="max-w-full mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white tracking-tight">Proje Portföyü</h2>
          <p className="text-gray-400 text-xs font-semibold tracking-[0.2em]">Çoklu Proje & Program Yönetimi</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatChip icon="fa-folder-open" label="Proje" value={String(stats.projectCount)} />
          <StatChip icon="fa-list-check" label="Toplam Görev" value={String(stats.taskCount)} />
          <StatChip icon="fa-chart-line" label="Tamamlanma" value={`%${stats.progress}`} />
          <StatChip icon="fa-users" label="Tekil Kaynak" value={String(stats.uniqueResources)} />
          <StatChip icon="fa-triangle-exclamation" label="Riskli Proje" value={String(stats.atRisk)} />
        </div>
      </div>

      {needsPerson && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-4 flex items-start gap-3">
          <i className="fa-solid fa-user-lock text-amber-500 mt-0.5"></i>
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Kapsam için kişi seçilmeli</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Bu rol (Proje Yöneticisi / Bölüm Sorumlusu) kişi bazlı çalışır. Üst menüden kimliğinizi (kişinizi) seçin;
              yalnızca sahip olduğunuz projeler ve bölümünüz kapsamı görünür.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {projects.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            isActive={p.id === activeProjectId}
            people={people}
            canEditContent={canEditProjectContent(wsLike, identity, p.id)}
            canManageOwner={canAssignProjectOwner(wsLike, identity, p.id)}
            onOpen={() => onOpenProject(p.id)}
            onDelete={() => onDeleteProject(p.id)}
            onRename={(name) => onRenameProject(p.id, name)}
            onSetRag={(rag, note) => onSetRag(p.id, rag, note)}
            onSetStatus={(status) => onSetStatus(p.id, status)}
            onSetOwner={(personId) => onSetOwner(p.id, personId)}
          />
        ))}

        {canCreate && (
          <div className="bg-white/50 dark:bg-gray-800/30 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-5 flex flex-col items-center justify-center min-h-[280px] hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className="fa-solid fa-plus"></i>
            </div>
            <p className="text-xs font-semibold text-gray-400 mb-3">Yeni Proje Ekle</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Proje adı..."
              className="w-full max-w-[220px] text-sm text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary mb-3"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="text-white text-xs font-semibold px-5 py-2 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-40"
              style={{ backgroundColor: 'var(--app-primary)' }}
            >
              Oluştur
            </button>
          </div>
        )}

        {projects.length === 0 && !canCreate && !needsPerson && (
          <div className="col-span-full text-center py-16 text-gray-400">
            <i className="fa-solid fa-folder-open text-3xl mb-3 opacity-40"></i>
            <p className="text-xs">Kapsamınızda görüntülenecek proje yok.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioView;
