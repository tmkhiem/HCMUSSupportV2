import React from 'react';
import { renderMarkdownFullImplementation } from './markdownFull';

/**
 * A self-contained markdown renderer that converts basic markdown strings into React nodes.
 * Supports: Headers (H1, H2, H3), Tables, Bullet/Numbered Lists, Bold text, and Paragraphs.
 */

export const renderMarkdownSelfImplementation = (text: string): React.ReactNode[] => renderMarkdownFullImplementation(text);

export const renderMarkdownSelfImplementation_Ignore = (text: string): React.ReactNode[] => {
  if (!text) return [];

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  // Simple inline parser for bold text (**bold**)
  const parseInline = (line: string) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
        return React.createElement('strong', { key: idx, className: "font-bold" }, part.slice(2, -2));
      }
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    const trimmedLine = line.trim();

    // 1. Headers
    if (trimmedLine.startsWith('# ')) {
      elements.push(
        // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
        React.createElement('h1', { 
          key: `h1-${i}`, 
          className: "text-2xl font-black mb-4 uppercase tracking-tight", 
          style: { color: 'var(--text-main)' } 
        }, parseInline(trimmedLine.slice(2)))
      );
      i++; continue;
    }
    if (trimmedLine.startsWith('## ')) {
      elements.push(
        // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
        React.createElement('h2', { 
          key: `h2-${i}`, 
          className: "text-xl font-black mb-3 uppercase tracking-tight", 
          style: { color: 'var(--text-main)' } 
        }, parseInline(trimmedLine.slice(3)))
      );
      i++; continue;
    }
    if (trimmedLine.startsWith('### ')) {
      elements.push(
        // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
        React.createElement('h3', { 
          key: `h3-${i}`, 
          className: "text-sm font-black uppercase tracking-widest mt-6 mb-3 flex items-center gap-2", 
          style: { color: 'var(--primary)' } 
        }, [
          React.createElement('span', { key: "dot", className: "w-1 h-4 bg-[var(--primary)] rounded-full" }),
          ...parseInline(trimmedLine.slice(4))
        ])
      );
      i++; continue;
    }

    // 2. Table detection
    if (trimmedLine.startsWith('|')) {
      const tableRows: string[][] = [];
      let j = i;
      
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        const rowText = lines[j].trim();
        // Skip separator rows like |---|---|
        if (!rowText.match(/^\|[\s\-\|:]+\|$/)) {
          const cells = rowText
            .split('|')
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map(c => c.trim());
          tableRows.push(cells);
        }
        j++;
      }

      if (tableRows.length > 0) {
        elements.push(
          // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
          React.createElement('div', { key: `table-${i}`, className: "overflow-x-auto my-6 blocky-shadow border border-gray-100 rounded-sm" },
            React.createElement('table', { className: "w-full text-left border-collapse bg-white" }, [
              React.createElement('thead', { key: "thead" },
                React.createElement('tr', { className: "bg-gray-50 border-b border-gray-100" },
                  tableRows[0].map((cell, idx) => 
                    React.createElement('th', { key: idx, className: "px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap" }, 
                      parseInline(cell)
                    )
                  )
                )
              ),
              React.createElement('tbody', { key: "tbody" },
                tableRows.slice(1).map((row, rowIdx) => 
                  React.createElement('tr', { key: rowIdx, className: "border-b border-gray-50 hover:bg-slate-50 transition-colors" },
                    row.map((cell, cellIdx) => 
                      React.createElement('td', { key: cellIdx, className: "px-4 py-3 text-sm font-medium text-slate-700" },
                        parseInline(cell)
                      )
                    )
                  )
                )
              )
            ])
          )
        );
      }
      i = j;
      continue;
    }

    // 3. List detection (Bulleted or Numbered)
    if (trimmedLine.startsWith('*') || trimmedLine.startsWith('-') || /^\d+\./.test(trimmedLine)) {
      const listItems: { text: string; type: 'bullet' | 'number' }[] = [];
      let j = i;
      while (j < lines.length) {
        const l = lines[j].trim();
        if (l.startsWith('*') || l.startsWith('-')) {
          listItems.push({ text: l.substring(1).trim(), type: 'bullet' });
        } else if (/^\d+\./.test(l)) {
          listItems.push({ text: l.replace(/^\d+\.\s*/, '').trim(), type: 'number' });
        } else {
          break;
        }
        j++;
      }
      elements.push(
        // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
        React.createElement('ul', { key: `list-${i}`, className: "list-none space-y-2 my-4" },
          listItems.map((item, idx) => 
            React.createElement('li', { key: idx, className: "flex gap-3 items-start" }, [
              item.type === 'bullet' 
                ? React.createElement('span', { key: "bullet", className: "w-1.5 h-1.5 rounded-full mt-2 shrink-0", style: { backgroundColor: 'var(--primary)' } })
                : React.createElement('span', { key: "number", className: "text-[11px] font-black mt-0.5 shrink-0 opacity-40" }, (idx + 1) + "."),
              React.createElement('span', { key: "text", className: "text-sm font-medium leading-relaxed" }, parseInline(item.text))
            ])
          )
        )
      );
      i = j;
      continue;
    }

    // 4. Regular paragraph
    if (trimmedLine !== '') {
      elements.push(
        // Fix: Use React.createElement instead of JSX to avoid errors in .ts file
        React.createElement('p', { key: `p-${i}`, className: "mb-4 text-sm font-medium leading-relaxed text-slate-700" }, 
          parseInline(line)
        )
      );
    }
    
    i++;
  }

  return elements;
};