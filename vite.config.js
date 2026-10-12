import { defineConfig, loadEnv } from 'vite';

// Serves /api/jev during `npm run dev` / `npm run preview` using the same
// handler as the Vercel function, so TypeSafe Jev works locally with .env.local.
function typesafeJevApi() {
  const mount = (server) => {
    server.middlewares.use('/api/jev', async (req, res) => {
      const { handle } = await import('./server/typesafe-jev.js');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch {}
      const { status, json } = await handle(req.method, body, req.socket.remoteAddress);
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(json));
    });
  };
  return { name: 'typesafe-jev-api', configureServer: mount, configurePreviewServer: mount };
}

// Social previews need absolute URLs. Resolve the site origin at build time:
// SITE_URL (custom domain) → Vercel production domain → this deployment's URL → dev server.
function siteUrl(env) {
  const raw = env.SITE_URL || process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`)
    || 'http://localhost:5173';
  return raw.replace(/\/+$/, '');
}

function socialMeta(url) {
  return {
    name: 'social-meta',
    // 'pre' so the placeholder is replaced before Vite parses the HTML's URLs.
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_URL%', url) },
  };
}

export default defineConfig(({ mode }) => {
  // Load TYPESAFE_* from .env / .env.local into process.env for the server handler only
  // (no VITE_ prefix, so the key is never bundled into client code).
  const env = loadEnv(mode, process.cwd(), 'TYPESAFE_');
  for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
  const site = siteUrl(loadEnv(mode, process.cwd(), 'SITE_'));
  return { plugins: [typesafeJevApi(), socialMeta(site)] };
});
