import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleTests = {
  async list(req: IRequest, env: Env) {
    return jsonResponse({ tests: [] }, 200, env);
  },
  async get(req: IRequest, env: Env) {
    return jsonResponse({ test: {} }, 200, env);
  },
  async getHeatmap(req: IRequest, env: Env) {
    return jsonResponse({ type: 'FeatureCollection', features: [] }, 200, env);
  },
  async getPath(req: IRequest, env: Env) {
    return jsonResponse({ type: 'FeatureCollection', features: [] }, 200, env);
  },
  async listMine(req: IRequest, env: Env) {
    return jsonResponse({ tests: [] }, 200, env);
  },
  async create(req: IRequest, env: Env) {
    return jsonResponse({ id: 'test1' }, 201, env);
  },
  async update(req: IRequest, env: Env) {
    return jsonResponse({ updated: true }, 200, env);
  },
  async publish(req: IRequest, env: Env) {
    return jsonResponse({ published: true }, 200, env);
  },
  async remove(req: IRequest, env: Env) {
    return jsonResponse({ deleted: true }, 200, env);
  },
};
