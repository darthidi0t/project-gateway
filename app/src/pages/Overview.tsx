import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { CardHead, Kpis, Loadable, PageHeader, Pill, Segmented, Tabs, money, spendColor } from '../components/ui';

interface OverviewData {
  range: string;
  kpis: { req: string; succ: string; inj: string; deny: string; spend: string; activeAgents: number };
  trend: { labels: string[]; requests: number[]; errors: number[]; max: number; axisTop: string; axisMid: string };
  methods: Array<{ name: string; pct: number }>;
  topRoutes: Array<{ caller: string; callee: string; calls: string; p95: string; errors: string; status: string }>;
  severity: Array<{ label: string; pct: number; color: string }>;
  events: Array<{ tag: string; tone: string; title: string; detail: string; ago: string; link: string }>;
  spend: Array<{ name: string; used: number; cap: number }>;
}

const W = 600, H = 180;
function smoothPath(vals: number[], max: number) {
  const n = vals.length;
  const pts = vals.map((v, i) => [i * (W / (n - 1)), H - (v / max) * (H - 8) - 2] as const);
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!, b = pts[i]!, cx = ((a[0] + b[0]) / 2).toFixed(1);
    d += ` C${cx},${a[1].toFixed(1)} ${cx},${b[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  }
  return d;
}
const METHOD_COLORS = ['#5fd38d', '#4c7fe0', '#8fb3ff', '#b48ef0', '#f3b552', '#f07167'];
const statusTone = (s: string) => (s === 'Healthy' ? 'ok' : s === 'Degraded' || s === 'Half-open' ? 'warn' : 'bad');

export default function Overview() {
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d');
  const state = useApi<OverviewData>(`overview?range=${range}`);

  return (
    <>
      <PageHeader
        title="Gateway Overview"
        crumb="a2a.gateway.example.com · Production · A2A protocol v1.0"
        tools={<Segmented label="Time range" value={range} onChange={setRange} options={[['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']]} />}
      />
      <Tabs items={[{ label: 'Executive Dashboard', active: true, onSelect: () => {} }]} />
      <Loadable state={state}>{(d) => {
        const line = smoothPath(d.trend.requests, d.trend.max);
        const maxPct = Math.max(...d.methods.map((m) => m.pct));
        let offset = 25;
        return (
          <div className="body">
            <Kpis label="Key metrics" items={[
              { label: 'A2A Requests', value: d.kpis.req, delta: '↑ 18%', deltaTone: 'good' },
              { label: 'Active Agents', value: d.kpis.activeAgents, delta: 'of 8 registered', deltaTone: 'good' },
              { label: 'Task Success', value: d.kpis.succ, delta: '↓ 0.4%', deltaTone: 'bad' },
              { label: 'Injections Blocked', value: d.kpis.inj, delta: '↑ 22%', deltaTone: 'bad' },
              { label: 'Policy Denials', value: d.kpis.deny, delta: '↓ 9%', deltaTone: 'good' },
              { label: 'Agent Spend', value: d.kpis.spend, delta: '↑ 12%', deltaTone: 'bad' }
            ]} />

            <div className="grid2">
              <section className="card">
                <CardHead title="A2A Traffic Trend" sub="East-west agent requests vs. errors through the gateway" right={<Link className="lk" to="/telemetry">View telemetry →</Link>} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', height: H, textAlign: 'right', minWidth: 34 }}><span>{d.trend.axisTop}</span><span>{d.trend.axisMid}</span><span>0</span></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label="Traffic trend chart" style={{ display: 'block' }}>
                      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fd38d" stopOpacity=".28" /><stop offset="1" stopColor="#5fd38d" stopOpacity="0" /></linearGradient></defs>
                      <path d={`M0 0.5H${W}M0 ${H / 2}H${W}M0 ${H - 0.5}H${W}`} stroke="#20252c" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#ga)" />
                      <path d={line} fill="none" stroke="#5fd38d" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      <path d={smoothPath(d.trend.errors, d.trend.max * 0.24)} fill="none" stroke="#f3b552" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{d.trend.labels.map((l) => <span key={l}>{l}</span>)}</div>
                  </div>
                </div>
                <div className="legend" style={{ marginTop: 16 }}><span><i className="dot" style={{ background: '#5fd38d' }} />Requests</span><span><i className="dot" style={{ background: '#f3b552' }} />Errors (4xx/5xx + JSON-RPC)</span></div>
              </section>

              <section className="card">
                <CardHead title="Requests by A2A Method" sub="JSON-RPC, HTTP+JSON and gRPC bindings combined" right={<Link className="lk" to="/routing">View routes →</Link>} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {d.methods.map((m, i) => (
                    <div key={m.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,200px) 1fr 48px', gap: 14, alignItems: 'center' }}>
                      <span className="mono" style={{ color: 'var(--text-2)' }}>{m.name}</span>
                      <div className="bar"><i style={{ width: `${(m.pct / maxPct) * 100}%`, background: METHOD_COLORS[i] }} /></div>
                      <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>{m.pct}%</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid2">
              <section className="card">
                <CardHead title="Top Agent Routes" sub="Busiest caller → callee pairs (east-west)" right={<Link className="lk" to="/registry">View registry →</Link>} />
                <div className="tw"><table className="tbl">
                  <thead><tr><th>Caller</th><th>Callee</th><th>Calls</th><th>p95</th><th>Errors</th><th>Status</th></tr></thead>
                  <tbody>{d.topRoutes.map((r) => <tr key={r.caller + r.callee}><td>{r.caller}</td><td>{r.callee}</td><td>{r.calls}</td><td className="nw">{r.p95}</td><td>{r.errors}</td><td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td></tr>)}</tbody>
                </table></div>
              </section>

              <section className="card">
                <CardHead title="Findings · Severity" sub="Gateway detections across all policies" right={<Link className="lk" to="/guard">View findings →</Link>} />
                <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
                  <svg viewBox="0 0 42 42" width="150" height="150" role="img" aria-label="Severity donut chart">
                    <circle cx="21" cy="21" r="15.915" fill="none" stroke="#20252c" strokeWidth="6" />
                    {d.severity.map((sv) => { const el = <circle key={sv.label} cx="21" cy="21" r="15.915" fill="none" stroke={sv.color} strokeWidth="6" strokeDasharray={`${sv.pct} ${100 - sv.pct}`} strokeDashoffset={offset} />; offset -= sv.pct; return el; })}
                    <text x="21" y="21" textAnchor="middle" fill="#e7e9ec" fontSize="6" fontWeight="600">1,904</text>
                    <text x="21" y="27" textAnchor="middle" fill="#8d939c" fontSize="3">findings</text>
                  </svg>
                  <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                    {d.severity.map((sv) => <div key={sv.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span><i className="dot" style={{ background: sv.color }} />{sv.label}</span><span>{sv.pct}%</span></div>)}
                  </div>
                </div>
              </section>
            </div>

            <div className="grid2">
              <section className="card">
                <CardHead title="Recent Gateway Events" sub="Blocked, throttled and denied A2A calls" right={<Link className="lk" to="/guard">View all →</Link>} />
                {d.events.map((e) => (
                  <div className="ev" key={e.title}>
                    <Pill tone={e.tone}>{e.tag}</Pill>
                    <div style={{ flex: 1, minWidth: 0 }}><Link to={e.link} style={{ color: 'var(--text)' }}>{e.title}</Link><div className="cs">{e.detail}</div></div>
                    <span className="cs">{e.ago}</span>
                  </div>
                ))}
              </section>
              <section className="card">
                <CardHead title="Spend vs. Budget by Principal" sub="Token + compute cost, month to date" right={<Link className="lk" to="/spend">View governance →</Link>} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {d.spend.map((s) => (
                    <div key={s.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{s.name}</span><span style={{ color: 'var(--text-3)' }}>{money(s.used)} <span className="muted">/ {money(s.cap)}</span></span></div>
                      <div className="bar"><i style={{ width: `${(s.used / s.cap) * 100}%`, background: spendColor(s.used / s.cap) }} /></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        );
      }}</Loadable>
    </>
  );
}
