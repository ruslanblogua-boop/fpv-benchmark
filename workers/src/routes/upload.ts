import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/utils';

export const handleUpload = {
  async heatmap(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<{ test_id: string; data: any }>();

      if (!body.test_id || !body.data) {
        return errorResponse('test_id and data are required', 400);
      }

      // Verify test ownership
      const test = await env.DB.prepare('SELECT user_id FROM tests WHERE id = ?').bind(body.test_id).first<{ user_id: string }>();
      if (!test || test.user_id !== user.sub) {
        return errorResponse('Not found or unauthorized', 404);
      }

      const key = `tests/${body.test_id}/heatmap.geojson`;
      const data = JSON.stringify(body.data);

      await env.STORAGE.put(key, data, {
        httpMetadata: { contentType: 'application/geo+json' },
      });

      // Update test record
      await env.DB.prepare('UPDATE tests SET heatmap_key = ? WHERE id = ?').bind(key, body.test_id).run();

      return jsonResponse({ key }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to upload heatmap: ' + err.message);
    }
  },
  async path(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<{ test_id: string; data: any }>();

      if (!body.test_id || !body.data) {
        return errorResponse('test_id and data are required', 400);
      }

      // Verify test ownership
      const test = await env.DB.prepare('SELECT user_id FROM tests WHERE id = ?').bind(body.test_id).first<{ user_id: string }>();
      if (!test || test.user_id !== user.sub) {
        return errorResponse('Not found or unauthorized', 404);
      }

      const key = `tests/${body.test_id}/path.geojson`;
      const data = JSON.stringify(body.data);

      await env.STORAGE.put(key, data, {
        httpMetadata: { contentType: 'application/geo+json' },
      });

      // Update test record
      await env.DB.prepare('UPDATE tests SET path_key = ? WHERE id = ?').bind(key, body.test_id).run();

      return jsonResponse({ key }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to upload path: ' + err.message);
    }
  },
};
