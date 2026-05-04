// FPV Heatmap Viewer

const TEST_TYPE_CONFIG = {
  video: {
    label: 'Video',
    metrics: [
      { id: 'bitrate', label: 'Bitrate', unit: 'Mbps', keys: ['avg_bitrate', 'bitrate'], invert: false },
      { id: 'video_signal', label: 'Video Signal', unit: 'bars', keys: ['avg_video_signal', 'video_signal'], invert: false },
      { id: 'delay_ms', label: 'Latency', unit: 'ms', keys: ['delay_ms'], invert: true },
    ],
  },
  control: {
    label: 'Control',
    metrics: [
      { id: 'rc_snr', label: 'Control Quality', unit: '%', keys: ['avg_rc_snr', 'rc_snr'], invert: false },
    ],
  },
};

class HeatmapViewer {
  constructor() {
    this.map = null;
    this.metricLayer = null;
    this.pathLayer = null;
    this.playbackMarker = null;
    this.pathCoordinates = [];
    this.currentTest = null;
    this.currentHeatmap = null;
    this.currentPath = null;
    this.currentMetric = 'bitrate';
    this.scaleShift = 0;
    this.playbackInterval = null;
    this.addMode = false;
    this.selectedTests = [];
    this.testBundles = new Map();
    this.allTests = [];
    this.init();
  }

  async init() {
    this.map = L.map('map').setView([52.18, 21.13], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© CartoDB',
      maxZoom: 19,
      opacity: 0.92,
    }).addTo(this.map);

    this.attachEventListeners();
    this.renderMetricOptions();
    this.renderSelectedTests();

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
  }

  attachEventListeners() {
    document.getElementById('filter-track').addEventListener('change', () => this.loadTests());
    document.getElementById('filter-category').addEventListener('change', () => this.onCategoryChange());
    document.getElementById('filter-system').addEventListener('input', () => this.loadTests());
    document.getElementById('topbar-login').addEventListener('click', () => auth.isAuthenticated() ? auth.logout() : auth.login());
    document.getElementById('frame-test').addEventListener('click', () => this.frameCurrentTest());
    document.getElementById('playback-play').addEventListener('click', () => this.togglePlayback());
    document.getElementById('playback-slider').addEventListener('input', () => this.updatePlayback());
    document.getElementById('metric-scale-shift').addEventListener('input', (event) => {
      this.scaleShift = Number(event.target.value) || 0;
      this.updateMetricLayer();
    });
    document.getElementById('add-test-toggle').addEventListener('click', () => this.toggleAddMode());
  }

  getActiveCategory() {
    return document.getElementById('filter-category').value || 'video';
  }

  onCategoryChange() {
    this.currentMetric = TEST_TYPE_CONFIG[this.getActiveCategory()].metrics[0].id;
    this.renderMetricOptions();
    this.loadTests();
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

  renderSelectedTests() {
    const container = document.getElementById('selected-tests');
    if (this.selectedTests.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = this.selectedTests.map((test) => `
      <button class="selected-test-pill ${this.currentTest?.id === test.id ? 'active' : ''}" data-id="${test.id}">
        <span>${test.custom_name || test.auto_name}</span>
        <strong>${test.category}</strong>
        <em data-remove="${test.id}">×</em>
      </button>
    `).join('');

    container.querySelectorAll('.selected-test-pill').forEach((pill) => {
      pill.addEventListener('click', async (event) => {
        const removeId = event.target.dataset.remove;
        if (removeId) {
          event.stopPropagation();
          this.removeSelectedTest(removeId);
          return;
        }
        await this.activateSelectedTest(pill.dataset.id, true);
      });
    });
  }

  toggleAddMode() {
    this.addMode = !this.addMode;
    const button = document.getElementById('add-test-toggle');
    button.classList.toggle('active', this.addMode);
    button.textContent = this.addMode ? 'Pick Test From List' : 'Add Test';
    this.setBrowserCollapsed(!this.addMode && this.selectedTests.length > 0);
    this.renderTestList(this.allTests);
  }

  setBrowserCollapsed(collapsed) {
    const browser = document.querySelector('.test-browser');
    if (!browser) return;
    browser.classList.toggle('collapsed', collapsed);
  }

  renderTestList(tests) {
    const list = document.getElementById('test-list');
    list.innerHTML = '';

    if (!tests || tests.length === 0) {
      list.innerHTML = '<div class="empty-state">No tests match these filters yet.</div>';
      return;
    }

    tests.forEach((test) => {
      const isSelected = this.selectedTests.some((item) => item.id === test.id);
      const item = document.createElement('article');
      item.className = 'test-item';
      item.innerHTML = `
        <div class="test-title">${test.custom_name || test.auto_name || 'Untitled Test'}</div>
        <div class="test-meta">${test.system_under_test || 'System not specified'}</div>
        <div class="test-submeta">${test.track_name || 'Unknown track'} · ${this.formatCategoryLabel(test.category)}</div>
        <button class="test-select" data-id="${test.id}">
          ${this.addMode ? (isSelected ? 'Added' : 'Add') : 'View'}
        </button>
      `;
      item.querySelector('.test-select').addEventListener('click', () => this.handleTestCardClick(test.id));
      list.appendChild(item);
    });
  }

  async handleTestCardClick(testId) {
    const preserveView = this.selectedTests.length > 0;
    if (this.addMode) {
      await this.addSelectedTest(testId, preserveView);
      this.addMode = false;
      document.getElementById('add-test-toggle').classList.remove('active');
      document.getElementById('add-test-toggle').textContent = 'Add Test';
      this.renderTestList(this.allTests);
      return;
    }

    if (!this.selectedTests.some((test) => test.id === testId)) {
      await this.addSelectedTest(testId, preserveView);
      return;
    }

    await this.activateSelectedTest(testId, true);
  }

  async addSelectedTest(testId, preserveView = false) {
    const bundle = await this.fetchTestBundle(testId);
    if (!this.selectedTests.some((test) => test.id === testId)) {
      this.selectedTests.push({
        id: bundle.test.id,
        custom_name: bundle.test.custom_name || bundle.test.auto_name,
        auto_name: bundle.test.auto_name,
        category: bundle.test.category,
      });
    }
    await this.renderBundle(bundle, preserveView);
    this.setBrowserCollapsed(true);
    this.renderSelectedTests();
  }

  removeSelectedTest(testId) {
    this.selectedTests = this.selectedTests.filter((test) => test.id !== testId);
    this.testBundles.delete(testId);

    if (this.currentTest?.id === testId) {
      const fallback = this.selectedTests[0];
      if (fallback) {
        this.activateSelectedTest(fallback.id, true);
      } else {
        this.clearPrimaryLayers();
        this.currentTest = null;
        this.currentHeatmap = null;
        this.currentPath = null;
        document.getElementById('test-info').innerHTML = '';
        document.getElementById('compare-info').innerHTML = '';
        this.setBrowserCollapsed(false);
      }
    }

    this.renderSelectedTests();
    this.renderTestList(this.allTests);
  }

  async activateSelectedTest(testId, preserveView = true) {
    const bundle = await this.fetchTestBundle(testId);
    await this.renderBundle(bundle, preserveView);
    this.renderSelectedTests();
  }

  async fetchTestBundle(testId) {
    if (this.testBundles.has(testId)) {
      return this.testBundles.get(testId);
    }

    const test = await api.getTest(testId);
    const [heatmap, path] = await Promise.all([
      api.getTestHeatmap(testId),
      api.getTestPath(testId),
    ]);
    const bundle = { test, heatmap, path };
    this.testBundles.set(testId, bundle);
    return bundle;
  }

  async renderBundle(bundle, preserveView = false) {
    this.currentTest = bundle.test;
    this.currentHeatmap = bundle.heatmap;
    this.currentPath = bundle.path;

    const activeCategory = bundle.test.category || 'video';
    document.getElementById('filter-category').value = activeCategory;
    this.currentMetric = TEST_TYPE_CONFIG[activeCategory]?.metrics[0]?.id || this.currentMetric;
    this.renderMetricOptions();

    this.clearPrimaryLayers();
    this.renderPath(bundle.path);
    this.updateMetricLayer();
    this.renderTestInfo(bundle.test);

    if (!preserveView) {
      this.frameCurrentTest();
    }
  }

  clearPrimaryLayers() {
    if (this.metricLayer) this.map.removeLayer(this.metricLayer);
    if (this.pathLayer) this.map.removeLayer(this.pathLayer);
    if (this.playbackMarker) this.map.removeLayer(this.playbackMarker);
    if (this.playbackInterval) clearInterval(this.playbackInterval);
    this.metricLayer = null;
    this.pathLayer = null;
    this.playbackMarker = null;
    this.pathCoordinates = [];
    document.getElementById('playback-slider').value = 0;
    document.getElementById('playback-time').textContent = '00:00';
    const playButton = document.getElementById('playback-play');
    playButton.classList.remove('playing');
    playButton.textContent = 'Play';
  }

  renderMetricOptions() {
    const container = document.getElementById('metric-options');
    const category = this.getActiveCategory();
    const metrics = TEST_TYPE_CONFIG[category]?.metrics || [];
    if (!metrics.some((metric) => metric.id === this.currentMetric)) {
      this.currentMetric = metrics[0]?.id || '';
    }

    container.innerHTML = metrics.map((metric) => `
      <button class="metric-pill ${metric.id === this.currentMetric ? 'active' : ''}" data-metric="${metric.id}">
        ${metric.label}
      </button>
    `).join('');

    container.querySelectorAll('.metric-pill').forEach((button) => {
      button.addEventListener('click', () => {
        this.currentMetric = button.dataset.metric;
        this.renderMetricOptions();
        this.updateMetricLayer();
      });
    });
  }

  updateMetricLayer() {
    if (!this.currentHeatmap) return;
    if (this.metricLayer) this.map.removeLayer(this.metricLayer);
    this.renderMetricLayer(this.currentHeatmap);
  }

  renderMetricLayer(geojson) {
    const config = this.getMetricConfig();
    if (!config) return;

    const points = [];
    (geojson.features || []).forEach((feature) => {
      if (feature.geometry?.type !== 'Point') return;
      const [lon, lat] = feature.geometry.coordinates;
      const value = this.pickMetricValue(feature.properties || {}, config.keys);
      if (!Number.isFinite(value)) return;
      points.push({ lat, lon, value, properties: feature.properties || {} });
    });

    if (points.length === 0) return;

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bias = this.scaleShift / 100;

    this.metricLayer = L.layerGroup(points.map((point) => {
      const normalized = this.normalizeMetric(point.value, max, bias, config.invert);
      return L.circleMarker([point.lat, point.lon], {
        radius: 6,
        weight: 0,
        color: 'transparent',
        fillColor: this.colorForValue(normalized),
        fillOpacity: 0.92,
      }).bindPopup(this.buildDataPointPopup(point.properties, config));
    })).addTo(this.map);

    this.renderLegend(min, max, config);
  }

  renderPath(geojson) {
    const coordinates = this.extractPathCoordinates(geojson);
    if (coordinates.length === 0) return;

    this.pathLayer = L.polyline(coordinates, {
      color: '#7bdff2',
      weight: 3,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(this.map);

    this.pathCoordinates = coordinates;
    document.getElementById('playback-slider').max = Math.max(coordinates.length - 1, 0);
  }

  extractPathCoordinates(geojson) {
    const coordinates = [];
    (geojson.features || []).forEach((feature) => {
      if (feature.geometry?.type === 'LineString') {
        feature.geometry.coordinates.forEach(([lon, lat]) => coordinates.push([lat, lon]));
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
    this.map.fitBounds(L.latLngBounds(this.pathCoordinates), { padding: [48, 48], maxZoom: 18 });
  }

  renderTestInfo(test) {
    const panel = document.getElementById('test-info');
    panel.innerHTML = `
      <div class="eyebrow">Selected Test</div>
      <h3>${test.custom_name || test.auto_name || 'Untitled Test'}</h3>
      <dl>
        <dt>Benchmark</dt><dd>${this.formatCategoryLabel(test.category)}</dd>
        <dt>System</dt><dd>${test.system_under_test || 'Not specified'}</dd>
        <dt>Track</dt><dd>${test.track_name || 'Unknown track'}</dd>
        <dt>Duration</dt><dd>${test.duration_s ? `${Math.round(test.duration_s)}s` : 'Unknown'}</dd>
        <dt>Distance</dt><dd>${test.total_distance_m ? `${Math.round(test.total_distance_m)}m` : 'Unknown'}</dd>
      </dl>
    `;
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
      if (currentIndex >= this.pathCoordinates.length) currentIndex = 0;
      slider.value = currentIndex;
      this.updatePlayback();
    }, 125);
  }

  updatePlayback() {
    if (!this.pathCoordinates || this.pathCoordinates.length === 0) return;
    const slider = document.getElementById('playback-slider');
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

    const totalPoints = this.pathCoordinates.length;
    const percentage = totalPoints > 1 ? index / (totalPoints - 1) : 0;
    const duration = this.currentTest?.duration_s || totalPoints;
    const currentTime = Math.floor(duration * percentage);
    const minutes = Math.floor(currentTime / 60);
    const seconds = currentTime % 60;
    document.getElementById('playback-time').textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  getMetricConfig() {
    return TEST_TYPE_CONFIG[this.currentTest?.category || this.getActiveCategory()]?.metrics.find((metric) => metric.id === this.currentMetric);
  }

  pickMetricValue(properties, keys) {
    for (const key of keys) {
      const value = Number(properties?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return NaN;
  }

  normalizeMetric(value, max, bias, invert = false) {
    if (!Number.isFinite(max) || max <= 0) return 0.5;
    const ratio = Math.max(0, Math.min(1, value / max));
    const redThreshold = Math.max(0.03, Math.min(0.28, 0.12 + bias * 0.16));
    const greenAnchor = 0.5;
    let normalized;

    if (ratio <= redThreshold) {
      normalized = 0;
    } else if (ratio < greenAnchor) {
      normalized = 0.5 * ((ratio - redThreshold) / Math.max(greenAnchor - redThreshold, 0.01));
    } else {
      normalized = 0.5 + 0.5 * ((ratio - greenAnchor) / Math.max(1 - greenAnchor, 0.01));
    }

    return invert ? 1 - Math.max(0, Math.min(1, normalized)) : Math.max(0, Math.min(1, normalized));
  }

  colorForValue(normalized) {
    const hue = normalized * 120;
    return `hsl(${hue}, 88%, 46%)`;
  }

  renderLegend(min, max, config) {
    const redThreshold = Math.max(0.03, Math.min(0.28, 0.12 + (this.scaleShift / 100) * 0.16));
    document.getElementById('metric-legend').innerHTML = `
      <div class="legend-gradient"></div>
      <div class="legend-shift">Scale shift: ${this.scaleShift > 0 ? '+' : ''}${this.scaleShift}% · red &lt; ${Math.round(redThreshold * 100)}% of max · green = 50% of max · brighter green &gt; 50%</div>
      <div class="legend-range">
        <span>${this.formatMetricValue(config.invert ? max : min, config.unit)}</span>
        <span>${this.formatMetricValue(config.invert ? min : max, config.unit)}</span>
      </div>
    `;
  }

  buildDataPointPopup(properties = {}, config) {
    const speedMs = Number.isFinite(Number(properties.speed_ms))
      ? Number(properties.speed_ms)
      : (Number.isFinite(Number(properties.ground_speed_kmh)) ? Number(properties.ground_speed_kmh) / 3.6 : Number(properties.speed || properties.avg_speed));
    return `
      <div class="data-point-popup">
        <strong>${config.label}</strong>
        <div>${this.formatMetricValue(this.pickMetricValue(properties, config.keys), config.unit)}</div>
        ${Number.isFinite(Number(properties.distance_from_home_m)) ? `<div>Distance from home: ${Math.round(Number(properties.distance_from_home_m))} m</div>` : ''}
        ${Number.isFinite(Number(properties.altitude || properties.altitude_m || properties.avg_altitude)) ? `<div>Altitude from home: ${Math.round(Number(properties.altitude || properties.altitude_m || properties.avg_altitude))} m</div>` : ''}
        ${Number.isFinite(speedMs) ? `<div>Speed: ${Math.round(speedMs * 10) / 10} m/s</div>` : ''}
        ${Number.isFinite(Number(properties.delay_ms)) ? `<div>Delay: ${Math.round(Number(properties.delay_ms))} ms</div>` : ''}
        ${Number.isFinite(Number(properties.bitrate || properties.avg_bitrate || properties.vtx_bitrate_mbps)) ? `<div>Bitrate: ${Math.round(Number(properties.bitrate || properties.avg_bitrate || properties.vtx_bitrate_mbps) * 10) / 10} Mbps</div>` : ''}
        ${Number.isFinite(Number(properties.video_signal || properties.avg_video_signal || properties.vtx_link_quality)) ? `<div>Video signal: ${Math.round(Number(properties.video_signal || properties.avg_video_signal || properties.vtx_link_quality))}</div>` : ''}
        ${Number.isFinite(Number(properties.rc_snr || properties.avg_rc_snr || properties.rqly_percent || properties.rx_link_quality)) ? `<div>Control quality: ${Math.round(Number(properties.rc_snr || properties.avg_rc_snr || properties.rqly_percent || properties.rx_link_quality) * 10) / 10}%</div>` : ''}
        ${Number.isFinite(Number(properties.t)) ? `<div>Timestamp: ${(Number(properties.t) / 1000).toFixed(1)} s</div>` : ''}
      </div>
    `;
  }

  formatMetricValue(value, unit) {
    return `${Math.round(value * 10) / 10}${unit ? ` ${unit}` : ''}`;
  }

  formatCategoryLabel(category) {
    if (category === 'video') return 'Video';
    if (category === 'control') return 'Control';
    if (category === 'camera') return 'Camera';
    if (category === 'battery') return 'Battery';
    return category || 'Uncategorized';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HeatmapViewer();
});
