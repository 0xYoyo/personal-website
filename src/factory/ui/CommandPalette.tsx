import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { factoryStore, useFactory } from '../store';
import { useFocusTrap } from '../../lib/focusTrap';
import { cx } from '../../lib/cx';
import { buildCommands, searchCommands, type Command } from './actions';
import './factory-ui.css';

/** Global shortcuts: ⌘K / Ctrl+K anywhere, "/" when not typing. */
function usePaletteShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const st = factoryStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.setPaletteOpen(!st.paletteOpen);
      } else if (e.key === '/' && !typing && !st.paletteOpen && !st.gameOpen) {
        e.preventDefault();
        st.setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function CommandPalette() {
  usePaletteShortcuts();
  const open = useFactory((s) => s.paletteOpen);
  if (!open) return null;
  return <PaletteDialog />;
}

export function PaletteDialog() {
  const commands = useMemo(buildCommands, []);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [output, setOutput] = useState<{ name: string; lines: string[] } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => factoryStore.getState().setPaletteOpen(false), []);
  useFocusTrap(dialogRef, true, close);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => searchCommands(commands, query), [commands, query]);

  const runCommand = (cmd: Command | undefined) => {
    if (!cmd) return;
    const lines = cmd.run();
    if (lines && lines.length) {
      setOutput({ name: cmd.name, lines });
      setQuery('');
      setActive(0);
      inputRef.current?.focus();
    } else close();
  };
  const run = (i: number) => runCommand(results[i]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Search what is in the box right now, so Enter straight after typing runs the top result
      // even if React has not re-rendered the list yet.
      const typed = e.currentTarget instanceof HTMLInputElement ? e.currentTarget.value : query;
      const now = typed === query ? results : searchCommands(commands, typed);
      runCommand(now[typed === query ? active : 0]);
    }
  };

  const listId = 'palette-list';
  return (
    <div className="overlay overlay--palette" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" ref={dialogRef}>
        <div className="palette-input-row">
          <span className="palette-prompt mono" aria-hidden="true">
            $
          </span>
          <input
            ref={inputRef}
            className="palette-input mono"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `cmd-${active}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="palette-esc mono">Esc</kbd>
        </div>
        {output && (
          <div className="palette-output mono" role="status">
            <p className="palette-output-cmd">$ {output.name}</p>
            {output.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
        <ul className="palette-list" id={listId} role="listbox" aria-label="Commands">
          {results.map((c, i) => (
            <li
              key={c.name}
              id={`cmd-${i}`}
              role="option"
              aria-selected={i === active}
              className={cx('palette-item', i === active && 'is-active')}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              <span className="palette-name mono">{c.name}</span>
              <span className="palette-desc">{c.description}</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette-empty mono">No command matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
