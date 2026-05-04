import { IRequest } from 'itty-router';
import { Env } from '../index';
import { errorResponse, generateId, jsonResponse, slugify } from '../lib/utils';

type CameraRow = {
  id: string;
  combo_name: string;
  slug: string;
  tab: string;
  camera_name?: string | null;
  vtx_name?: string | null;
  vrx_name?: string | null;
  firmware?: string | null;
  scene_name?: string | null;
  latency_method?: string | null;
  exposure_notes?: string | null;
  summary?: string | null;
  tags_json?: string | null;
  metadata_json?: string | null;
  created_at?: string | null;
  status?: string | null;
  vtx_dvr_key?: string | null;
  vrx_dvr_key?: string | null;
};

function parseJson<T>(value?: string | null, fallback?: T): T {
  if (!value) return fallback as T;
  try {
    return JSON.parse(value);
  } catch {
    return fallback as T;
  }
}

function mapCameraRow(row: CameraRow, requestBase: string) {
  return {
    id: row.id,
    combo_name: row.combo_name,
    slug: row.slug,
    tab: row.tab,
    camera_name: row.camera_name,
    vtx_name: row.vtx_name,
    vrx_name: row.vrx_name,
    firmware: row.firmware,
    scene_name: row.scene_name,
    latency_method: row.latency_method,
    exposure_notes: row.exposure_notes,
    summary: row.summary,
    tags: parseJson<string[]>(row.tags_json, []),
    metadata: parseJson<any>(row.metadata_json, {}),
    created_at: row.created_at,
    status: row.status,
    assets: {
      vtx: row.vtx_dvr_key ? `${requestBase}/api/camera-tests/${row.id}/assets/vtx` : null,
      vrx: row.vrx_dvr_key ? `${requestBase}/api/camera-tests/${row.id}/assets/vrx` : null,
    },
  };
}

async function requireAdmin(env: Env, userId: string) {
  const row = await env.DB.prepare('SELECT role FROM users WHERE id = ?')
    .bind(userId)
    .first<{ role?: string }>();
  return row?.role === 'admin';
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Images must be sent as data URLs');
  const [, contentType, base64] = match;
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return { contentType, bytes };
}

async function putAsset(env: Env, key: string, dataUrl: string) {
  const { contentType, bytes } = decodeDataUrl(dataUrl);
  await env.STORAGE.put(key, bytes, {
    httpMetadata: { contentType },
  });
}

export const handleCamera = {
  async list(req: IRequest, env: Env) {
    try {
      const url = new URL(req.url);
      const tab = url.searchParams.get('tab');
      const search = url.searchParams.get('search')?.toLowerCase().trim();
      const requestBase = url.origin;

      const result = await env.DB.prepare(`
        SELECT *
        FROM camera_tests
        WHERE status = 'published'
        ORDER BY created_at DESC
      `).all<CameraRow>();

      let rows = result.results || [];
      if (tab) {
        rows = rows.filter((row) => row.tab === tab);
      }
      if (search) {
        rows = rows.filter((row) => {
          const haystack = [
            row.combo_name,
            row.camera_name,
            row.vtx_name,
            row.vrx_name,
            row.summary,
            row.scene_name,
            row.tags_json,
          ].join(' ').toLowerCase();
          return haystack.includes(search);
        });
      }

      return jsonResponse({ camera_tests: rows.map((row) => mapCameraRow(row, requestBase)) }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch camera tests: ' + err.message);
    }
  },

  async get(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const url = new URL(req.url);
      const row = await env.DB.prepare('SELECT * FROM camera_tests WHERE id = ?')
        .bind(id)
        .first<CameraRow>();

      if (!row) return errorResponse('Camera test not found', 404);
      return jsonResponse({ camera_test: mapCameraRow(row, url.origin) }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch camera test: ' + err.message);
    }
  },

  async getAsset(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const kind = (req as any).params.kind;
      if (!['vtx', 'vrx'].includes(kind)) return errorResponse('Unknown camera asset', 404);

      const row = await env.DB.prepare('SELECT vtx_dvr_key, vrx_dvr_key FROM camera_tests WHERE id = ?')
        .bind(id)
        .first<{ vtx_dvr_key?: string | null; vrx_dvr_key?: string | null }>();

      if (!row) return errorResponse('Camera test not found', 404);
      const key = kind === 'vtx' ? row.vtx_dvr_key : row.vrx_dvr_key;
      if (!key) return errorResponse('Camera asset not found', 404);

      const object = await env.STORAGE.get(key);
      if (!object) return errorResponse('Camera asset not found', 404);

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(object.body, { headers });
    } catch (err: any) {
      return errorResponse('Failed to fetch camera asset: ' + err.message);
    }
  },

  async create(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const isAdmin = await requireAdmin(env, user.sub);
      if (!isAdmin) return errorResponse('Forbidden', 403);

      const body = await req.json<any>();
      if (!body.combo_name?.trim()) return errorResponse('Combo name is required', 400);
      if (!body.tab?.trim()) return errorResponse('Camera tab is required', 400);
      if (!body.vtx_asset_data_url || !body.vrx_asset_data_url) {
        return errorResponse('Both VTX DVR and VRX DVR images are required', 400);
      }

      const id = generateId();
      const slug = slugify(body.combo_name);
      const vtxKey = `camera-tests/${id}/vtx`;
      const vrxKey = `camera-tests/${id}/vrx`;

      await putAsset(env, vtxKey, body.vtx_asset_data_url);
      await putAsset(env, vrxKey, body.vrx_asset_data_url);

      await env.DB.prepare(`
        INSERT INTO camera_tests (
          id, created_by, combo_name, slug, tab,
          camera_name, vtx_name, vrx_name, firmware, scene_name,
          latency_method, exposure_notes, summary, tags_json,
          vtx_dvr_key, vrx_dvr_key, metadata_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        user.sub,
        body.combo_name.trim(),
        `${slug}-${id.slice(0, 4)}`,
        body.tab,
        body.camera_name || null,
        body.vtx_name || null,
        body.vrx_name || null,
        body.firmware || null,
        body.scene_name || null,
        body.latency_method || null,
        body.exposure_notes || null,
        body.summary || null,
        JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
        vtxKey,
        vrxKey,
        JSON.stringify({
          notes: body.notes || '',
          source_type: 'tested',
        }),
        'published'
      ).run();

      return jsonResponse({ id }, 201, env);
    } catch (err: any) {
      return errorResponse('Failed to create camera test: ' + err.message);
    }
  },

  async remove(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const isAdmin = await requireAdmin(env, user.sub);
      if (!isAdmin) return errorResponse('Forbidden', 403);

      const id = (req as any).params.id;
      const row = await env.DB.prepare('SELECT vtx_dvr_key, vrx_dvr_key FROM camera_tests WHERE id = ?')
        .bind(id)
        .first<{ vtx_dvr_key?: string | null; vrx_dvr_key?: string | null }>();

      if (!row) return errorResponse('Camera test not found', 404);

      if (row.vtx_dvr_key) await env.STORAGE.delete(row.vtx_dvr_key).catch(() => {});
      if (row.vrx_dvr_key) await env.STORAGE.delete(row.vrx_dvr_key).catch(() => {});
      await env.DB.prepare('DELETE FROM camera_tests WHERE id = ?').bind(id).run();

      return jsonResponse({ deleted: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to delete camera test: ' + err.message);
    }
  },
};
