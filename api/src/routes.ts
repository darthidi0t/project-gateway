import * as store from './store.js';
import { HttpError } from './store.js';

export interface ApiRequest {
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string | undefined>;
}
export interface ApiResponse { status?: number; body: unknown }
export interface RouteDef {
  name: string;
  methods: Array<'GET' | 'POST'>;
  route: string; // Azure Functions route template, relative to /api
  handler: (req: ApiRequest) => ApiResponse | Promise<ApiResponse>;
}

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
function bool(b: unknown, key: string): boolean {
  const v = obj(b)[key];
  if (typeof v !== 'boolean') throw new HttpError(400, `Body field "${key}" must be true or false`);
  return v;
}
function str(b: unknown, key: string): string {
  const v = obj(b)[key];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Body field "${key}" is required`);
  return v.trim().slice(0, 500);
}

/** Reads the Azure Static Web Apps client principal, if the user signed in. */
function me(req: ApiRequest): ApiResponse {
  const raw = req.headers['x-ms-client-principal'];
  if (!raw) return ok({ authenticated: false, name: 'Guest', initials: 'GU', roles: ['anonymous'] });
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    const name: string = p.userDetails ?? 'User';
    const initials = name.split(/[@.\s_-]+/).filter(Boolean).slice(0, 2).map((x: string) => x[0]!.toUpperCase()).join('') || 'U';
    return ok({ authenticated: true, name, initials, roles: p.userRoles ?? [], provider: p.identityProvider });
  } catch {
    return ok({ authenticated: false, name: 'Guest', initials: 'GU', roles: ['anonymous'] });
  }
}

export const routes: RouteDef[] = [
  { name: 'me', methods: ['GET'], route: 'me', handler: me },
  { name: 'health', methods: ['GET'], route: 'health', handler: () => ok({ status: 'ok', time: new Date().toISOString() }) },

  { name: 'overview', methods: ['GET'], route: 'overview', handler: (r) => ok(store.overview(r.query.get('range') ?? '7d')) },

  { name: 'agentsList', methods: ['GET'], route: 'agents', handler: () => ok(store.listAgents()) },
  { name: 'agentRegister', methods: ['POST'], route: 'agents', handler: (r) => {
    const b = obj(r.body);
    const binding = String(b.binding ?? 'JSON-RPC');
    if (!['JSON-RPC', 'HTTP+JSON', 'gRPC'].includes(binding)) throw new HttpError(400, 'binding must be JSON-RPC, HTTP+JSON or gRPC');
    const skills = Array.isArray(b.skills) ? b.skills.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 20) : [];
    const trust = b.trust === 'external' ? 'external' : 'internal';
    return { status: 201, body: store.registerAgent({
      name: str(b, 'name'), id: str(b, 'id').toLowerCase(), backendUrl: str(b, 'backendUrl'), auth: str(b, 'auth'),
      description: typeof b.description === 'string' ? b.description.slice(0, 500) : '', owner: typeof b.owner === 'string' ? b.owner.slice(0, 100) : '',
      binding: binding as 'JSON-RPC', skills, trust
    }) };
  } },
  { name: 'agentGet', methods: ['GET'], route: 'agents/{id}', handler: (r) => ok(store.getAgent(r.params.id!)) },
  { name: 'agentCard', methods: ['GET'], route: 'agents/{id}/card', handler: (r) => ok(store.agentCard(r.params.id!)) },
  { name: 'agentStatus', methods: ['POST'], route: 'agents/{id}/status', handler: (r) => ok(store.setAgentActive(r.params.id!, bool(r.body, 'active'))) },
  { name: 'agentSync', methods: ['POST'], route: 'agents/{id}/sync', handler: (r) => ok(store.syncAgent(r.params.id!)) },
  { name: 'search', methods: ['POST'], route: 'search', handler: (r) => ok(store.search(str(r.body, 'query'))) },
  { name: 'approvalsList', methods: ['GET'], route: 'approvals', handler: () => ok(store.listApprovals()) },
  { name: 'approvalDecide', methods: ['POST'], route: 'approvals/{id}', handler: (r) => {
    const d = str(r.body, 'decision');
    if (d !== 'approved' && d !== 'rejected') throw new HttpError(400, 'decision must be approved or rejected');
    return ok(store.decideApproval(r.params.id!, d));
  } },

  { name: 'routingRoutes', methods: ['GET'], route: 'routing/routes', handler: () => ok(store.listRoutes()) },
  { name: 'routingTraffic', methods: ['GET'], route: 'routing/traffic', handler: () => ok(store.traffic()) },
  { name: 'routingRules', methods: ['GET'], route: 'routing/rules', handler: () => ok(store.listRules()) },
  { name: 'routingRuleSet', methods: ['POST'], route: 'routing/rules/{key}', handler: (r) => ok(store.setRule(r.params.key!, bool(r.body, 'enabled'))) },

  { name: 'access', methods: ['GET'], route: 'access', handler: () => ok(store.access()) },
  { name: 'accessGrant', methods: ['POST'], route: 'access/acl', handler: (r) => ok(store.setGrant(str(r.body, 'scope'), str(r.body, 'agent'), bool(r.body, 'granted'))) },
  { name: 'accessPublish', methods: ['POST'], route: 'access/publish', handler: () => ok(store.publishAcl()) },
  { name: 'accessPolicy', methods: ['POST'], route: 'access/policies/{id}', handler: (r) => ok(store.setPolicy(r.params.id!, bool(r.body, 'enabled'))) },

  { name: 'guard', methods: ['GET'], route: 'guard', handler: () => ok(store.guard()) },
  { name: 'guardMode', methods: ['POST'], route: 'guard/mode', handler: (r) => ok(store.setGuardMode(str(r.body, 'mode'))) },
  { name: 'guardPlugin', methods: ['POST'], route: 'guard/plugins/{key}', handler: (r) => ok(store.setPlugin(r.params.key!, bool(r.body, 'enabled'))) },
  { name: 'guardFalsePositive', methods: ['POST'], route: 'guard/events/{id}/false-positive', handler: (r) => ok(store.markFalsePositive(r.params.id!)) },

  { name: 'telemetry', methods: ['GET'], route: 'telemetry', handler: (r) => ok(store.telemetry(r.query.get('group') ?? 'method')) },
  { name: 'trace', methods: ['GET'], route: 'traces/{id}', handler: (r) => ok(store.trace(r.params.id!)) },

  { name: 'governance', methods: ['GET'], route: 'governance', handler: () => ok(store.governance()) },
  { name: 'governanceCircuit', methods: ['POST'], route: 'governance/circuit', handler: (r) => ok(store.setCircuit(str(r.body, 'state'))) },
  { name: 'governanceKill', methods: ['POST'], route: 'governance/kill-context', handler: () => ok(store.killContext()) },
  { name: 'governanceRule', methods: ['POST'], route: 'governance/rules/{key}', handler: (r) => ok(store.setLoopRule(r.params.key!, bool(r.body, 'enabled'))) }
];

/** Runs a handler and maps thrown errors to JSON responses. */
export async function run(def: RouteDef, req: ApiRequest): Promise<ApiResponse> {
  try {
    return await def.handler(req);
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: 'Internal error' } };
  }
}
