
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Note, Resource } from '../types';
import RemindersModal from './RemindersModal';
import TagEditModal from './TagEditModal';
import ToDosModal from './ToDosModal';
import NotesHelpModal from './NotesHelpModal';

interface NotesViewProps {
  notes: Note[];
  resources: Resource[];
  tagColors: Record<string, string>;
  setTagColors: (colors: Record<string, string>) => void;
  onAddNote: (note: Note) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
}

const getWeekNumber = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const PREDEFINED_TAGS = ['Toplantı', 'Karar', 'Risk', 'Fikir', 'Acil', 'anımsatıcı', 'todo'];

const parseContent = (content: string) => {
  const tags = (content.match(/#[\w-ğüşöçİĞÜŞÖÇı]+/g) || []).map(t => t.substring(1));
  const mentions = (content.match(/@[\w\sğüşöçİĞÜŞÖÇı]+/g) || []).map(m => m.substring(1));
  return { tags, mentions };
};

const NotesView: React.FC<NotesViewProps> = ({ notes, resources, tagColors, setTagColors, onAddNote, onEditNote, onDeleteNote }) => {
  const [inputValue, setInputValue] = useState('');
  const [creationDate, setCreationDate] = useState(new Date().toISOString().split('T')[0]);
  const [suggestionType, setSuggestionType] = useState<'mention' | 'tag' | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [activeTextArea, setActiveTextArea] = useState<'main' | 'edit' | 'lineText' | 'lineUpdate'>('main');
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [tempLineText, setTempLineText] = useState('');
  const [tempUpdateText, setTempUpdateText] = useState('');
  const lineTextRef = useRef<HTMLTextAreaElement>(null);
  const lineUpdateRef = useRef<HTMLTextAreaElement>(null);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [isToDosOpen, setIsToDosOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Collapsed state logic: Record<DateKey, boolean>. True means collapsed (hidden).
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  const allUsedTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_TAGS);
    notes.forEach(note => note.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [notes]);

  const reminderLines = useMemo(() => {
    const reminders: { noteId: string; content: string; date: string }[] = [];
    notes.forEach(note => {
      const lines = (note.content || '').split('\n');
      lines.forEach(line => {
        if (line.toLocaleLowerCase('tr-TR').includes('#anımsatıcı')) {
          reminders.push({ noteId: note.id, content: line.replace('#anımsatıcı', '').trim(), date: note.createdAt });
        }
      });
    });
    return reminders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [notes]);

  const todoLines = useMemo(() => {
    const todos: { noteId: string; content: string; date: string; completed: boolean; lineIndex: number }[] = [];
    notes.forEach(note => {
      const lines = (note.content || '').split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('[ ]') || line.includes('[x]')) {
          todos.push({
            noteId: note.id,
            content: line.replace(/\[\s?x?\]/g, '').trim(),
            date: note.createdAt,
            completed: line.includes('[x]'),
            lineIndex: idx
          });
        }
      });
    });
    return todos;
  }, [notes]);

  const groupedNotes = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    const filteredNotes = activeTagFilter 
        ? notes.filter(n => n.tags.some(t => t.toLocaleLowerCase('tr-TR') === activeTagFilter.toLocaleLowerCase('tr-TR')))
        : notes;

    filteredNotes.forEach(note => {
      const dateKey = new Date(note.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(note);
    });

    const sortedGroups = Object.entries(grouped).sort((a, b) => {
        return new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime();
    });

    return sortedGroups;
  }, [notes, activeTagFilter]);

  // Initial collapse state: Expand only the first (most recent) date group
  useEffect(() => {
      if (groupedNotes.length > 0 && Object.keys(collapsedDates).length === 0) {
          const initialCollapsed: Record<string, boolean> = {};
          groupedNotes.forEach((group, index) => {
              // Index 0 is most recent -> Open (false). Others -> Collapsed (true)
              initialCollapsed[group[0]] = index !== 0;
          });
          setCollapsedDates(initialCollapsed);
      }
  }, [groupedNotes.length]); // Only run when list length changes significantly or init

  const toggleDateCollapse = (dateKey: string) => {
      setCollapsedDates(prev => ({
          ...prev,
          [dateKey]: !prev[dateKey]
      }));
  };

  const expandAll = () => {
      const allOpen: Record<string, boolean> = {};
      groupedNotes.forEach(([key]) => allOpen[key] = false);
      setCollapsedDates(allOpen);
  };

  const collapseAll = () => {
      const allClosed: Record<string, boolean> = {};
      groupedNotes.forEach(([key]) => allClosed[key] = true);
      setCollapsedDates(allClosed);
  };

  const checkSuggestions = (value: string, cursor: number) => {
    const lastAt = value.lastIndexOf('@', cursor - 1);
    const lastHash = value.lastIndexOf('#', cursor - 1);
    const lastSpace = value.lastIndexOf(' ', cursor - 1);

    if (lastAt > lastSpace && lastAt !== -1) {
        setSuggestionType('mention');
        setSuggestionQuery(value.substring(lastAt + 1, cursor));
    } else if (lastHash > lastSpace && lastHash !== -1) {
        setSuggestionType('tag');
        setSuggestionQuery(value.substring(lastHash + 1, cursor));
    } else {
        setSuggestionType(null);
    }
  };

  const getTargetProps = () => {
    switch (activeTextArea) {
        case 'edit': return { value: editInputValue, setter: setEditInputValue, ref: editTextAreaRef };
        case 'lineText': return { value: tempLineText, setter: setTempLineText, ref: lineTextRef };
        case 'lineUpdate': return { value: tempUpdateText, setter: setTempUpdateText, ref: lineUpdateRef };
        default: return { value: inputValue, setter: setInputValue, ref: textareaRef };
    }
  };

  const applyFormatting = (prefix: string, suffix: string) => {
      const { value, setter, ref } = getTargetProps();
      if (!ref.current) return;

      const start = ref.current.selectionStart;
      const end = ref.current.selectionEnd;
      const selectedText = value.substring(start, end);
      const newVal = value.substring(0, start) + prefix + selectedText + suffix + value.substring(end);
      
      setter(newVal);

      setTimeout(() => {
          if (ref.current) {
              ref.current.focus();
              ref.current.setSelectionRange(start + prefix.length, end + prefix.length);
          }
      }, 0);
  };

  const insertSuggestion = (text: string) => {
    const { value, setter, ref } = getTargetProps();
    if (!ref.current) return;

    const trigger = suggestionType === 'mention' ? '@' : '#';
    const currentCursor = ref.current.selectionStart;
    const lastTriggerIndex = value.lastIndexOf(trigger, currentCursor - 1);
    const newValue = value.substring(0, lastTriggerIndex) + trigger + text + " " + value.substring(currentCursor);
    
    setter(newValue);
    setSuggestionType(null);
    ref.current.focus();
  };

  const toggleTodo = (noteId: string, lineIndex: number) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const lines = note.content.split('\n');
    const line = lines[lineIndex];
    if (line.includes('[ ]')) lines[lineIndex] = line.replace('[ ]', '[x]');
    else if (line.includes('[x]')) lines[lineIndex] = line.replace('[x]', '[ ]');
    const newContent = lines.join('\n');
    onEditNote({ ...note, content: newContent, ...parseContent(newContent) });
  };

  const toggleLineExpansion = (noteId: string, lineIdx: number, currentText: string, currentUpdate: string) => {
    const compositeId = `${noteId}-${lineIdx}`;
    if (expandedLineId === compositeId) {
        setExpandedLineId(null);
    } else {
        setExpandedLineId(compositeId);
        setTempLineText(currentText);
        setTempUpdateText(currentUpdate);
        setActiveTextArea('lineText');
    }
  };

  const handleSaveInlineChanges = (noteId: string, lineIdx: number) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
        const lines = note.content.split('\n');
        lines[lineIdx] = tempLineText;
        const newContent = lines.join('\n');
        const updatedLineUpdates = { ...(note.lineUpdates || {}), [lineIdx]: tempUpdateText };
        onEditNote({ ...note, content: newContent, ...parseContent(newContent), lineUpdates: updatedLineUpdates });
    }
    setExpandedLineId(null);
  };

  const handleAddNote = () => {
    if (!inputValue.trim()) return;
    const selectedDate = new Date(creationDate);
    // Add 12 hours to avoid timezone shifting the day back
    const normalizedDate = new Date(selectedDate.getTime() + (12 * 60 * 60 * 1000));
    const newNote: Note = {
      id: Date.now().toString(),
      content: inputValue,
      createdAt: normalizedDate.toISOString(),
      weekNumber: getWeekNumber(normalizedDate),
      year: normalizedDate.getFullYear(),
      ...parseContent(inputValue)
    };
    onAddNote(newNote);
    setInputValue('');
    // Automatically expand the date we just added to
    const dateKey = normalizedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    setCollapsedDates(prev => ({...prev, [dateKey]: false}));
  };

  const FormattingToolbar = () => (
      <div className="flex flex-wrap items-center space-x-1 p-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 backdrop-blur-sm sticky top-0 z-10">
          <button onClick={() => applyFormatting('**', '**')} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all text-xs font-black shadow-sm" title="Kalın"><i className="fa-solid fa-bold"></i></button>
          <button onClick={() => applyFormatting('*', '*')} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all text-xs italic shadow-sm" title="İtalik"><i className="fa-solid fa-italic"></i></button>
          <button onClick={() => applyFormatting('==', '==')} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all text-xs text-yellow-600 shadow-sm" title="Vurgula"><i className="fa-solid fa-highlighter"></i></button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1"></div>
          <button onClick={() => applyFormatting('[ ] ', '')} className="px-3 py-1.5 hover:bg-emerald-500 hover:text-white rounded-lg transition-all text-[10px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 dark:bg-emerald-950/20" title="ToDo Ekle">ToDo</button>
          <button onClick={() => applyFormatting('#anımsatıcı ', '')} className="px-3 py-1.5 hover:bg-amber-500 hover:text-white rounded-lg transition-all text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 dark:bg-amber-950/20 ml-1" title="Anımsatıcı Ekle">Anımsatıcı</button>
      </div>
  );

  const SuggestionDropdown = () => (
    <div className="absolute z-[100] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden w-64 mt-1 animate-fade-in-up">
        <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b dark:border-gray-800">
            {suggestionType === 'mention' ? 'EKİP ÜYELERİ' : 'ETİKETLER'}
        </div>
        <ul className="max-h-64 overflow-y-auto custom-scrollbar">
            {suggestionType === 'mention' && resources.filter(r => r.name.toLocaleLowerCase('tr-TR').includes(suggestionQuery.toLocaleLowerCase('tr-TR'))).map(r => (
                <li key={r.id} onClick={() => insertSuggestion(r.name.replace(/\s/g, ''))} className="px-4 py-3 hover:bg-accent dark:hover:bg-gray-700 cursor-pointer flex items-center space-x-3 text-xs text-gray-700 dark:text-gray-200 border-b last:border-0 dark:border-gray-700/50 transition-colors">
                    <span className="w-6 h-6 rounded-lg bg-primary text-white flex items-center justify-center text-[10px] font-black shadow-sm">{r.name.charAt(0)}</span>
                    <span className="font-bold">{r.name}</span>
                </li>
            ))}
            {suggestionType === 'tag' && allUsedTags.filter(t => t.toLocaleLowerCase('tr-TR').includes(suggestionQuery.toLocaleLowerCase('tr-TR'))).map(t => (
                <li key={t} onClick={() => insertSuggestion(t)} className="px-4 py-3 hover:bg-purple-50 dark:hover:bg-gray-700 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-200 border-b last:border-0 dark:border-gray-700/50 transition-colors"># {t}</li>
            ))}
        </ul>
    </div>
  );

  const renderRichText = (text: string, noteId: string, lineUpdates?: Record<number, string>) => {
    const lines = (text || '').split('\n');
    return lines.map((line, lineIdx) => {
      if (!line.trim() && lineIdx !== lines.length - 1) return null;

      const { tags } = parseContent(line);
      const isCompleted = line.trim().startsWith('[x]');
      
      const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|==.*?==|\^.*?\^|\[\s?\]|\[x\]|\[c:[^\]]+\]|\[\/c\]|#[\w-ğüşöçİĞÜŞÖÇı]+|@[\w\sğüşöçİĞÜŞÖÇı]+)/g);
      
      const compositeId = `${noteId}-${lineIdx}`;
      const isExpanded = expandedLineId === compositeId;
      const hasUpdate = lineUpdates && lineUpdates[lineIdx];
      let currentColor = '';

      return (
        <div key={lineIdx} className="mb-1">
            <div 
                className={`group/line relative min-h-[1.5em] flex items-start p-2 rounded-xl transition-all cursor-text ${
                    isExpanded 
                        ? 'bg-accent/50 dark:bg-primary/10 ring-1 ring-primary/20' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
            >
                <div 
                    className={`flex-grow flex flex-wrap text-sm leading-relaxed transition-all duration-300 ${
                        isCompleted ? 'text-gray-400 line-through decoration-2 decoration-gray-300/50 dark:decoration-gray-600 opacity-70' : 'text-gray-800 dark:text-gray-200'
                    }`}
                    onClick={() => { setEditingNoteId(noteId); setEditInputValue(text); setActiveTextArea('edit'); }}
                >
                    {parts.map((part, i) => {
                        if (!part) return null;
                        if (part === '[ ]') return <i key={i} onClick={(e) => { e.stopPropagation(); toggleTodo(noteId, lineIdx); }} className="fa-regular fa-square mr-3 mt-1 text-gray-300 hover:text-emerald-500 transition-colors cursor-pointer no-underline opacity-100 inline-block"></i>;
                        if (part === '[x]') return <i key={i} onClick={(e) => { e.stopPropagation(); toggleTodo(noteId, lineIdx); }} className="fa-solid fa-square-check mr-3 mt-1 text-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer no-underline opacity-100 inline-block"></i>;
                        if (part.startsWith('[c:')) { currentColor = part.slice(3, -1); return null; }
                        if (part === '[/c]') { currentColor = ''; return null; }
                        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-black" style={currentColor ? { color: currentColor } : {}}>{part.slice(2, -2)}</strong>;
                        if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic opacity-90" style={currentColor ? { color: currentColor } : {}}>{part.slice(1, -1)}</em>;
                        if (part.startsWith('==') && part.endsWith('==')) return <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/40 text-yellow-900 dark:text-yellow-100 px-1.5 py-0.5 mx-0.5 rounded-md font-medium box-decoration-clone shadow-sm no-underline inline-block">{part.slice(2, -2)}</mark>;
                        if (part.startsWith('#')) {
                            const tag = part.substring(1);
                            const tagColor = tagColors[tag];
                            return <span key={i} className="font-black px-1.5 py-0.5 rounded-lg cursor-pointer hover:opacity-80 transition-all text-[10px] uppercase tracking-tighter mx-0.5 no-underline inline-block" style={tagColor ? { color: tagColor, backgroundColor: `${tagColor}15`, border: `1px solid ${tagColor}30` } : { backgroundColor: 'rgba(0,0,0,0.05)' }} onClick={(e) => { e.stopPropagation(); setActiveTagFilter(tag); }}>{part}</span>;
                        }
                        if (part.startsWith('@')) return <span key={i} className="text-primary font-black bg-accent dark:bg-primary/20 px-1.5 py-0.5 rounded-lg text-[10px] uppercase tracking-tighter mx-0.5 no-underline inline-block">{part}</span>;
                        return <span key={i} style={currentColor ? { color: currentColor } : {}}>{part}</span>;
                    })}
                </div>

                <button 
                    onClick={(e) => { e.stopPropagation(); toggleLineExpansion(noteId, lineIdx, line, lineUpdates?.[lineIdx] || ''); }}
                    className={`flex-none ml-2 transition-all p-1.5 rounded-lg ${isExpanded || hasUpdate ? 'text-amber-500 opacity-100' : 'text-gray-200 opacity-0 group-hover/line:opacity-100'}`}
                >
                    <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : hasUpdate ? 'fa-note-sticky' : 'fa-sticky-note'} text-[10px]`}></i>
                </button>
            </div>

            {isExpanded && (
                <div className="my-4 p-5 bg-white dark:bg-gray-800 border border-primary/30 rounded-3xl shadow-2xl space-y-4 animate-fade-in-up">
                    <FormattingToolbar />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-primary uppercase tracking-widest pl-2">GÜNCEL SATIR</label>
                            <textarea 
                                ref={lineTextRef} value={tempLineText} onFocus={() => setActiveTextArea('lineText')}
                                onChange={(e) => { setTempLineText(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-xs focus:ring-2 focus:ring-primary outline-none resize-none" rows={3}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest pl-2">GELİŞME NOTU</label>
                            <textarea 
                                ref={lineUpdateRef} value={tempUpdateText} onFocus={() => setActiveTextArea('lineUpdate')}
                                onChange={(e) => { setTempUpdateText(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }}
                                placeholder="Buraya kısa bir ilerleme notu düşebilirsiniz..."
                                className="w-full bg-amber-50/30 dark:bg-amber-900/10 border border-amber-200/50 rounded-2xl p-4 text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none italic text-amber-900 dark:text-amber-200" rows={3}
                            />
                        </div>
                        {suggestionType && (activeTextArea === 'lineText' || activeTextArea === 'lineUpdate') && <SuggestionDropdown />}
                    </div>
                    <div className="flex justify-end items-center space-x-3 pt-2">
                        <button onClick={() => setExpandedLineId(null)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">İptal</button>
                        <button onClick={() => handleSaveInlineChanges(noteId, lineIdx)} className="bg-primary hover:opacity-90 text-white px-6 py-2.5 rounded-xl text-[10px] font-black shadow-lg transition-all uppercase tracking-widest">GÜNCELLE</button>
                    </div>
                </div>
            )}

            {!isExpanded && hasUpdate && (
                <div className="ml-10 mb-4 p-3 bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-amber-500/50 text-[11px] text-amber-800 dark:text-amber-400 italic rounded-r-2xl flex items-start shadow-sm">
                    <i className="fa-solid fa-reply fa-rotate-180 mr-3 mt-1.5 opacity-40 text-[9px]"></i>
                    <span className="leading-relaxed">{lineUpdates[lineIdx]}</span>
                </div>
            )}
        </div>
      );
    });
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 pb-24 px-4">
      {/* Sidebar - Navigation Style */}
      <aside className="w-full lg:w-72 flex-shrink-0 space-y-6 order-2 lg:order-1">
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm sticky top-24">
              <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6 flex items-center">
                  <i className="fa-solid fa-compass mr-3 text-primary" style={{ color: 'var(--app-primary)' }}></i> NAVİGASYON
              </h3>
              
              <div className="space-y-2 mb-8">
                  <button onClick={() => setActiveTagFilter(null)} className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-tighter transition-all flex items-center justify-between ${activeTagFilter === null ? 'bg-primary text-white shadow-lg' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100'}`} style={activeTagFilter === null ? { backgroundColor: 'var(--app-primary)' } : {}}>
                      TÜM KAYITLAR
                      <i className="fa-solid fa-list-ul opacity-40"></i>
                  </button>
                  <button onClick={() => setIsToDosOpen(true)} className="w-full text-left px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-tighter text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all flex items-center justify-between border border-emerald-100 dark:border-emerald-900/50">
                      YAPILACAKLAR
                      <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-700 px-2 py-0.5 rounded-lg text-[10px]">{todoLines.filter(t=>!t.completed).length}</span>
                  </button>
                  <button onClick={() => setIsRemindersOpen(true)} className="w-full text-left px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-tighter text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all flex items-center justify-between border border-amber-100 dark:border-amber-900/50">
                      ANIMSATICILAR
                      <span className="bg-amber-100 dark:bg-amber-900 text-amber-700 px-2 py-0.5 rounded-lg text-[10px]">{reminderLines.length}</span>
                  </button>
              </div>

              <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center">
                  <i className="fa-solid fa-hashtag mr-3 text-purple-500"></i> ETİKETLER
              </h3>
              <div className="grid grid-cols-1 gap-1">
                  {allUsedTags.map(tag => {
                      const tagColor = tagColors[tag] || 'var(--app-primary)';
                      const isActive = activeTagFilter === tag;
                      return (
                        <div key={tag} className="flex items-center group relative">
                            <input 
                                type="color" 
                                value={tagColors[tag] || '#8b5cf6'} 
                                onChange={(e) => setTagColors({...tagColors, [tag]: e.target.value})} 
                                className="w-4 h-4 rounded-lg cursor-pointer border-none bg-transparent flex-shrink-0 absolute left-2" 
                            />
                            <button 
                                onClick={() => setActiveTagFilter(isActive ? null : tag)} 
                                className={`w-full text-left pl-8 pr-4 py-2 rounded-xl text-[11px] font-bold transition-all truncate border ${isActive ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}
                                style={isActive ? { color: tagColor } : {}}
                            >
                                {tag.toLocaleUpperCase('tr-TR')}
                            </button>
                        </div>
                      );
                  })}
              </div>
          </div>
      </aside>

      {/* Main Content - Journal Style */}
      <div className="flex-grow space-y-12 order-1 lg:order-2">
          {/* Document Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between px-2 gap-4">
             <div className="space-y-1">
                <h2 className="text-4xl font-black text-gray-800 dark:text-white tracking-tighter">GÜNLÜK <span className="text-primary font-normal lowercase" style={{ color: 'var(--app-primary)' }}>akış</span></h2>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{activeTagFilter ? `#${activeTagFilter} GÖRÜNÜMÜ` : 'TÜM PROJE KAYITLARI'}</p>
             </div>
             <div className="flex items-center space-x-2">
                 <button onClick={expandAll} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-primary transition-all">Tümünü Aç</button>
                 <button onClick={collapseAll} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-primary transition-all">Tümünü Kapat</button>
                 <button onClick={() => setIsHelpOpen(true)} className="w-10 h-10 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-primary transition-all shadow-sm">
                    <i className="fa-solid fa-question"></i>
                 </button>
             </div>
          </div>

          {/* New Note Entry - "The Canvas" */}
          <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden group focus-within:ring-4 focus-within:ring-primary/5 transition-all">
                <FormattingToolbar />
                <div className="p-8 relative">
                    <div className="flex justify-between items-center mb-6">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">YENİ KAYIT OLUŞTUR</span>
                        <div className="flex items-center space-x-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-2 px-4 rounded-2xl shadow-inner">
                            <i className="fa-solid fa-calendar-alt text-primary opacity-60 text-xs" style={{ color: 'var(--app-primary)' }}></i>
                            <input 
                              type="date" 
                              value={creationDate} 
                              onChange={(e) => setCreationDate(e.target.value)} 
                              className="text-[11px] font-black bg-transparent text-gray-600 dark:text-white outline-none border-none p-0 cursor-pointer" 
                            />
                        </div>
                    </div>
                    <textarea
                        ref={textareaRef} value={inputValue} onFocus={() => setActiveTextArea('main')}
                        onChange={(e) => { setInputValue(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAddNote(); }}
                        placeholder="Bugün neler yaşandı? (İpucu: #etiket, @kişi, [ ] görev)"
                        className="w-full bg-transparent border-none rounded-none p-0 text-gray-800 dark:text-gray-100 focus:ring-0 text-lg leading-relaxed min-h-[160px] resize-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
                    />
                    <div className="flex justify-between items-center mt-8 pt-6 border-t dark:border-gray-700/50">
                        <p className="text-[10px] text-gray-300 dark:text-gray-600 font-black uppercase tracking-widest">
                            <i className="fa-solid fa-keyboard mr-2"></i> CTRL + ENTER İLE HIZLI KAYDET
                        </p>
                        <button 
                            onClick={handleAddNote} 
                            disabled={!inputValue.trim()} 
                            className="bg-primary hover:opacity-90 text-white px-10 py-3.5 rounded-2xl text-[11px] font-black shadow-xl transition-all disabled:opacity-30 disabled:grayscale uppercase tracking-widest"
                            style={{ backgroundColor: 'var(--app-primary)' }}
                        >
                            KAYDI TAMAMLA
                        </button>
                    </div>
                    {suggestionType && activeTextArea === 'main' && <SuggestionDropdown />}
                </div>
          </div>

          {/* Feed - Timeline Structure */}
          <div className="relative pl-8 space-y-16">
            {/* The Timeline Line */}
            <div className="absolute left-0 top-4 bottom-0 w-px bg-gradient-to-b from-gray-200 via-gray-200 to-transparent dark:from-gray-700 dark:via-gray-700"></div>

            {groupedNotes.map(([dateKey, dateNotes]) => {
                const isCollapsed = collapsedDates[dateKey];
                
                // Calculate quick stats for collapsed view
                const totalTodos = dateNotes.reduce((acc, note) => acc + (note.content.match(/\[ \]/g) || []).length, 0);
                const uniqueTags = Array.from(new Set(dateNotes.flatMap(n => n.tags))).slice(0, 3);

                return (
                    <div key={dateKey} className="relative space-y-8 animate-fade-in-up">
                        {/* Date Marker (Clickable) */}
                        <div 
                            onClick={() => toggleDateCollapse(dateKey)}
                            className={`absolute -left-[37px] top-1 rounded-full bg-white dark:bg-gray-900 border-4 border-primary z-20 shadow-sm cursor-pointer transition-all duration-300 hover:scale-125 ${isCollapsed ? 'w-3 h-3 border-gray-400 dark:border-gray-600' : 'w-4 h-4'}`} 
                            style={!isCollapsed ? { borderColor: 'var(--app-primary)' } : {}}
                        ></div>
                        
                        {/* Date Header (Clickable Accordion Trigger) */}
                        <div 
                            onClick={() => toggleDateCollapse(dateKey)}
                            className="flex items-center justify-between mb-8 cursor-pointer group select-none pr-4"
                        >
                            <div className="flex items-center space-x-4">
                                <h3 className={`text-xs font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border shadow-sm transition-all ${isCollapsed ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-gray-700'}`}>
                                    {dateKey}
                                </h3>
                                {isCollapsed && (
                                    <div className="flex items-center space-x-2 animate-fade-in">
                                        <span className="text-[9px] font-bold bg-accent dark:bg-primary/20 text-primary px-2 py-0.5 rounded-lg">{dateNotes.length} Not</span>
                                        {totalTodos > 0 && <span className="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg">{totalTodos} Görev</span>}
                                        {uniqueTags.map(tag => (
                                            <span key={tag} className="text-[9px] font-bold text-gray-400 opacity-60">#{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="text-gray-300 group-hover:text-primary transition-colors">
                                <i className={`fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}`}></i>
                            </div>
                        </div>

                        {!isCollapsed && (
                            <div className="space-y-6 animate-fade-in origin-top">
                                {dateNotes.map(note => (
                                    <div key={note.id} className="relative bg-white dark:bg-gray-800 rounded-[2.5rem] border border-gray-100 dark:border-gray-700 p-8 shadow-sm group hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300">
                                        {editingNoteId === note.id ? (
                                            <div className="space-y-4 relative animate-fade-in">
                                                <FormattingToolbar />
                                                <textarea 
                                                    ref={editTextAreaRef} value={editInputValue} onFocus={() => setActiveTextArea('edit')}
                                                    onChange={(e) => { setEditInputValue(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }} 
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-primary/30 rounded-2xl p-6 text-sm focus:ring-4 focus:ring-primary/5 outline-none leading-relaxed transition-all" rows={6} autoFocus 
                                                />
                                                <div className="flex justify-end space-x-2">
                                                    <button onClick={() => setEditingNoteId(null)} className="px-6 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vazgeç</button>
                                                    <button onClick={() => { onEditNote({ ...note, content: editInputValue, ...parseContent(editInputValue) }); setEditingNoteId(null); }} className="px-8 py-2.5 text-[10px] font-black bg-primary text-white rounded-xl shadow-lg shadow-primary/20 uppercase tracking-widest" style={{ backgroundColor: 'var(--app-primary)' }}>KAYDET</button>
                                                </div>
                                                {suggestionType && activeTextArea === 'edit' && <SuggestionDropdown />}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <div className="text-gray-800 dark:text-gray-200">
                                                    {renderRichText(note.content, note.id, note.lineUpdates)}
                                                </div>
                                                
                                                <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-50 dark:border-gray-700/50">
                                                    <div className="flex items-center space-x-6 text-[10px] font-black text-gray-300 dark:text-gray-500 uppercase tracking-widest">
                                                        <span className="flex items-center"><i className="fa-regular fa-clock mr-2 text-primary/40" style={{ color: 'var(--app-primary)' }}></i> {new Date(note.createdAt).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</span>
                                                        <span className="flex items-center"><i className="fa-solid fa-quote-left mr-2 text-primary/40" style={{ color: 'var(--app-primary)' }}></i> HAFTA {note.weekNumber}</span>
                                                    </div>
                                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all space-x-2">
                                                        <button onClick={() => { setEditingNoteId(note.id); setEditInputValue(note.content); }} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-400 hover:text-primary transition-colors"><i className="fa-solid fa-pencil text-[10px]"></i></button>
                                                        <button onClick={() => { if(window.confirm('Bu kaydı silmek istediğinize emin misiniz?')) onDeleteNote(note.id); }} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
          </div>
      </div>

      {isRemindersOpen && <RemindersModal reminders={reminderLines} onClose={() => setIsRemindersOpen(false)} />}
      {isToDosOpen && <ToDosModal todos={todoLines} onClose={() => setIsToDosOpen(false)} onToggle={toggleTodo} />}
      {isHelpOpen && <NotesHelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
};

export default NotesView;
