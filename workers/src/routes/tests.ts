import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse, errorResponse, generateId } from '../lib/utils';

export const handleTests = {
  async list(req: IRequest, env: Env) {
    try {
      const tests = await env.DB.prepare(`
        SELECT
          t.id, t.custom_name, t.auto_name, t.category, t.system_under_test,
          t.created_at, t.status,
          tr.name as track_name
        FROM tests t
        LEFT JOIN tracks tr ON t.track_id = tr.id
        WHERE t.status = 'published'
        ORDER BY t.created_at DESC
        LIMIT 100
      `).all<any>();
      return jsonResponse({ tests: tests.results || [] }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch tests: ' + err.message);
    }
  },
  async get(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const test = await env.DB.prepare(`
        SELECT
          t.*,
          tr.name as track_name,
          dp.name as drone_name
        FROM tests t
        LEFT JOIN tracks tr ON t.track_id = tr.id
        LEFT JOIN drone_profiles dp ON t.drone_profile_id = dp.id
        WHERE t.id = ?
      `).bind(id).first();
      if (!test) return errorResponse('Test not found', 404);
      return jsonResponse({ test }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch test: ' + err.message);
    }
  },
  async getHeatmap(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const test = await env.DB.prepare('SELECT heatmap_key FROM tests WHERE id = ?').bind(id).first<{ heatmap_key: string }>();
      if (!test || !test.heatmap_key) return errorResponse('Heatmap not found', 404);

      const data = await env.STORAGE.get(test.heatmap_key);
      if (!data) return errorResponse('Heatmap not found', 404);

      return new Response(data.body, {
        headers: { 'Content-Type': 'application/geo+json' },
      });
    } catch (err: any) {
      return errorResponse('Failed to fetch heatmap: ' + err.message);
    }
  },
  async getPath(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const test = await env.DB.prepare('SELECT path_key FROM tests WHERE id = ?').bind(id).first<{ path_key: string }>();
      if (!test || !test.path_key) return errorResponse('Path not found', 404);

      const data = await env.STORAGE.get(test.path_key);
      if (!data) return errorResponse('Path not found', 404);

      return new Response(data.body, {
        headers: { 'Content-Type': 'application/geo+json' },
      });
    } catch (err: any) {
      return errorResponse('Failed to fetch path: ' + err.message);
    }
  },
  async listMine(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const tests = await env.DB.prepare(`
        SELECT
          t.id, t.custom_name, t.auto_name, t.category, t.system_under_test,
          t.created_at, t.status,
          tr.name as track_name
        FROM tests t
        LEFT JOIN tracks tr ON t.track_id = tr.id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC
      `).bind(user.sub).all<any>();
      return jsonResponse({ tests: tests.results || [] }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch user tests: ' + err.message);
    }
  },
  async create(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<any>();

      const testId = generateId();
      const autoName = body.custom_name || `Test ${new Date().toISOString().split('T')[0]}`;

      await env.DB.prepare(`
        INSERT INTO tests (
          id, user_id, track_id, drone_profile_id,
          auto_name, custom_name, category, system_under_test,
          pilot_lat, pilot_lon, pilot_bearing_deg,
          grid_size_m, wind_speed, wind_direction, notes,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        testId,
        user.sub,
        body.track_id || null,
        body.drone_profile_id || null,
        autoName,
        body.custom_name || null,
        body.category || 'link',
        body.system_under_test || '',
        body.pilot_lat || null,
        body.pilot_lon || null,
        body.pilot_bearing_deg || null,
        body.grid_size_m || 1.0,
        body.wind_speed || null,
        body.wind_direction || null,
        body.notes || null,
        'draft'
      ).run();

      return jsonResponse({ id: testId }, 201, env);
    } catch (err: any) {
      return errorResponse('Failed to create test: ' + err.message);
    }
  },
  async update(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const user = (req as any).user;
      const body = await req.json<any>();

      // Verify ownership
      const test = await env.DB.prepare('SELECT user_id FROM tests WHERE id = ?').bind(id).first<{ user_id: string }>();
      if (!test || test.user_id !== user.sub) return errorResponse('Not found or unauthorized', 404);

      await env.DB.prepare(`
        UPDATE tests SET
          custom_name = ?, category = ?, system_under_test = ?,
          pilot_lat = ?, pilot_lon = ?, pilot_bearing_deg = ?,
          grid_size_m = ?, wind_speed = ?, wind_direction = ?, notes = ?
        WHERE id = ?
      `).bind(
        body.custom_name || null,
        body.category || 'link',
        body.system_under_test || '',
        body.pilot_lat || null,
        body.pilot_lon || null,
        body.pilot_bearing_deg || null,
        body.grid_size_m || 1.0,
        body.wind_speed || null,
        body.wind_direction || null,
        body.notes || null,
        id
      ).run();

      return jsonResponse({ updated: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to update test: ' + err.message);
    }
  },
  async publish(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const user = (req as any).user;

      // Verify ownership and draft status
      const test = await env.DB.prepare('SELECT user_id, status FROM tests WHERE id = ?').bind(id).first<{ user_id: string; status: string }>();
      if (!test || test.user_id !== user.sub) return errorResponse('Not found or unauthorized', 404);
      if (test.status !== 'draft') return errorResponse('Only draft tests can be published', 400);

      await env.DB.prepare(`
        UPDATE tests SET status = ?, published_at = datetime('now') WHERE id = ?
      `).bind('published', id).run();

      return jsonResponse({ published: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to publish test: ' + err.message);
    }
  },
  async remove(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const user = (req as any).user;

      const test = await env.DB.prepare('SELECT user_id, heatmap_key, path_key FROM tests WHERE id = ?').bind(id).first<any>();
      if (!test || test.user_id !== user.sub) return errorResponse('Not found or unauthorized', 404);

      // Delete from R2
      if (test.heatmap_key) {
        await env.STORAGE.delete(test.heatmap_key).catch(() => {});
      }
      if (test.path_key) {
        await env.STORAGE.delete(test.path_key).catch(() => {});
      }

      // Delete from DB
      await env.DB.prepare('DELETE FROM tests WHERE id = ?').bind(id).run();

      return jsonResponse({ deleted: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to delete test: ' + err.message);
    }
  },
};
