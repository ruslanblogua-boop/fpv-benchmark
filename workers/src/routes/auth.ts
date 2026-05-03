import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleAuth = {
  async sync(req: IRequest, env: Env) {
    return jsonResponse({ message: 'Auth sync - TODO' }, 200, env);
  },

  async me(req: IRequest, env: Env) {
    return jsonResponse({ user: 'TODO' }, 200, env);
  },

  async updateMe(req: IRequest, env: Env) {
    return jsonResponse({ updated: true }, 200, env);
  },
};
