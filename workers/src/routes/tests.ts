import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleTests = {
  async list(req: IRequest, env: Env) {
    return jsonResponse({ tests: [] });
  },
  async get(req: IRequest, env: Env) {
    return jsonResponse({ test: {} });
  },
  async getHeatmap(req: IRequest, env: Env) {
    return jsonResponse({ type: 'FeatureCollection', features: [] });
  },
  async getPath(req: IRequest, env: Env) {
    return jsonResponse({ type: 'FeatureCollection', features: [] });
  },
  async listMine(req: IRequest, env: Env) {
    return jsonResponse({ tests: [] });
  },
  async create(req: IRequest, env: Env) {
    return jsonResponse({ id: 'test1' }, 201);
  },
  async update(req: IRequest, env: Env) {
    return jsonResponse({ updated: true });
  },
  async publish(req: IRequest, env: Env) {
    return jsonResponse({ published: true });
  },
  async remove(req: IRequest, env: Env) {
    return jsonResponse({ deleted: true });
  },
};
