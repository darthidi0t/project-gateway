import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export const toneClass: Record<string, string> = { ok: 'pill p-ok', warn: 'pill p-warn', bad: 'pill p-bad', info: 'pill p-info', mute: 'pill p-mute', vio: 'pill p-vio' };
export const Pill = ({ tone, children }: { tone: keyof typeof toneClass | string; children: ReactNode }) => <span className={toneClass[tone] ?? toneClass.mute}>{children}</span>;

export function PageHeader({ title, crumb, tools }: { title: string; crumb: ReactNode; tools?: ReactNode }) {
  return (
    <div className="top">
      <div><h1>{title}</h1><div className="crumb">{crumb}</div></div>
      {tools && <div className="tools">{tools}</div>}
    </div>
  );
}

/** Tab strip. Items with `href` scroll to an anchor; items with `onSelect` switch views. */
export function Tabs({ items }: { items: Array<{ label: ReactNode; active?: boolean; href?: string; onSelect?: () => void }> }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((t, i) => t.href
        ? <a key={i} className={`tab${t.active ? ' on' : ''}`} href={t.href} onClick={(e) => { e.preventDefault(); document.querySelector(t.href!)?.scrollIntoView({ behavior: 'smooth' }); }}>{t.label}</a>
        : <button key={i} className={`tab${t.active ? ' on' : ''}`} aria-pressed={!!t.active} onClick={t.onSelect}>{t.label}</button>)}
    </nav>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export const Toggle = ({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) =>
  <button className={`sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;

export function Kpis({ items, label }: { items: Array<{ label: string; value: ReactNode; delta?: ReactNode; deltaTone?: 'good' | 'bad'; style?: React.CSSProperties }>; label: string }) {
  return (
    <section className="kpis" aria-label={label}>
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="kl">{k.label}</div>
          <div className="kv" style={k.style}>{k.value}{k.delta && <span className={k.deltaTone === 'bad' ? 'delta-bad' : 'delta-good'}>{k.delta}</span>}</div>
        </div>
      ))}
    </section>
  );
}

export function CardHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return <div className="ch"><div><h2 className="ct">{title}</h2>{sub && <div className="cs">{sub}</div>}</div>{right}</div>;
}

export function Loadable<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean }; children: (d: T) => ReactNode }) {
  if (state.error && !state.data) return <div className="error-box" role="alert">Couldn’t load data: {state.error}. Check that the API is running.</div>;
  if (!state.data) return <div className="state-msg">Loading…</div>;
  return <>{children(state.data)}</>;
}

export const Arrow = ({ color }: { color?: string }) => (
  <svg viewBox="0 0 46 20" width="46" height="20" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2" aria-hidden="true"><path d="M2 10h40M34 3l8 7-8 7" /></svg>
);

// Toast notifications
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return <ToastCtx.Provider value={setMsg}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/** Wraps an API mutation: runs it, reports failures as a toast. */
export function useAction() {
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    try { const r = await fn(); if (success) toast(success); return r; }
    catch (e) { toast(`Action failed: ${e instanceof Error ? e.message : String(e)}`); return undefined; }
  }, [toast]);
}

export const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);
export const money = (v: number) => `$${v.toLocaleString('en-US')}`;
export const spendColor = (r: number) => (r > 0.85 ? '#f07167' : r > 0.7 ? '#f3b552' : '#5fd38d');
