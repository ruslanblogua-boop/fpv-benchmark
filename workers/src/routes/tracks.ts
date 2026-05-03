import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleTracks = {
  async list(req: IRequest, env: Env) {
    return jsonResponse({ tracks: [] });
  },
  async get(req: IRequest, env: Env) {
    return jsonResponse({ track: {} });
  },
  async create(req: IRequest, env: Env) {
    return jsonResponse({ id: 'track1' }, 201);
  },
  async update(req: IRequest, env: Env) {
    return jsonResponse({ updated: true });
  },
  async promote(req: IRequest, env: Env) {
    return jsonResponse({ promoted: true });
  },
};
