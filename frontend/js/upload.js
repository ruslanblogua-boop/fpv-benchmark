// Upload Wizard

class UploadWizard {
  constructor() {
    this.currentStep = 1;
    this.uploadedTestData = null;
    this.trimStart = 0;
    this.trimEnd = 0;
    this.trimPreviewMap = null;
    this.trimPreviewBaseLayer = null;
    this.trimPreviewKeptLayer = null;
    this.map = null;
    this.previewMap = null;
    this.pilotMarker = null;
    this.systems = [];
    this.init();
  }

  async init() {
    this.attachEventListeners();

    try {
      const { tracks } = await api.getTracks();
      this.populateTrackSelect(tracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }

    try {
      const { profiles } = await api.getProfiles();
      this.populateProfileSelect(profiles);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }

    this.systems = [];
    this.renderSystems();
  }

  attachEventListeners() {
    document.getElementById('file-test-json').addEventListener('change', (e) => this.onTestJsonSelect(e));
    ['trim-start-range', 'trim-end-range'].forEach((id) => {
      document.getElementById(id).addEventListener('input', (event) => this.onTrimInput(event.target.id, event.target.value));
    });
    document.getElementById('step-1-next').addEventListener('click', () => this.nextStep());

    document.getElementById('step-2-back').addEventListener('click', () => this.prevStep());
    document.getElementById('step-2-next').addEventListener('click', () => this.nextStep());

    document.getElementById('step-3-back').addEventListener('click', () => this.prevStep());
    document.getElementById('step-3-next').addEventListener('click', () => this.nextStep());
    document.getElementById('profile').addEventListener('change', (e) => this.onProfileChange(e));
    document.getElementById('track').addEventListener('change', (e) => this.onTrackChange(e));
    document.getElementById('system-search').addEventListener('input', () => this.renderExistingSystems());

    const addSystemBtn = document.getElementById('add-system-btn');
    if (addSystemBtn) addSystemBtn.addEventListener('click', () => this.openSystemModal());

    const systemTypeSelect = document.getElementById('system-type');
    if (systemTypeSelect) systemTypeSelect.addEventListener('change', (e) => this.onSystemTypeChange(e));

    const systemModalAdd = document.getElementById('system-modal-add');
    if (systemModalAdd) systemModalAdd.addEventListener('click', () => this.addSystemFromModal());

    const systemModalCancel = document.getElementById('system-modal-cancel');
    if (systemModalCancel) systemModalCancel.addEventListener('click', () => this.closeSystemModal());

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
        this.systems = [];
        this.trimStart = 0;
        this.trimEnd = Math.max((this.uploadedTestData.track?.length || 1) - 1, 0);
        this.syncTrimInputs();
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
    if (!data || typeof data !== 'object') throw new Error('JSON root must be an object');
    if (!Array.isArray(data.track)) throw new Error('JSON must contain a track array');
    if (data.track.length === 0) throw new Error('Track array cannot be empty');
  }

  syncTrimInputs() {
    const rawLength = this.getRawTrack().length;
    const startInput = document.getElementById('trim-start-range');
    const endInput = document.getElementById('trim-end-range');
    const maxValue = String(Math.max(rawLength - 1, 0));

    startInput.max = maxValue;
    startInput.value = String(this.trimStart);
    endInput.max = maxValue;
    endInput.value = String(this.trimEnd);
  }

  onTrimInput(id, value) {
    const rawLength = this.getRawTrack().length;
    if (rawLength === 0) return;

    if (id.includes('start')) {
      this.trimStart = Math.max(0, Math.min(parseInt(value || '0', 10) || 0, rawLength - 1));
      if (this.trimStart > this.trimEnd) this.trimEnd = this.trimStart;
    } else {
      this.trimEnd = Math.max(0, Math.min(parseInt(value || '0', 10) || 0, rawLength - 1));
      if (this.trimEnd < this.trimStart) this.trimStart = this.trimEnd;
    }

    this.syncTrimInputs();
    this.renderTrimSummary();
    this.renderNormalizedPreview();
    this.renderTrimTimeline();
    this.updateTrimPreviewMap();
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
    this.renderTrimTimeline();
    this.initTrimPreviewMap();
    btn.disabled = false;
  }

  getRawTrack() {
    return Array.isArray(this.uploadedTestData?.track) ? this.uploadedTestData.track : [];
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
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  getTrimmedTrack() {
    const rawTrack = this.getRawTrack();
    if (rawTrack.length === 0) return [];
    return rawTrack.slice(this.trimStart, this.trimEnd + 1);
  }

  getTrackPoints() {
    return this.getTrimmedTrack().filter((point) => this.isValidCoordinate(point));
  }

  getAllValidTrackPoints() {
    return this.getRawTrack().filter((point) => this.isValidCoordinate(point));
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
      const dtSeconds = Number.isFinite(prevT) && Number.isFinite(currentT) && currentT > prevT ? (currentT - prevT) / 1000 : 1;
      const speedMs = distanceM / Math.max(dtSeconds, 0.2);

      if (distanceM > 120 || speedMs > 80) {
        flagged.push({ index, distanceM, speedMs });
      }
    }

    return flagged;
  }

  applyUploadedDefaults() {
    if (!this.uploadedTestData) return;

    const firstTrackPoint = this.getTrackPoints()[0];

    if (this.uploadedTestData.test_name) {
      document.getElementById('test-name').value = this.uploadedTestData.test_name;
    }

    if (firstTrackPoint) {
      if (!document.getElementById('pilot-lat').value) document.getElementById('pilot-lat').value = firstTrackPoint.lat.toFixed(5);
      if (!document.getElementById('pilot-lon').value) document.getElementById('pilot-lon').value = firstTrackPoint.lon.toFixed(5);
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
      if (notes.length > 0) document.getElementById('notes').value = notes.join('\n');
    }

    if (!document.getElementById('track').value) {
      document.getElementById('track').value = '__new__';
      document.getElementById('new-track').classList.remove('hidden');
      if (!document.getElementById('track-name').value) document.getElementById('track-name').value = this.uploadedTestData.test_name || 'Uploaded Track';
      if (!document.getElementById('track-location').value) document.getElementById('track-location').value = this.uploadedTestData.location_name || 'Imported from uploaded JSON';
    }

    this.populateSystemsFromUpload();
  }

  populateSystemsFromUpload() {
    if (!this.uploadedTestData) return;

    const systems = [];
    const baseId = Date.now();
    if (this.uploadedTestData.video_ground_unit) {
      systems.push({
        id: `auto_vrx_${baseId}`,
        type: 'VRX',
        name: this.uploadedTestData.video_ground_unit,
        variant: null,
        includeVideo: true,
        includeControl: false,
      });
    }
    if (this.uploadedTestData.video_air_unit_model) {
      systems.push({
        id: `auto_vtx_${baseId + 1}`,
        type: 'VTX',
        name: this.uploadedTestData.video_air_unit_model,
        variant: null,
        includeVideo: true,
        includeControl: false,
      });
    }
    if (this.uploadedTestData.control_rx_model) {
      systems.push({
        id: `auto_ctrl_rx_${baseId + 2}`,
        type: 'CONTROL_LINK',
        name: this.uploadedTestData.control_rx_model,
        variant: this.uploadedTestData.control_rx_type?.toLowerCase() || null,
        includeVideo: false,
        includeControl: true,
      });
    }
    if (this.uploadedTestData.control_tx || this.uploadedTestData.control_tx_model || this.uploadedTestData.radio_tx_model) {
      systems.push({
        id: `auto_ctrl_tx_${baseId + 3}`,
        type: 'RADIO_TX',
        name: this.uploadedTestData.control_tx || this.uploadedTestData.control_tx_model || this.uploadedTestData.radio_tx_model,
        variant: null,
        includeVideo: false,
        includeControl: true,
      });
    }

    systems.forEach((system) => systemManager.upsertSystem(system));
    this.systems = systems.map((system) => ({ ...system }));
    this.renderSystems();
    this.updateTestName();
  }

  renderTrimSummary() {
    const rawCount = this.getRawTrack().length;
    const keptCount = this.getTrimmedTrack().length;
    const validGpsCount = this.getTrackPoints().length;
    const teleportCount = this.detectTeleports().length;
    document.getElementById('trim-summary').textContent = `${keptCount} of ${rawCount} samples kept after trim, ${validGpsCount} with valid GPS coordinates, ${teleportCount} possible GPS teleports flagged.`;
  }

  renderTrimTimeline() {
    const rawTrack = this.getRawTrack();
    const teleports = this.detectTeleports();
    const teleportIndexes = new Set(teleports.map((item) => this.trimStart + item.index));
    const total = Math.max(rawTrack.length, 1);
    const segments = rawTrack.map((_, index) => {
      const classes = ['trim-segment'];
      if (index >= this.trimStart && index <= this.trimEnd) classes.push('active');
      if (teleportIndexes.has(index)) classes.push('teleport');
      return `<span class="${classes.join(' ')}" style="width:${100 / total}%"></span>`;
    }).join('');
    document.getElementById('trim-timeline').innerHTML = segments;
  }

  renderNormalizedPreview() {
    const preview = document.getElementById('normalized-preview');
    if (!this.uploadedTestData) {
      preview.innerHTML = '';
      return;
    }

    const teleports = this.detectTeleports();
    preview.innerHTML = `
      <strong>Structured Test JSON Ready</strong>
      <div>${this.uploadedTestData.test_name || 'Untitled Test'}</div>
      <div>${this.getRawTrack().length} raw samples</div>
      <div>${this.getTrimmedTrack().length} trimmed samples</div>
      <div>${this.getTrackPoints().length} valid GPS samples</div>
      <div>${teleports.length} flagged GPS teleports</div>
      <div>${this.uploadedTestData.captured_at || 'No capture date'}</div>
      ${teleports.length > 0 ? '<div class="hint">Trim around the flagged jump area before publishing.</div>' : ''}
    `;
  }

  initTrimPreviewMap() {
    const container = document.getElementById('trim-map-preview');
    if (!container) return;
    if (this.trimPreviewMap) {
      this.updateTrimPreviewMap();
      return;
    }

    this.trimPreviewMap = L.map(container, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.trimPreviewMap);
    this.updateTrimPreviewMap();
  }

  updateTrimPreviewMap() {
    if (!this.trimPreviewMap) return;
    if (this.trimPreviewBaseLayer) this.trimPreviewMap.removeLayer(this.trimPreviewBaseLayer);
    if (this.trimPreviewKeptLayer) this.trimPreviewMap.removeLayer(this.trimPreviewKeptLayer);

    const allPoints = this.getAllValidTrackPoints().map((point) => [point.lat, point.lon]);
    const keptPoints = this.getTrackPoints().map((point) => [point.lat, point.lon]);

    if (allPoints.length > 1) {
      this.trimPreviewBaseLayer = L.polyline(allPoints, {
        color: '#6b7280',
        weight: 2,
        opacity: 0.5,
      }).addTo(this.trimPreviewMap);
    }

    if (keptPoints.length > 1) {
      this.trimPreviewKeptLayer = L.polyline(keptPoints, {
        color: '#ff8c42',
        weight: 3,
        opacity: 0.95,
      }).addTo(this.trimPreviewMap);
    }

    if (allPoints.length > 0) {
      this.trimPreviewMap.fitBounds(L.latLngBounds(allPoints), { padding: [16, 16] });
    }
  }

  populateTrackSelect(tracks) {
    const select = document.getElementById('track');
    tracks.forEach((track) => {
      const opt = document.createElement('option');
      opt.value = track.id;
      opt.textContent = track.name;
      select.appendChild(opt);
    });
  }

  populateProfileSelect(profiles) {
    const select = document.getElementById('profile');
    profiles.forEach((profile) => {
      const opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.name;
      select.appendChild(opt);
    });
  }

  onProfileChange(e) {
    document.getElementById('new-profile').classList.toggle('hidden', e.target.value !== '');
  }

  onTrackChange(e) {
    document.getElementById('new-track').classList.toggle('hidden', e.target.value !== '__new__');
    this.updateTestName();
  }

  openSystemModal() {
    const modal = document.getElementById('system-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('system-type').value = '';
    document.getElementById('system-name').value = '';
    document.getElementById('system-variant').value = '';
    document.getElementById('system-search').value = '';
    document.getElementById('systems-error').textContent = '';
    this.renderExistingSystems();
  }

  closeSystemModal() {
    const modal = document.getElementById('system-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  renderExistingSystems() {
    const list = document.getElementById('existing-systems-list');
    const term = document.getElementById('system-search').value.toLowerCase().trim();
    const matches = systemManager.getAllSystems().filter((system) => {
      const label = systemManager.formatSystemName(system).toLowerCase();
      return !term || label.includes(term);
    });

    if (matches.length === 0) {
      list.innerHTML = '<div class="empty-state">No saved systems match this search.</div>';
      return;
    }

    list.innerHTML = matches.map((system) => `
      <button type="button" class="existing-system-item" data-existing-system="${system.id}">
        ${systemManager.formatSystemName(system)}
      </button>
    `).join('');

    list.querySelectorAll('[data-existing-system]').forEach((button) => {
      button.addEventListener('click', () => this.selectExistingSystem(button.dataset.existingSystem));
    });
  }

  selectExistingSystem(systemId) {
    const existing = systemManager.getSystem(systemId);
    if (!existing) return;
    if (!this.systems.some((system) => system.id === existing.id)) {
      this.systems.push({ ...existing });
    }
    this.renderSystems();
    this.closeSystemModal();
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

    if (!type) return void (error.textContent = 'Please select a system type');
    if (!name) return void (error.textContent = 'Please enter a product name');
    if (SYSTEM_TYPES[type]?.hasVariants && !variant) return void (error.textContent = 'Please select a variant');

    const system = systemManager.addSystem(type, name, variant);
    this.systems.push(system);
    this.renderSystems();
    this.updateTestName();
    this.closeSystemModal();
  }

  toggleSystemBenchmark(systemId, benchmarkKey) {
    this.systems = this.systems.map((system) => system.id === systemId ? { ...system, [benchmarkKey]: !system[benchmarkKey] } : system);
    this.renderSystems();
  }

  removeSystem(systemId) {
    this.systems = this.systems.filter((system) => system.id !== systemId);
    this.renderSystems();
    this.updateTestName();
  }

  renderSystems() {
    const renderGroup = (items, containerId, emptyMessage) => {
      const container = document.getElementById(containerId);
      if (items.length === 0) {
        container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
        return;
      }

      container.innerHTML = items.map((system) => `
        <div class="system-tag system-tag-panel">
          <div class="system-tag-copy">
            <span>${systemManager.formatSystemName(system)}</span>
            <small>${SYSTEM_TYPES[system.type]?.label || system.type}</small>
          </div>
          <div class="system-benchmark-toggles">
            <button type="button" class="${system.includeVideo ? 'active' : ''}" data-system-id="${system.id}" data-benchmark="includeVideo">Video</button>
            <button type="button" class="${system.includeControl ? 'active' : ''}" data-system-id="${system.id}" data-benchmark="includeControl">Control</button>
          </div>
          <button type="button" data-remove-system="${system.id}" aria-label="Remove system">×</button>
        </div>
      `).join('');
    };

    renderGroup(this.systems.filter((system) => system.includeVideo), 'video-systems-list', 'No systems selected for the video benchmark.');
    renderGroup(this.systems.filter((system) => system.includeControl), 'control-systems-list', 'No systems selected for the control benchmark.');

    document.querySelectorAll('[data-benchmark]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.toggleSystemBenchmark(button.dataset.systemId, button.dataset.benchmark);
      });
    });

    document.querySelectorAll('[data-remove-system]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.removeSystem(button.dataset.removeSystem);
      });
    });
  }

  updateTestName() {
    const videoSystems = this.systems.filter((system) => system.includeVideo).map((system) => systemManager.formatSystemName(system));
    const controlSystems = this.systems.filter((system) => system.includeControl).map((system) => systemManager.formatSystemName(system));
    const summary = [videoSystems[0], controlSystems[0]].filter(Boolean).join(' / ') || 'Test';
    const trackSelect = document.getElementById('track');
    const trackName = trackSelect.selectedOptions[0]?.textContent || 'Unknown Track';
    if (!this.uploadedTestData?.test_name) {
      document.getElementById('test-name').value = `${summary} on ${trackName}`;
    }
  }

  nextStep() {
    if (this.currentStep === 3) {
      const videoSystems = this.systems.filter((system) => system.includeVideo);
      const controlSystems = this.systems.filter((system) => system.includeControl);
      if (videoSystems.length === 0 || controlSystems.length === 0) {
        alert('Choose at least one system for Video and one for Control.');
        return;
      }
    }

    this.currentStep += 1;
    this.renderStep();
    if (this.currentStep === 2) this.setupMapStep();
    if (this.currentStep === 4) this.renderPreview();
  }

  prevStep() {
    this.currentStep -= 1;
    this.renderStep();
  }

  renderStep() {
    document.querySelectorAll('.step-content').forEach((el) => el.classList.remove('active'));
    document.getElementById(`step-${this.currentStep}`).classList.add('active');
    document.querySelectorAll('.step').forEach((el) => el.classList.remove('active'));
    document.querySelector(`[data-step="${this.currentStep}"]`).classList.add('active');
  }

  setupMapStep() {
    if (this.map) this.map.remove();
    this.map = L.map('map-setup').setView([52.18, 21.13], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    const latLngs = this.getTrackPoints().map((point) => [point.lat, point.lon]);
    if (latLngs.length > 0) {
      L.polyline(latLngs, { color: '#ff8c42', weight: 3, opacity: 0.9 }).addTo(this.map);
      this.map.fitBounds(latLngs, { padding: [30, 30] });
    }

    const pilotLat = parseFloat(document.getElementById('pilot-lat').value) || latLngs[0]?.[0] || 52.18;
    const pilotLon = parseFloat(document.getElementById('pilot-lon').value) || latLngs[0]?.[1] || 21.13;
    this.pilotMarker = L.marker([pilotLat, pilotLon], { draggable: true }).addTo(this.map);
    this.pilotMarker.on('dragend', () => {
      const { lat, lng } = this.pilotMarker.getLatLng();
      document.getElementById('pilot-lat').value = lat.toFixed(5);
      document.getElementById('pilot-lon').value = lng.toFixed(5);
    });
    this.map.on('click', (e) => {
      this.pilotMarker.setLatLng(e.latlng);
      document.getElementById('pilot-lat').value = e.latlng.lat.toFixed(5);
      document.getElementById('pilot-lon').value = e.latlng.lng.toFixed(5);
    });
  }

  renderPreview() {
    if (this.previewMap) this.previewMap.remove();
    this.previewMap = L.map('map-preview').setView([52.18, 21.13], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.previewMap);

    const latLngs = this.getTrackPoints().map((point) => [point.lat, point.lon]);
    if (latLngs.length > 0) {
      L.polyline(latLngs, { color: '#ff8c42', weight: 3, opacity: 0.9 }).addTo(this.previewMap);
      this.previewMap.fitBounds(latLngs, { padding: [40, 40] });
    }

    const panel = document.getElementById('preview-info');
    panel.innerHTML = `
      <h3>${this.uploadedTestData?.test_name || document.getElementById('test-name').value || 'Untitled Test'}</h3>
      <dl>
        <dt>Benchmarks</dt><dd>Video + Control</dd>
        <dt>Video Systems</dt><dd>${this.systems.filter((system) => system.includeVideo).map((system) => systemManager.formatSystemName(system)).join(', ') || 'None selected'}</dd>
        <dt>Control Systems</dt><dd>${this.systems.filter((system) => system.includeControl).map((system) => systemManager.formatSystemName(system)).join(', ') || 'None selected'}</dd>
        <dt>Trimmed Samples</dt><dd>${this.getTrimmedTrack().length}</dd>
        <dt>Valid GPS Samples</dt><dd>${this.getTrackPoints().length}</dd>
        <dt>Flagged Teleports</dt><dd>${this.detectTeleports().length}</dd>
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
    if (!authToken) return alert('Please log in before saving or publishing a test.');

    const processedTrack = this.getTrackPoints();
    if (processedTrack.length < 2) return alert('Please keep at least two samples with valid GPS coordinates after trimming.');

    let trackId = document.getElementById('track').value;
    if (trackId === '__new__') {
      const track = await api.createTrack({
        name: document.getElementById('track-name').value.trim(),
        location: document.getElementById('track-location').value.trim() || 'Unknown',
      });
      trackId = track.id;
    } else if (!trackId) {
      return alert('Please select a track');
    }

    const testName = document.getElementById('test-name').value.trim();
    if (!testName) return alert('Please enter a test name');

    const preparedTestJson = this.buildPreparedUploadJson(processedTrack);
    const benchmarkDefinitions = [
      { category: 'video', suffix: 'Video', systems: this.systems.filter((system) => system.includeVideo) },
      { category: 'control', suffix: 'Control', systems: this.systems.filter((system) => system.includeControl) },
    ];

    try {
      const createdTests = [];
      for (const benchmark of benchmarkDefinitions) {
        const created = await api.createTest({
          category: benchmark.category,
          system_under_test: benchmark.systems.map((system) => systemManager.formatSystemName(system)).join(' + '),
          systems: benchmark.systems.map((system) => ({ type: system.type, name: system.name, variant: system.variant })),
          track_id: trackId,
          custom_name: `${testName} — ${benchmark.suffix}`,
          pilot_lat: parseFloat(document.getElementById('pilot-lat').value) || null,
          pilot_lon: parseFloat(document.getElementById('pilot-lon').value) || null,
          pilot_bearing_deg: parseInt(document.getElementById('pilot-bearing').value, 10) || null,
          wind_speed: document.getElementById('wind-speed').value || null,
          wind_direction: document.getElementById('wind-direction').value || null,
          notes: document.getElementById('notes').value || null,
          prepared_test_json: preparedTestJson,
          duration_s: preparedTestJson?.stats?.flight_duration_s || null,
          total_distance_m: preparedTestJson?.track?.at(-1)?.distance_from_home_m || null,
        });
        createdTests.push(created);
        if (status === 'published') await api.publishTest(created.id);
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

document.addEventListener('DOMContentLoaded', () => {
  window.uploadWizard = new UploadWizard();
});
