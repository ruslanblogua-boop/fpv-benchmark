/**
 * FPV Heatmap API — Cloudflare Worker
 * Routes all API requests, handles auth verification, serves data.
 */

import { Router, IRequest } from 'itty-router';
import { handleAuth }          from './routes/auth';
import { handleProfiles }      from './routes/profiles';
import { handleTracks }        from './routes/tracks';
import { handleTests }         from './routes/tests';
import { handleUpload }        from './routes/upload';
import { verifyJWT, corsHeaders, jsonResponse, errorResponse } from './lib/utils';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_JWT_SECRET: string;
  FRONTEND_URL: string;
}

const router = Router();

// ── CORS preflight ────────────────────────────────────────────────────────────
router.options('*', (req: IRequest, env: Env) =>
  new Response(null, { status: 204, headers: corsHeaders(env) })
);

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/api/health',         () => jsonResponse({ ok: true, ts: Date.now() }));
router.post('/api/auth/sync',     handleAuth.sync);     // sync Supabase user to D1

router.get('/api/tracks',         handleTracks.list);
router.get('/api/tracks/:slug',   handleTracks.get);

router.get('/api/tests',          handleTests.list);    // filter by track/category/user
router.get('/api/tests/:id',      handleTests.get);
router.get('/api/tests/:id/geojson/heatmap', handleTests.getHeatmap);  // proxy from R2
router.get('/api/tests/:id/geojson/path',    handleTests.getPath);     // proxy from R2

// ── Authenticated routes ──────────────────────────────────────────────────────
router.get('/api/me',                    withAuth, handleAuth.me);
router.put('/api/me',                    withAuth, handleAuth.updateMe);

router.get('/api/me/profiles',           withAuth, handleProfiles.list);
router.post('/api/me/profiles',          withAuth, handleProfiles.create);
router.put('/api/me/profiles/:id',       withAuth, handleProfiles.update);
router.delete('/api/me/profiles/:id',    withAuth, handleProfiles.remove);

router.get('/api/me/tests',              withAuth, handleTests.listMine);
router.post('/api/tests',                withAuth, handleTests.create);   // create draft
router.put('/api/tests/:id',             withAuth, handleTests.update);   // update draft metadata
router.post('/api/tests/:id/publish',    withAuth, handleTests.publish);  // draft → published
router.delete('/api/tests/:id',          withAuth, handleTests.remove);

router.post('/api/upload/heatmap',       withAuth, handleUpload.heatmap); // upload heatmap GeoJSON to R2
router.post('/api/upload/path',          withAuth, handleUpload.path);    // upload path GeoJSON to R2

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post('/api/tracks',               withAuth, withAdmin, handleTracks.create);
router.put('/api/tracks/:slug',          withAuth, withAdmin, handleTracks.update);
router.post('/api/tracks/:slug/promote', withAuth, withAdmin, handleTracks.promote);

// ── 404 ───────────────────────────────────────────────────────────────────────
router.all('*', () => errorResponse('Not found', 404));

// ── Middleware helpers ────────────────────────────────────────────────────────
async function withAuth(req: IRequest, env: Env): Promise<Response | void> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return errorResponse('Unauthorized', 401);

  try {
    const payload = await verifyJWT(token, env.SUPABASE_JWT_SECRET);
    (req as any).user = payload;
  } catch {
    return errorResponse('Invalid token', 401);
  }
}

async function withAdmin(req: IRequest, env: Env): Promise<Response | void> {
  const user = (req as any).user;
  const row = await env.DB.prepare('SELECT role FROM users WHERE id = ?')
    .bind(user.sub)
    .first<{ role: string }>();
  if (!row || row.role !== 'admin') return errorResponse('Forbidden', 403);
}

// ── Export ────────────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const response = await router.fetch(request, env, ctx);
      // Guarantee CORS headers on every response (catches 404s, unhandled routes, etc.)
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders(env))) {
        headers.set(k, String(v));
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err: any) {
      console.error('Unhandled error:', err);
      return errorResponse('Internal server error', 500);
    }
  },
};
