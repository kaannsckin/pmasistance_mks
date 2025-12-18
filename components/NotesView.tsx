
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Note, Resource } from '../types';
import RemindersModal from './RemindersModal';
import TagEditModal from './TagEditModal';

interface NotesViewProps {
  notes: Note[];
  resources: Resource[];
  onAddNote: (note: Note) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
}

const getWeekNumber = (d: Date) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const PREDEFINED_TAGS = [
  'Toplantı', 'Karar', 'Risk', 'Fikir', 'Acil', 'anımsatıcı',
  'Backend', 'Frontend', 'DevOps', 'Test', 'Bug'
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

  // Modal States
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);

  // Editing Note State
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const [editDateValue, setEditDateValue] = useState('');
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

  const groupedNotes = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    if (!activeTagFilter) {
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${getWeekNumber(now)}`;
        grouped[currentKey] = [];
    }

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
    
    if (activeTagFilter) {
        Object.keys(grouped).forEach(key => {
            if (grouped[key].length === 0) delete grouped[key];
        });
    }

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

  const handleRenameTag = (oldTag: string, newTag: string) => {
      notes.forEach(note => {
          if (note.tags.includes(oldTag)) {
              // Replace tag in content using regex to match whole word after #
              const regex = new RegExp(`#${oldTag}\\b`, 'g');
              const newContent = note.content.replace(regex, `#${newTag}`);
              const { tags, mentions } = parseContent(newContent);
              onEditNote({ ...note, content: newContent, tags, mentions });
          }
      });
      setEditingTag(null);
  };

  const renderRichText = (text: string) => {
    const parts = text.split(/([@#][\w-ğüşöçİĞÜŞÖÇı]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30 px-1 rounded cursor-pointer hover:underline">{part}</span>;
      }
      if (part.startsWith('#')) {
         const tag = part.substring(1);
         return <span key={i} className={`font-semibold px-1 rounded cursor-pointer hover:underline ${tag === 'anımsatıcı' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/40' : 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30'}`} onClick={() => setActiveTagFilter(tag)}>{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

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

          {/* Input Area */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 relative border border-gray-200 dark:border-gray-700">
             <div className="flex flex-col space-y-3">
                 <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Yeni Not Ekle</label>
                    <input type="date" value={creationDate} onChange={(e) => setCreationDate(e.target.value)} className="text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500" />
                 </div>
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !suggestionType) { e.preventDefault(); handleAddNote(); } }}
                        placeholder="Notunuzu yazın... Hatırlatıcı için #anımsatıcı ekleyin."
                        className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-lg p-4 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none shadow-inner min-h-[120px]"
                    />
                    <div className="absolute bottom-3 right-3">
                        <button onClick={handleAddNote} disabled={!inputValue.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full text-sm font-black shadow-md transition-all disabled:opacity-50">
                            EKLE
                        </button>
                    </div>
                    {suggestionType && !editingNoteId && <SuggestionDropdown isEditing={false} />}
                </div>
             </div>
          </div>

          {/* List area */}
          <div className="space-y-6">
            {groupedNotes.map(([key, weekNotes]) => (
                <div key={key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                    <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/30 flex items-center space-x-3">
                        <span className="text-xl font-black text-blue-600">{key.split('-')[1]}</span>
                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{key.split('-')[0]} . HAFTA</span>
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {weekNotes.map(note => (
                            <li key={note.id} className="p-6 group hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-all">
                                {editingNoteId === note.id ? (
                                    <div className="space-y-3">
                                        <textarea ref={editTextAreaRef} value={editInputValue} onChange={(e) => { setEditInputValue(e.target.value); checkSuggestions(e.target.value, e.target.selectionStart); }} className="w-full bg-white dark:bg-gray-900 border border-blue-300 rounded-lg p-3 text-sm" rows={4} autoFocus />
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setEditingNoteId(null)} className="px-4 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800">İptal</button>
                                            <button onClick={() => saveEditing(note.id)} className="px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg">Kaydet</button>
                                        </div>
                                        {suggestionType && <SuggestionDropdown isEditing={true} />}
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-4">
                                        <div className="flex-grow min-w-0">
                                            <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                                                {renderRichText(note.content)}
                                            </div>
                                            <div className="mt-3 text-[10px] text-gray-400 font-bold uppercase">
                                                {new Date(note.createdAt).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => { setEditingNoteId(note.id); setEditInputValue(note.content); setEditDateValue(note.createdAt.split('T')[0]); }} className="p-2 text-gray-400 hover:text-blue-600"><i className="fa-solid fa-pencil"></i></button>
                                            <button onClick={() => onDeleteNote(note.id)} className="p-2 text-gray-400 hover:text-red-500"><i className="fa-solid fa-trash-can"></i></button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
          </div>
      </div>

      {/* Modals */}
      {isRemindersOpen && <RemindersModal reminders={reminderLines} onClose={() => setIsRemindersOpen(false)} />}
      {editingTag && <TagEditModal tag={editingTag} onSave={handleRenameTag} onClose={() => setEditingTag(null)} />}
    </div>
  );
};

const saveEditing = (noteId: string) => { /* Dummy for TS */ };

export default NotesView;
