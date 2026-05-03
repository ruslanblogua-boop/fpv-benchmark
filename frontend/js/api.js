// API wrapper for fpv-heatmap Worker

const getAPIBase = () => {
  // Support three ways to configure API endpoint:
  // 1. Environment variable (for build-time config)
  // 2. localStorage (set by user or during auth setup)
  // 3. Default fallback
  if (typeof window !== 'undefined' && window.VITE_API_URL) {
    return window.VITE_API_URL;
  }
  return localStorage.getItem('api_base') || 'https://fpv-heatmap-api.moonlet.workers.dev';
};

class FPVApi {
  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  setAPIBase(url) {
    localStorage.setItem('api_base', url);
  }

  async request(method, path, body = null) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (this.token) {
      opts.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${getAPIBase()}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // Auth
  async syncUser(token) {
    this.setToken(token);
    return this.request('POST', '/auth/sync');
  }

  async getMe() {
    return this.request('GET', '/me');
  }

  async updateMe(updates) {
    return this.request('PUT', '/me', updates);
  }

  // Tracks
  async getTracks() {
    return this.request('GET', '/tracks');
  }

  async getTrack(slug) {
    return this.request('GET', `/tracks/${slug}`);
  }

  async createTrack(track) {
    return this.request('POST', '/tracks', track);
  }

  async updateTrack(slug, updates) {
    return this.request('PUT', `/tracks/${slug}`, updates);
  }

  async promoteTrack(slug) {
    return this.request('POST', `/tracks/${slug}/promote`);
  }

  // Tests
  async getTests(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request('GET', `/tests?${params}`);
  }

  async getTest(id) {
    return this.request('GET', `/tests/${id}`);
  }

  async getTestHeatmap(id) {
    return this.request('GET', `/tests/${id}/geojson/heatmap`);
  }

  async getTestPath(id) {
    return this.request('GET', `/tests/${id}/geojson/path`);
  }

  async getMyTests() {
    return this.request('GET', '/me/tests');
  }

  async createTest(test) {
    return this.request('POST', '/tests', test);
  }

  async updateTest(id, updates) {
    return this.request('PUT', `/tests/${id}`, updates);
  }

  async publishTest(id) {
    return this.request('POST', `/tests/${id}/publish`);
  }

  async deleteTest(id) {
    return this.request('DELETE', `/tests/${id}`);
  }

  // Profiles
  async getProfiles() {
    return this.request('GET', '/me/profiles');
  }

  async createProfile(profile) {
    return this.request('POST', '/me/profiles', profile);
  }

  async updateProfile(id, updates) {
    return this.request('PUT', `/me/profiles/${id}`, updates);
  }

  async deleteProfile(id) {
    return this.request('DELETE', `/me/profiles/${id}`);
  }

  // Upload
  async uploadHeatmap(testId, geojson) {
    return this.request('POST', '/upload/heatmap', {
      test_id: testId,
      data: geojson,
    });
  }

  async uploadPath(testId, geojson) {
    return this.request('POST', '/upload/path', {
      test_id: testId,
      data: geojson,
    });
  }
}

const api = new FPVApi();
