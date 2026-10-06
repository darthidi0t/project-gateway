import * as seed from './data/seed.js';
import { GATEWAY_BASE } from './data/seed.js';

/**
 * In-memory store. State lives for the lifetime of the Functions host
 * (it resets on cold start / redeploy). Swap these functions for calls to
 * Cosmos DB, Table Storage or your real gateway's admin API to persist.
 */
const s = {
  agents: structuredClone(seed.agents),
  approvals: structuredClone(seed.approvals),
  rules: structuredClone(seed.validationRules),
  acl: structuredClone(seed.aclScopes),
  policies: structuredClone(seed.policies),
  guardMode: 'enforce' as 'enforce' | 'monitor',
  guardEvents: structuredClone(seed.guardEvents),
  plugins: structuredClone(seed.guardPlugins),
  loopRules: structuredClone(seed.loopRules),
  circuit: 'open' as 'open' | 'half-open' | 'closed',
  contextKilled: false,
  aclChanges: 0
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const find = <T>(list: T[], pred: (x: T) => boolean, what: string): T => {
  const x = list.find(pred);
  if (!x) throw new HttpError(404, `${what} not found`);
  return x;
};

// ---------- Overview ----------
export function overview(range: string) {
  const d = (seed.overviewRanges[range] ?? seed.overviewRanges['7d'])!;
  return {
    range: seed.overviewRanges[range] ? range : '7d',
    kpis: { ...d.k, activeAgents: s.agents.filter((a) => a.active).length },
    trend: { labels: d.labels, requests: d.req, errors: d.err, max: d.max, axisTop: d.top, axisMid: d.mid },
    methods: seed.methodMix.map(([name, pct]) => ({ name, pct })),
    topRoutes: seed.topRoutes.map((r) => r.callee === 'Refund Agent' ? { ...r, status: circuitLabel() } : r),
    severity: seed.severity,
    events: seed.recentEvents,
    spend: seed.caps.slice(0, 5).map((c) => ({ name: c.name, used: c.used, cap: c.cap }))
  };
}

// ---------- Registry ----------
function agentView(a: (typeof s.agents)[number]) {
  const status = a.kind === 'pending' && !a.active ? 'Pending' : !a.active ? 'Inactive' : a.kind === 'warn' ? 'Throttled' : 'Active';
  return { ...a, status, gatewayUrl: GATEWAY_BASE + a.id };
}

export function agentCard(id: string) {
  const a = find(s.agents, (x) => x.id === id, 'Agent');
  return {
    name: a.name,
    description: a.description,
    version: a.version,
    supportedInterfaces: a.interfaces.map((b) => ({ url: GATEWAY_BASE + a.id, protocolBinding: b })),
    capabilities: a.capabilities,
    securitySchemes: { gatewayOAuth: { oauth2SecurityScheme: { flows: { clientCredentials: { tokenUrl: 'https://auth.example.com/oauth2/token' } } } } },
    security: [{ gatewayOAuth: [] }],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: a.skills.map((k) => ({ id: k, name: k, description: seed.skillDescriptions[k] ?? '', tags: [k.split('.')[0]] }))
  };
}

export const listAgents = () => s.agents.map(agentView);
export const getAgent = (id: string) => agentView(find(s.agents, (x) => x.id === id, 'Agent'));

export function setAgentActive(id: string, active: boolean) {
  const a = find(s.agents, (x) => x.id === id, 'Agent');
  a.active = active;
  return agentView(a);
}

export function syncAgent(id: string) {
  const a = find(s.agents, (x) => x.id === id, 'Agent');
  a.lastSync = 'Just now';
  if (a.kind === 'drift') a.lastSync = 'Drift detected (re-checked just now)';
  return agentView(a);
}

const SCOPES_OF_CALLER = ['billing:read', 'support:write', 'kb:read'];
const SCOPE_FOR_AGENT: Record<string, string> = { 'agt-billing': 'billing:read', 'agt-refund': 'refund:write', 'agt-support-triage': 'support:write', 'agt-procurement': 'procurement:request', 'agt-hr-policy': 'hr:read', 'agt-vendor-quote': 'quote:read', 'agt-concierge': 'support:write', 'agt-code-review': 'code:review' };

/** Mock "semantic" search: token overlap against skill ids and descriptions. Replace with a vector index (e.g. Azure AI Search). */
export function search(query: string) {
  const q = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const results: Array<{ agentId: string; agent: string; skill: string; description: string; score: number; callable: boolean; requiredScope: string }> = [];
  for (const a of s.agents) {
    for (const k of a.skills) {
      const text = `${k.replace('.', ' ')} ${seed.skillDescriptions[k] ?? ''} ${a.description}`.toLowerCase();
      const words = text.split(/[^a-z0-9]+/);
      let hits = 0;
      q.forEach((w) => { if (words.some((x) => x.startsWith(w.slice(0, 5)))) hits++; });
      if (!hits) continue;
      const score = Math.min(0.97, 0.45 + 0.5 * (hits / Math.max(q.size, 1)));
      const scope = SCOPE_FOR_AGENT[a.id] ?? 'unknown';
      results.push({ agentId: a.id, agent: a.name, skill: k, description: seed.skillDescriptions[k] ?? a.description, score: Math.round(score * 100) / 100, callable: SCOPES_OF_CALLER.includes(scope), requiredScope: scope });
    }
  }
  const best = new Map<string, (typeof results)[number]>();
  results.sort((x, y) => y.score - x.score).forEach((r) => { if (!best.has(r.agentId)) best.set(r.agentId, r); });
  return { query, results: [...best.values()].slice(0, 5) };
}

export const listApprovals = () => s.approvals;
export function decideApproval(id: string, decision: 'approved' | 'rejected') {
  const p = find(s.approvals, (x) => x.id === id, 'Approval');
  p.decision = decision;
  if (decision === 'approved' && p.id === 'p1') { const a = s.agents.find((x) => x.id === p.agentId); if (a) { a.active = true; a.kind = 'ok'; a.lastSync = 'Just now'; } }
  if (decision === 'approved' && p.id === 'p2') { const a = s.agents.find((x) => x.id === p.agentId); if (a) { a.kind = 'ok'; a.version = '1.3.0'; a.skills.push('leave.approve', 'payroll.read'); a.lastSync = 'Just now'; } }
  return p;
}

// ---------- Routing ----------
let seq = 0;
const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

export function traffic() {
  const now = Date.now();
  seq++;
  return seed.trafficTemplates.map((c, i) => {
    const t = new Date(now - i * 470 - Math.floor(Math.random() * 120));
    const task = c.notFound ? 't-ffff…000' : `t-${hex(4)}…${hex(3)}`;
    return { ...c, seq, t: t.toISOString(), task };
  });
}

export const listRoutes = () => seed.routes;
export const listRules = () => s.rules;
export function setRule(key: string, enabled: boolean) {
  const r = find(s.rules, (x) => x.key === key, 'Rule');
  r.enabled = enabled;
  return r;
}

// ---------- Access ----------
export function access() {
  return {
    identity: seed.identity,
    acl: { agents: seed.aclAgents, scopes: s.acl, unpublishedChanges: s.aclChanges },
    policies: s.policies,
    obo: seed.oboChain
  };
}
export function setGrant(scope: string, agent: string, granted: boolean) {
  const row = find(s.acl, (x) => x.scope === scope, 'Scope');
  if (!seed.aclAgents.includes(agent)) throw new HttpError(400, 'Unknown agent column');
  row.grants = granted ? [...new Set([...row.grants, agent])] : row.grants.filter((g) => g !== agent);
  s.aclChanges++;
  return { scope: row, unpublishedChanges: s.aclChanges };
}
export function publishAcl() { s.aclChanges = 0; return { unpublishedChanges: 0, publishedAt: new Date().toISOString() }; }
export function setPolicy(id: string, enabled: boolean) {
  const p = find(s.policies, (x) => x.id === id, 'Policy');
  p.enabled = enabled;
  return p;
}

// ---------- Guard ----------
export function guard() {
  return {
    mode: s.guardMode,
    kpis: { inspected: '2.41M', blocked: s.guardEvents.filter((e) => e.act === 'Blocked' && !e.falsePositive).length + 133, sanitized: '2,904', falsePositiveRate: '0.8%', latencyP95: '18 ms' },
    events: s.guardEvents.map((e) => ({ ...e, act: e.falsePositive ? 'False positive' : s.guardMode === 'monitor' && e.act === 'Blocked' ? 'Would block' : e.act })),
    types: seed.guardTypes.map(([name, n]) => ({ name, n })),
    plugins: s.plugins
  };
}
export function setGuardMode(mode: string) {
  if (mode !== 'enforce' && mode !== 'monitor') throw new HttpError(400, 'mode must be enforce or monitor');
  s.guardMode = mode;
  return guard();
}
export function setPlugin(key: string, enabled: boolean) {
  const p = find(s.plugins, (x) => x.key === key, 'Plugin');
  p.enabled = enabled;
  return p;
}
export function markFalsePositive(id: string) {
  const e = find(s.guardEvents, (x) => x.id === id, 'Event');
  e.falsePositive = true;
  return guard();
}

// ---------- Telemetry ----------
export function telemetry(group: string) {
  const g = seed.telemetryGroups[group] ? group : 'method';
  return {
    group: g,
    kpis: { requests: '356k', errorRate: '1.9%', p50: '180 ms', p95: '1.4 s', p99: '4.2 s', openTasks: '3,118' },
    rows: seed.telemetryGroups[g]!.map(([key, requests, p50, p95, p99, errorPct]) => ({ key, requests, p50, p95, p99, errorPct })),
    statusCodes: seed.statusCodes
  };
}
export function trace(id: string) {
  return {
    traceId: id || '4bf92f3577b34da6a3ce929d0e0e4736',
    title: 'Order 40 ergonomic chairs for the Bengaluru office',
    context: 'ctx-77d0…e1', task: 't-e210…6b7', totalMs: 4820,
    spans: seed.traceSpans.map(([start, dur, depth, kind, name, service, method, status, extra]) => ({
      start, dur, depth, kind, name, status,
      attributes: {
        'service.name': service, 'a2a.method': method, 'a2a.task_id': 't-e210…6b7', 'a2a.context_id': 'ctx-77d0…e1',
        'a2a.caller.id': depth === 0 ? 'user/alice' : depth === 1 ? 'agt-concierge' : 'agt-procurement', 'a2a.obo.origin': 'alice@example.com',
        ...extra
      }
    }))
  };
}

// ---------- Governance ----------
function circuitLabel() { return s.circuit === 'open' ? 'Circuit open' : s.circuit === 'half-open' ? 'Half-open' : 'Healthy'; }
export function governance() {
  return {
    kpis: { spend: 4812, budget: 8000, tokens: '182M', throttled24h: '1,402', openCircuits: s.circuit === 'open' ? 1 : 0, loopsStopped30d: 7, saved: '$312' },
    incident: {
      context: 'ctx-91be…04', detectedAt: '09:15:02', cycle: ['Support Triage', 'Refund Agent', 'Support Triage'], hops: 14,
      stats: { depth: 14, depthLimit: 6, calls: 312, windowSec: 90, tokens: '1.9M', saved: '$41' },
      circuit: s.circuit, contextKilled: s.contextKilled
    },
    loopRules: s.loopRules,
    caps: seed.caps.map((c) => ({ ...c, circuit: c.id === 'agt-refund' ? s.circuit : 'closed' })),
    throttleLog: seed.throttleLog
  };
}
export function setCircuit(state: string) {
  if (!['open', 'half-open', 'closed'].includes(state)) throw new HttpError(400, 'state must be open, half-open or closed');
  s.circuit = state as typeof s.circuit;
  return governance();
}
export function killContext() { s.contextKilled = true; return governance(); }
export function setLoopRule(key: string, enabled: boolean) {
  const r = find(s.loopRules, (x) => x.key === key, 'Rule');
  r.enabled = enabled;
  return r;
}
