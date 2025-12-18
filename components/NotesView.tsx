
import React, { useState, useRef, useMemo } from 'react';
import { Note, Resource } from '../types';
import RemindersModal from './RemindersModal';
import TagEditModal from './TagEditModal';
import ToDosModal from './ToDosModal';

interface NotesViewProps {
  notes: Note[];
  resources: Resource[];
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

const PREDEFINED_TAGS = [
  'Toplantı', 'Karar', 'Risk', 'Fikir', 'Acil', 'anımsatıcı', 'todo',
  'Backend', 'Frontend', 'DevOps', 'Test', 'Bug'
];

const COLORS = [
  { name: 'Varsayılan', value: 'inherit' },
  { name: 'Kırmızı', value: '#ef4444' },
  { name: 'Mavi', value: '#3b82f6' },
  { name: 'Yeşil', value: '#10b981' },
  { name: 'Turuncu', value: '#f59e0b' },
  { name: 'Mor', value: '#8b5cf6' },
  { name: 'Pembe', value: '#ec4899' }
];

const parseContent = (content: string) => {
  const tags = (content.match(/#[\w-ğüşöçİĞÜŞÖÇı]+/g) || []).map(t => t.substring(1));
  const mentions = (content.match(/@[\w\sğüşöçİĞÜŞÖÇı]+/g) || []).map(m => m.substring(1));
  return { tags, mentions };
};

const NotesView: React.FC<NotesViewProps> = ({ notes, resources, onAddNote, onEditNote, onDeleteNote }) => {
  const [inputValue, setInputValue] = useState('');
  const [creationDate, setCreationDate] = useState(new Date().toISOString().split('T')[0]);
  const [suggestionType, setSuggestionType] = useState<'mention' | 'tag' | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Modal States
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [isToDosOpen, setIsToDosOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);

  // Editing Note State
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // Collect all unique tags from notes
  const allUsedTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_TAGS);
    notes.forEach(note => note.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [notes]);

  // Extract Reminder Lines
  const reminderLines = useMemo(() => {
    const reminders: { noteId: string; content: string; date: string }[] = [];
    notes.forEach(note => {
      const lines = note.content.split('\n');
      lines.forEach(line => {
        if (line.toLocaleLowerCase('tr-TR').includes('#anımsatıcı')) {
          reminders.push({ noteId: note.id, content: line.replace('#anımsatıcı', '').trim(), date: note.createdAt });
        }
      });
    });
    return reminders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [notes]);

  // Extract ToDo Lines
  const todoLines = useMemo(() => {
    const todos: { noteId: string; content: string; date: string; completed: boolean; lineIndex: number }[] = [];
    notes.forEach(note => {
      const lines = note.content.split('\n');
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const newCursorPos = e.target.selectionStart;
    setInputValue(value);
    setCursorPosition(newCursorPos);
    checkSuggestions(value, newCursorPos);
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

  const applyFormatting = (prefix: string, suffix: string, isEditing = false) => {
      const ref = isEditing ? editTextAreaRef : textareaRef;
      if (!ref.current) return;

      const start = ref.current.selectionStart;
      const end = ref.current.selectionEnd;
      const currentVal = isEditing ? editInputValue : inputValue;
      const selectedText = currentVal.substring(start, end);
      
      const newVal = currentVal.substring(0, start) + prefix + selectedText + suffix + currentVal.substring(end);
      
      if (isEditing) setEditInputValue(newVal);
      else setInputValue(newVal);

      setTimeout(() => {
          if (ref.current) {
              ref.current.focus();
              ref.current.setSelectionRange(start + prefix.length, end + prefix.length);
          }
      }, 0);
  };

  const toggleTodo = (noteId: string, lineIndex: number) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const lines = note.content.split('\n');
    const line = lines[lineIndex];
    if (line.includes('[ ]')) {
      lines[lineIndex] = line.replace('[ ]', '[x]');
    } else if (line.includes('[x]')) {
      lines[lineIndex] = line.replace('[x]', '[ ]');
    }
    const newContent = lines.join('\n');
    const { tags, mentions } = parseContent(newContent);
    onEditNote({ ...note, content: newContent, tags, mentions });
  };

  const insertSuggestion = (text: string, isEditing = false) => {
    if (!suggestionType) return;
    const trigger = suggestionType === 'mention' ? '@' : '#';
    const targetValue = isEditing ? editInputValue : inputValue;
    const targetSetter = isEditing ? setEditInputValue : setInputValue;
    const currentCursor = isEditing ? editTextAreaRef.current?.selectionStart || 0 : cursorPosition;
    const lastTriggerIndex = targetValue.lastIndexOf(trigger, currentCursor - 1);
    const newValue = targetValue.substring(0, lastTriggerIndex) + trigger + text + " " + targetValue.substring(currentCursor);
    targetSetter(newValue);
    setSuggestionType(null);
    const ref = isEditing ? editTextAreaRef : textareaRef;
    if (ref.current) ref.current.focus();
  };

  const handleAddNote = () => {
    if (!inputValue.trim()) return;
    const selectedDate = new Date(creationDate);
    const userTimezoneOffset = selectedDate.getTimezoneOffset() * 60000;
    const normalizedDate = new Date(selectedDate.getTime() + userTimezoneOffset + (12 * 60 * 60 * 1000));
    const { tags, mentions } = parseContent(inputValue);
    const newNote: Note = {
      id: Date.now().toString(),
      content: inputValue,
      createdAt: normalizedDate.toISOString(),
      weekNumber: getWeekNumber(normalizedDate),
      year: normalizedDate.getFullYear(),
      tags,
      mentions
    };
    onAddNote(newNote);
    setInputValue('');
  };

  const handleSaveEditing = (noteId: string) => {
      const note = notes.find(n => n.id === noteId);
      if (note) {
          const { tags, mentions } = parseContent(editInputValue);
          onEditNote({ ...note, content: editInputValue, tags, mentions });
          setEditingNoteId(null);
      }
  };

  const handleRenameTag = (oldTag: string, newTag: string) => {
    notes.forEach(note => {
      if (note.tags.some(t => t.toLocaleLowerCase('tr-TR') === oldTag.toLocaleLowerCase('tr-TR'))) {
        const regex = new RegExp(`#${oldTag}`, 'gi');
        const newContent = note.content.replace(regex, `#${newTag}`);
        const { tags, mentions } = parseContent(newContent);
        onEditNote({ ...note, content: newContent, tags, mentions });
      }
    });
    setEditingTag(null);
    if (activeTagFilter === oldTag) {
      setActiveTagFilter(newTag);
    }
  };

  const renderRichText = (text: string, noteId?: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|==.*?==|\^.*?\^|\[\s?\]|\[x\]|\[c:[^\]]+\]|\[\/c\]|#[\w-ğüşöçİĞÜŞÖÇı]+|@[\w\sğüşöçİĞÜŞÖÇı]+)/g);

      let currentColor = '';

      return (
        <div key={lineIdx} className="min-h-[1.5em] flex items-start flex-wrap">
          {parts.map((part, i) => {
            if (part === '[ ]') {
              return <button key={i} onClick={() => noteId && toggleTodo(noteId, lineIdx)} className="mr-2 mt-1 text-gray-400 hover:text-blue-500 transition-colors"><i className="fa-regular fa-square text-lg"></i></button>;
            }
            if (part === '[x]') {
              return <button key={i} onClick={() => noteId && toggleTodo(noteId, lineIdx)} className="mr-2 mt-1 text-emerald-500 hover:text-emerald-600 transition-colors"><i className="fa-solid fa-square-check text-lg"></i></button>;
            }
            if (part.startsWith('[c:')) {
              currentColor = part.slice(3, -1);
              return null;
            }
            if (part === '[/c]') {
              currentColor = '';
              return null;
            }
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} style={currentColor ? { color: currentColor } : {}}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
              return <em key={i} className="italic" style={currentColor ? { color: currentColor } : {}}>{part.slice(1, -1)}</em>;
            }
            if (part.startsWith('==') && part.endsWith('==')) {
              return <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/40 dark:text-yellow-100 px-1 rounded">{part.slice(2, -2)}</mark>;
            }
            if (part.startsWith('^') && part.endsWith('^')) {
              return <span key={i} className="text-lg font-bold" style={currentColor ? { color: currentColor } : {}}>{part.slice(1, -1)}</span>;
            }
            if (part.startsWith('@')) {
              return <span key={i} className="text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30 px-1 rounded cursor-pointer hover:underline">{part}</span>;
            }
            if (part.startsWith('#')) {
               const tag = part.substring(1);
               let colorClass = 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30';
               if (tag === 'anımsatıcı') colorClass = 'text-amber-600 bg-amber-50 dark:bg-amber-900/40';
               if (tag === 'todo') colorClass = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40';

               return (
                   <span key={i} 
                      className={`font-semibold px-1 rounded cursor-pointer hover:underline ${colorClass}`} 
                      onClick={() => setActiveTagFilter(tag)}
                   >
                       {part}
                   </span>
               );
            }
            return <span key={i} style={currentColor ? { color: currentColor } : {}}>{part}</span>;
          })}
        </div>
      );
    });
  };

  const FormattingToolbar = ({ isEditing = false }) => (
      <div className="flex flex-wrap items-center space-x-1 p-1 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 relative">
          <button onClick={() => applyFormatting('**', '**', isEditing)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs font-bold" title="Kalın">
              <i className="fa-solid fa-bold"></i>
          </button>
          <button onClick={() => applyFormatting('*', '*', isEditing)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs italic" title="İtalik">
              <i className="fa-solid fa-italic"></i>
          </button>
          <button onClick={() => applyFormatting('==', '==', isEditing)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs text-yellow-600" title="Vurgula">
              <i className="fa-solid fa-highlighter"></i>
          </button>
          <button onClick={() => applyFormatting('^', '^', isEditing)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs" title="Büyük Font">
              <i className="fa-solid fa-text-height"></i>
          </button>
          <div className="relative group">
              <button onClick={() => setShowColorPicker(!showColorPicker)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-xs text-blue-500" title="Yazı Rengi">
                  <i className="fa-solid fa-palette"></i>
              </button>
              {showColorPicker && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl rounded-lg p-2 z-[60] flex flex-wrap gap-2 w-40">
                    {COLORS.map(c => (
                        <button key={c.value} onClick={() => { applyFormatting(`[c:${c.value}]`, `[/c]`, isEditing); setShowColorPicker(false); }} className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform" style={{ backgroundColor: c.value }} title={c.name}></button>
                    ))}
                </div>
              )}
          </div>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
          <button onClick={() => applyFormatting('[ ] ', '', isEditing)} className="px-2 py-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors text-[10px] font-black text-emerald-600" title="ToDo Ekle">
              <i className="fa-solid fa-check-double mr-1"></i> TODO
          </button>
          <button onClick={() => {
              const ref = isEditing ? editTextAreaRef : textareaRef;
              if (ref.current) {
                  const val = isEditing ? editInputValue : inputValue;
                  const targetSetter = isEditing ? setEditInputValue : setInputValue;
                  const start = ref.current.selectionStart;
                  targetSetter(val.substring(0, start) + '#anımsatıcı ' + val.substring(start));
              }
          }} className="px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors text-[10px] font-black text-amber-600" title="Hatırlatıcı Ekle">
              <i className="fa-solid fa-bell mr-1"></i> ANIMSATICI
          </button>
      </div>
  );

  const SuggestionDropdown = ({ isEditing }: { isEditing: boolean }) => (
    <div className="absolute z-50 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 overflow-hidden animate-fade-in-up w-64 mt-1">
        <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
            {suggestionType === 'mention' ? 'Kişiler' : 'Etiketler'}
        </div>
        <ul className="max-h-48 overflow-y-auto">
            {suggestionType === 'mention' && resources.filter(r => r.name.toLocaleLowerCase('tr-TR').includes(suggestionQuery.toLocaleLowerCase('tr-TR'))).map(r => (
                <li key={r.id} onClick={() => insertSuggestion(r.name.replace(/\s/g, ''), isEditing)} className="px-4 py-2 hover:bg-blue-50 dark:hover:bg-gray-600 cursor-pointer flex items-center space-x-2 text-gray-700 dark:text-gray-200">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{r.name.charAt(0)}</span>
                    <span>{r.name}</span>
                </li>
            ))}
            {suggestionType === 'tag' && allUsedTags.filter(t => t.toLocaleLowerCase('tr-TR').includes(suggestionQuery.toLocaleLowerCase('tr-TR'))).map(t => (
                <li key={t} onClick={() => insertSuggestion(t, isEditing)} className="px-4 py-2 hover:bg-purple-50 dark:hover:bg-gray-600 cursor-pointer text-gray-700 dark:text-gray-200"># {t}</li>
            ))}
        </ul>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 pb-20 px-4">
      {/* Sidebar: Tag Management */}
      <aside className="w-full lg:w-64 flex-shrink-0 space-y-6 order-2 lg:order-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm sticky top-24">
              <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center">
                  <i className="fa-solid fa-tags mr-2 text-blue-500"></i>
                  Etiket Yönetimi
              </h3>
              <div className="flex flex-col space-y-1">
                  <button onClick={() => setActiveTagFilter(null)} className={`text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all ${activeTagFilter === null ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      Tüm Notlar
                  </button>
                  {allUsedTags.map(tag => (
                      <div key={tag} className="flex items-center group">
                          <button onClick={() => setActiveTagFilter(tag)} className={`flex-grow text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all truncate ${activeTagFilter === tag ? 'bg-purple-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/10'}`}>
                              # {tag}
                          </button>
                          <button 
                            onClick={() => setEditingTag(tag)}
                            className="p-2 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Etiketi Düzenle"
                          >
                              <i className="fa-solid fa-pencil text-[10px]"></i>
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      </aside>

      {/* Main Content */}
      <div className="flex-grow space-y-8 order-1 lg:order-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <h2 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                <i className="fa-solid fa-clipboard-list mr-3 text-blue-600"></i>
                Proje Günlüğü
             </h2>
             
             <div className="flex space-x-2">
                 {/* ToDos Trigger */}
                 <button 
                    onClick={() => setIsToDosOpen(true)}
                    className="relative flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none transition-all font-bold text-sm"
                 >
                    <i className="fa-solid fa-check-double"></i>
                    <span>ToDo Listesi</span>
                    {todoLines.filter(t => !t.completed).length > 0 && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 border-2 border-white dark:border-gray-800 rounded-full text-[10px] flex items-center justify-center font-black">
                            {todoLines.filter(t => !t.completed).length}
                        </span>
                    )}
                 </button>

                 {/* Reminders Trigger */}
                 <button 
                    onClick={() => setIsRemindersOpen(true)}
                    className="relative flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-xl shadow-lg shadow-amber-200 dark:shadow-none transition-all font-bold text-sm"
                 >
                    <i className="fa-solid fa-bell"></i>
                    <span>Anımsatıcılar</span>
                    {reminderLines.length > 0 && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 border-2 border-white dark:border-gray-800 rounded-full text-[10px] flex items-center justify-center font-black animate-bounce">
                            {reminderLines.length}
                        </span>
                    )}
                 </button>
             </div>
          </div>

          {/* Input Area */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg relative border border-gray-200 dark:border-gray-700 overflow-hidden">
             <FormattingToolbar isEditing={false} />
             <div className="p-6 pt-3 flex flex-col space-y-3">
                 <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px] font-black">Yeni Not Yaz</label>
                    <input type="date" value={creationDate} onChange={(e) => setCreationDate(e.target.value)} className="text-[11px] font-bold p-1 px-3 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none" />
                 </div>
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={(e) => { 
                            if (e.key === 'Enter' && e.ctrlKey && !suggestionType) { 
                                handleAddNote(); 
                            } 
                        }}
                        placeholder="Toplantı notları, kararlar veya ToDo'lar... #etiket, @kişi veya #anımsatıcı ekleyebilirsiniz."
                        className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-lg p-4 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none shadow-inner min-h-[140px]"
                    />
                    <div className="flex justify-between items-center mt-3">
                        <span className="text-[10px] text-gray-400 font-bold italic">Ctrl+Enter ile hızlı kaydet</span>
                        <button onClick={handleAddNote} disabled={!inputValue.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-xl text-sm font-black shadow-lg shadow-blue-200 dark:shadow-none transition-all disabled:opacity-50">
                            NOTU KAYDET
                        </button>
                    </div>
                    {suggestionType && !editingNoteId && <SuggestionDropdown isEditing={false} />}
                </div>
             </div>
          </div>

          {/* List area */}
          <div className="space-y-6">
            {groupedNotes.length > 0 ? groupedNotes.map(([key, weekNotes]) => (
                <div key={key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                    <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/30 flex items-center space-x-3 border-b dark:border-gray-700">
                        <span className="text-xl font-black text-blue-600">{key.split('-')[1]}</span>
                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{key.split('-')[0]} . HAFTA</span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {weekNotes.map(note => (
                            <li key={note.id} className="p-6 group hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all">
                                {editingNoteId === note.id ? (
                                    <div className="space-y-3">
                                        <FormattingToolbar isEditing={true} />
                                        <textarea ref={editTextAreaRef} value={editInputValue} onChange={(e) => { setEditInputValue(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }} className="w-full bg-white dark:bg-gray-900 border border-blue-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" rows={5} autoFocus />
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setEditingNoteId(null)} className="px-4 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800">İptal</button>
                                            <button onClick={() => handleSaveEditing(note.id)} className="px-5 py-1.5 text-xs font-black bg-blue-600 text-white rounded-lg shadow-md">GÜNCELLE</button>
                                        </div>
                                        {suggestionType && <SuggestionDropdown isEditing={true} />}
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-4">
                                        <div className="flex-grow min-w-0">
                                            <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                                                {renderRichText(note.content, note.id)}
                                            </div>
                                            <div className="mt-3 flex items-center space-x-3 text-[10px] text-gray-400 font-bold uppercase">
                                                <span><i className="fa-regular fa-clock mr-1"></i> {new Date(note.createdAt).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                                                {note.tags.length > 0 && <span className="text-purple-400">{note.tags.length} Etiket</span>}
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => { setEditingNoteId(note.id); setEditInputValue(note.content); }} className="p-2 text-gray-400 hover:text-blue-600" title="Düzenle"><i className="fa-solid fa-pencil text-xs"></i></button>
                                            <button onClick={() => onDeleteNote(note.id)} className="p-2 text-gray-400 hover:text-red-500" title="Sil"><i className="fa-solid fa-trash-can text-xs"></i></button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )) : (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 shadow-inner">
                    <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                        <i className="fa-solid fa-book-open text-3xl text-blue-500"></i>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Günlüğünüz Henüz Boş</h3>
                    <div className="max-w-2xl text-center px-6">
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-10">
                            Proje günlüğünü kullanarak toplantı notlarını, kararları ve teknik detayları kayıt altına alabilirsiniz.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-emerald-400 transition-all group">
                                <div className="flex items-center space-x-3 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600">
                                        <i className="fa-solid fa-check-double"></i>
                                    </div>
                                    <span className="text-emerald-500 font-black text-xs uppercase">ToDo Listesi</span>
                                </div>
                                <p className="text-[11px] text-gray-400">Notlarınıza interaktif ToDo listeleri ekleyin. <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">[ ] Görev</code> yazarak başlayın.</p>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-amber-400 transition-all">
                                <div className="flex items-center space-x-3 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600">
                                        <i className="fa-solid fa-bell"></i>
                                    </div>
                                    <span className="text-amber-500 font-black text-xs uppercase">Anımsatıcılar</span>
                                </div>
                                <p className="text-[11px] text-gray-400">Kritik satırları <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">#anımsatıcı</code> etiketiyle işaretleyerek özel panoda görünmesini sağlayın.</p>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-400 transition-all">
                                <div className="flex items-center space-x-3 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600">
                                        <i className="fa-solid fa-palette"></i>
                                    </div>
                                    <span className="text-blue-500 font-black text-xs uppercase">Görsel Düzen</span>
                                </div>
                                <p className="text-[11px] text-gray-400">Yazı rengi, kalın, italik ve vurgu araçlarını kullanarak notlarınızı daha okunabilir hale getirin.</p>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-400 transition-all">
                                <div className="flex items-center space-x-3 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                                        <i className="fa-solid fa-tags"></i>
                                    </div>
                                    <span className="text-purple-500 font-black text-xs uppercase">Etiket & Kişi</span>
                                </div>
                                <p className="text-[11px] text-gray-400"><code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">#etiket</code> ve <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">@kişi</code> mentionları ile notlarınızı kategorize edin.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
          </div>
      </div>

      {/* Modals */}
      {isRemindersOpen && <RemindersModal reminders={reminderLines} onClose={() => setIsRemindersOpen(false)} />}
      {isToDosOpen && <ToDosModal todos={todoLines} onClose={() => setIsToDosOpen(false)} onToggle={toggleTodo} />}
      {editingTag && <TagEditModal tag={editingTag} onSave={handleRenameTag} onClose={() => setEditingTag(null)} />}
    </div>
  );
};

export default NotesView;
