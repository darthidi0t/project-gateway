import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

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

/** Tab strip. Items with `to` navigate to another page; items with `onSelect` switch the view on this page. */
export function Tabs({ items }: { items: Array<{ label: ReactNode; active?: boolean; to?: string; onSelect?: () => void }> }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((t, i) => t.to
        ? <Link key={i} className={`tab${t.active ? ' on' : ''}`} to={t.to}>{t.label}</Link>
        : <button key={i} className={`tab${t.active ? ' on' : ''}`} aria-pressed={!!t.active} onClick={t.onSelect}>{t.label}</button>)}
    </nav>
  );
}

/** Builds tab items from [key, label] pairs bound to a piece of state. */
export function tabItems<K extends string>(defs: Array<[K, ReactNode]>, value: K, set: (k: K) => void) {
  return defs.map(([k, label]) => ({ label, active: value === k, onSelect: () => set(k) }));
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

export function Kpis({ items, label }: { items: Array<{ label: string; value: ReactNode; delta?: ReactNode; deltaTone?: 'good' | 'bad'; style?: React.CSSProperties; to?: string }>; label: string }) {
  return (
    <section className="kpis" aria-label={label}>
      {items.map((k) => {
        const inner = <>
          <div className="kl">{k.label}</div>
          <div className="kv" style={k.style}>{k.value}{k.delta && <span className={k.deltaTone === 'bad' ? 'delta-bad' : 'delta-good'}>{k.delta}</span>}</div>
        </>;
        return k.to ? <Link className="kpi" key={k.label} to={k.to}>{inner}</Link> : <div className="kpi" key={k.label}>{inner}</div>;
      })}
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
