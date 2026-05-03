import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleProfiles = {
  async list(req: IRequest, env: Env) {
    return jsonResponse({ profiles: [] }, 200, env);
  },
  async create(req: IRequest, env: Env) {
    return jsonResponse({ id: 'profile1' }, 201, env);
  },
  async update(req: IRequest, env: Env) {
    return jsonResponse({ updated: true }, 200, env);
  },
  async remove(req: IRequest, env: Env) {
    return jsonResponse({ deleted: true }, 200, env);
  },
};
