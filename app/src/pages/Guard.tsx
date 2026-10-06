import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardHead, Kpis, Loadable, PageHeader, Pill, Segmented, Tabs, Toggle, tabItems, useAction } from '../components/ui';

interface GuardEvent { id: string; t: string; type: string; from: string; to: string; score: string; act: string; task: string; part: string; clf: string; segs: Array<[string, number]>; steps: string[] }
interface Plugin { key: string; name: string; desc: string; enabled: boolean }
interface GuardData {
  mode: 'enforce' | 'monitor';
  kpis: { inspected: string; blocked: number; sanitized: string; falsePositiveRate: string; latencyP95: string };
  events: GuardEvent[];
  types: Array<{ name: string; n: number }>;
  plugins: Plugin[];
}
const ACT: Record<string, string> = { Blocked: 'bad', Sanitized: 'info', Monitored: 'mute', 'Would block': 'warn', 'False positive': 'mute' };
const TYPE_COLORS = ['#f07167', '#f3a23b', '#f3b552', '#c4a5ff', '#8fb3ff', '#4c7fe0'];

export default function Guard() {
  const state = useApi<GuardData>('guard');
  const [tab, setTab] = useState<'events' | 'plugins'>('events');
  const [sel, setSel] = useState(0);
  const act = useAction();

  return (
    <>
      <PageHeader
        title="In-flight Prompt Guard"
        crumb="Inspects every message, artifact and streamed chunk between agents · blocks recursive injections, jailbreaks and malicious commands before handoff"
        tools={state.data && <>
          <span className="cs" style={{ margin: 0 }}>Mode</span>
          <Segmented label="Guard mode" value={state.data.mode} options={[['enforce', 'Enforce'], ['monitor', 'Monitor only']]} onChange={async (m) => {
            const r = await act(() => api.post<GuardData>('guard/mode', { mode: m }), m === 'enforce' ? 'Guard now blocks detections' : 'Guard now only logs detections');
            if (r) state.setData(r);
          }} />
        </>}
      />
      <Tabs items={tabItems([['events', 'Detections'], ['plugins', 'Guard Plugins']], tab, setTab)} />
      <Loadable state={state}>{(d) => {
        const ev = d.events[Math.min(sel, d.events.length - 1)]!;
        const maxN = Math.max(...d.types.map((t) => t.n));
        return (
          <div className="body">
            <Kpis label="Guard metrics" items={[
              { label: 'Messages inspected', value: d.kpis.inspected },
              { label: d.mode === 'enforce' ? 'Blocked handoffs' : 'Would have blocked', value: d.kpis.blocked, style: { color: '#ff8a80' } },
              { label: 'Sanitized (PII)', value: d.kpis.sanitized },
              { label: 'False-positive rate', value: d.kpis.falsePositiveRate },
              { label: 'Added latency p95', value: d.kpis.latencyP95 }
            ]} />

            {tab === 'events' && (
            <div className="split" id="events">
              <section className="card" style={{ flex: '999 1 600px' }}>
                <CardHead title="Detections" sub="Last 24 hours · select one to see the intercepted payload" />
                <div className="tw"><table className="tbl nw">
                  <thead><tr><th>Time</th><th>Detection</th><th>Handoff</th><th>Score</th><th>Action</th></tr></thead>
                  <tbody>{d.events.map((e, i) => (
                    <tr key={e.id} className={`click${e.id === ev.id ? ' sel' : ''}`} onClick={() => setSel(i)}>
                      <td className="mono" style={{ color: 'var(--text-3)' }}>{e.t}</td>
                      <td><button className="rb" onClick={() => setSel(i)} aria-pressed={e.id === ev.id}>{e.type}</button></td>
                      <td>{e.from} <span className="muted">→</span> {e.to}</td>
                      <td className="mono">{e.score}</td>
                      <td><Pill tone={ACT[e.act] ?? 'mute'}>{e.act}</Pill></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </section>

              <section className="card" style={{ flex: '1 1 460px' }}>
                <CardHead title={ev.type} sub={<>{ev.from} → {ev.to} · task <span className="mono">{ev.task}</span></>} right={<Pill tone={ACT[ev.act] ?? 'mute'}>{ev.act}</Pill>} />
                <div className="kl" style={{ marginBottom: 8 }}>Intercepted message part</div>
                <div style={{ background: 'var(--code)', border: '1px solid #1f2329', borderRadius: 8, padding: 16, fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.75, color: 'var(--text-2)', overflowWrap: 'anywhere' }}>
                  {ev.segs.map(([text, flagged], i) => flagged
                    ? <mark key={i} style={{ background: '#4a1d1d', color: '#ffb4ab', borderBottom: '2px solid #f07167', padding: '1px 2px', borderRadius: 3 }}>{text}</mark>
                    : <span key={i}>{text}</span>)}
                </div>
                <dl className="kvl" style={{ marginTop: 16 }}>
                  <dt>Classifier</dt><dd>{ev.clf}</dd>
                  <dt>Confidence</dt><dd className="mono">{ev.score}</dd>
                  <dt>Part</dt><dd className="mono">{ev.part}</dd>
                </dl>
                <div className="label">What the gateway did</div>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>{ev.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={ev.act === 'False positive'} onClick={async () => {
                    const r = await act(() => api.post<GuardData>(`guard/events/${ev.id}/false-positive`), 'Marked as a false positive');
                    if (r) state.setData(r);
                  }}>{ev.act === 'False positive' ? 'Marked false positive' : 'Mark false positive'}</button>
                  <Link className="btn" to="/telemetry" style={{ color: 'var(--text)' }}>Open trace</Link>
                </div>
              </section>
            </div>
            )}

            {tab === 'plugins' && (
            <div className="grid2" id="plugins">
              <section className="card">
                <CardHead title="Detections by Type" sub="Blocked + sanitized, last 7 days" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {d.types.map((t, i) => (
                    <div key={t.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,240px) 1fr 40px', gap: 14, alignItems: 'center', fontSize: 13 }}>
                      <span>{t.name}</span><div className="bar"><i style={{ width: `${(t.n / maxN) * 100}%`, background: TYPE_COLORS[i] }} /></div><span style={{ textAlign: 'right', color: 'var(--text-3)' }}>{t.n}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card">
                <CardHead title="Guard Plugins" sub="Order of evaluation: top to bottom, before the route forwards" />
                {d.plugins.map((p) => (
                  <div className="row-line" key={p.key}>
                    <div style={{ minWidth: 0 }}><div>{p.name}</div><div className="cs">{p.desc}</div></div>
                    <Toggle on={p.enabled} label={p.name} onChange={async (v) => {
                      const r = await act(() => api.post<Plugin>(`guard/plugins/${p.key}`, { enabled: v }), `${p.name}: ${v ? 'on' : 'off'}`);
                      if (r) state.setData((x) => (x ? { ...x, plugins: x.plugins.map((y) => (y.key === r.key ? r : y)) } : x));
                    }} />
                  </div>
                ))}
              </section>
            </div>
            )}
          </div>
        );
      }}</Loadable>
    </>
  );
}
