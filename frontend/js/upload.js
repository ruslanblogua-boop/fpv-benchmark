// Upload Wizard

class UploadWizard {
  constructor() {
    this.currentStep = 1;
    this.heatmapData = null;
    this.pathData = null;
    this.mapSetup = null;
    this.metadata = null;
    this.systems = [];
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
    document.getElementById('track').addEventListener('change', (e) => this.onTrackChange(e));

    // System modal
    document.getElementById('add-system-btn').addEventListener('click', () => this.openSystemModal());
    document.getElementById('system-type').addEventListener('change', (e) => this.onSystemTypeChange(e));
    document.getElementById('system-modal-add').addEventListener('click', () => this.addSystemFromModal());
    document.getElementById('system-modal-cancel').addEventListener('click', () => this.closeSystemModal());

    // Step 4: Preview & submit
    document.getElementById('step-4-back').addEventListener('click', () => this.prevStep());
    document.getElementById('publish-draft').addEventListener('click', () => this.publishDraft());
    document.getElementById('publish-live').addEventListener('click', () => this.publishLive());

    // Load saved systems
    this.systems = systemManager.getAllSystems();
    this.renderSystems();
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

  onTrackChange(e) {
    const isNew = e.target.value === '__new__';
    document.getElementById('new-track').classList.toggle('hidden', !isNew);
    this.updateTestName();
  }

  openSystemModal() {
    document.getElementById('system-modal').style.display = 'flex';
    document.getElementById('system-type').value = '';
    document.getElementById('system-name').value = '';
    document.getElementById('system-variant').value = '';
    document.getElementById('systems-error').textContent = '';
  }

  closeSystemModal() {
    document.getElementById('system-modal').style.display = 'none';
  }

  onSystemTypeChange(e) {
    const type = e.target.value;
    const variantContainer = document.getElementById('system-variant-container');
    if (SYSTEM_TYPES[type]?.hasVariants) {
      variantContainer.style.display = 'block';
      document.getElementById('system-variant').required = true;
    } else {
      variantContainer.style.display = 'none';
      document.getElementById('system-variant').required = false;
    }
  }

  addSystemFromModal() {
    const type = document.getElementById('system-type').value;
    const name = document.getElementById('system-name').value.trim();
    const variant = document.getElementById('system-variant').value || null;
    const error = document.getElementById('systems-error');

    if (!type) {
      error.textContent = 'Please select a system type';
      return;
    }

    if (!name) {
      error.textContent = 'Please enter a product name';
      return;
    }

    if (SYSTEM_TYPES[type]?.hasVariants && !variant) {
      error.textContent = 'Please select a variant';
      return;
    }

    if (this.systems.length >= 5) {
      error.textContent = 'Maximum 5 systems allowed';
      return;
    }

    try {
      const system = systemManager.addSystem(type, name, variant);
      this.systems = systemManager.getAllSystems();
      this.renderSystems();
      this.updateTestName();
      this.closeSystemModal();
    } catch (err) {
      error.textContent = err.message;
    }
  }

  removeSystem(systemId) {
    systemManager.deleteSystem(systemId);
    this.systems = systemManager.getAllSystems();
    this.renderSystems();
    this.updateTestName();
  }

  renderSystems() {
    const list = document.getElementById('systems-list');
    list.innerHTML = this.systems.map(system => `
      <div class="system-tag">
        <span>${systemManager.formatSystemName(system)}</span>
        <button type="button" data-system-id="${system.id}" aria-label="Remove system">×</button>
      </div>
    `).join('');

    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.removeSystem(e.target.dataset.systemId);
      });
    });
  }

  updateTestName() {
    const systemStr = this.systems.length > 0
      ? this.systems.map(s => systemManager.formatSystemName(s)).join(' + ')
      : 'Test';
    const trackSelect = document.getElementById('track');
    const trackName = trackSelect.selectedOptions[0]?.textContent || 'Unknown Track';
    const date = new Date().toISOString().split('T')[0];
    const autoName = `${systemStr} on ${trackName} — ${date}`;
    document.getElementById('test-name').value = autoName;
  }

  nextStep() {
    // Validate before moving from Step 3
    if (this.currentStep === 3) {
      if (!Array.isArray(this.systems) || this.systems.length === 0) {
        alert('Please add at least one system under test');
        return;
      }
    }

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
    // Validate systems
    if (!Array.isArray(this.systems) || this.systems.length === 0) {
      alert('Please add at least one system under test');
      return;
    }

    // Validate track
    const trackSelect = document.getElementById('track');
    let trackId = trackSelect.value;

    if (trackId === '__new__') {
      const trackName = document.getElementById('track-name').value.trim();
      const trackLocation = document.getElementById('track-location').value.trim();

      if (!trackName) {
        alert('Please enter a track name or select an existing track');
        return;
      }

      // Create new track
      try {
        const track = await api.createTrack({
          name: trackName,
          location: trackLocation || 'Unknown',
        });
        trackId = track.id;
      } catch (err) {
        alert('Failed to create track: ' + err.message);
        return;
      }
    } else if (!trackId) {
      alert('Please select a track');
      return;
    }

    // Validate test name
    const testName = document.getElementById('test-name').value.trim();
    if (!testName) {
      alert('Please enter a test name');
      return;
    }

    try {
      // Collect metadata
      const systemLabels = this.systems.map(s => systemManager.formatSystemName(s)).join(', ');
      const metadata = {
        category: document.getElementById('category').value,
        system_under_test: systemLabels,
        systems: this.systems.map(s => ({
          type: s.type,
          name: s.name,
          variant: s.variant,
        })),
        track_id: trackId,
        custom_name: testName,
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
