
import React, { useState, useRef, useMemo } from 'react';
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
const COLORS = [
  { name: 'Varsayılan', value: 'inherit' },
  { name: 'Kırmızı', value: '#ef4444' },
  { name: 'Mavi', value: '#3b82f6' },
  { name: 'Yeşil', value: '#10b981' },
  { name: 'Turuncu', value: '#f59e0b' },
  { name: 'Mor', value: '#8b5cf6' }
];

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
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Focus tracking for formatting/suggestions
  const [activeTextArea, setActiveTextArea] = useState<'main' | 'edit' | 'lineText' | 'lineUpdate'>('main');

  // Inline Line Panel State
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [tempLineText, setTempLineText] = useState('');
  const [tempUpdateText, setTempUpdateText] = useState('');
  const lineTextRef = useRef<HTMLTextAreaElement>(null);
  const lineUpdateRef = useRef<HTMLTextAreaElement>(null);

  // Edit Note Modal State (Full edit)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // Other Modal States
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [isToDosOpen, setIsToDosOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);

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
      const key = `${note.year}-${note.weekNumber}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(note);
    });

    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [notes, activeTagFilter]);

  // --- Formatting & Suggestions Logic ---

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

  // --- Handlers ---

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
    const userTimezoneOffset = selectedDate.getTimezoneOffset() * 60000;
    const normalizedDate = new Date(selectedDate.getTime() + userTimezoneOffset + (12 * 60 * 60 * 1000));
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
  };

  // --- Components ---

  const FormattingToolbar = () => (
      <div className="flex flex-wrap items-center space-x-1 p-1 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 relative">
          <button onClick={() => applyFormatting('**', '**')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs font-bold" title="Kalın"><i className="fa-solid fa-bold"></i></button>
          <button onClick={() => applyFormatting('*', '*')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs italic" title="İtalik"><i className="fa-solid fa-italic"></i></button>
          <button onClick={() => applyFormatting('==', '==')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs text-yellow-600" title="Vurgula"><i className="fa-solid fa-highlighter"></i></button>
          <button onClick={() => applyFormatting('^', '^')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs" title="Büyük Font"><i className="fa-solid fa-text-height"></i></button>
          
          <div className="relative">
              <button onClick={() => setShowColorPicker(!showColorPicker)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs text-blue-500" title="Yazı Rengi"><i className="fa-solid fa-palette"></i></button>
              {showColorPicker && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl rounded-lg p-2 z-[60] flex flex-wrap gap-2 w-40">
                    {COLORS.map(c => (
                        <button key={c.value} onClick={() => { applyFormatting(`[c:${c.value}]`, `[/c]`); setShowColorPicker(false); }} className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: c.value }} title={c.name}></button>
                    ))}
                </div>
              )}
          </div>

          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
          
          <button onClick={() => applyFormatting('[ ] ', '')} className="px-2 py-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors text-[9px] font-black text-emerald-600" title="ToDo Ekle">TODO</button>
          <button onClick={() => applyFormatting('#anımsatıcı ', '')} className="px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors text-[9px] font-black text-amber-600" title="Anımsatıcı Ekle">ANIMSATICI</button>
      </div>
  );

  const SuggestionDropdown = () => (
    <div className="absolute z-50 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 overflow-hidden w-64 mt-1">
        <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            {suggestionType === 'mention' ? 'Kişiler' : 'Etiketler'}
        </div>
        <ul className="max-h-48 overflow-y-auto">
            {suggestionType === 'mention' && resources.filter(r => r.name.toLocaleLowerCase('tr-TR').includes(suggestionQuery.toLocaleLowerCase('tr-TR'))).map(r => (
                <li key={r.id} onClick={() => insertSuggestion(r.name.replace(/\s/g, ''))} className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-gray-600 cursor-pointer flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-200">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">{r.name.charAt(0)}</span>
                    <span>{r.name}</span>
                </li>
            ))}
            {suggestionType === 'tag' && allUsedTags.filter(t => t.toLocaleLowerCase('tr-TR').includes(suggestionQuery.toLocaleLowerCase('tr-TR'))).map(t => (
                <li key={t} onClick={() => insertSuggestion(t)} className="px-4 py-2 hover:bg-purple-50 dark:hover:bg-gray-600 cursor-pointer text-xs text-gray-700 dark:text-gray-200"># {t}</li>
            ))}
        </ul>
    </div>
  );

  const renderRichText = (text: string, noteId: string, lineUpdates?: Record<number, string>) => {
    const lines = (text || '').split('\n');
    return lines.map((line, lineIdx) => {
      if (!line.trim() && lineIdx !== lines.length - 1) return null;

      const { tags } = parseContent(line);
      let highlightColor = '';
      if (tags.length > 0) highlightColor = tagColors[tags[0]] || '';

      // Splitting for Rich Text Formatting
      const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|==.*?==|\^.*?\^|\[\s?\]|\[x\]|\[c:[^\]]+\]|\[\/c\]|#[\w-ğüşöçİĞÜŞÖÇı]+|@[\w\sğüşöçİĞÜŞÖÇı]+)/g);
      
      const compositeId = `${noteId}-${lineIdx}`;
      const isExpanded = expandedLineId === compositeId;
      const hasUpdate = lineUpdates && lineUpdates[lineIdx];
      let currentColor = '';

      return (
        <div key={lineIdx} className="mb-2">
            <div 
                className={`group/line relative min-h-[1.5em] flex items-center p-3 rounded-xl transition-all shadow-sm border ${
                    isExpanded 
                        ? 'border-blue-500 bg-blue-50/10' 
                        : highlightColor 
                            ? 'border-opacity-50' 
                            : 'bg-gray-50/40 dark:bg-gray-900/20 border-gray-100 dark:border-gray-700/50 hover:border-blue-200'
                }`}
                style={!isExpanded && highlightColor ? { backgroundColor: `${highlightColor}15`, borderColor: highlightColor } : {}}
            >
                <div 
                    className="flex-grow flex flex-wrap cursor-pointer text-sm"
                    onClick={() => { setEditingNoteId(noteId); setEditInputValue(text); setActiveTextArea('edit'); }}
                >
                    {parts.map((part, i) => {
                        if (!part) return null;
                        if (part === '[ ]') return <i key={i} onClick={(e) => { e.stopPropagation(); toggleTodo(noteId, lineIdx); }} className="fa-regular fa-square mr-3 mt-0.5 text-gray-400 hover:text-emerald-500 transition-colors"></i>;
                        if (part === '[x]') return <i key={i} onClick={(e) => { e.stopPropagation(); toggleTodo(noteId, lineIdx); }} className="fa-solid fa-square-check mr-3 mt-0.5 text-emerald-500 hover:text-emerald-600 transition-colors"></i>;
                        if (part.startsWith('[c:')) { currentColor = part.slice(3, -1); return null; }
                        if (part === '[/c]') { currentColor = ''; return null; }
                        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={currentColor ? { color: currentColor } : {}}>{part.slice(2, -2)}</strong>;
                        if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic" style={currentColor ? { color: currentColor } : {}}>{part.slice(1, -1)}</em>;
                        if (part.startsWith('==') && part.endsWith('==')) return <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/40 dark:text-yellow-100 px-1 rounded">{part.slice(2, -2)}</mark>;
                        if (part.startsWith('^') && part.endsWith('^')) return <span key={i} className="text-lg font-bold" style={currentColor ? { color: currentColor } : {}}>{part.slice(1, -1)}</span>;
                        if (part.startsWith('#')) {
                            const tag = part.substring(1);
                            const tagColor = tagColors[tag];
                            return <span key={i} className="font-semibold px-1 rounded cursor-pointer hover:underline" style={tagColor ? { color: tagColor, backgroundColor: `${tagColor}20` } : {}} onClick={(e) => { e.stopPropagation(); setActiveTagFilter(tag); }}>{part}</span>;
                        }
                        if (part.startsWith('@')) return <span key={i} className="text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30 px-1 rounded">{part}</span>;
                        return <span key={i} style={currentColor ? { color: currentColor } : {}}>{part}</span>;
                    })}
                </div>

                <button 
                    onClick={(e) => { e.stopPropagation(); toggleLineExpansion(noteId, lineIdx, line, lineUpdates?.[lineIdx] || ''); }}
                    className={`flex-none ml-2 transition-all p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 ${isExpanded || hasUpdate ? 'text-amber-500 opacity-100 bg-amber-50 dark:bg-amber-900/20' : 'text-gray-300 opacity-0 group-hover/line:opacity-100'}`}
                >
                    <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : hasUpdate ? 'fa-note-sticky' : 'fa-sticky-note'}`}></i>
                </button>
            </div>

            {/* Sub-row Panel */}
            {isExpanded && (
                <div className="mx-4 mt-1 p-5 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-900 rounded-2xl shadow-xl space-y-4">
                    <FormattingToolbar />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center"><i className="fa-solid fa-i-cursor mr-2"></i> Satır Metni</label>
                            <textarea 
                                ref={lineTextRef} value={tempLineText} onFocus={() => setActiveTextArea('lineText')}
                                onChange={(e) => { setTempLineText(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }}
                                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl p-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={3}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center"><i className="fa-solid fa-sticky-note mr-2"></i> Güncelleme Notu</label>
                            <textarea 
                                ref={lineUpdateRef} value={tempUpdateText} onFocus={() => setActiveTextArea('lineUpdate')}
                                onChange={(e) => { setTempUpdateText(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }}
                                placeholder="İlerleme notu düşebilirsiniz..."
                                className="w-full bg-amber-50/30 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-xl p-3 text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none italic text-amber-900 dark:text-amber-200" rows={3}
                            />
                        </div>
                        {suggestionType && (activeTextArea === 'lineText' || activeTextArea === 'lineUpdate') && <SuggestionDropdown />}
                    </div>
                    <div className="flex justify-end items-center space-x-3 pt-2 border-t dark:border-gray-700">
                        <button onClick={() => setExpandedLineId(null)} className="text-[10px] font-bold text-gray-400 hover:text-gray-600 px-3 py-1">Vazgeç</button>
                        <button onClick={() => handleSaveInlineChanges(noteId, lineIdx)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-lg text-[10px] font-black shadow-md transition-all flex items-center"><i className="fa-solid fa-check mr-2"></i>KAYDET</button>
                    </div>
                </div>
            )}

            {!isExpanded && hasUpdate && (
                <div className="ml-10 mb-3 p-2 bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-amber-300 dark:border-amber-700 text-[11px] text-amber-700 dark:text-amber-400 italic rounded-r-lg flex items-start">
                    <i className="fa-solid fa-reply fa-rotate-180 mr-2 mt-1 opacity-50"></i>
                    <span>{lineUpdates[lineIdx]}</span>
                </div>
            )}
        </div>
      );
    });
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 pb-20 px-4">
      <aside className="w-full lg:w-64 flex-shrink-0 space-y-6 order-2 lg:order-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm sticky top-24">
              <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center">
                  <i className="fa-solid fa-tags mr-2 text-blue-500"></i> Etiketler
              </h3>
              <div className="flex flex-col space-y-1">
                  <button onClick={() => setActiveTagFilter(null)} className={`text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all ${activeTagFilter === null ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100'}`}>
                      Tüm Notlar
                  </button>
                  {allUsedTags.map(tag => (
                      <div key={tag} className="flex items-center group space-x-1">
                          <input type="color" value={tagColors[tag] || '#8b5cf6'} onChange={(e) => setTagColors({...tagColors, [tag]: e.target.value})} className="w-4 h-4 rounded-md cursor-pointer border-none bg-transparent flex-shrink-0" />
                          <button onClick={() => setActiveTagFilter(tag)} className={`flex-grow text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all truncate ${activeTagFilter === tag ? 'bg-white dark:bg-gray-700 text-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100'}`}># {tag}</button>
                      </div>
                  ))}
              </div>
          </div>
      </aside>

      <div className="flex-grow space-y-8 order-1 lg:order-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <h2 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center"><i className="fa-solid fa-clipboard-list mr-3 text-blue-600"></i> Proje Günlüğü</h2>
             <div className="flex space-x-2">
                 <button onClick={() => setIsToDosOpen(true)} className="relative flex items-center space-x-2 bg-emerald-500 text-white px-5 py-2 rounded-xl shadow-lg text-sm font-bold"><i className="fa-solid fa-check-double"></i> <span>ToDo</span></button>
                 <button onClick={() => setIsRemindersOpen(true)} className="relative flex items-center space-x-2 bg-amber-500 text-white px-5 py-2 rounded-xl shadow-lg text-sm font-bold"><i className="fa-solid fa-bell"></i> <span>Anımsatıcılar</span></button>
             </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <FormattingToolbar />
                <div className="p-6 relative">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Yeni Not Yaz</label>
                        <input type="date" value={creationDate} onChange={(e) => setCreationDate(e.target.value)} className="text-[11px] font-bold p-1 px-3 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 text-gray-800 dark:text-white" />
                    </div>
                    <textarea
                        ref={textareaRef} value={inputValue} onFocus={() => setActiveTextArea('main')}
                        onChange={(e) => { setInputValue(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAddNote(); }}
                        placeholder="Notlarınızı buraya yazın... #etiket, @kişi kullanabilirsiniz."
                        className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-lg p-4 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none"
                    />
                    <div className="flex justify-between items-center mt-3">
                        <span className="text-[10px] text-gray-400 font-bold italic">Ctrl+Enter ile hızlı kaydet</span>
                        <button onClick={handleAddNote} disabled={!inputValue.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-xl text-sm font-black shadow-lg transition-all disabled:opacity-50">KAYDET</button>
                    </div>
                    {suggestionType && activeTextArea === 'main' && <SuggestionDropdown />}
                </div>
          </div>

          <div className="space-y-10">
            {groupedNotes.map(([key, weekNotes]) => (
                <div key={key} className="space-y-4">
                    <div className="flex items-center space-x-4 px-2">
                        <div className="h-px flex-grow bg-gray-200 dark:bg-gray-700"></div>
                        <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full uppercase tracking-widest">{key.split('-')[1]}. Hafta / {key.split('-')[0]}</span>
                        <div className="h-px flex-grow bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div className="space-y-6">
                        {weekNotes.map(note => (
                            <div key={note.id} className="bg-white/50 dark:bg-gray-800/50 rounded-[2rem] border border-gray-100 dark:border-gray-700 p-6 shadow-sm group">
                                {editingNoteId === note.id ? (
                                    <div className="space-y-3 relative">
                                        <FormattingToolbar />
                                        <textarea 
                                            ref={editTextAreaRef} value={editInputValue} onFocus={() => setActiveTextArea('edit')}
                                            onChange={(e) => { setEditInputValue(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }} 
                                            className="w-full bg-white dark:bg-gray-900 border border-blue-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" rows={5} autoFocus 
                                        />
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setEditingNoteId(null)} className="px-4 py-1.5 text-xs font-bold text-gray-500">İptal</button>
                                            <button onClick={() => { onEditNote({ ...note, content: editInputValue, ...parseContent(editInputValue) }); setEditingNoteId(null); }} className="px-5 py-1.5 text-xs font-black bg-blue-600 text-white rounded-lg shadow-md">GÜNCELLE</button>
                                        </div>
                                        {suggestionType && activeTextArea === 'edit' && <SuggestionDropdown />}
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                        <div className="text-gray-800 dark:text-gray-200 leading-relaxed mb-4">
                                            {renderRichText(note.content, note.id, note.lineUpdates)}
                                        </div>
                                        <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                                            <div className="flex items-center space-x-4 text-[10px] text-gray-400 font-bold uppercase">
                                                <span><i className="fa-regular fa-calendar mr-1.5 text-blue-500"></i> {new Date(note.createdAt).toLocaleDateString('tr-TR')}</span>
                                                <span><i className="fa-regular fa-clock mr-1.5 text-blue-500"></i> {new Date(note.createdAt).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}</span>
                                            </div>
                                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all space-x-1">
                                                <button onClick={() => onDeleteNote(note.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-400 hover:text-red-500"><i className="fa-solid fa-trash-can text-[11px]"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
          </div>
      </div>

      {isRemindersOpen && <RemindersModal reminders={reminderLines} onClose={() => setIsRemindersOpen(false)} />}
      {isToDosOpen && <ToDosModal todos={todoLines} onClose={() => setIsToDosOpen(false)} onToggle={toggleTodo} />}
      {isHelpOpen && <NotesHelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
};

export default NotesView;
