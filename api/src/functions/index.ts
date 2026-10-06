import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { routes, run } from '../routes.js';

// Registers one Azure Function per API route. Static Web Apps forwards /api/* here.
for (const def of routes) {
  app.http(def.name, {
    methods: def.methods,
    route: def.route,
    authLevel: 'anonymous', // access is governed by staticwebapp.config.json roles
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
      let body: unknown = undefined;
      if (req.method === 'POST') {
        try { body = await req.json(); } catch { body = {}; }
      }
      const headers: Record<string, string | undefined> = {};
      req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      const res = await run(def, { method: req.method, params: req.params as Record<string, string>, query: req.query, body, headers });
      return { status: res.status ?? 200, jsonBody: res.body, headers: { 'Cache-Control': 'no-store' } };
    }
  });
}
