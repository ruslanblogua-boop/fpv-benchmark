import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleTracks = {
  async list(req: IRequest, env: Env) {
    return jsonResponse({ tracks: [] }, 200, env);
  },
  async get(req: IRequest, env: Env) {
    return jsonResponse({ track: {} }, 200, env);
  },
  async create(req: IRequest, env: Env) {
    return jsonResponse({ id: 'track1' }, 201, env);
  },
  async update(req: IRequest, env: Env) {
    return jsonResponse({ updated: true }, 200, env);
  },
  async promote(req: IRequest, env: Env) {
    return jsonResponse({ promoted: true }, 200, env);
  },
};
