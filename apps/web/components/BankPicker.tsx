'use client';

import { KeyboardEvent, useId, useMemo, useState } from 'react';

/**
 * Searchable bank dropdown. Typing filters the list; when nothing matches exactly,
 * the last option adds the typed name (onAdd saves it so it shows up next time).
 */
export default function BankPicker({
  id, value, options, onChange, onAdd, placeholder = 'Cari bank…',
}: {
  id: string; value: string; options: string[]; onChange: (v: string) => void;
  onAdd: (name: string) => void; placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = value.trim().toLowerCase();

  const items = useMemo(() => {
    const hits = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    // Matches that start with the query first: "bc" → BCA before "blu by BCA".
    const sorted = [...hits].sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)));
    const exact = options.some((o) => o.toLowerCase() === q);
    return [...sorted.map((o) => ({ label: o, add: false })), ...(q && !exact ? [{ label: value.trim(), add: true }] : [])];
  }, [options, q, value]);

  function pick(i: number) {
    const it = items[i];
    if (!it) return;
    if (it.add) onAdd(it.label);
    onChange(it.label);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + d + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter' && open && items.length) {
      e.preventDefault(); // keep the dialog form from submitting
      pick(active);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); // close the list, not the dialog
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="combo">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => { setActive(0); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      {value && (
        <button type="button" className="combo-clear" aria-label="Kosongkan" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange('')}>×</button>
      )}
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="combo-list" onMouseDown={(e) => e.preventDefault()}>
          {items.map((it, i) => (
            <li
              key={(it.add ? '+' : '') + it.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${i === active ? 'on' : ''}${it.add ? ' add' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              {it.add ? <>+ Tambah “{it.label}”</> : it.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
