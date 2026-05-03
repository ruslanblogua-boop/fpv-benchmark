// FPV Heatmap Viewer

class HeatmapViewer {
  constructor() {
    this.map = null;
    this.heatLayer = null;
    this.pathLayer = null;
    this.currentTest = null;
    this.allTests = [];
    this.init();
  }

  async init() {
    // Initialize map
    this.map = L.map('map').setView([52.18, 21.13], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CartoDB',
      maxZoom: 19,
    }).addTo(this.map);

    // Load tracks
    try {
      const { tracks } = await api.getTracks();
      this.populateTrackFilter(tracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }

    // Load tests
    try {
      await this.loadTests();
    } catch (err) {
      console.error('Failed to load tests:', err);
    }

    // Event listeners
    document.getElementById('filter-track').addEventListener('change', () => this.loadTests());
    document.getElementById('filter-category').addEventListener('change', () => this.loadTests());
    document.getElementById('filter-system').addEventListener('input', () => this.loadTests());

    // Topbar category navigation
    document.querySelectorAll('.topbar-link[data-category]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const category = e.target.dataset.category;
        this.setCategory(category);
      });
    });

    // Topbar login/settings (placeholder)
    document.getElementById('topbar-login').addEventListener('click', () => {
      console.log('Login clicked');
      // TODO: Implement login modal
    });

    document.getElementById('topbar-settings').addEventListener('click', () => {
      console.log('Settings clicked');
      // TODO: Implement settings modal
    });

    document.querySelectorAll('input[name="metric"]').forEach(radio => {
      radio.addEventListener('change', () => this.updateHeatmap());
    });

    document.getElementById('compare-mode').addEventListener('click', () => this.toggleCompareMode());
    document.getElementById('playback-play').addEventListener('click', () => this.togglePlayback());
    document.getElementById('playback-slider').addEventListener('input', () => this.updatePlayback());
  }

  setCategory(category) {
    document.querySelectorAll('.topbar-link[data-category]').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`.topbar-link[data-category="${category}"]`).classList.add('active');
    document.getElementById('filter-category').value = category;
    this.loadTests();
  }

  async loadTests() {
    try {
      const filters = {};
      const track = document.getElementById('filter-track').value;
      const category = document.getElementById('filter-category').value;
      const system = document.getElementById('filter-system').value;

      if (track) filters.track_id = track;
      if (category) filters.category = category;
      if (system) filters.system_under_test = system;

      const { tests } = await api.getTests(filters);
      this.allTests = tests;
      this.renderTestList(tests);
    } catch (err) {
      console.error('Failed to load tests:', err);
    }
  }

  populateTrackFilter(tracks) {
    const select = document.getElementById('filter-track');
    tracks.forEach(track => {
      const opt = document.createElement('option');
      opt.value = track.id;
      opt.textContent = track.name;
      select.appendChild(opt);
    });
  }

  renderTestList(tests) {
    const list = document.getElementById('test-list');
    list.innerHTML = '';
    tests.forEach(test => {
      const item = document.createElement('div');
      item.className = 'test-item';
      item.innerHTML = `
        <div class="test-title">${test.custom_name || test.auto_name}</div>
        <div class="test-meta">${test.system_under_test}</div>
        <button class="test-select" data-id="${test.id}">View</button>
      `;
      item.querySelector('.test-select').addEventListener('click', () => this.selectTest(test.id));
      list.appendChild(item);
    });
  }

  async selectTest(testId) {
    try {
      const test = await api.getTest(testId);
      this.currentTest = test;
      await this.renderTest(test);
    } catch (err) {
      console.error('Failed to load test:', err);
    }
  }

  async renderTest(test) {
    try {
      const heatmap = await api.getTestHeatmap(test.id);
      const path = await api.getTestPath(test.id);

      // Clear previous layers
      if (this.heatLayer) this.map.removeLayer(this.heatLayer);
      if (this.pathLayer) this.map.removeLayer(this.pathLayer);

      // Render heatmap
      this.renderHeatmap(heatmap);

      // Render path
      this.renderPath(path);

      // Fit bounds
      if (path.features.length > 0) {
        const bounds = L.latLngBounds(
          path.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]])
        );
        this.map.fitBounds(bounds, { padding: [50, 50] });
      }

      // Update test info panel
      this.renderTestInfo(test);
    } catch (err) {
      console.error('Failed to render test:', err);
    }
  }

  renderHeatmap(geojson) {
    // TODO: Render heatmap.geojson with leaflet.heat
    // Get selected metric from radio buttons
    // Color scale based on metric values
  }

  renderPath(geojson) {
    // TODO: Render path as dashed line overlay
    // Store for playback slider
  }

  renderTestInfo(test) {
    const panel = document.getElementById('test-info');
    panel.innerHTML = `
      <h3>${test.custom_name || test.auto_name}</h3>
      <dl>
        <dt>System</dt><dd>${test.system_under_test}</dd>
        <dt>Category</dt><dd>${test.category}</dd>
        <dt>Duration</dt><dd>${test.duration_s}s</dd>
        <dt>Distance</dt><dd>${test.total_distance_m}m</dd>
        <dt>Link Loss Events</dt><dd>${test.link_loss_count}</dd>
        ${test.wind_speed ? `<dt>Wind</dt><dd>${test.wind_speed}</dd>` : ''}
        ${test.notes ? `<dt>Notes</dt><dd>${test.notes}</dd>` : ''}
      </dl>
    `;
  }

  updateHeatmap() {
    // TODO: Re-render heatmap with new metric selected
  }

  toggleCompareMode() {
    // TODO: Allow second test selection for side-by-side comparison
  }

  togglePlayback() {
    // TODO: Animate drone along path
  }

  updatePlayback() {
    // TODO: Update playback position based on slider
  }
}

// Initialize viewer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new HeatmapViewer();
});
