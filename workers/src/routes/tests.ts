import { IRequest } from 'itty-router';
import { Env } from '../index';
import { jsonResponse, errorResponse, generateId } from '../lib/utils';

type StoredStats = {
  prepared_test_json?: any;
  systems?: Array<{ type?: string; name?: string; variant?: string | null }>;
  summary_metrics?: any;
};

type TestRow = {
  id: string;
  custom_name?: string | null;
  auto_name?: string | null;
  category?: string | null;
  system_under_test?: string | null;
  created_at?: string | null;
  status?: string | null;
  track_name?: string | null;
  track_id?: string | null;
  stats_json?: string | null;
};

const SYSTEM_ID_SEPARATOR = '::';

function parseStatsJson(statsJson?: string | null): StoredStats {
  if (!statsJson) return {};
  try {
    return JSON.parse(statsJson);
  } catch {
    return {};
  }
}

function extractBaseId(id: string) {
  const [baseId, virtualIndex] = id.split(SYSTEM_ID_SEPARATOR);
  return {
    baseId,
    virtualIndex: Number.isInteger(Number(virtualIndex)) ? Number(virtualIndex) : null,
  };
}

function numeric(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTrackPoints(preparedTestJson: any) {
  if (!preparedTestJson || !Array.isArray(preparedTestJson.track)) return [];

  return preparedTestJson.track
    .map((point: any, index: number) => {
      const lat = numeric(point?.lat);
      const lon = numeric(point?.lon);
      if (lat === null || lon === null) return null;

      const speedMs = numeric(point?.speed_ms);
      const groundSpeedKmh = numeric(point?.ground_speed_kmh);

      return {
        index,
        t: numeric(point?.t) ?? index,
        lat,
        lon,
        altitude_m: numeric(point?.altitude_m) ?? numeric(point?.relative_altitude_m) ?? 0,
        speed_ms: speedMs ?? (groundSpeedKmh !== null ? groundSpeedKmh / 3.6 : 0),
        bitrate_mbps: numeric(point?.vtx_bitrate_mbps) ?? 0,
        video_signal: numeric(point?.vtx_link_quality) ?? 0,
        rc_snr: numeric(point?.rx_link_quality) ?? numeric(point?.rqly_percent) ?? 0,
        delay_ms: numeric(point?.delay_ms) ?? 0,
        distance_from_home_m: numeric(point?.distance_from_home_m) ?? 0,
        heatmap_score: numeric(point?.heatmap_score) ?? 0,
        zone_tag: point?.zone_tag || null,
      };
    })
    .filter(Boolean);
}

function buildPathGeoJSON(preparedTestJson: any) {
  const points = getTrackPoints(preparedTestJson);
  const lineCoordinates = points.map((point) => [point.lon, point.lat]);
  const features: any[] = [];

  if (lineCoordinates.length > 1) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: lineCoordinates,
      },
      properties: {
        sample_count: lineCoordinates.length,
      },
    });
  }

  points.forEach((point) => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lon, point.lat],
      },
      properties: {
        t: point.t,
        altitude_m: point.altitude_m,
        speed_ms: point.speed_ms,
        distance_from_home_m: point.distance_from_home_m,
        heatmap_score: point.heatmap_score,
        zone_tag: point.zone_tag,
      },
    });
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

function buildHeatmapGeoJSON(preparedTestJson: any) {
  const points = getTrackPoints(preparedTestJson);

  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lon, point.lat],
      },
      properties: {
        t: point.t,
        rc_snr: point.rc_snr,
        avg_rc_snr: point.rc_snr,
        bitrate: point.bitrate_mbps,
        avg_bitrate: point.bitrate_mbps,
        video_signal: point.video_signal,
        avg_video_signal: point.video_signal,
        altitude: point.altitude_m,
        avg_altitude: point.altitude_m,
        speed: point.speed_ms,
        avg_speed: point.speed_ms,
        delay_ms: point.delay_ms,
        distance_from_home_m: point.distance_from_home_m,
        heatmap_score: point.heatmap_score,
        zone_tag: point.zone_tag,
      },
    })),
  };
}

function formatSystemLabel(system: { type?: string; name?: string; variant?: string | null }) {
  if (!system) return '';
  const base = String(system.name || '').trim();
  const variant = String(system.variant || '').trim();
  return [base, variant].filter(Boolean).join(' ');
}

function getSystemLabels(test: TestRow) {
  if (test.category && test.category !== 'link') {
    return [String(test.system_under_test || '').trim()].filter(Boolean);
  }

  const stats = parseStatsJson(test.stats_json);
  const labelsFromSystems = Array.isArray(stats.systems)
    ? stats.systems.map(formatSystemLabel).filter(Boolean)
    : [];

  if (labelsFromSystems.length > 0) return labelsFromSystems;

  return String(test.system_under_test || '')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
}

function expandTestRows(rows: TestRow[]) {
  return rows.flatMap((row) => {
    if (row.category && row.category !== 'link') {
      return [{
        ...row,
        source_test_name: row.custom_name || row.auto_name || 'Untitled Test',
        system_under_test: row.system_under_test || '',
      }];
    }

    const labels = getSystemLabels(row);
    const sourceName = row.custom_name || row.auto_name || 'Untitled Test';

    if (labels.length <= 1) {
      const label = labels[0] || row.system_under_test || '';
      return [{
        ...row,
        source_test_name: sourceName,
        system_under_test: label,
      }];
    }

    return labels.map((label, index) => ({
      ...row,
      id: `${row.id}${SYSTEM_ID_SEPARATOR}${index}`,
      source_test_name: sourceName,
      system_under_test: label,
      custom_name: row.custom_name ? `${row.custom_name} — ${label}` : null,
      auto_name: `${row.auto_name || sourceName} — ${label}`,
      system_index: index,
    }));
  });
}

function filterExpandedTests(rows: any[], req: IRequest) {
  const url = new URL(req.url);
  const trackId = url.searchParams.get('track_id');
  const category = url.searchParams.get('category');
  const systemSearch = url.searchParams.get('system_under_test')?.toLowerCase().trim();

  return rows.filter((row) => {
    if (trackId && row.track_id !== trackId) return false;
    if (category && row.category !== category) return false;
    if (systemSearch) {
      const haystack = `${row.system_under_test || ''} ${row.custom_name || ''} ${row.auto_name || ''}`.toLowerCase();
      if (!haystack.includes(systemSearch)) return false;
    }
    return true;
  });
}

function buildStoredStats(body: any, existingStatsJson?: string | null) {
  const existingStats = parseStatsJson(existingStatsJson);
  const nextStats: StoredStats = {
    ...existingStats,
  };

  if (body.prepared_test_json !== undefined) {
    nextStats.prepared_test_json = body.prepared_test_json;
  }

  if (body.systems !== undefined) {
    nextStats.systems = body.systems;
  }

  if (body.prepared_test_json?.summary_metrics !== undefined) {
    nextStats.summary_metrics = body.prepared_test_json.summary_metrics;
  }

  return JSON.stringify(nextStats);
}

export const handleTests = {
  async list(req: IRequest, env: Env) {
    try {
      const tests = await env.DB.prepare(`
        SELECT
          t.id, t.custom_name, t.auto_name, t.category, t.system_under_test,
          t.created_at, t.status, t.track_id, t.stats_json,
          tr.name as track_name
        FROM tests t
        LEFT JOIN tracks tr ON t.track_id = tr.id
        WHERE t.status = 'published'
        ORDER BY t.created_at DESC
        LIMIT 100
      `).all<TestRow>();

      const expanded = expandTestRows(tests.results || []);
      return jsonResponse({ tests: filterExpandedTests(expanded, req) }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch tests: ' + err.message);
    }
  },

  async get(req: IRequest, env: Env) {
    try {
      const { baseId, virtualIndex } = extractBaseId((req as any).params.id);
      const test = await env.DB.prepare(`
        SELECT
          t.*,
          tr.name as track_name,
          dp.name as drone_name
        FROM tests t
        LEFT JOIN tracks tr ON t.track_id = tr.id
        LEFT JOIN drone_profiles dp ON t.drone_profile_id = dp.id
        WHERE t.id = ?
      `).bind(baseId).first<any>();

      if (!test) return errorResponse('Test not found', 404);

      const labels = getSystemLabels(test);
      if (virtualIndex !== null && labels[virtualIndex]) {
        const label = labels[virtualIndex];
        test.id = `${test.id}${SYSTEM_ID_SEPARATOR}${virtualIndex}`;
        test.source_test_name = test.custom_name || test.auto_name;
        test.system_under_test = label;
        test.custom_name = test.custom_name ? `${test.custom_name} — ${label}` : null;
        test.auto_name = `${test.auto_name || test.source_test_name} — ${label}`;
      }

      return jsonResponse({ test }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch test: ' + err.message);
    }
  },

  async getHeatmap(req: IRequest, env: Env) {
    try {
      const { baseId } = extractBaseId((req as any).params.id);
      const test = await env.DB.prepare(
        'SELECT heatmap_key, stats_json FROM tests WHERE id = ?'
      ).bind(baseId).first<{ heatmap_key?: string; stats_json?: string | null }>();

      if (!test) return errorResponse('Heatmap not found', 404);

      if (test.heatmap_key) {
        const data = await env.STORAGE.get(test.heatmap_key);
        if (data) {
          return new Response(data.body, {
            headers: { 'Content-Type': 'application/geo+json' },
          });
        }
      }

      const preparedTestJson = parseStatsJson(test.stats_json).prepared_test_json;
      if (!preparedTestJson) return errorResponse('Heatmap not found', 404);

      return new Response(JSON.stringify(buildHeatmapGeoJSON(preparedTestJson)), {
        headers: { 'Content-Type': 'application/geo+json' },
      });
    } catch (err: any) {
      return errorResponse('Failed to fetch heatmap: ' + err.message);
    }
  },

  async getPath(req: IRequest, env: Env) {
    try {
      const { baseId } = extractBaseId((req as any).params.id);
      const test = await env.DB.prepare(
        'SELECT path_key, stats_json FROM tests WHERE id = ?'
      ).bind(baseId).first<{ path_key?: string; stats_json?: string | null }>();

      if (!test) return errorResponse('Path not found', 404);

      if (test.path_key) {
        const data = await env.STORAGE.get(test.path_key);
        if (data) {
          return new Response(data.body, {
            headers: { 'Content-Type': 'application/geo+json' },
          });
        }
      }

      const preparedTestJson = parseStatsJson(test.stats_json).prepared_test_json;
      if (!preparedTestJson) return errorResponse('Path not found', 404);

      return new Response(JSON.stringify(buildPathGeoJSON(preparedTestJson)), {
        headers: { 'Content-Type': 'application/geo+json' },
      });
    } catch (err: any) {
      return errorResponse('Failed to fetch path: ' + err.message);
    }
  },

  async listMine(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const tests = await env.DB.prepare(`
        SELECT
          t.id, t.custom_name, t.auto_name, t.category, t.system_under_test,
          t.created_at, t.status, t.track_id, t.stats_json,
          tr.name as track_name
        FROM tests t
        LEFT JOIN tracks tr ON t.track_id = tr.id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC
      `).bind(user.sub).all<TestRow>();

      const expanded = expandTestRows(tests.results || []);
      return jsonResponse({ tests: filterExpandedTests(expanded, req) }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to fetch user tests: ' + err.message);
    }
  },

  async create(req: IRequest, env: Env) {
    try {
      const user = (req as any).user;
      const body = await req.json<any>();

      const testId = generateId();
      const autoName = body.custom_name || `Test ${new Date().toISOString().split('T')[0]}`;

      await env.DB.prepare(`
        INSERT INTO tests (
          id, user_id, track_id, drone_profile_id,
          auto_name, custom_name, category, system_under_test,
          pilot_lat, pilot_lon, pilot_bearing_deg,
          grid_size_m, wind_speed, wind_direction, notes,
          stats_json, duration_s, total_distance_m,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        testId,
        user.sub,
        body.track_id || null,
        body.drone_profile_id || null,
        autoName,
        body.custom_name || null,
        body.category || 'link',
        body.system_under_test || '',
        body.pilot_lat || null,
        body.pilot_lon || null,
        body.pilot_bearing_deg || null,
        body.grid_size_m || 1.0,
        body.wind_speed || null,
        body.wind_direction || null,
        body.notes || null,
        buildStoredStats(body),
        body.duration_s || null,
        body.total_distance_m || null,
        'draft'
      ).run();

      return jsonResponse({ id: testId }, 201, env);
    } catch (err: any) {
      return errorResponse('Failed to create test: ' + err.message);
    }
  },

  async update(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const user = (req as any).user;
      const body = await req.json<any>();

      const existing = await env.DB.prepare(
        'SELECT user_id, stats_json FROM tests WHERE id = ?'
      ).bind(id).first<{ user_id: string; stats_json?: string | null }>();

      if (!existing || existing.user_id !== user.sub) {
        return errorResponse('Not found or unauthorized', 404);
      }

      await env.DB.prepare(`
        UPDATE tests SET
          custom_name = ?, category = ?, system_under_test = ?,
          pilot_lat = ?, pilot_lon = ?, pilot_bearing_deg = ?,
          grid_size_m = ?, wind_speed = ?, wind_direction = ?, notes = ?,
          stats_json = ?, duration_s = ?, total_distance_m = ?
        WHERE id = ?
      `).bind(
        body.custom_name || null,
        body.category || 'link',
        body.system_under_test || '',
        body.pilot_lat || null,
        body.pilot_lon || null,
        body.pilot_bearing_deg || null,
        body.grid_size_m || 1.0,
        body.wind_speed || null,
        body.wind_direction || null,
        body.notes || null,
        buildStoredStats(body, existing.stats_json),
        body.duration_s || null,
        body.total_distance_m || null,
        id
      ).run();

      return jsonResponse({ updated: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to update test: ' + err.message);
    }
  },

  async publish(req: IRequest, env: Env) {
    try {
      const id = (req as any).params.id;
      const user = (req as any).user;

      const test = await env.DB.prepare(
        'SELECT user_id, status FROM tests WHERE id = ?'
      ).bind(id).first<{ user_id: string; status: string }>();

      if (!test || test.user_id !== user.sub) return errorResponse('Not found or unauthorized', 404);
      if (test.status !== 'draft') return errorResponse('Only draft tests can be published', 400);

      await env.DB.prepare(`
        UPDATE tests SET status = ?, published_at = datetime('now') WHERE id = ?
      `).bind('published', id).run();

      return jsonResponse({ published: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to publish test: ' + err.message);
    }
  },

  async remove(req: IRequest, env: Env) {
    try {
      const { baseId } = extractBaseId((req as any).params.id);
      const user = (req as any).user;

      const test = await env.DB.prepare(
        'SELECT user_id, heatmap_key, path_key FROM tests WHERE id = ?'
      ).bind(baseId).first<any>();

      if (!test || test.user_id !== user.sub) return errorResponse('Not found or unauthorized', 404);

      if (test.heatmap_key) {
        await env.STORAGE.delete(test.heatmap_key).catch(() => {});
      }
      if (test.path_key) {
        await env.STORAGE.delete(test.path_key).catch(() => {});
      }

      await env.DB.prepare('DELETE FROM tests WHERE id = ?').bind(baseId).run();

      return jsonResponse({ deleted: true }, 200, env);
    } catch (err: any) {
      return errorResponse('Failed to delete test: ' + err.message);
    }
  },
};
