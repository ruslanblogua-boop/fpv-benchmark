// Upload Wizard

class UploadWizard {
  constructor() {
    this.currentStep = 1;
    this.uploadedTestData = null;
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

    // Attach all event listeners FIRST (synchronously, before any async operations)
    this.attachEventListeners();

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

    // Load saved systems
    this.systems = systemManager.getAllSystems();
    this.renderSystems();
  }

  attachEventListeners() {
    // Step 1: File upload
    document.getElementById('file-test-json').addEventListener('change', (e) => this.onTestJsonSelect(e));
    document.getElementById('step-1-next').addEventListener('click', () => this.nextStep());

    // Step 2: Map setup
    document.getElementById('step-2-back').addEventListener('click', () => this.prevStep());
    document.getElementById('step-2-next').addEventListener('click', () => this.nextStep());

    // Step 3: Metadata
    document.getElementById('step-3-back').addEventListener('click', () => this.prevStep());
    document.getElementById('step-3-next').addEventListener('click', () => this.nextStep());
    document.getElementById('profile').addEventListener('change', (e) => this.onProfileChange(e));
    document.getElementById('track').addEventListener('change', (e) => this.onTrackChange(e));

    // System modal
    const addSystemBtn = document.getElementById('add-system-btn');
    if (addSystemBtn) {
      addSystemBtn.addEventListener('click', () => this.openSystemModal());
    }

    const systemTypeSelect = document.getElementById('system-type');
    if (systemTypeSelect) {
      systemTypeSelect.addEventListener('change', (e) => this.onSystemTypeChange(e));
    }

    const systemModalAdd = document.getElementById('system-modal-add');
    if (systemModalAdd) {
      systemModalAdd.addEventListener('click', () => this.addSystemFromModal());
    }

    const systemModalCancel = document.getElementById('system-modal-cancel');
    if (systemModalCancel) {
      systemModalCancel.addEventListener('click', () => this.closeSystemModal());
    }

    // Step 4: Preview & submit
    document.getElementById('step-4-back').addEventListener('click', () => this.prevStep());
    document.getElementById('publish-draft').addEventListener('click', () => this.publishDraft());
    document.getElementById('publish-live').addEventListener('click', () => this.publishLive());
  }

  onTestJsonSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        this.validateTestJson(parsed);
        this.uploadedTestData = parsed;
        document.getElementById('test-json-preview').textContent = `✓ ${file.name} (${this.uploadedTestData.track?.length || 0} samples)`;
        this.checkFilesReady();
      } catch (err) {
        this.uploadedTestData = null;
        document.getElementById('test-json-preview').textContent = '';
        alert('Invalid test JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  validateTestJson(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('JSON root must be an object');
    }
    if (!Array.isArray(data.track)) {
      throw new Error('JSON must contain a track array');
    }
    if (data.track.length === 0) {
      throw new Error('Track array cannot be empty');
    }
  }

  checkFilesReady() {
    const btn = document.getElementById('step-1-next');
    if (!this.uploadedTestData) {
      document.getElementById('normalized-preview').innerHTML = '';
      btn.disabled = true;
      return;
    }

    this.applyUploadedDefaults();
    this.renderNormalizedPreview();
    btn.disabled = false;
  }

  getTrackPoints() {
    if (!Array.isArray(this.uploadedTestData?.track)) return [];
    return this.uploadedTestData.track.filter(point =>
      point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lon)
    );
  }

  getSystemByType(type) {
    return this.systems.find(system => system.type === type) || null;
  }

  applyUploadedDefaults() {
    if (!this.uploadedTestData) return;

    const trackPoints = this.getTrackPoints();
    const firstTrackPoint = trackPoints[0];

    if (this.uploadedTestData.test_name) {
      document.getElementById('test-name').value = this.uploadedTestData.test_name;
    }

    if (firstTrackPoint) {
      if (!document.getElementById('pilot-lat').value) {
        document.getElementById('pilot-lat').value = firstTrackPoint.lat.toFixed(5);
      }
      if (!document.getElementById('pilot-lon').value) {
        document.getElementById('pilot-lon').value = firstTrackPoint.lon.toFixed(5);
      }
    }

    const pilotBearing = this.uploadedTestData.pilot_bearing_deg;
    if (Number.isFinite(pilotBearing) && !document.getElementById('pilot-bearing').value) {
      document.getElementById('pilot-bearing').value = String(pilotBearing);
    }
  }

  renderNormalizedPreview() {
    const preview = document.getElementById('normalized-preview');
    if (!this.uploadedTestData) {
      preview.innerHTML = '';
      return;
    }

    preview.innerHTML = `
      <strong>Structured Test JSON Ready</strong>
      <div>${this.uploadedTestData.test_name || 'Untitled Test'}</div>
      <div>${this.uploadedTestData.track.length} track samples</div>
      <div>${this.uploadedTestData.stats?.gps_samples ?? this.getTrackPoints().length} GPS samples</div>
      <div>${this.uploadedTestData.captured_at || 'No capture date'}</div>
    `;
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
    const modal = document.getElementById('system-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('system-type').value = '';
    document.getElementById('system-name').value = '';
    document.getElementById('system-variant').value = '';
    document.getElementById('systems-error').textContent = '';
  }

  closeSystemModal() {
    const modal = document.getElementById('system-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
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
    if (!this.uploadedTestData?.test_name) {
      document.getElementById('test-name').value = autoName;
    }
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

    const trackPoints = this.getTrackPoints();
    if (trackPoints.length > 0) {
      const latLngs = trackPoints.map(point => [point.lat, point.lon]);

      L.polyline(latLngs, { color: 'cyan', weight: 2, opacity: 0.8 }).addTo(this.map);
      this.map.fitBounds(latLngs, { padding: [30, 30] });
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
<<<<<<< HEAD
    // Initialize Leaflet map in step 4
    const mapContainer = document.getElementById('map-preview');
    if (this.previewMap) this.previewMap.remove();

    this.previewMap = L.map(mapContainer).setView([52.18, 21.13], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.previewMap);

    // Draw path (cyan polyline)
    if (this.pathData && this.pathData.features) {
      this.pathData.features.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          L.polyline(
            feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
            { color: 'cyan', weight: 3, opacity: 0.8 }
          ).addTo(this.previewMap);
        }
      });
    }

    // Draw heatmap as circles (intensity represented by color/radius)
    if (this.heatmapData && this.heatmapData.features) {
      this.heatmapData.features.forEach(feature => {
        if (feature.geometry.type === 'Point') {
          const [lon, lat] = feature.geometry.coordinates;
          const value = feature.properties?.value || 0;

          // Scale: higher values → orange-red, lower values → dim
          let color = '#00ff00';
          let radius = 4;

          if (value > 0.75) {
            color = '#ff0000'; // Red for high
            radius = 6;
          } else if (value > 0.5) {
            color = '#ff8800'; // Orange for medium-high
            radius = 5;
          } else if (value > 0.25) {
            color = '#ffff00'; // Yellow for medium
            radius = 4;
          }

          L.circleMarker([lat, lon], {
            radius: radius,
            color: color,
            weight: 1,
            opacity: 0.7,
            fillOpacity: 0.6,
          }).addTo(this.previewMap);
        }
      });
    }

    // Fit bounds to show all data
    if (this.pathData && this.pathData.features && this.pathData.features.length > 0) {
      const bounds = L.latLngBounds();
      this.pathData.features.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          feature.geometry.coordinates.forEach(([lon, lat]) => {
            bounds.extend([lat, lon]);
          });
        }
      });
      if (bounds.isValid()) {
        this.previewMap.fitBounds(bounds, { padding: [50, 50] });
      }
    }

    // Display summary statistics
    const infoPanel = document.getElementById('preview-info');
    const heatmapCount = this.heatmapData?.features?.length || 0;
    const pathCount = this.pathData?.features?.length || 0;
    const pathDistance = this.calculatePathDistance();
    const systemStr = this.systems.map(s => systemManager.formatSystemName(s)).join(', ');
    const trackSelect = document.getElementById('track');
    const trackName = trackSelect.selectedOptions[0]?.textContent || 'Unknown';
    const testName = document.getElementById('test-name').value || 'Unnamed test';

    infoPanel.innerHTML = `
      <h3>Test Summary</h3>
      <table>
        <tr>
          <td><strong>Test Name:</strong></td>
          <td>${escapeHtml(testName)}</td>
        </tr>
        <tr>
          <td><strong>Track:</strong></td>
          <td>${escapeHtml(trackName)}</td>
        </tr>
        <tr>
          <td><strong>Systems:</strong></td>
          <td>${escapeHtml(systemStr || 'None selected')}</td>
        </tr>
        <tr>
          <td><strong>Heatmap Cells:</strong></td>
          <td>${heatmapCount}</td>
        </tr>
        <tr>
          <td><strong>Path Points:</strong></td>
          <td>${pathCount}</td>
        </tr>
        <tr>
          <td><strong>Approximate Distance:</strong></td>
          <td>${pathDistance}</td>
        </tr>
        <tr>
          <td><strong>Pilot Position:</strong></td>
          <td>${document.getElementById('pilot-lat').value}, ${document.getElementById('pilot-lon').value}</td>
        </tr>
        <tr>
          <td><strong>Grid Size:</strong></td>
          <td>${document.getElementById('grid-size').value}m</td>
        </tr>
      </table>
    `;
  }

  calculatePathDistance() {
    if (!this.pathData || !this.pathData.features) return '0 km';

    let totalDistance = 0;
    this.pathData.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates;
        for (let i = 0; i < coords.length - 1; i++) {
          const [lon1, lat1] = coords[i];
          const [lon2, lat2] = coords[i + 1];
          const distance = this.haversineM(lat1, lon1, lat2, lon2);
          totalDistance += distance;
        }
      }
    });

    return (totalDistance / 1000).toFixed(2) + ' km';
  }

  // Haversine distance calculation (same as in utils.ts)
  haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
=======
    const panel = document.getElementById('preview-info');
    if (!this.uploadedTestData) {
      panel.innerHTML = '<p>No uploaded test data available.</p>';
      return;
    }

    panel.innerHTML = `
      <h3>${this.uploadedTestData.test_name || 'Untitled Test'}</h3>
      <dl>
        <dt>Captured At</dt><dd>${this.uploadedTestData.captured_at || 'Unknown'}</dd>
        <dt>Track Samples</dt><dd>${this.uploadedTestData.track.length}</dd>
        <dt>GPS Samples</dt><dd>${this.uploadedTestData.stats?.gps_samples ?? this.getTrackPoints().length}</dd>
        <dt>Flight Duration</dt><dd>${this.uploadedTestData.stats?.flight_duration_s ?? 0}s</dd>
        <dt>Min Bitrate</dt><dd>${this.uploadedTestData.stats?.min_bitrate_mbps ?? 0}</dd>
        <dt>Max Bitrate</dt><dd>${this.uploadedTestData.stats?.max_bitrate_mbps ?? 0}</dd>
      </dl>
    `;
>>>>>>> fd76a07 (Simplify repo to website-only JSON upload flow)
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
        wind_speed: document.getElementById('wind-speed').value || null,
        wind_direction: document.getElementById('wind-direction').value || null,
        notes: document.getElementById('notes').value || null,
        prepared_test_json: this.uploadedTestData,
        duration_s: this.uploadedTestData?.stats?.flight_duration_s || null,
        total_distance_m: this.uploadedTestData?.track?.at(-1)?.distance_from_home_m || null,
      };

      // Create test record
      const test = await api.createTest(metadata);

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

// Helper to safely escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Initialize upload wizard when DOM is ready
let uploadWizardInstance = null;
document.addEventListener('DOMContentLoaded', () => {
  uploadWizardInstance = new UploadWizard();
  window.uploadWizard = uploadWizardInstance;
});
