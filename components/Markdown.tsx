import React, { useMemo } from 'react';
import { MdBlock, MdInline, parseMarkdown } from '../utils/markdown';

/**
 * AI yanıtlarını güvenle gösterir: markdown ağacından React öğeleri üretilir,
 * dangerouslySetInnerHTML KULLANILMAZ — modelin ürettiği HTML/JS çalışamaz.
 */

const Inline: React.FC<{ nodes: MdInline[] }> = ({ nodes }) => (
  <>
    {nodes.map((n, i) => {
      switch (n.t) {
        case 'text': return <React.Fragment key={i}>{n.v}</React.Fragment>;
        case 'br': return <br key={i} />;
        case 'strong': return <strong key={i} className="font-bold"><Inline nodes={n.c} /></strong>;
        case 'em': return <em key={i}><Inline nodes={n.c} /></em>;
        case 'del': return <del key={i}><Inline nodes={n.c} /></del>;
        case 'code': return <code key={i} className="px-1 py-0.5 rounded bg-gray-200/70 dark:bg-gray-700 text-[0.85em] font-mono">{n.v}</code>;
        case 'link': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline"><Inline nodes={n.c} /></a>;
      }
    })}
  </>
);

const HEADING_CLASS = ['text-lg font-black', 'text-base font-black', 'text-sm font-black', 'text-sm font-bold', 'text-sm font-bold', 'text-sm font-semibold'];

const Block: React.FC<{ b: MdBlock }> = ({ b }) => {
  switch (b.t) {
    case 'heading': {
      const Tag = `h${Math.min(6, b.level + 2)}` as 'h3';
      return <Tag className={`${HEADING_CLASS[b.level - 1]} mt-1`}><Inline nodes={b.c} /></Tag>;
    }
    case 'paragraph':
      return <p><Inline nodes={b.c} /></p>;
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <Tag start={b.ordered ? b.start : undefined} className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
          {b.items.map((it, i) => (
            <li key={i} style={it.depth ? { marginLeft: `${it.depth * 1.25}rem` } : undefined}><Inline nodes={it.c} /></li>
          ))}
        </Tag>
      );
    }
    case 'code':
      return (
        <pre className="bg-gray-900 text-gray-100 rounded-xl p-3 overflow-x-auto text-xs font-mono">
          <code>{b.v}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-700 pl-3 text-gray-600 dark:text-gray-300 space-y-2">
          {b.c.map((c, i) => <Block key={i} b={c} />)}
        </blockquote>
      );
    case 'hr':
      return <hr className="border-gray-200 dark:border-gray-700" />;
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} className="px-2 py-1.5 font-bold border-b border-gray-200 dark:border-gray-700" style={{ textAlign: b.align[i] || 'left' }}><Inline nodes={h} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2 py-1" style={{ textAlign: b.align[ci] || 'left' }}><Inline nodes={c} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
};

const Markdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={`space-y-3 break-words ${className || ''}`}>
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
};

export default Markdown;
