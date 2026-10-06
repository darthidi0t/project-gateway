import { useState } from 'react';
import { useApi } from '../api';
import { CardHead, Kpis, Loadable, PageHeader, Pill, Segmented, Tabs, fmtMs } from '../components/ui';

interface TelemetryData {
  group: string;
  kpis: { requests: string; errorRate: string; p50: string; p95: string; p99: string; openTasks: string };
  rows: Array<{ key: string; requests: string; p50: number; p95: number; p99: number; errorPct: number }>;
  statusCodes: Array<{ code: string; n: string; tone: string }>;
}
interface Span { start: number; dur: number; depth: number; kind: string; name: string; status: string; attributes: Record<string, string> }
interface TraceData { traceId: string; title: string; context: string; task: string; totalMs: number; spans: Span[] }

const KIND_COLOR: Record<string, string> = { orch: '#8fb3ff', gw: '#5fd38d', agent: '#f3b552', ext: '#c4a5ff', tool: '#6b7280' };
const STATUS: Record<string, [string, string]> = { ok: ['OK', 'ok'], warn: ['Input required', 'warn'], bad: ['Blocked content', 'bad'] };
const CODE_COLOR: Record<string, string> = { ok: '#6ee59a', warn: '#f3b552', bad: '#ff8a80', info: '#8fb3ff' };
const GROUP_NAME: Record<string, string> = { method: 'A2A method', agent: 'Agent ID', status: 'Status code' };
const W = (v: number) => `${Math.min(100, (v / 5000) * 100).toFixed(1)}%`;
const COLS = 'minmax(240px,340px) minmax(300px,1fr) 70px';

export default function Telemetry() {
  const [group, setGroup] = useState<'method' | 'agent' | 'status'>('method');
  const tel = useApi<TelemetryData>(`telemetry?group=${group}`);
  const trace = useApi<TraceData>('traces/4bf92f3577b34da6a3ce929d0e0e4736');
  const [sel, setSel] = useState(8);

  return (
    <>
      <PageHeader
        title="Telemetry & Tracing"
        crumb="Real-time A2A metrics by method, task, agent and status code · OpenTelemetry traces across every agent handoff"
      />
      <Tabs items={[{ label: 'Metrics', href: '#metrics', active: true }, { label: 'Distributed Trace', href: '#trace' }, { label: 'Status Codes', href: '#codes' }]} />
      <div className="body">
        <Loadable state={tel}>{(d) => (
          <>
            <Kpis label="Telemetry metrics" items={[
              { label: 'Requests', value: d.kpis.requests }, { label: 'Error rate', value: d.kpis.errorRate, style: { color: '#f3b552' } },
              { label: 'p50', value: d.kpis.p50 }, { label: 'p95', value: d.kpis.p95 }, { label: 'p99', value: d.kpis.p99 }, { label: 'Open tasks', value: d.kpis.openTasks }
            ]} />
            <section className="card" id="metrics">
              <CardHead title="Latency & Errors" sub={`Grouped by ${GROUP_NAME[group]} · bar shows p50 / p95 / p99 on a 5 s scale`}
                right={<Segmented label="Group by" value={group} onChange={setGroup} options={[['method', 'A2A method'], ['agent', 'Agent ID'], ['status', 'Status code']]} />} />
              <div className="tw"><table className="tbl nw">
                <thead><tr><th>{GROUP_NAME[group]}</th><th>Requests</th><th>p50</th><th>p95</th><th>p99</th><th style={{ width: '30%' }}>Distribution</th><th>Errors</th></tr></thead>
                <tbody>{d.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="mono" style={{ color: 'var(--text)' }}>{r.key}</td><td>{r.requests}</td><td>{fmtMs(r.p50)}</td><td>{fmtMs(r.p95)}</td><td>{fmtMs(r.p99)}</td>
                    <td><div style={{ position: 'relative', height: 10, background: '#1b1f25', borderRadius: 5, minWidth: 160 }}>
                      <i style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 5, width: W(r.p99), background: '#2a4636' }} />
                      <i style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 5, width: W(r.p95), background: '#3a7d55' }} />
                      <i style={{ position: 'absolute', inset: '0 auto 0 0', borderRadius: 5, width: W(r.p50), background: '#5fd38d' }} />
                    </div></td>
                    <td><Pill tone={r.errorPct >= 5 ? 'bad' : r.errorPct >= 1.5 ? 'warn' : 'ok'}>{r.errorPct}%</Pill></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="legend" style={{ marginTop: 14 }}><span><i className="dot" style={{ background: '#5fd38d' }} />p50</span><span><i className="dot" style={{ background: '#3a7d55' }} />p95</span><span><i className="dot" style={{ background: '#2a4636' }} />p99</span></div>
            </section>
          </>
        )}</Loadable>

        <section className="card" id="trace">
          <Loadable state={trace}>{(t) => {
            const span = t.spans[Math.min(sel, t.spans.length - 1)]!;
            const [stLabel, stTone] = STATUS[span.status] ?? ['OK', 'ok'];
            const attrs = { ...span.attributes, 'span.start_offset': fmtMs(span.start), 'span.duration': fmtMs(span.dur) };
            return (
              <>
                <CardHead title={`Distributed Trace · “${t.title}”`}
                  sub={<>trace <span className="mono">{t.traceId.slice(0, 8)}…{t.traceId.slice(-6)}</span> · context <span className="mono">{t.context}</span> · {t.spans.length} spans · {fmtMs(t.totalMs)} · select a span</>}
                  right={<div className="legend">{[['orch', 'Orchestrator'], ['gw', 'Gateway'], ['agent', 'Specialist agent'], ['ext', 'External agent'], ['tool', 'Tool call']].map(([k, l]) => <span key={k}><i className="dot" style={{ background: KIND_COLOR[k!] }} />{l}</span>)}</div>} />
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 640 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 8px 8px', fontSize: 11, color: 'var(--muted)' }}>
                      <span>SPAN</span><span style={{ display: 'flex', justifyContent: 'space-between' }}>{[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{fmtMs(Math.round(t.totalMs * f))}</span>)}</span><span style={{ textAlign: 'right' }}>DURATION</span>
                    </div>
                    {t.spans.map((s, i) => (
                      <button key={i} onClick={() => setSel(i)} aria-pressed={i === sel}
                        style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', width: '100%', background: i === sel ? 'var(--sel)' : 'none', border: 0, borderRadius: 6, color: 'var(--text)', fontSize: 12.5, textAlign: 'left', padding: '6px 8px', minHeight: 36, cursor: 'pointer' }}>
                        <span style={{ display: 'flex', alignItems: 'center', minWidth: 0, paddingLeft: s.depth * 18 }}>
                          <i className="dot" style={{ background: KIND_COLOR[s.kind], flex: 'none' }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                        </span>
                        <span style={{ position: 'relative', height: 14, background: '#15181d', borderRadius: 3 }}>
                          <i style={{ position: 'absolute', top: 2, bottom: 2, borderRadius: 3, minWidth: 3, left: `${(s.start / t.totalMs) * 100}%`, width: `${Math.max(0.5, (s.dur / t.totalMs) * 100)}%`, background: KIND_COLOR[s.kind] }} />
                        </span>
                        <span className="mono" style={{ textAlign: 'right', color: 'var(--text-3)' }}>{fmtMs(s.dur)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}><div style={{ fontWeight: 600 }}>{span.name}</div><Pill tone={stTone}>{stLabel}</Pill></div>
                  <dl className="kvl" style={{ gridTemplateColumns: 'minmax(160px,220px) 1fr' }}>
                    {Object.entries(attrs).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="mono">{k}</dt><dd className="mono">{v}</dd></div>)}
                  </dl>
                </div>
              </>
            );
          }}</Loadable>
        </section>

        {tel.data && (
          <section className="card" id="codes">
            <CardHead title="Status Codes" sub="HTTP status and A2A / JSON-RPC error codes returned through the gateway, last 24 hours" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {tel.data.statusCodes.map((c) => (
                <div key={c.code} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', minWidth: 140, background: 'var(--inset)' }}>
                  <div className="mono" style={{ color: CODE_COLOR[c.tone] }}>{c.code}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{c.n}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
