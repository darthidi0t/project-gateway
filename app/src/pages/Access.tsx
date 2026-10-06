import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { Arrow, CardHead, Loadable, PageHeader, Pill, Tabs, Toggle, useAction } from '../components/ui';

interface Scope { scope: string; methods: string; rpm: string; grants: string[] }
interface Policy { id: string; effect: string; hits: string; enabled: boolean; desc: string; cel: string }
interface AccessData {
  identity: Array<{ title: string; sub: string; rows: Array<[string, string]> }>;
  acl: { agents: string[]; scopes: Scope[]; unpublishedChanges: number };
  policies: Policy[];
  obo: { task: string; context: string; hops: Array<{ label: string; name: string; claims: string[]; verdict: string; tone: string }>; rules: string[] };
}
const EFFECT: Record<string, string> = { Deny: 'bad', Allow: 'ok', 'Step-up': 'warn' };

export default function Access() {
  const state = useApi<AccessData>('access');
  const [selPolicy, setSelPolicy] = useState(0);
  const act = useAction();
  const patch = (fn: (d: AccessData) => AccessData) => state.setData((d) => (d ? fn(d) : d));

  return (
    <>
      <PageHeader
        title="Access Control"
        crumb="Centralized AuthN / AuthZ for every agent principal · mTLS, OAuth 2.0 scopes, JWT and traceable on-behalf-of chains"
        tools={<button className="btn pri" disabled={!state.data?.acl.unpublishedChanges} onClick={async () => {
          const r = await act(() => api.post<{ unpublishedChanges: number }>('access/publish'), 'Permission changes published to the gateway');
          if (r) patch((d) => ({ ...d, acl: { ...d.acl, unpublishedChanges: 0 } }));
        }}>Publish changes{state.data?.acl.unpublishedChanges ? ` (${state.data.acl.unpublishedChanges})` : ''}</button>}
      />
      <Tabs items={[{ label: 'Identity', href: '#identity', active: true }, { label: 'Scopes & ACLs', href: '#acl' }, { label: 'Policies (CEL)', href: '#cel' }, { label: 'On-behalf-of Chains', href: '#obo' }]} />
      <Loadable state={state}>{(d) => {
        const pol = d.policies[Math.min(selPolicy, d.policies.length - 1)]!;
        const grantCount = d.acl.scopes.reduce((n, s) => n + s.grants.length, 0);
        return (
          <div className="body">
            <div className="grid3" id="identity">
              {d.identity.map((c) => (
                <section className="card" key={c.title}>
                  <CardHead title={c.title} sub={c.sub} right={<Pill tone="ok">Enforced</Pill>} />
                  <dl className="kvl">{c.rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className={v.includes('://') ? 'mono' : ''}>{v}</dd></Fragment>)}</dl>
                </section>
              ))}
            </div>

            <section className="card" id="acl">
              <CardHead title="Scope → Agent Capability ACL" sub={`Which OAuth scopes may reach which agents. Click a cell to grant or revoke · ${grantCount} grants · ${d.acl.unpublishedChanges ? `${d.acl.unpublishedChanges} unpublished change(s)` : 'no unpublished changes'}`} right={<span className="cs mono">Permissions table</span>} />
              <div className="tw"><table className="tbl">
                <thead><tr><th>Scope</th><th>Allowed A2A methods</th>{d.acl.agents.map((a) => <th key={a} style={{ textAlign: 'center' }}>{a}</th>)}<th>Rate limit</th></tr></thead>
                <tbody>{d.acl.scopes.map((s) => (
                  <tr key={s.scope}>
                    <td className="mono" style={{ color: 'var(--text)' }}>{s.scope}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: 12.5 }}>{s.methods}</td>
                    {d.acl.agents.map((a) => {
                      const on = s.grants.includes(a);
                      return (
                        <td key={a} style={{ textAlign: 'center' }}>
                          <button aria-pressed={on} aria-label={`${s.scope} → ${a}`} onClick={async () => {
                            const r = await act(() => api.post<{ scope: Scope; unpublishedChanges: number }>('access/acl', { scope: s.scope, agent: a, granted: !on }));
                            if (r) patch((x) => ({ ...x, acl: { ...x.acl, unpublishedChanges: r.unpublishedChanges, scopes: x.acl.scopes.map((y) => (y.scope === r.scope.scope ? r.scope : y)) } }));
                          }} style={{ width: 40, height: 34, borderRadius: 7, cursor: 'pointer', fontSize: 14, border: `1px solid ${on ? '#2a5a3a' : 'var(--ctl)'}`, background: on ? '#16301f' : 'var(--inset)', color: on ? '#6ee59a' : '#5b626c' }}>{on ? '✓' : '–'}</button>
                        </td>
                      );
                    })}
                    <td style={{ color: 'var(--text-3)' }}>{s.rpm}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </section>

            <div className="split" id="cel">
              <section className="card" style={{ flex: '1 1 520px' }}>
                <CardHead title="Access Policies" sub="CEL expressions bound to agent entities · evaluated per method and resource" />
                <div className="tw"><table className="tbl nw">
                  <thead><tr><th>Policy</th><th>Effect</th><th>Hits 24 h</th><th>Enabled</th></tr></thead>
                  <tbody>{d.policies.map((p, i) => (
                    <tr key={p.id} className={p.id === pol.id ? 'sel' : ''}>
                      <td><button className="rb mono" style={{ fontSize: 12.5 }} onClick={() => setSelPolicy(i)} aria-pressed={p.id === pol.id}>{p.id}</button></td>
                      <td><Pill tone={EFFECT[p.effect] ?? 'mute'}>{p.effect}</Pill></td>
                      <td>{p.hits}</td>
                      <td><Toggle on={p.enabled} label={`Enable ${p.id}`} onChange={async (v) => {
                        const r = await act(() => api.post<Policy>(`access/policies/${p.id}`, { enabled: v }), `${p.id} ${v ? 'enabled' : 'disabled'}`);
                        if (r) patch((x) => ({ ...x, policies: x.policies.map((y) => (y.id === r.id ? r : y)) }));
                      }} /></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </section>
              <section className="card" style={{ flex: '1 1 520px' }}>
                <CardHead title={<span className="mono" style={{ fontSize: 13.5 }}>{pol.id}</span>} sub={pol.desc} right={<Pill tone={EFFECT[pol.effect] ?? 'mute'}>{pol.effect}</Pill>} />
                <pre className="code" style={{ fontSize: 12.5, lineHeight: 1.7, padding: 16 }}>{pol.cel}</pre>
                <p className="cs" style={{ marginTop: 14 }}>Variables: <span className="mono">principal</span> (calling agent + user) · <span className="mono">resource</span> (target agent, skill) · <span className="mono">request</span> (method, token, obo chain)</p>
              </section>
            </div>

            <section className="card" id="obo">
              <CardHead title="On-behalf-of Delegation Chain" sub={<>Task <span className="mono">{d.obo.task}</span> · context <span className="mono">{d.obo.context}</span> · each hop gets a new token whose scopes can only narrow</>} right={<Link className="lk" to="/telemetry">View trace →</Link>} />
              <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: 6 }}>
                {d.obo.hops.map((h, i) => (
                  <Fragment key={h.name}>
                    {i > 0 && <div style={{ flex: '0 0 46px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: h.tone === 'warn' ? 'var(--amber)' : 'var(--accent)' }}><Arrow /></div>}
                    <div style={{ flex: '1 0 230px', background: 'var(--inset)', border: `1px solid ${h.tone === 'warn' ? '#5a4318' : 'var(--ctl)'}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="kl">{h.label}</span>
                      <div style={{ fontWeight: 600 }}>{h.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>{h.claims.map((c) => <div key={c}>{c}</div>)}</div>
                      <span style={{ alignSelf: 'flex-start' }}><Pill tone={h.tone}>{h.verdict}</Pill></span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: '10px 20px', marginTop: 20, fontSize: 13 }}>
                {d.obo.rules.map((r) => <div key={r} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Pill tone="ok">Rule</Pill>{r}</div>)}
              </div>
            </section>
          </div>
        );
      }}</Loadable>
    </>
  );
}
