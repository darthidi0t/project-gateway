import { Fragment } from 'react';
import { api, useApi } from '../api';
import { Arrow, CardHead, Kpis, Loadable, PageHeader, Pill, Tabs, Toggle, money, spendColor, useAction } from '../components/ui';

type Circuit = 'open' | 'half-open' | 'closed';
interface Gov {
  kpis: { spend: number; budget: number; tokens: string; throttled24h: string; openCircuits: number; loopsStopped30d: number; saved: string };
  incident: { context: string; detectedAt: string; cycle: string[]; hops: number; stats: { depth: number; depthLimit: number; calls: number; windowSec: number; tokens: string; saved: string }; circuit: Circuit; contextKilled: boolean };
  loopRules: Array<{ key: string; name: string; desc: string; value: string; enabled: boolean }>;
  caps: Array<{ name: string; id: string; rpm: number; tpd: string; cap: number; used: number; breach: string; circuit: Circuit }>;
  throttleLog: Array<{ t: string; route: string; limit: string; observed: string; response: string; tone: string }>;
}
const CIRCUIT: Record<Circuit, [string, string]> = { open: ['Circuit open', 'bad'], 'half-open': ['Half-open', 'warn'], closed: ['Closed', 'ok'] };
const NEXT: Record<Circuit, [Circuit, string]> = { open: ['half-open', 'Move to half-open'], 'half-open': ['closed', 'Close circuit'], closed: ['open', 'Re-open circuit'] };

export default function Spend() {
  const state = useApi<Gov>('governance');
  const act = useAction();

  return (
    <>
      <PageHeader title="Spend, Rate Limits & Loop Breakers" crumb="Token, request and dollar caps per agent principal · automatic circuit breaking for runaway agent-to-agent loops" />
      <Tabs items={[{ label: 'Loop Breakers', href: '#loops', active: true }, { label: 'Caps by Principal', href: '#caps' }, { label: 'Throttling Log', href: '#throttle' }]} />
      <Loadable state={state}>{(d) => {
        const inc = d.incident;
        const [cLabel, cTone] = CIRCUIT[inc.circuit];
        const [next, nextLabel] = NEXT[inc.circuit];
        return (
          <div className="body">
            <Kpis label="Spend metrics" items={[
              { label: 'Spend this month', value: <>{money(d.kpis.spend)} <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>/ {money(d.kpis.budget)}</span></> },
              { label: 'Tokens this month', value: d.kpis.tokens },
              { label: '429s issued (24 h)', value: d.kpis.throttled24h },
              { label: 'Open circuits', value: d.kpis.openCircuits, style: { color: d.kpis.openCircuits ? '#ff8a80' : '#6ee59a' } },
              { label: 'Loops stopped (30 d)', value: d.kpis.loopsStopped30d, delta: `≈ ${d.kpis.saved} saved`, deltaTone: 'good' }
            ]} />

            <section id="loops" style={{ background: '#1a1312', border: '1px solid #5c2a24', borderRadius: 10, padding: 20 }}>
              <CardHead
                title={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 16 }}><Pill tone={cTone}>{cLabel}</Pill>Runaway loop stopped · context <span className="mono" style={{ fontSize: 13 }}>{inc.context}</span></span>}
                sub={<span style={{ color: '#c9a9a4' }}>Detected {inc.detectedAt} · cycle {inc.cycle[0]} ⇄ {inc.cycle[1]} · {inc.contextKilled ? 'context terminated, open tasks canceled' : `route ${inc.cycle[0]} → ${inc.cycle[1]} is ${cLabel.toLowerCase()}`}</span>}
                right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={async () => { const r = await act(() => api.post<Gov>('governance/circuit', { state: next }), `Circuit: ${CIRCUIT[next][0]}`); if (r) state.setData(r); }}>{nextLabel}</button>
                  <button className="btn danger" disabled={inc.contextKilled} onClick={async () => { const r = await act(() => api.post<Gov>('governance/kill-context'), 'Context terminated'); if (r) state.setData(r); }}>{inc.contextKilled ? 'Context terminated' : 'Terminate context'}</button>
                </div>}
              />
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 10 }} aria-label="Loop cycle">
                  {inc.cycle.map((n, i) => (
                    <Fragment key={i}>
                      {i > 0 && <div style={{ color: '#f07167', padding: '0 10px', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}><Arrow />SendMessage</div>}
                      <div style={{ background: 'var(--inset)', border: '1px solid var(--ctl)', borderRadius: 9, padding: '10px 14px', fontSize: 13 }}>{n}</div>
                    </Fragment>
                  ))}
                  <div style={{ color: '#c9a9a4', padding: '0 10px', fontSize: 12 }}>× {inc.hops} hops</div>
                </div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  {[[String(inc.stats.depth), `delegation depth (limit ${inc.stats.depthLimit})`], [String(inc.stats.calls), `calls in ${inc.stats.windowSec} s`], [inc.stats.tokens, 'tokens burned'], [`≈ ${inc.stats.saved}`, 'projected spend avoided']].map(([v, l], i) => (
                    <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 20, fontWeight: 600, color: i === 3 ? '#6ee59a' : undefined }}>{v}</b><span style={{ fontSize: 12, color: '#c9a9a4' }}>{l}</span></div>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid2">
              <section className="card">
                <CardHead title="Loop Detection Rules" sub="Any rule tripping opens the circuit for that caller → callee route" />
                {d.loopRules.map((r) => (
                  <div className="row-line" key={r.key}>
                    <div style={{ minWidth: 0 }}><div>{r.name}</div><div className="cs">{r.desc}</div></div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: 13, background: 'var(--inset)', border: '1px solid var(--ctl)', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap' }}>{r.value}</span>
                      <Toggle on={r.enabled} label={r.name} onChange={async (v) => {
                        const u = await act(() => api.post<Gov['loopRules'][number]>(`governance/rules/${r.key}`, { enabled: v }), `${r.name}: ${v ? 'on' : 'off'}`);
                        if (u) state.setData((x) => (x ? { ...x, loopRules: x.loopRules.map((y) => (y.key === u.key ? u : y)) } : x));
                      }} />
                    </div>
                  </div>
                ))}
              </section>
              <section className="card">
                <CardHead title="Circuit Breaker" sub="Behaviour once a route trips" />
                {[['Open', 'All calls on the route fail fast with 503 and the task moves to failed', '5 min cool-down'], ['Half-open', 'One probe request lets through; success closes the circuit', '1 req / 10 s'], ['Notify', 'Agent owners and the security channel', 'on open'], ['Spend-cap breach', 'What happens when a principal hits its monthly dollar cap', 'block + alert']].map(([n, desc, v]) => (
                  <div className="row-line" key={n}><div><div>{n}</div><div className="cs">{desc}</div></div><span className="mono" style={{ fontSize: 13, background: 'var(--inset)', border: '1px solid var(--ctl)', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap' }}>{v}</span></div>
                ))}
              </section>
            </div>

            <section className="card" id="caps">
              <CardHead title="Caps by Agent Principal" sub="Request, token and dollar limits enforced at the gateway · counters reset per window" />
              <div className="tw"><table className="tbl nw">
                <thead><tr><th>Principal</th><th>Requests / min</th><th>Tokens / day</th><th>Monthly cap</th><th style={{ width: '22%' }}>Spend used</th><th>On breach</th><th>Circuit</th></tr></thead>
                <tbody>{d.caps.map((c) => {
                  const r = c.used / c.cap;
                  return (
                    <tr key={c.id}>
                      <td><div>{c.name}</div><div className="mono muted">{c.id}</div></td>
                      <td>{c.rpm}</td><td>{c.tpd}</td><td>{money(c.cap)}</td>
                      <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><div className="bar" style={{ flex: 1, minWidth: 120 }}><i style={{ width: `${r * 100}%`, background: spendColor(r) }} /></div><span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 42, textAlign: 'right' }}>{Math.round(r * 100)}%</span></div></td>
                      <td style={{ color: 'var(--text-3)' }}>{c.breach}</td>
                      <td><Pill tone={CIRCUIT[c.circuit][1]}>{CIRCUIT[c.circuit][0]}</Pill></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            </section>

            <section className="card" id="throttle">
              <CardHead title="Throttling Log" sub="Most recent limit hits" />
              <div className="tw"><table className="tbl nw">
                <thead><tr><th>Time</th><th>Principal → Agent</th><th>Limit</th><th>Observed</th><th>Response</th></tr></thead>
                <tbody>{d.throttleLog.map((t) => <tr key={t.t}><td className="mono" style={{ color: 'var(--text-3)' }}>{t.t}</td><td>{t.route}</td><td>{t.limit}</td><td>{t.observed}</td><td><Pill tone={t.tone}>{t.response}</Pill></td></tr>)}</tbody>
              </table></div>
            </section>
          </div>
        );
      }}</Loadable>
    </>
  );
}
