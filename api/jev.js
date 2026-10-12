// Vercel Function: /api/jev — proxies moves to TypeSafe Jev with the server-held key.
import { handle } from '../server/typesafe-jev.js';

async function respond(request) {
  let body = null;
  if (request.method === 'POST') {
    try { body = await request.json(); } catch { body = null; }
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { status, json } = await handle(request.method, body, ip);
  return Response.json(json, { status, headers: { 'cache-control': 'no-store' } });
}

export const GET = respond;
export const POST = respond;
