import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardHead, Kpis, Loadable, PageHeader, Pill, Tabs, Toggle, tabItems, useAction } from '../components/ui';

interface Call { m: string; from: string; to: string; id: string; ctx: string; st: string; lat: string; code: string; b: string; text?: string; p: string; scope: string; guard?: boolean; notFound?: boolean; limited?: boolean; t: string; task: string }
interface RouteRow { route: string; binding: string; ops: string; upstream: string; timeout: string; retries: number; response: string }
interface Rule { key: string; name: string; desc: string; enabled: boolean }

const STATE_TONE: Record<string, string> = { working: 'info', completed: 'ok', 'input-required': 'vio', rejected: 'bad', canceled: 'mute', failed: 'bad', 'auth-required': 'warn' };
const codeTone = (c: string) => (c.startsWith('200') ? 'ok' : c === '429' ? 'warn' : 'bad');
const respTone = (r: string) => (r.includes('SSE') ? 'info' : r.includes('gRPC') ? 'vio' : 'mute');
const time = (iso: string) => { const d = new Date(iso); return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'); };

function inspect(c: Call) {
  const rest = c.b === 'HTTP+JSON';
  const route = rest ? (c.m === 'GetTask' ? `GET /agents/${c.id}/tasks/{taskId}` : `POST /agents/${c.id}/tasks/{taskId}:cancel`) : `POST /agents/${c.id}`;
  const body = c.text
    ? { jsonrpc: '2.0', id: 'req-8812', method: c.m, params: { message: { role: 'ROLE_USER', messageId: 'msg-2c71', contextId: c.ctx, parts: [{ text: c.text }] } } }
    : rest ? null : { jsonrpc: '2.0', id: 'req-8813', method: c.m, params: { id: c.task } };
  const hdr = `${rest ? route.replace('{taskId}', c.task) : route} HTTP/2\nHost: a2a.gateway.example.com\nAuthorization: Bearer eyJhbGciOiJSUzI1NiIs… (redacted)\nA2A-Version: 1.0\nA2A-Extensions: https://a2a.example.com/ext/obo-chain/v1\n${c.m === 'SendStreamingMessage' ? 'Accept: text/event-stream\n' : ''}traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`;
  type Check = [string, string, string];
  const checks: Check[] = [
    ['Pass', 'ok', rest ? 'HTTP+JSON path and verb match the operation' : 'JSON-RPC 2.0 envelope and params schema valid'],
    ['Pass', 'ok', 'A2A-Version 1.0 supported'],
    ['Pass', 'ok', `JWT valid · scope ${c.scope} allows ${c.id}`],
    c.guard ? ['Fail', 'bad', 'Prompt Guard: recursive injection detected (0.97) — blocked before handoff'] : ['Pass', 'ok', 'Prompt Guard: clean'],
    c.limited ? ['Limit', 'warn', `Rate limit 120/min exceeded for ${c.p} → 429, Retry-After: 30`] : ['Pass', 'ok', 'Rate limit within quota'],
    c.notFound ? ['Fail', 'bad', 'Upstream returned TaskNotFoundError (-32001)'] : ['Pass', 'ok', 'Part media types allowed (text/plain, application/json)']
  ];
  return { route, req: hdr + (body ? '\n\n' + JSON.stringify(body, null, 2) : ''), checks, upstream: c.id === 'agt-procurement' ? 'dns:///procurement.ops.svc:50051 (gRPC)' : `resolved via registry → ${c.id}` };
}

export default function Routing() {
  const [tab, setTab] = useState<'live' | 'routes' | 'rules'>('live');
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(0);
  const traffic = useApi<Call[]>('routing/traffic', paused || tab !== 'live' ? undefined : 3000);
  const routes = useApi<RouteRow[]>('routing/routes');
  const rules = useApi<Rule[]>('routing/rules');
  const act = useAction();

  return (
    <>
      <PageHeader
        title="A2A Protocol Routing"
        crumb="Proxies, validates and routes JSON-RPC 2.0, HTTP+JSON and gRPC bindings · extracts Task ID, Context ID and method on every hop"
        tools={<>
          <span className={`live${paused ? ' paused' : ''}`}><i />{paused ? 'Paused' : 'Live'}</span>
          <button className="btn" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume stream' : 'Pause stream'}</button>
        </>}
      />
      <Tabs items={tabItems([['live', 'Live Traffic'], ['routes', 'Routes'], ['rules', 'Protocol Validation']], tab, setTab)} />
      <div className="body">
        <Kpis label="Routing metrics" items={[
          { label: 'Requests / sec', value: '412' }, { label: 'Open SSE streams', value: '1,208' }, { label: 'Avg agent hops / task', value: '2.7' },
          { label: 'Validation rejects', value: '0.21%' }, { label: 'Gateway overhead p95', value: '14 ms' }
        ]} />

        {tab === 'live' && (
        <Loadable state={traffic}>{(calls) => {
          const c = calls[Math.min(sel, calls.length - 1)]!;
          const x = inspect(c);
          return (
            <div className="split" id="live">
              <section className="card" style={{ flex: '999 1 640px' }}>
                <CardHead title="Live A2A Traffic" sub={`East-west calls · ${paused ? 'paused' : 'refreshing every 3 s'} · select a call to inspect it`} />
                <div className="tw"><table className="tbl nw">
                  <thead><tr><th>Time</th><th>Method</th><th>Caller → Callee</th><th>Task</th><th>Context</th><th>Task state</th><th>Latency</th><th>Result</th></tr></thead>
                  <tbody>{calls.map((r, i) => (
                    <tr key={i} className={`click${i === sel ? ' sel' : ''}`} onClick={() => setSel(i)}>
                      <td><button className="rb mono" style={{ fontSize: 12 }} onClick={() => setSel(i)} aria-pressed={i === sel}>{time(r.t)}</button></td>
                      <td className="mono" style={{ color: 'var(--text-2)' }}>{r.m}</td>
                      <td>{r.from} <span className="muted">→</span> {r.to}</td>
                      <td className="mono" style={{ color: 'var(--text-3)' }}>{r.task}</td>
                      <td className="mono" style={{ color: 'var(--text-3)' }}>{r.ctx}</td>
                      <td><Pill tone={STATE_TONE[r.st] ?? 'mute'}>{r.st}</Pill></td>
                      <td>{r.lat}</td>
                      <td><Pill tone={codeTone(r.code)}>{r.code}</Pill></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </section>
              <section className="card" style={{ flex: '1 1 440px' }}>
                <CardHead title="Call Inspector" sub={<span className="mono">{c.task} · {c.m}</span>} right={<Link className="lk" to="/telemetry">Open trace →</Link>} />
                <dl className="kvl">
                  <dt>Route matched</dt><dd className="mono">{x.route}</dd>
                  <dt>Binding</dt><dd>{c.b}</dd>
                  <dt>Upstream</dt><dd className="mono" style={{ color: 'var(--text-3)' }}>{x.upstream}</dd>
                  <dt>Caller principal</dt><dd className="mono">spiffe://example.com/{c.p}</dd>
                  <dt>On behalf of</dt><dd>alice@example.com (employee)</dd>
                  <dt>Task · Context</dt><dd className="mono">{c.task} · {c.ctx}</dd>
                </dl>
                <div className="label">Gateway checks</div>
                {x.checks.map(([res, tone, text]) => <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '5px 0' }}><span style={{ minWidth: 52, display: 'inline-flex' }}><Pill tone={tone}>{res}</Pill></span><span>{text}</span></div>)}
                <div className="label">Request</div>
                <pre className="code">{x.req}</pre>
              </section>
            </div>
          );
        }}</Loadable>
        )}

        {tab === 'routes' && (
        <section className="card" id="routes">
          <CardHead title="Routes" sub="One public domain; each agent is addressed by path and resolved through the registry" />
          <Loadable state={routes}>{(list) => (
            <div className="tw"><table className="tbl nw">
              <thead><tr><th>Route</th><th>Binding</th><th>A2A operations</th><th>Upstream</th><th>Timeout</th><th>Retries</th><th>Response</th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.route}><td className="mono">{r.route}</td><td><span className="chip">{r.binding}</span></td><td style={{ color: 'var(--text-3)' }}>{r.ops}</td><td>{r.upstream}</td><td>{r.timeout}</td><td>{r.retries}</td><td><Pill tone={respTone(r.response)}>{r.response}</Pill></td></tr>
              ))}</tbody>
            </table></div>
          )}</Loadable>
        </section>
        )}

        {tab === 'rules' && (
        <section className="card" id="rules">
          <CardHead title="Protocol Validation" sub="Applied to every payload before it is forwarded to a backend agent" />
          <Loadable state={rules}>{(list) => <>{list.map((r) => (
            <div className="row-line" key={r.key}>
              <div style={{ minWidth: 0 }}><div>{r.name}</div><div className="cs">{r.desc}</div></div>
              <Toggle on={r.enabled} label={r.name} onChange={async (v) => {
                const u = await act(() => api.post<Rule>(`routing/rules/${r.key}`, { enabled: v }), `${r.name}: ${v ? 'on' : 'off'}`);
                if (u) rules.setData((l) => l?.map((x) => (x.key === u.key ? u : x)) ?? null);
              }} />
            </div>
          ))}</>}</Loadable>
        </section>
        )}
      </div>
    </>
  );
}
