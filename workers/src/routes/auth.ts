import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse, errorResponse } from '../lib/utils';

export const handleAuth = {
  async sync(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;

      if (!user.sub || !user.email) {
        return errorResponse('Missing user info', 400);
      }

      // Insert or replace user
      await env.DB.prepare(`
        INSERT INTO users (id, email, display_name, role)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          display_name = excluded.display_name
      `).bind(
        user.sub,
        user.email,
        user.user_metadata?.display_name || user.email.split('@')[0] || 'User',
        'pilot'  // default role
      ).run();

      return jsonResponse({
        synced: true,
        user: {
          id: user.sub,
          email: user.email,
        },
      }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to sync user: ' + err.message);
    }
  },

  async me(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;

      const dbUser = await env.DB.prepare(
        'SELECT id, email, display_name, role FROM users WHERE id = ?'
      ).bind(user.sub).first<any>();

      if (!dbUser) {
        // User not synced yet, do it now
        await handleAuth.sync(req, env);
      }

      return jsonResponse({
        user: dbUser || {
          id: user.sub,
          email: user.email,
          display_name: user.email.split('@')[0],
          role: 'pilot',
        },
      }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch user: ' + err.message);
    }
  },

  async updateMe(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<any>();

      if (body.display_name) {
        await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(body.display_name, user.sub).run();
      }

      return jsonResponse({ updated: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to update user: ' + err.message);
    }
  },
};
