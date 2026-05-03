import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse, errorResponse, generateId } from '../lib/utils';

export const handleProfiles = {
  async list(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const profiles = await env.DB.prepare(
        'SELECT id, name, frame, motors, fc, vtx, props, weight_g FROM drone_profiles WHERE user_id = ? ORDER BY created_at DESC'
      ).bind(user.sub).all<any>();
      return jsonResponse({ profiles: profiles.results || [] }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch profiles: ' + err.message);
    }
  },
  async create(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<any>();

      if (!body.name || body.name.trim().length === 0) {
        return errorResponse('Profile name is required', 400);
      }

      const profileId = generateId();
      await env.DB.prepare(`
        INSERT INTO drone_profiles (id, user_id, name, frame, motors, fc, vtx, props, weight_g, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        profileId,
        user.sub,
        body.name.trim(),
        body.frame || null,
        body.motors || null,
        body.fc || null,
        body.vtx || null,
        body.props || null,
        body.weight_g || null,
        body.notes || null
      ).run();

      return jsonResponse({ id: profileId, name: body.name }, 201, env);
    } catch (err: any) {
      return errorResponse('Failed to create profile: ' + err.message);
    }
  },
  async update(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const id = (req as any).params.id;
      const body = await req.json<any>();

      // Verify ownership
      const profile = await env.DB.prepare('SELECT user_id FROM drone_profiles WHERE id = ?').bind(id).first<{ user_id: string }>();
      if (!profile || profile.user_id !== user.sub) {
        return errorResponse('Not found or unauthorized', 404);
      }

      await env.DB.prepare(`
        UPDATE drone_profiles SET name = ?, frame = ?, motors = ?, fc = ?, vtx = ?, props = ?, weight_g = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(
        body.name || null,
        body.frame || null,
        body.motors || null,
        body.fc || null,
        body.vtx || null,
        body.props || null,
        body.weight_g || null,
        id
      ).run();

      return jsonResponse({ updated: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to update profile: ' + err.message);
    }
  },
  async remove(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const id = (req as any).params.id;

      const profile = await env.DB.prepare('SELECT user_id FROM drone_profiles WHERE id = ?').bind(id).first<{ user_id: string }>();
      if (!profile || profile.user_id !== user.sub) {
        return errorResponse('Not found or unauthorized', 404);
      }

      await env.DB.prepare('DELETE FROM drone_profiles WHERE id = ?').bind(id).run();

      return jsonResponse({ deleted: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to delete profile: ' + err.message);
    }
  },
};
