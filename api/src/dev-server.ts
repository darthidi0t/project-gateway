/**
 * Local API server for development without Azure Functions Core Tools.
 * Serves the same route table on http://localhost:7071/api/* .
 * In Azure, src/functions/index.ts is used instead.
 */
import http from 'node:http';
import { routes, run, RouteDef } from './routes.js';

const PORT = Number(process.env.PORT ?? 7071);

const compiled = routes.map((def) => {
  const keys: string[] = [];
  const pattern = def.route.split('/').map((seg) => {
    const m = /^\{(\w+)\}$/.exec(seg);
    if (m) { keys.push(m[1]!); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { def, keys, re: new RegExp(`^/api/${pattern}/?$`) };
});

function match(method: string, path: string): { def: RouteDef; params: Record<string, string> } | null {
  for (const c of compiled) {
    if (!c.def.methods.includes(method as 'GET' | 'POST')) continue;
    const m = c.re.exec(path);
    if (m) return { def: c.def, params: Object.fromEntries(c.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) };
  }
  return null;
}

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', async () => {
    const hit = match(req.method ?? 'GET', url.pathname);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (!hit) return send(404, { error: 'Not found' });
    let body: unknown = {};
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Invalid JSON' }); } }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    const out = await run(hit.def, { method: req.method ?? 'GET', params: hit.params, query: url.searchParams, body, headers });
    send(out.status ?? 200, out.body);
  });
}).listen(PORT, () => console.log(`A2A Gateway Console API (dev) on http://localhost:${PORT}/api`));
