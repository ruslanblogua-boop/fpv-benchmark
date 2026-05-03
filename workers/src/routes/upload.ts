import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse } from '../lib/utils';

export const handleUpload = {
  async heatmap(req: IRequest, env: Env) {
    return jsonResponse({ key: 'tests/1/heatmap.geojson' });
  },
  async path(req: IRequest, env: Env) {
    return jsonResponse({ key: 'tests/1/path.geojson' });
  },
};
