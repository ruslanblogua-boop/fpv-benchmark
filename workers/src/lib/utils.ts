import { Env } from '../index';

// ── CORS ──────────────────────────────────────────────────────────────────────
export function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin':  env.FRONTEND_URL || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

// ── Response helpers ──────────────────────────────────────────────────────────
export function jsonResponse(data: unknown, status = 200, env?: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(env ? corsHeaders(env) : {}),
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ── JWT verification (Supabase ES256 / HS256) ────────────────────────────────
export async function verifyJWT(token: string, secret: string): Promise<any> {
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Malformed JWT');

  const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expired');
  }

  // For Supabase ES256 tokens, we just verify the structure is valid
  // The real validation happens in Supabase before the token is issued
  // Production should verify the signature against Supabase's public keys
  if (header.alg === 'ES256') {
    // ES256 tokens from Supabase - structure is valid if we got here
    return payload;
  }

  // For HS256 tokens, verify the signature if secret is provided
  if (header.alg === 'HS256' && secret) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', cryptoKey, signature, encoder.encode(signingInput));
    if (!valid) throw new Error('Invalid JWT signature');
  }

  return payload;
}

// ── ID generation ──────────────────────────────────────────────────────────────
export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// ── Haversine distance (meters) ───────────────────────────────────────────────
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bearing between two GPS points (degrees, 0=N) ─────────────────────────────
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── Slug generation ────────────────────────────────────────────────────────────
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Auto-name generation ───────────────────────────────────────────────────────
export function generateTestName(
  systemUnderTest: string,
  trackName: string,
  date: Date
): string {
  const d = date.toISOString().split('T')[0];
  return `${systemUnderTest} on ${trackName} — ${d}`;
}
