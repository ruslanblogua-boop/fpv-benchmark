// FPV Heatmap Viewer

class HeatmapViewer {
  constructor() {
    this.map = null;
    this.heatLayer = null;
    this.pathLayer = null;
    this.comparePathLayer = null;
    this.playbackMarker = null;
    this.pathCoordinates = [];
    this.currentTest = null;
    this.currentHeatmap = null;
    this.currentPath = null;
    this.compareMode = false;
    this.compareTest = null;
    this.playbackInterval = null;
    this.init();
  }

  async init() {
    this.map = L.map('map').setView([52.18, 21.13], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CartoDB',
      maxZoom: 19,
    }).addTo(this.map);

    this.attachEventListeners();

    try {
      const { tracks } = await api.getTracks();
      this.populateTrackFilter(tracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }

    try {
      await this.loadTests();
    } catch (err) {
      console.error('Failed to load tests:', err);
    }

    const params = new URLSearchParams(window.location.search);
    const testId = params.get('test');
    if (testId) {
      await this.selectTest(testId);
    }
  }

  attachEventListeners() {
    document.getElementById('filter-track').addEventListener('change', () => this.loadTests());
    document.getElementById('filter-category').addEventListener('change', () => this.loadTests());
    document.getElementById('filter-system').addEventListener('input', () => this.loadTests());

    document.getElementById('topbar-login').addEventListener('click', () => {
      if (auth.isAuthenticated()) {
        auth.logout();
      } else {
        auth.login();
      }
    });

    document.querySelectorAll('input[name="metric"]').forEach((radio) => {
      radio.addEventListener('change', () => this.updateHeatmap());
    });

    document.getElementById('compare-mode').addEventListener('click', () => this.toggleCompareMode());
    document.getElementById('frame-test').addEventListener('click', () => this.frameCurrentTest());
    document.getElementById('playback-play').addEventListener('click', () => this.togglePlayback());
    document.getElementById('playback-slider').addEventListener('input', () => this.updatePlayback());
  }

  async loadTests() {
    const filters = {};
    const track = document.getElementById('filter-track').value;
    const category = document.getElementById('filter-category').value;
    const system = document.getElementById('filter-system').value.trim();

    if (track) filters.track_id = track;
    if (category) filters.category = category;
    if (system) filters.system_under_test = system;

    const { tests } = await api.getTests(filters);
    this.allTests = tests || [];
    this.renderTestList(this.allTests);
  }

  populateTrackFilter(tracks) {
    const select = document.getElementById('filter-track');
    tracks.forEach((track) => {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = track.name;
      select.appendChild(option);
    });
  }

  renderTestList(tests) {
    const list = document.getElementById('test-list');
    list.innerHTML = '';

    if (!tests || tests.length === 0) {
      list.innerHTML = '<div class="empty-state">No tests match these filters yet.</div>';
      return;
    }

    tests.forEach((test) => {
      const item = document.createElement('article');
      item.className = 'test-item';
      item.innerHTML = `
        <div class="test-title">${test.custom_name || test.auto_name || 'Untitled Test'}</div>
        <div class="test-meta">${test.system_under_test || 'System not specified'}</div>
        <div class="test-submeta">${test.track_name || 'Unknown track'} · ${this.formatCategoryLabel(test.category)}</div>
        <button class="test-select" data-id="${test.id}">
          ${this.compareMode && this.currentTest ? 'Compare' : 'View'}
        </button>
      `;

      item.querySelector('.test-select').addEventListener('click', () => this.selectTest(test.id));
      list.appendChild(item);
    });
  }

  async selectTest(testId) {
    const shouldCompare = this.compareMode && this.currentTest && this.currentTest.id !== testId;
    const bundle = await this.fetchTestBundle(testId);

    if (shouldCompare) {
      this.renderCompareTest(bundle);
      return;
    }

    this.clearCompareTest();
    this.currentTest = bundle.test;
    this.currentHeatmap = bundle.heatmap;
    this.currentPath = bundle.path;

    this.clearPrimaryLayers();
    this.renderHeatmap(bundle.heatmap);
    this.renderPath(bundle.path, { compare: false });
    this.renderTestInfo(bundle.test);
    this.frameCurrentTest();
  }

  async fetchTestBundle(testId) {
    const test = await api.getTest(testId);
    const [heatmap, path] = await Promise.all([
      api.getTestHeatmap(testId),
      api.getTestPath(testId),
    ]);

    return { test, heatmap, path };
  }

  clearPrimaryLayers() {
    if (this.heatLayer) this.map.removeLayer(this.heatLayer);
    if (this.pathLayer) this.map.removeLayer(this.pathLayer);
    if (this.playbackMarker) this.map.removeLayer(this.playbackMarker);
    if (this.playbackInterval) clearInterval(this.playbackInterval);
    this.heatLayer = null;
    this.pathLayer = null;
    this.playbackMarker = null;
    this.pathCoordinates = [];
    document.getElementById('playback-slider').value = 0;
    document.getElementById('playback-time').textContent = '00:00';
    const playButton = document.getElementById('playback-play');
    playButton.classList.remove('playing');
    playButton.textContent = 'Play';
  }

  clearCompareTest() {
    this.compareTest = null;
    if (this.comparePathLayer) {
      this.map.removeLayer(this.comparePathLayer);
      this.comparePathLayer = null;
    }
    const compareInfo = document.getElementById('compare-info');
    if (compareInfo) compareInfo.innerHTML = '';
  }

  renderCompareTest(bundle) {
    this.compareTest = bundle.test;
    if (this.comparePathLayer) {
      this.map.removeLayer(this.comparePathLayer);
    }
    this.renderPath(bundle.path, { compare: true });

    const compareInfo = document.getElementById('compare-info');
    compareInfo.innerHTML = `
      <div class="compare-card">
        <div class="eyebrow">Comparison</div>
        <h4>${bundle.test.custom_name || bundle.test.auto_name}</h4>
        <p>${bundle.test.system_under_test || 'System not specified'}</p>
      </div>
    `;

    this.compareMode = false;
    const btn = document.getElementById('compare-mode');
    btn.classList.remove('active');
    btn.textContent = 'Compare 2 Tests';
    this.renderTestList(this.allTests);
  }

  renderHeatmap(geojson) {
    const metric = document.querySelector('input[name="metric"]:checked').value;
    const metricKeys = {
      rc_snr: ['avg_rc_snr', 'rc_snr'],
      bitrate: ['avg_bitrate', 'bitrate'],
      video_signal: ['avg_video_signal', 'video_signal'],
      altitude: ['avg_altitude', 'altitude'],
      speed: ['avg_speed', 'speed'],
    };

    const values = [];
    const rawPoints = [];

    (geojson.features || []).forEach((feature) => {
      if (feature.geometry?.type !== 'Point') return;
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties || {};
      const value = this.pickMetricValue(props, metricKeys[metric] || [metric]);
      rawPoints.push({ lat, lon, value });
      values.push(value);
    });

    if (rawPoints.length === 0) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const heatPoints = rawPoints.map((point) => {
      const intensity = max === min ? 0.7 : 0.2 + ((point.value - min) / (max - min)) * 0.8;
      return [point.lat, point.lon, intensity];
    });

    this.heatLayer = L.heatLayer(heatPoints, {
      radius: 24,
      blur: 16,
      minOpacity: 0.35,
      gradient: {
        0.0: '#164863',
        0.35: '#2c9cdb',
        0.6: '#ffe66d',
        0.85: '#ff9f1c',
        1.0: '#ef476f',
      },
    }).addTo(this.map);
  }

  renderPath(geojson, { compare = false } = {}) {
    const coordinates = this.extractPathCoordinates(geojson);
    if (coordinates.length === 0) return;

    const layer = L.polyline(coordinates, {
      color: compare ? '#ffd166' : '#7bdff2',
      weight: compare ? 3 : 4,
      opacity: compare ? 0.85 : 0.95,
      dashArray: compare ? '10 8' : null,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(this.map);

    if (compare) {
      this.comparePathLayer = layer;
      return;
    }

    this.pathLayer = layer;
    this.pathCoordinates = coordinates;
    const slider = document.getElementById('playback-slider');
    slider.max = Math.max(coordinates.length - 1, 0);
  }

  extractPathCoordinates(geojson) {
    const coordinates = [];

    (geojson.features || []).forEach((feature) => {
      if (feature.geometry?.type === 'LineString') {
        feature.geometry.coordinates.forEach(([lon, lat]) => {
          coordinates.push([lat, lon]);
        });
      }

      if (feature.geometry?.type === 'Point') {
        const [lon, lat] = feature.geometry.coordinates;
        coordinates.push([lat, lon]);
      }
    });

    return coordinates.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  }

  frameCurrentTest() {
    if (!this.pathCoordinates || this.pathCoordinates.length === 0) return;
    this.map.fitBounds(L.latLngBounds(this.pathCoordinates), {
      padding: [48, 48],
      maxZoom: 18,
    });
  }

  renderTestInfo(test) {
    const panel = document.getElementById('test-info');
    const duration = test.duration_s ? `${Math.round(test.duration_s)}s` : 'Unknown';
    const distance = test.total_distance_m ? `${Math.round(test.total_distance_m)}m` : 'Unknown';

    panel.innerHTML = `
      <div class="eyebrow">Selected Test</div>
      <h3>${test.custom_name || test.auto_name || 'Untitled Test'}</h3>
      <dl>
        <dt>System</dt><dd>${test.system_under_test || 'Not specified'}</dd>
        ${test.source_test_name ? `<dt>Source Upload</dt><dd>${test.source_test_name}</dd>` : ''}
        <dt>Track</dt><dd>${test.track_name || 'Unknown track'}</dd>
        <dt>Category</dt><dd>${this.formatCategoryLabel(test.category)}</dd>
        <dt>Duration</dt><dd>${duration}</dd>
        <dt>Distance</dt><dd>${distance}</dd>
        ${test.notes ? `<dt>Notes</dt><dd>${test.notes}</dd>` : ''}
      </dl>
    `;
  }

  updateHeatmap() {
    if (!this.currentHeatmap) return;
    if (this.heatLayer) this.map.removeLayer(this.heatLayer);
    this.renderHeatmap(this.currentHeatmap);
  }

  toggleCompareMode() {
    this.compareMode = !this.compareMode;
    const btn = document.getElementById('compare-mode');

    if (this.compareMode) {
      btn.classList.add('active');
      btn.textContent = 'Pick 2nd Test';
    } else {
      btn.classList.remove('active');
      btn.textContent = 'Compare 2 Tests';
    }

    this.renderTestList(this.allTests);
  }

  togglePlayback() {
    if (!this.pathCoordinates || this.pathCoordinates.length === 0) return;

    const btn = document.getElementById('playback-play');
    if (btn.classList.contains('playing')) {
      btn.classList.remove('playing');
      btn.textContent = 'Play';
      clearInterval(this.playbackInterval);
      return;
    }

    btn.classList.add('playing');
    btn.textContent = 'Stop';
    this.startPlayback();
  }

  startPlayback() {
    const slider = document.getElementById('playback-slider');
    let currentIndex = Number(slider.value) || 0;

    this.playbackInterval = setInterval(() => {
      currentIndex += 1;
      if (currentIndex >= this.pathCoordinates.length) {
        currentIndex = 0;
      }
      slider.value = currentIndex;
      this.updatePlayback();
    }, 125);
  }

  updatePlayback() {
    if (!this.pathCoordinates || this.pathCoordinates.length === 0) return;

    const slider = document.getElementById('playback-slider');
    const timeDisplay = document.getElementById('playback-time');
    const index = Number(slider.value) || 0;
    const coordinate = this.pathCoordinates[index];

    if (!coordinate) return;

    if (!this.playbackMarker) {
      this.playbackMarker = L.circleMarker(coordinate, {
        radius: 6,
        color: '#f8f9fa',
        weight: 2,
        fillColor: '#ff8c42',
        fillOpacity: 1,
      }).addTo(this.map);
    } else {
      this.playbackMarker.setLatLng(coordinate);
    }

    this.map.panTo(coordinate, { animate: true, duration: 0.2 });

    const totalPoints = this.pathCoordinates.length;
    const percentage = totalPoints > 1 ? index / (totalPoints - 1) : 0;
    const duration = this.currentTest?.duration_s || totalPoints;
    const currentTime = Math.floor(duration * percentage);
    const minutes = Math.floor(currentTime / 60);
    const seconds = currentTime % 60;
    timeDisplay.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  pickMetricValue(properties, keys) {
    for (const key of keys) {
      const value = Number(properties?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  formatCategoryLabel(category) {
    if (category === 'link') return 'Link Quality';
    if (category === 'camera') return 'Camera';
    if (category === 'battery') return 'Battery';
    return category || 'Uncategorized';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HeatmapViewer();
});
