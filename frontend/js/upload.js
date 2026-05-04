// Upload Wizard

class UploadWizard {
  constructor() {
    this.currentStep = 1;
    this.uploadedTestData = null;
    this.trimStart = 0;
    this.trimEnd = 0;
    this.mapSetup = null;
    this.metadata = null;
    this.systems = [];
    this.init();
  }

  async init() {
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
    document.getElementById('trim-start').addEventListener('input', () => this.onTrimChange());
    document.getElementById('trim-end').addEventListener('input', () => this.onTrimChange());
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
        this.trimStart = 0;
        this.trimEnd = Math.max((this.uploadedTestData.track?.length || 1) - 1, 0);
        document.getElementById('trim-start').value = String(this.trimStart);
        document.getElementById('trim-end').value = String(this.trimEnd);
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
    this.renderTrimSummary();
    this.renderNormalizedPreview();
    btn.disabled = false;
  }

  isValidCoordinate(point) {
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
    if (lat === 0 && lon === 0) return false;
    return true;
  }

  haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  getRawTrack() {
    return Array.isArray(this.uploadedTestData?.track) ? this.uploadedTestData.track : [];
  }

  getTrimmedTrack() {
    const rawTrack = this.getRawTrack();
    if (rawTrack.length === 0) return [];

    const safeStart = Math.max(0, Math.min(this.trimStart, rawTrack.length - 1));
    const safeEnd = Math.max(safeStart, Math.min(this.trimEnd, rawTrack.length - 1));
    return rawTrack.slice(safeStart, safeEnd + 1);
  }

  getTrackPoints() {
    return this.getTrimmedTrack().filter((point) => this.isValidCoordinate(point));
  }

  detectTeleports() {
    const points = this.getTrackPoints();
    const flagged = [];

    for (let index = 1; index < points.length; index += 1) {
      const prev = points[index - 1];
      const current = points[index];
      const distanceM = this.haversineMeters(prev.lat, prev.lon, current.lat, current.lon);
      const prevT = Number(prev.t);
      const currentT = Number(current.t);
      const dtSeconds = Number.isFinite(prevT) && Number.isFinite(currentT) && currentT > prevT
        ? (currentT - prevT) / 1000
        : 1;
      const speedMs = distanceM / Math.max(dtSeconds, 0.2);

      if (distanceM > 120 || speedMs > 80) {
        flagged.push({
          index,
          distanceM,
          speedMs,
        });
      }
    }

    return flagged;
  }

  onTrimChange() {
    const rawTrack = this.getRawTrack();
    if (rawTrack.length === 0) return;

    const startInput = document.getElementById('trim-start');
    const endInput = document.getElementById('trim-end');
    const startValue = Math.max(0, Math.min(parseInt(startInput.value || '0', 10) || 0, rawTrack.length - 1));
    const endValue = Math.max(startValue, Math.min(parseInt(endInput.value || '0', 10) || 0, rawTrack.length - 1));

    this.trimStart = startValue;
    this.trimEnd = endValue;
    startInput.value = String(startValue);
    endInput.value = String(endValue);

    this.renderTrimSummary();
    this.renderNormalizedPreview();
  }

  renderTrimSummary() {
    const rawCount = this.getRawTrack().length;
    const keptCount = this.getTrimmedTrack().length;
    const validGpsCount = this.getTrackPoints().length;
    const teleportCount = this.detectTeleports().length;
    document.getElementById('trim-summary').textContent = `${keptCount} of ${rawCount} samples kept after trim, ${validGpsCount} with valid GPS coordinates, ${teleportCount} possible GPS teleports flagged.`;
  }

  getSystemByType(type) {
    return this.systems.find(system => system.type === type) || null;
  }

  applyUploadedDefaults() {
    if (!this.uploadedTestData) return;

    const trackPoints = this.getTrackPoints();
    const firstTrackPoint = trackPoints[0];
    const lastTrackPoint = trackPoints[trackPoints.length - 1];

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

    if (!document.getElementById('notes').value) {
      const notes = [
        ...(Array.isArray(this.uploadedTestData.warnings) ? this.uploadedTestData.warnings : []),
        ...(Array.isArray(this.uploadedTestData.issues) ? this.uploadedTestData.issues : []),
      ].filter(Boolean);
      if (notes.length > 0) {
        document.getElementById('notes').value = notes.join('\n');
      }
    }

    if (this.uploadedTestData.drone_type) {
      document.getElementById('profile').value = '';
      document.getElementById('new-profile').classList.remove('hidden');
      if (!document.getElementById('profile-name').value) {
        document.getElementById('profile-name').value = this.uploadedTestData.drone_type;
      }
      if (!document.getElementById('profile-frame').value) {
        document.getElementById('profile-frame').value = this.uploadedTestData.drone_type;
      }
    }

    if (!document.getElementById('profile-vtx').value && this.uploadedTestData.video_air_unit_model) {
      document.getElementById('profile-vtx').value = this.uploadedTestData.video_air_unit_model;
    }

    if (!document.getElementById('profile-weight').value && this.uploadedTestData.battery) {
      document.getElementById('profile-weight').value = this.uploadedTestData.battery;
    }

    if (!document.getElementById('track').value) {
      document.getElementById('track').value = '__new__';
      document.getElementById('new-track').classList.remove('hidden');
      if (!document.getElementById('track-name').value) {
        document.getElementById('track-name').value = this.uploadedTestData.test_name || 'Uploaded Track';
      }
      if (!document.getElementById('track-location').value) {
        document.getElementById('track-location').value = this.uploadedTestData.location_name || 'Imported from uploaded JSON';
      }
    }

    if (lastTrackPoint && !document.getElementById('pilot-lat').value) {
      document.getElementById('pilot-lat').value = lastTrackPoint.lat.toFixed(5);
      document.getElementById('pilot-lon').value = lastTrackPoint.lon.toFixed(5);
    }

    this.populateSystemsFromUpload();
  }

  populateSystemsFromUpload() {
    if (this.systems.length > 0 || !this.uploadedTestData) return;

    const systems = [];
    if (this.uploadedTestData.video_ground_unit) {
      systems.push({
        id: `auto_vrx_${Date.now()}`,
        type: 'VRX',
        name: this.uploadedTestData.video_ground_unit,
        variant: null,
        includeVideo: true,
        includeControl: false,
      });
    }
    if (this.uploadedTestData.video_air_unit_model) {
      systems.push({
        id: `auto_vtx_${Date.now()}`,
        type: 'VTX',
        name: this.uploadedTestData.video_air_unit_model,
        variant: null,
        includeVideo: true,
        includeControl: false,
      });
    }
    if (this.uploadedTestData.control_rx_model) {
      systems.push({
        id: `auto_ctrl_${Date.now()}`,
        type: 'CONTROL_LINK',
        name: this.uploadedTestData.control_rx_model,
        variant: this.uploadedTestData.control_rx_type?.toLowerCase() || null,
        includeVideo: false,
        includeControl: true,
      });
    }

    this.systems = systems;
    this.renderSystems();
    this.updateTestName();
  }

  renderNormalizedPreview() {
    const preview = document.getElementById('normalized-preview');
    if (!this.uploadedTestData) {
      preview.innerHTML = '';
      return;
    }

    const rawCount = this.getRawTrack().length;
    const trimmedCount = this.getTrimmedTrack().length;
    const validCount = this.getTrackPoints().length;
    const teleports = this.detectTeleports();
    preview.innerHTML = `
      <strong>Structured Test JSON Ready</strong>
      <div>${this.uploadedTestData.test_name || 'Untitled Test'}</div>
      <div>${rawCount} raw samples</div>
      <div>${trimmedCount} trimmed samples</div>
      <div>${validCount} valid GPS samples</div>
      <div>${teleports.length} flagged GPS teleports</div>
      <div>${this.uploadedTestData.captured_at || 'No capture date'}</div>
      ${teleports.length > 0 ? `<div class="hint">Trim around the flagged jump area before publishing.</div>` : ''}
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
      if (type === 'CONTROL_LINK') {
        system.includeVideo = false;
        system.includeControl = true;
      } else {
        system.includeVideo = true;
        system.includeControl = false;
      }
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

  toggleSystemBenchmark(systemId, benchmarkKey) {
    this.systems = this.systems.map((system) => {
      if (system.id !== systemId) return system;
      return {
        ...system,
        [benchmarkKey]: !system[benchmarkKey],
      };
    });
    this.renderSystems();
  }

  renderSystems() {
    const list = document.getElementById('systems-list');
    list.innerHTML = this.systems.map(system => `
      <div class="system-tag">
        <div class="system-tag-copy">
          <span>${systemManager.formatSystemName(system)}</span>
          <div class="system-benchmark-toggles">
            <button type="button" class="${system.includeVideo ? 'active' : ''}" data-system-id="${system.id}" data-benchmark="includeVideo">Video</button>
            <button type="button" class="${system.includeControl ? 'active' : ''}" data-system-id="${system.id}" data-benchmark="includeControl">Control</button>
          </div>
        </div>
        <button type="button" data-system-id="${system.id}" aria-label="Remove system">×</button>
      </div>
    `).join('');

    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const benchmarkKey = e.target.dataset.benchmark;
        if (benchmarkKey) {
          this.toggleSystemBenchmark(e.target.dataset.systemId, benchmarkKey);
          return;
        }
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
    const mapContainer = document.getElementById('map-preview');
    if (this.previewMap) this.previewMap.remove();

    this.previewMap = L.map(mapContainer).setView([52.18, 21.13], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.previewMap);

    const trackPoints = this.getTrackPoints();
    if (trackPoints.length > 0) {
      const latLngs = trackPoints.map(point => [point.lat, point.lon]);
      L.polyline(latLngs, { color: 'cyan', weight: 3, opacity: 0.8 }).addTo(this.previewMap);
      this.previewMap.fitBounds(latLngs, { padding: [40, 40] });
    }

    const panel = document.getElementById('preview-info');
    if (!this.uploadedTestData) {
      panel.innerHTML = '<p>No uploaded test data available.</p>';
      return;
    }

    const systemStr = this.systems.map(s => systemManager.formatSystemName(s)).join(', ');
    const trackSelect = document.getElementById('track');
    const selectedTrack = trackSelect.selectedOptions[0]?.textContent || '';
    const customTrackName = document.getElementById('track-name').value.trim();
    const trackName = customTrackName || (selectedTrack && selectedTrack !== '+ Create new track' ? selectedTrack : 'Not selected');

    panel.innerHTML = `
      <h3>${this.uploadedTestData.test_name || document.getElementById('test-name').value || 'Untitled Test'}</h3>
      <dl>
        <dt>Track</dt><dd>${trackName}</dd>
        <dt>Benchmarks</dt><dd>Video + Control</dd>
        <dt>Systems</dt><dd>${systemStr || 'Not specified'}</dd>
        <dt>Captured At</dt><dd>${this.uploadedTestData.captured_at || 'Unknown'}</dd>
        <dt>Track Samples</dt><dd>${this.getTrimmedTrack().length}</dd>
        <dt>GPS Samples</dt><dd>${this.getTrackPoints().length}</dd>
        <dt>Flight Duration</dt><dd>${this.uploadedTestData.stats?.flight_duration_s ?? 0}s</dd>
        <dt>Min Bitrate</dt><dd>${this.uploadedTestData.stats?.min_bitrate_mbps ?? 0}</dd>
        <dt>Max Bitrate</dt><dd>${this.uploadedTestData.stats?.max_bitrate_mbps ?? 0}</dd>
        <dt>Pilot Position</dt><dd>${document.getElementById('pilot-lat').value || 'Unknown'}, ${document.getElementById('pilot-lon').value || 'Unknown'}</dd>
      </dl>
    `;
  }

  async publishDraft() {
    await this.doPublish('draft');
  }

  async publishLive() {
    await this.doPublish('published');
  }

  async doPublish(status) {
    const authToken = api.token || localStorage.getItem('auth_token') || (typeof auth !== 'undefined' ? auth.getToken() : null);
    if (!authToken) {
      alert('Please log in before saving or publishing a test.');
      return;
    }

    if (!Array.isArray(this.systems) || this.systems.length === 0) {
      alert('Please add the video and control systems used in this flight.');
      return;
    }

    const processedTrack = this.getTrackPoints();
    if (processedTrack.length < 2) {
      alert('Please keep at least two samples with valid GPS coordinates after trimming.');
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
      const pilotLatValue = parseFloat(document.getElementById('pilot-lat').value);
      const pilotLonValue = parseFloat(document.getElementById('pilot-lon').value);
      const pilotBearingValue = parseInt(document.getElementById('pilot-bearing').value, 10);
      const preparedTestJson = this.buildPreparedUploadJson(processedTrack);

      const videoSystems = this.systems.filter((system) => system.includeVideo);
      const controlSystems = this.systems.filter((system) => system.includeControl);

      if (videoSystems.length === 0 || controlSystems.length === 0) {
        alert('Select at least one system for Video and one for Control before publishing.');
        return;
      }

      const benchmarkDefinitions = [
        {
          category: 'video',
          suffix: 'Video',
          systems: videoSystems,
        },
        {
          category: 'control',
          suffix: 'Control',
          systems: controlSystems,
        },
      ];

      const createdTests = [];
      for (const benchmark of benchmarkDefinitions) {
        const metadata = {
          category: benchmark.category,
          system_under_test: benchmark.systems.map((system) => systemManager.formatSystemName(system)).join(' + '),
          systems: benchmark.systems.map((system) => ({
            type: system.type,
            name: system.name,
            variant: system.variant,
          })),
          track_id: trackId,
          custom_name: `${testName} — ${benchmark.suffix}`,
          pilot_lat: Number.isFinite(pilotLatValue) ? pilotLatValue : null,
          pilot_lon: Number.isFinite(pilotLonValue) ? pilotLonValue : null,
          pilot_bearing_deg: Number.isFinite(pilotBearingValue) ? pilotBearingValue : null,
          wind_speed: document.getElementById('wind-speed').value || null,
          wind_direction: document.getElementById('wind-direction').value || null,
          notes: document.getElementById('notes').value || null,
          prepared_test_json: preparedTestJson,
          duration_s: preparedTestJson?.stats?.flight_duration_s || null,
          total_distance_m: preparedTestJson?.track?.at(-1)?.distance_from_home_m || null,
        };

        const created = await api.createTest(metadata);
        createdTests.push(created);

        if (status === 'published') {
          await api.publishTest(created.id);
        }
      }

      alert(`${createdTests.length} tests ${status === 'draft' ? 'saved as drafts' : 'published'}: Video and Control.`);
      window.location.href = '/';
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  }

  buildPreparedUploadJson(processedTrack) {
    const firstT = Number(processedTrack[0]?.t);
    const lastT = Number(processedTrack.at(-1)?.t);
    const trimmedDuration = Number.isFinite(firstT) && Number.isFinite(lastT) && lastT >= firstT
      ? (lastT - firstT) / 1000
      : this.uploadedTestData?.stats?.flight_duration_s || null;

    const teleportWarnings = this.detectTeleports();
    return {
      ...this.uploadedTestData,
      track: processedTrack,
      stats: {
        ...(this.uploadedTestData?.stats || {}),
        gps_samples: processedTrack.length,
        flight_duration_s: trimmedDuration,
      },
      upload_trim: {
        start_index: this.trimStart,
        end_index: this.trimEnd,
      },
      warnings: [
        ...(Array.isArray(this.uploadedTestData?.warnings) ? this.uploadedTestData.warnings : []),
        ...(teleportWarnings.length > 0 ? [`${teleportWarnings.length} possible GPS teleports detected during upload review.`] : []),
      ],
    };
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
