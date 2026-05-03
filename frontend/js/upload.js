// Upload Wizard

class UploadWizard {
  constructor() {
    this.currentStep = 1;
    this.heatmapData = null;
    this.pathData = null;
    this.mapSetup = null;
    this.metadata = null;
    this.init();
  }

  async init() {
    // Check auth
    if (!api.token) {
      window.location.href = '/'; // Redirect to viewer
      return;
    }

    // Step 1: File upload (set up first before API calls)
    document.getElementById('file-heatmap').addEventListener('change', (e) => this.onHeatmapFileSelect(e));
    document.getElementById('file-path').addEventListener('change', (e) => this.onPathFileSelect(e));
    document.getElementById('step-1-next').addEventListener('click', () => this.nextStep());

    // Load tracks (non-blocking)
    try {
      const { tracks } = await api.getTracks();
      this.populateTrackSelect(tracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      // Continue anyway with empty tracks
    }

    // Load user profiles (non-blocking)
    try {
      const { profiles } = await api.getProfiles();
      this.populateProfileSelect(profiles);
    } catch (err) {
      console.error('Failed to load profiles:', err);
      // Continue anyway with empty profiles
    }

    // Step 2: Map setup
    document.getElementById('step-2-back').addEventListener('click', () => this.prevStep());
    document.getElementById('step-2-next').addEventListener('click', () => this.nextStep());

    // Step 3: Metadata
    document.getElementById('step-3-back').addEventListener('click', () => this.prevStep());
    document.getElementById('step-3-next').addEventListener('click', () => this.nextStep());
    document.getElementById('profile').addEventListener('change', (e) => this.onProfileChange(e));
    document.getElementById('system').addEventListener('input', () => this.updateTestName());

    // Step 4: Preview & submit
    document.getElementById('step-4-back').addEventListener('click', () => this.prevStep());
    document.getElementById('publish-draft').addEventListener('click', () => this.publishDraft());
    document.getElementById('publish-live').addEventListener('click', () => this.publishLive());
  }

  onHeatmapFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        this.heatmapData = JSON.parse(evt.target.result);
        document.getElementById('heatmap-preview').textContent = `✓ ${file.name} (${this.heatmapData.features?.length || 0} cells)`;
        this.checkFilesReady();
      } catch (err) {
        alert('Invalid GeoJSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  onPathFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        this.pathData = JSON.parse(evt.target.result);
        document.getElementById('path-preview').textContent = `✓ ${file.name} (${this.pathData.features?.length || 0} points)`;
        this.checkFilesReady();
      } catch (err) {
        alert('Invalid GeoJSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  checkFilesReady() {
    const btn = document.getElementById('step-1-next');
    btn.disabled = !(this.heatmapData && this.pathData);
  }

  populateTrackSelect(tracks) {
    const select = document.getElementById('track');
    tracks.forEach(track => {
      const opt = document.createElement('option');
      opt.value = track.id;
      opt.textContent = track.name;
      select.appendChild(opt);
    });
  }

  populateProfileSelect(profiles) {
    const select = document.getElementById('profile');
    profiles.forEach(profile => {
      const opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.name;
      select.appendChild(opt);
    });
  }

  onProfileChange(e) {
    const isNew = e.target.value === '';
    document.getElementById('new-profile').classList.toggle('hidden', !isNew);
  }

  updateTestName() {
    const system = document.getElementById('system').value;
    const trackSelect = document.getElementById('track');
    const trackName = trackSelect.selectedOptions[0]?.textContent || 'Unknown Track';
    const date = new Date().toISOString().split('T')[0];
    const autoName = `${system} on ${trackName} — ${date}`;
    document.getElementById('test-name').value = autoName;
  }

  nextStep() {
    this.currentStep++;
    this.renderStep();
    if (this.currentStep === 2) this.setupMapStep();
    if (this.currentStep === 4) this.renderPreview();
  }

  prevStep() {
    this.currentStep--;
    this.renderStep();
  }

  renderStep() {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${this.currentStep}`).classList.add('active');

    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-step="${this.currentStep}"]`).classList.add('active');
  }

  setupMapStep() {
    // Initialize Leaflet map
    const mapContainer = document.getElementById('map-setup');
    if (this.map) this.map.remove(); // Clean up old map

    this.map = L.map(mapContainer).setView([52.18, 21.13], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    // Draw path
    if (this.pathData && this.pathData.features) {
      this.pathData.features.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          L.polyline(
            feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
            { color: 'cyan', weight: 2, opacity: 0.8 }
          ).addTo(this.map);
        }
      });
    }

    // Pilot marker
    const pilotLat = parseFloat(document.getElementById('pilot-lat').value) || 52.18;
    const pilotLon = parseFloat(document.getElementById('pilot-lon').value) || 21.13;
    this.pilotMarker = L.marker([pilotLat, pilotLon], { draggable: true }).addTo(this.map);

    this.pilotMarker.on('dragend', () => {
      const { lat, lng } = this.pilotMarker.getLatLng();
      document.getElementById('pilot-lat').value = lat.toFixed(5);
      document.getElementById('pilot-lon').value = lng.toFixed(5);
    });

    // Click to set position
    this.map.on('click', (e) => {
      this.pilotMarker.setLatLng(e.latlng);
      document.getElementById('pilot-lat').value = e.latlng.lat.toFixed(5);
      document.getElementById('pilot-lon').value = e.latlng.lng.toFixed(5);
    });
  }

  renderPreview() {
    // TODO: Initialize Leaflet map in step 4
    // Show heatmap + path
    // Show lap table, link loss summary
  }

  async publishDraft() {
    await this.doPublish('draft');
  }

  async publishLive() {
    await this.doPublish('published');
  }

  async doPublish(status) {
    try {
      // Collect metadata
      const metadata = {
        category: document.getElementById('category').value,
        system_under_test: document.getElementById('system').value,
        track_id: document.getElementById('track').value,
        custom_name: document.getElementById('test-name').value,
        pilot_lat: parseFloat(document.getElementById('pilot-lat').value),
        pilot_lon: parseFloat(document.getElementById('pilot-lon').value),
        pilot_bearing_deg: parseInt(document.getElementById('pilot-bearing').value),
        grid_size_m: parseFloat(document.getElementById('grid-size').value),
        wind_speed: document.getElementById('wind-speed').value || null,
        wind_direction: document.getElementById('wind-direction').value || null,
        notes: document.getElementById('notes').value || null,
      };

      // Create test record
      const test = await api.createTest(metadata);

      // Upload GeoJSON files
      await api.uploadHeatmap(test.id, this.heatmapData);
      await api.uploadPath(test.id, this.pathData);

      // Publish if needed
      if (status === 'published') {
        await api.publishTest(test.id);
      }

      alert(`Test ${status === 'draft' ? 'saved as draft' : 'published'}!`);
      window.location.href = '/';
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  }
}

// Initialize upload wizard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new UploadWizard();
});
