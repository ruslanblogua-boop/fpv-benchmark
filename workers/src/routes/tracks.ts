import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse, errorResponse, slugify, generateId } from '../lib/utils';

export const handleTracks = {
  async list(req: IRequest, env: Env) {
    try {
      const tracks = await env.DB.prepare(
        'SELECT id, name, slug, location_name FROM tracks ORDER BY created_at DESC'
      ).all<{ id: string; name: string; slug: string; location_name?: string }>();
      return jsonResponse({ tracks: tracks.results || [] }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch tracks: ' + err.message);
    }
  },
  async get(req: IRequest, env: Env) {
    try {
      const slug = (req as any).params.slug;
      const track = await env.DB.prepare(
        'SELECT * FROM tracks WHERE slug = ?'
      ).bind(slug).first();
      if (!track) return errorResponse('Track not found', 404);
      return jsonResponse({ track }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch track: ' + err.message);
    }
  },
  async create(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<{ name: string; location?: string }>();

      if (!body.name || body.name.trim().length === 0) {
        return errorResponse('Track name is required', 400);
      }

      const trackId = generateId();
      const slug = slugify(body.name);
      const location = body.location?.trim() || 'Unknown';

      const existingTrack = await env.DB.prepare(
        'SELECT id, name, slug, location_name FROM tracks WHERE slug = ?'
      ).bind(slug).first<{ id: string; name: string; slug: string; location_name?: string }>();

      if (existingTrack) {
        if ((!existingTrack.location_name || existingTrack.location_name === 'Unknown') && location !== 'Unknown') {
          await env.DB.prepare(
            'UPDATE tracks SET location_name = ? WHERE id = ?'
          ).bind(location, existingTrack.id).run();
          existingTrack.location_name = location;
        }

        return jsonResponse({
          id: existingTrack.id,
          name: existingTrack.name,
          slug: existingTrack.slug,
          location_name: existingTrack.location_name || 'Unknown',
          reused: true,
        }, 200, env);
      }

      await env.DB.prepare(
        'INSERT INTO tracks (id, name, slug, location_name, created_by) VALUES (?, ?, ?, ?, ?)'
      ).bind(trackId, body.name.trim(), slug, location, user.sub).run();

      return jsonResponse({
        id: trackId,
        name: body.name,
        slug,
        location_name: location,
      }, 201, env);
    } catch (err: any) {
      return errorResponse('Failed to create track: ' + err.message);
    }
  },
  async update(req: IRequest, env: Env) {
    try {
      const slug = (req as any).params.slug;
      const body = await req.json();

      await env.DB.prepare(
        'UPDATE tracks SET location_name = ?, description = ?, updated_at = datetime(\'now\') WHERE slug = ?'
      ).bind(body.location_name, body.description, slug).run();

      return jsonResponse({ updated: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to update track: ' + err.message);
    }
  },
  async promote(req: IRequest, env: Env) {
    try {
      const slug = (req as any).params.slug;
      await env.DB.prepare(
        'UPDATE tracks SET status = ?, promoted_at = datetime(\'now\') WHERE slug = ?'
      ).bind('standard', slug).run();

      return jsonResponse({ promoted: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to promote track: ' + err.message);
    }
  },
};
