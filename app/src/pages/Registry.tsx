import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { CardHead, Loadable, PageHeader, Pill, Tabs, useAction } from '../components/ui';

interface Agent {
  id: string; name: string; description: string; binding: string; interfaces: string[]; auth: string; backendUrl: string; skills: string[];
  capabilities: { streaming: boolean; pushNotifications: boolean; extendedAgentCard: boolean };
  signature: string; owner: string; trust: string; lastSync: string; kind: string; active: boolean; status: string; gatewayUrl: string;
}
interface Approval { id: string; kind: string; title: string; meta: string; diff: string; decision: null | 'approved' | 'rejected' }
interface SearchResult { agentId: string; agent: string; skill: string; description: string; score: number; callable: boolean; requiredScope: string }

const statusTone = (s: string) => (s === 'Active' ? 'ok' : s === 'Throttled' ? 'warn' : 'mute');
const syncTone = (a: Agent) => (a.lastSync.startsWith('Drift') ? 'info' : a.kind === 'pending' && !a.active ? 'mute' : 'ok');
const kindTone: Record<string, string> = { 'New agent': 'info', 'Card drift': 'warn', 'Scope change': 'mute' };

export default function Registry() {
  const [tab, setTab] = useState<'agents' | 'approvals'>('agents');
  const agents = useApi<Agent[]>('agents');
  const approvals = useApi<Approval[]>('approvals');
  const [params] = useSearchParams();
  const [selId, setSelId] = useState(params.get('agent') ?? 'agt-billing');
  const [registering, setRegistering] = useState(false);
  useEffect(() => { const a = params.get('agent'); if (a) { setSelId(a); setTab('agents'); } }, [params]);
  const card = useApi<unknown>(`agents/${selId}/card`);
  const [query, setQuery] = useState('dispute a duplicate charge on a customer invoice');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const act = useAction();

  const pending = approvals.data?.filter((p) => !p.decision).length ?? 0;
  const replaceAgent = (a: Agent) => agents.setData((list) => list?.map((x) => (x.id === a.id ? a : x)) ?? null);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    const r = await act(() => api.post<{ results: SearchResult[] }>('search', { query }));
    setSearching(false);
    if (r) setResults(r.results);
  }

  return (
    <>
      <PageHeader
        title="Agent Registry"
        crumb={<>Agent Cards are cached and rewritten so callers only ever see <span className="mono">a2a.gateway.example.com</span></>}
        tools={<><button className="btn" onClick={() => setTab('approvals')}>Review approvals{pending > 0 ? ` (${pending})` : ''}</button><button className="btn pri" onClick={() => setRegistering(true)}>+ Register agent</button></>}
      />
      <Tabs items={[
        { label: 'Agents & Discovery', active: tab === 'agents', onSelect: () => setTab('agents') },
        { label: <>Pending Approvals {pending > 0 && <span className="count">{pending}</span>}</>, active: tab === 'approvals', onSelect: () => setTab('approvals') }
      ]} />

      {tab === 'agents' && (
        <div className="body">
          <section className="card">
            <CardHead title="Semantic Discovery" sub="Describe the capability you need — matched against skills in every cached Agent Card" right={<span className="cs mono">POST /search</span>} />
            <form onSubmit={runSearch} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--inset)', border: '1px solid var(--ctl)', borderRadius: 9, padding: '0 6px 0 14px', minHeight: 48 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8d939c" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
              <label htmlFor="q" className="sr-only">Search agents by capability</label>
              <input id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. reconcile an invoice dispute"
                style={{ flex: 1, minWidth: 0, background: 'none', border: 0, color: 'var(--text)', font: 'inherit', fontSize: 14, outline: 'none', minHeight: 44 }} />
              <button className="btn pri" type="submit" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
            </form>
            {results && (
              <div style={{ marginTop: 6 }}>
                {results.length === 0 && <p className="muted">No agent advertises a matching skill.</p>}
                {results.map((r) => (
                  <div className="ev" key={r.agentId} style={{ alignItems: 'center' }}>
                    <span className="mono" style={{ color: 'var(--accent)', minWidth: 44, fontSize: 13 }}>{r.score.toFixed(2)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button className="rb" style={{ padding: 0, minHeight: 0 }} onClick={() => setSelId(r.agentId)}><span>{r.agent} <span className="mono muted">· skill {r.skill}</span></span></button>
                      <div className="cs">“{r.description}”</div>
                    </div>
                    {r.callable ? <Pill tone="ok">Callable with your scopes</Pill> : <Pill tone="warn">Needs {r.requiredScope}</Pill>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <Loadable state={agents}>{(list) => {
            const sel = list.find((a) => a.id === selId) ?? list[0]!;
            return (
              <div className="split">
                <section className="card" style={{ flex: '999 1 620px' }}>
                  <CardHead title="Registered Agents" sub={`${list.filter((a) => a.active).length} active of ${list.length} · select a row to inspect its card`} right={<span className="cs mono">GET /agents</span>} />
                  <div className="tw"><table className="tbl">
                    <thead><tr><th>Agent</th><th>Binding</th><th>Skills</th><th>Auth</th><th>Card sync</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{list.map((a) => (
                      <tr key={a.id} className={`click${a.id === sel.id ? ' sel' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('button:not(.rb)')) setSelId(a.id); }}>
                        <td><button className="rb" onClick={() => setSelId(a.id)} aria-pressed={a.id === sel.id}><span className="rn">{a.name}</span><span className="mono muted">{a.id}</span></button></td>
                        <td><span className="chip">{a.binding}</span></td>
                        <td>{a.skills.length}</td>
                        <td style={{ color: 'var(--text-3)', fontSize: 12.5 }}>{a.auth}</td>
                        <td><Pill tone={syncTone(a)}>{a.lastSync}</Pill></td>
                        <td><Pill tone={statusTone(a.status)}>{a.status}</Pill></td>
                        <td><button className="btn sm" onClick={async () => { const r = await act(() => api.post<Agent>(`agents/${a.id}/status`, { active: !a.active }), `${a.name} ${a.active ? 'deactivated' : 'activated'}`); if (r) replaceAgent(r); }}>{a.active ? 'Deactivate' : 'Activate'}</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </section>

                <section className="card" style={{ flex: '1 1 420px' }}>
                  <CardHead title={sel.name} sub={sel.description} right={
                    <button className="btn sm" onClick={async () => { const r = await act(() => api.post<Agent>(`agents/${sel.id}/sync`), 'Agent Card re-synced'); if (r) { replaceAgent(r); void card.reload(); } }}>↻ Sync card</button>
                  } />
                  <dl className="kvl">
                    <dt>Gateway URL</dt><dd className="mono" style={{ color: 'var(--accent)' }}>{sel.gatewayUrl}</dd>
                    <dt>Backend URL</dt><dd className="mono" style={{ color: 'var(--text-3)' }}>{sel.backendUrl} <Pill tone="mute">hidden from callers</Pill></dd>
                    <dt>Agent Card</dt><dd className="mono">{sel.gatewayUrl}/.well-known/agent-card.json</dd>
                    <dt>Interfaces</dt><dd>{sel.interfaces.join(', ')}</dd>
                    <dt>Capabilities</dt><dd style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Pill tone={sel.capabilities.streaming ? 'ok' : 'mute'}>{sel.capabilities.streaming ? 'streaming' : 'no streaming'}</Pill>
                      <Pill tone={sel.capabilities.pushNotifications ? 'ok' : 'mute'}>{sel.capabilities.pushNotifications ? 'pushNotifications' : 'no push'}</Pill>
                      <Pill tone={sel.capabilities.extendedAgentCard ? 'info' : 'mute'}>{sel.capabilities.extendedAgentCard ? 'extendedAgentCard' : 'basic card only'}</Pill>
                    </dd>
                    <dt>Security schemes</dt><dd>{sel.auth}</dd>
                    <dt>Card signature</dt><dd><Pill tone={sel.signature === 'Unsigned' ? 'warn' : 'ok'}>{sel.signature}</Pill></dd>
                    <dt>Owner · trust</dt><dd>{sel.owner} · {sel.trust}</dd>
                    <dt>Last sync</dt><dd>{sel.lastSync}</dd>
                  </dl>
                  <div className="label">Skills</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{sel.skills.map((s) => <span key={s} className="chip mono">{s}</span>)}</div>
                  <div className="label">Rewritten card served to callers</div>
                  <pre className="code" style={{ maxHeight: 320 }}>{card.data ? JSON.stringify(card.data, null, 2) : card.error ?? 'Loading…'}</pre>
                </section>
              </div>
            );
          }}</Loadable>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="body">
          <section className="card">
            <CardHead title="Pending Approvals" sub="New registrations and upstream Agent Card changes are held until an admin approves them" />
            <Loadable state={approvals}>{(list) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {list.map((p) => (
                  <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <Pill tone={kindTone[p.kind] ?? 'mute'}>{p.kind}</Pill>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ fontWeight: 500 }}>{p.title}</div>
                      <div className="cs">{p.meta}</div>
                      <pre className="code" style={{ marginTop: 10 }}>{p.diff}</pre>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {p.decision
                        ? <Pill tone={p.decision === 'approved' ? 'ok' : 'bad'}>{p.decision === 'approved' ? 'Approved' : 'Rejected'}</Pill>
                        : (['rejected', 'approved'] as const).map((d) => (
                          <button key={d} className={`btn sm${d === 'approved' ? ' pri' : ''}`} onClick={async () => {
                            const r = await act(() => api.post<Approval>(`approvals/${p.id}`, { decision: d }), d === 'approved' ? 'Approved' : 'Rejected');
                            if (r) { approvals.setData((l) => l?.map((x) => (x.id === r.id ? r : x)) ?? null); void agents.reload(); }
                          }}>{d === 'approved' ? 'Approve' : 'Reject'}</button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}</Loadable>
          </section>
        </div>
      )}

      {registering && <RegisterDialog onClose={() => setRegistering(false)} onDone={(a) => {
        setRegistering(false);
        agents.setData((l) => (l ? [...l, a] : l));
        void approvals.reload();
        setSelId(a.id);
        setTab('approvals');
      }} />}
    </>
  );
}

function RegisterDialog({ onClose, onDone }: { onClose: () => void; onDone: (a: Agent) => void }) {
  const [f, setF] = useState({ name: '', id: 'agt-', description: '', backendUrl: 'https://', binding: 'JSON-RPC', auth: 'OAuth2 client credentials', owner: '', trust: 'internal', skills: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ agent: Agent }>('agents', { ...f, skills: f.skills.split(',').map((x) => x.trim()).filter(Boolean) });
      onDone(r.agent);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reg-title">
        <h2 id="reg-title" className="ct" style={{ fontSize: 18 }}>Register an agent</h2>
        <p className="cs" style={{ margin: '4px 0 18px' }}>The agent is added as Pending and held for approval before the gateway routes any traffic to it.</p>
        <form className="form" onSubmit={submit}>
          <label>Display name<input required value={f.name} onChange={set('name')} placeholder="Invoice Matching Agent" autoFocus /></label>
          <label>Agent ID<input required value={f.id} onChange={set('id')} placeholder="agt-invoice-matching" pattern="agt-[a-z0-9-]{2,40}" title="agt- followed by lower-case letters, digits and dashes" /></label>
          <label className="full">Backend URL (never shown to callers)<input required value={f.backendUrl} onChange={set('backendUrl')} placeholder="https://invoice-match.internal/a2a" /></label>
          <label>Protocol binding<select value={f.binding} onChange={set('binding')}><option>JSON-RPC</option><option>HTTP+JSON</option><option>gRPC</option></select></label>
          <label>Backend authentication<select value={f.auth} onChange={set('auth')}><option>OAuth2 client credentials</option><option>mTLS (SPIFFE)</option><option>mTLS + OAuth2 token exchange</option><option>API key</option></select></label>
          <label>Owner team<input value={f.owner} onChange={set('owner')} placeholder="Finance Engineering" /></label>
          <label>Trust tier<select value={f.trust} onChange={set('trust')}><option value="internal">Internal</option><option value="external">External partner</option></select></label>
          <label className="full">Skills (comma-separated)<input value={f.skills} onChange={set('skills')} placeholder="invoice.match, invoice.explain" /></label>
          <label className="full">Description<textarea value={f.description} onChange={set('description')} placeholder="What this agent does, in one or two sentences." /></label>
          {err && <div className="full" role="alert" style={{ color: '#ff8a80', fontSize: 13 }}>{err}</div>}
          <div className="full" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn pri" disabled={busy}>{busy ? 'Registering…' : 'Register agent'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
