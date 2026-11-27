import React, { useLayoutEffect, useRef, useState } from 'react';
import Markdown from './Markdown';
import { Icon } from './modern/icons';
import changelog from '../CHANGELOG.md?raw';
import './UserGuide.css';

const docsPath = '../docs/kullanim/';
const docs = import.meta.glob<string>('../docs/kullanim/*.md', { eager: true, query: '?raw', import: 'default' });
const images = import.meta.glob<string>('../docs/kullanim/gorseller/*.png', { eager: true, query: '?url', import: 'default' });
const files = ['README.md', 'baslangic.md', 'proje-planlama.md', 'kapasite.md', 'raporlama.md', 'isbirligi.md'];
const repository = 'https://github.com/kaannsckin/pmasistance_mks/blob/main/';
const guideUrl = repository + 'docs/kullanim/';

const chapters = files.map(file => {
    const [title, ...lines] = docs[docsPath + file].trim().split(/\r?\n/);
    return { title: title.replace(/^# /, ''), text: lines.join('\n') };
});

const releases = Array.from(changelog.matchAll(/^## (.+)\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/gm),
    ([, title, text]) => ({ title, text: text.trim() }));
const notesIndex = chapters.length;
const chapterLabel = (index: number) => index === 0 ? 'Kılavuza giriş' : chapters[index].title;
const currentReleaseIndex = Math.max(0, releases.findIndex(release => /^v\d/.test(release.title)));

function resolveLinks(text: string, base: string) {
    return text.replace(/(\]\()((?:\.\.\/)*[\w/.-]+\.md(?:#[^\s)]+)?)(\))/g,
        (_, open, path, close) => open + new URL(path, base).href + close);
}

type GuideImage = { url: string; alt: string };

export default function UserGuide({ onClose }: { onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const page = useRef<HTMLElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const imageTrigger = useRef<HTMLButtonElement>(null);
    const [index, setIndex] = useState(0);
    const [releaseIndex, setReleaseIndex] = useState(currentReleaseIndex);
    const [zoomed, setZoomed] = useState<GuideImage | null>(null);
    const zoomClose = useRef<HTMLButtonElement>(null);
    const showNotes = index === notesIndex;
    const chapter = chapters[index];

    useLayoutEffect(() => {
        const element = dialog.current;
        element?.showModal();
    }, []);

    useLayoutEffect(() => {
        if (page.current) page.current.scrollTop = 0;
        heading.current?.focus({ preventScroll: true });
    }, [index]);

    useLayoutEffect(() => {
        if (zoomed) zoomClose.current?.focus();
        else imageTrigger.current?.focus();
    }, [zoomed]);

    const followChapter = (event: React.MouseEvent) => {
        const link = (event.target as HTMLElement).closest('a');
        if (!link?.href.startsWith(guideUrl) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const next = files.indexOf(link.href.slice(guideUrl.length));
        if (next < 0) return;
        event.preventDefault();
        setIndex(next);
    };

    return (
        <dialog
            ref={dialog}
            className="guide-book"
            aria-label="PlanAsistan Kullanım Kılavuzu"
            onClose={onClose}
            onCancel={event => {
                if (zoomed) {
                    event.preventDefault();
                    setZoomed(null);
                }
            }}
            onKeyDown={event => event.stopPropagation()}
            onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        >
            <div className="guide-layout">
                <nav inert={!!zoomed} className="guide-contents" aria-label="Kılavuz bölümleri">
                    <div className="guide-brand"><Icon name="rocket" size={20} /> PlanAsistan</div>
                    <h2>İçindekiler</h2>
                    <select className="guide-chapter-select" aria-label="Kılavuz bölümü" value={index}
                        onChange={event => setIndex(Number(event.target.value))}>
                        {chapters.map((_, i) => <option key={files[i]} value={i}>{chapterLabel(i)}</option>)}
                        <option value={notesIndex}>Sürüm notları</option>
                    </select>
                    {chapters.map((_, i) => (
                        <button type="button" key={files[i]} aria-current={index === i ? 'page' : undefined} onClick={() => setIndex(i)}>
                            {chapterLabel(i)}
                        </button>
                    ))}
                    <button type="button" className="guide-notes" aria-current={showNotes ? 'page' : undefined} onClick={() => setIndex(notesIndex)}>
                        Sürüm notları
                    </button>
                </nav>
                <div inert={!!zoomed} className="guide-paper">
                    <div className="guide-toolbar">
                        <span>{showNotes ? 'Sürüm geçmişi' : 'Kullanım kılavuzu'}</span>
                        <button type="button" className="guide-close" aria-label="Kılavuzu kapat" onClick={() => dialog.current?.close()}><Icon name="x" size={20} /></button>
                    </div>
                    <article ref={page} className="guide-scroll" onClick={followChapter}>
                        <div key={index} className="guide-page">
                            <h1 ref={heading} tabIndex={-1}>{showNotes ? 'Sürüm notları' : chapter.title}</h1>
                            {showNotes ? (
                                <>
                                    <div className="guide-version">
                                        <label htmlFor="guide-release">Sürüm</label>
                                        <select id="guide-release" value={releaseIndex} onChange={event => setReleaseIndex(Number(event.target.value))}>
                                            {releases.map((release, i) => <option key={release.title} value={i}>{release.title}</option>)}
                                        </select>
                                    </div>
                                    <Markdown text={resolveLinks(releases[releaseIndex].text, repository)} />
                                </>
                            ) : resolveLinks(chapter.text, guideUrl).split(/^!\[([^\]\n]+)\]\((gorseller\/[^)\n]+)\)\s*$/gm)
                                .map((piece, i, parts) => {
                                    if (i % 3 === 0) return <Markdown key={i} text={piece} />;
                                    if (i % 3 !== 1) return null;
                                    const url = images[docsPath + parts[i + 1]];
                                    if (!url) return null;
                                    return (
                                        <button type="button" key={i} className="guide-figure"
                                            aria-label={`Ekran görüntüsünü büyüt: ${piece}`}
                                            onClick={event => {
                                                imageTrigger.current = event.currentTarget;
                                                setZoomed({ url, alt: piece });
                                            }}>
                                            <img src={url} alt={piece} width={1540} height={970} loading="lazy" />
                                            <span aria-hidden="true"><Icon name="search" size={17} /></span>
                                        </button>
                                    );
                                })}
                        </div>
                    </article>
                    <div className="guide-pagination">
                        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Önceki</button>
                        <span aria-label="Bölüm numarası">{index + 1} / {notesIndex + 1}</span>
                        <button type="button" disabled={showNotes} onClick={() => setIndex(index + 1)}>Sonraki →</button>
                    </div>
                </div>
                {zoomed && (
                    <div className="guide-zoom" onClick={event => { if (event.target === event.currentTarget) setZoomed(null); }}>
                        <button ref={zoomClose} type="button" className="guide-close" aria-label="Ekran görüntüsünü kapat" onClick={() => setZoomed(null)}><Icon name="x" size={22} /></button>
                        <div className="guide-zoom-image" onClick={event => { if (event.target === event.currentTarget) setZoomed(null); }}>
                            <img src={zoomed.url} alt={zoomed.alt} />
                        </div>
                    </div>
                )}
            </div>
        </dialog>
    );
}
