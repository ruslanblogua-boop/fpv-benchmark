const CAMERA_FIXTURES = [
  {
    id: 'fixture-ws-pro-gx-quality',
    tab: 'quality',
    combo_name: 'Walksnail Pro Kit + Goggles X',
    summary: 'Daylight detail bench with both onboard and goggles DVR captures.',
    tags: ['Walksnail', 'Goggles X', 'VTX DVR', 'VRX DVR'],
    scene_name: 'Standard daylight detail scene',
    exposure_notes: 'Placeholder until the first admin upload lands.',
    latency_method: null,
    assets: { vtx: null, vrx: null },
    metadata: { source_type: 'tested' },
  },
  {
    id: 'fixture-hdzero-lowlight',
    tab: 'low-light',
    combo_name: 'HDZero Freestyle V2 + Goggles',
    summary: 'Low-light placeholder for shadow detail and noise-floor comparisons.',
    tags: ['HDZero', 'Low Light', 'VRX DVR'],
    scene_name: 'Standard low-light dusk scene',
    exposure_notes: 'Use identical scene lighting across every combo.',
    latency_method: null,
    assets: { vtx: null, vrx: null },
    metadata: { source_type: 'tested' },
  },
  {
    id: 'fixture-o3-latency',
    tab: 'latency',
    combo_name: 'DJI O3 + Goggles 2',
    summary: 'Latency placeholder for LED gate and high-frame-rate capture benchmarks.',
    tags: ['DJI O3', 'Latency', 'Goggles 2'],
    scene_name: 'Latency lane',
    exposure_notes: null,
    latency_method: 'LED gate + high-FPS reference capture',
    assets: { vtx: null, vrx: null },
    metadata: { source_type: 'tested' },
  },
];

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

class CameraPage {
  constructor() {
    this.activeTab = 'quality';
    this.activeView = 'split';
    this.cameraTests = [];
    this.filteredItems = [];
    this.selectedItem = null;
    this.isAdmin = false;
    this.init();
  }

  async init() {
    this.bindTopbar();

    if (document.querySelector('.camera-page')) {
      this.bindBrowserControls();
      await this.loadUserState();
      await this.loadCameraTests();
      this.renderList();
    }

    if (window.location.pathname.endsWith('/camera-admin.html')) {
      await this.setupAdminPage();
    }
  }

  bindTopbar() {
    const loginBtn = document.getElementById('topbar-login');
    if (!loginBtn) return;

    loginBtn.addEventListener('click', () => {
      if (auth.isAuthenticated()) {
        auth.logout();
        window.location.href = '/';
      } else {
        auth.login();
      }
    });
  }

  bindBrowserControls() {
    document.querySelectorAll('.camera-tab').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeTab = button.dataset.tab;
        document.querySelectorAll('.camera-tab').forEach((tab) => tab.classList.remove('active'));
        button.classList.add('active');
        this.renderList();
      });
    });

    document.getElementById('camera-search')?.addEventListener('input', () => this.renderList());

    document.querySelectorAll('.view-mode').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeView = button.dataset.view;
        document.querySelectorAll('.view-mode').forEach((mode) => mode.classList.remove('active'));
        button.classList.add('active');
        this.renderStage();
      });
    });
  }

  async loadUserState() {
    try {
      if (!api.token) return;
      const user = await api.getMe();
      this.isAdmin = user.role === 'admin';
      if (this.isAdmin) {
        document.getElementById('camera-admin-entry')?.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Failed to load camera user state:', err);
    }
  }

  async loadCameraTests() {
    try {
      const { camera_tests } = await api.getCameraTests();
      this.cameraTests = camera_tests && camera_tests.length > 0 ? camera_tests : CAMERA_FIXTURES;
    } catch (err) {
      console.error('Failed to load camera tests:', err);
      this.cameraTests = CAMERA_FIXTURES;
    }

    const requestedId = new URLSearchParams(window.location.search).get('camera_test');
    if (requestedId) {
      const matched = this.cameraTests.find((item) => item.id === requestedId);
      if (matched) {
        this.activeTab = matched.tab;
        document.querySelectorAll('.camera-tab').forEach((button) => {
          button.classList.toggle('active', button.dataset.tab === this.activeTab);
        });
      }
    }
  }

  renderList() {
    const searchTerm = (document.getElementById('camera-search')?.value || '').toLowerCase().trim();
    this.filteredItems = this.cameraTests.filter((item) => {
      if (item.tab !== this.activeTab) return false;
      if (!searchTerm) return true;

      const haystack = [
        item.combo_name,
        item.camera_name,
        item.vtx_name,
        item.vrx_name,
        item.summary,
        ...(item.tags || []),
      ].join(' ').toLowerCase();

      return haystack.includes(searchTerm);
    });

    const list = document.getElementById('camera-list');
    if (!list) return;

    if (this.filteredItems.length === 0) {
      list.innerHTML = '<div class="empty-state">No camera combos match this filter yet.</div>';
      this.selectedItem = null;
      this.renderStage();
      return;
    }

    if (!this.selectedItem || this.selectedItem.tab !== this.activeTab || !this.filteredItems.some((item) => item.id === this.selectedItem.id)) {
      this.selectedItem = this.filteredItems[0];
    }

    const requestedId = new URLSearchParams(window.location.search).get('camera_test');
    if (requestedId) {
      const matched = this.filteredItems.find((item) => item.id === requestedId);
      if (matched) {
        this.selectedItem = matched;
      }
    }

    list.innerHTML = '';
    this.filteredItems.forEach((item) => {
      const card = document.createElement('button');
      card.className = `camera-list-item ${this.selectedItem?.id === item.id ? 'active' : ''}`;
      card.innerHTML = `
        <strong>${item.combo_name}</strong>
        <span>${item.summary || 'Standardized combo dataset'}</span>
      `;
      card.addEventListener('click', () => {
        this.selectedItem = item;
        this.renderList();
        this.renderStage();
      });
      list.appendChild(card);
    });

    document.getElementById('camera-tab-title').textContent = `${this.formatTabLabel(this.activeTab)} Comparison`;
    this.renderStage();
  }

  renderStage() {
    const item = this.selectedItem;
    const stageTitle = document.getElementById('camera-stage-title');
    const badges = document.getElementById('camera-stage-badges');
    const metadata = document.getElementById('camera-metadata');
    const vtxFrame = document.getElementById('camera-vtx-frame');
    const vrxFrame = document.getElementById('camera-vrx-frame');

    if (!stageTitle || !badges || !metadata || !vtxFrame || !vrxFrame) return;

    if (!item) {
      stageTitle.textContent = 'Select a combo';
      badges.innerHTML = '';
      metadata.innerHTML = '<div class="empty-state">Choose a camera combo to inspect its standardized comparison set.</div>';
      vtxFrame.innerHTML = 'Select a combo to preview the onboard recording.';
      vrxFrame.innerHTML = 'Select a combo to preview the goggles recording.';
      return;
    }

    stageTitle.textContent = item.combo_name;
    const sourceType = item.metadata?.source_type || 'tested';
    badges.innerHTML = [
      ...(item.tags || []),
      sourceType === 'simulated' ? 'Simulated' : 'Tested',
    ].map((tag) => `<span class="tool-pill">${tag}</span>`).join('');

    vtxFrame.innerHTML = this.renderAssetFrame(item.assets?.vtx, 'VTX DVR preview');
    vrxFrame.innerHTML = this.renderAssetFrame(item.assets?.vrx, 'VRX DVR preview');

    if (this.activeView === 'vtx') {
      vrxFrame.classList.add('muted-frame');
      vtxFrame.classList.remove('muted-frame');
    } else if (this.activeView === 'vrx') {
      vtxFrame.classList.add('muted-frame');
      vrxFrame.classList.remove('muted-frame');
    } else {
      vtxFrame.classList.remove('muted-frame');
      vrxFrame.classList.remove('muted-frame');
    }

    metadata.innerHTML = `
      <div class="eyebrow">Dataset Notes</div>
      <h3>${item.combo_name}</h3>
      <p>${item.summary || 'Standardized end-to-end combo dataset.'}</p>
      <div class="camera-meta-grid">
        <div><strong>Camera</strong><span>${item.camera_name || 'Not specified'}</span></div>
        <div><strong>VTX</strong><span>${item.vtx_name || 'Not specified'}</span></div>
        <div><strong>VRX</strong><span>${item.vrx_name || 'Not specified'}</span></div>
        <div><strong>Scene</strong><span>${item.scene_name || 'Not specified'}</span></div>
        <div><strong>Latency Method</strong><span>${item.latency_method || 'Not specified'}</span></div>
        <div><strong>Exposure Notes</strong><span>${item.exposure_notes || 'Not specified'}</span></div>
      </div>
    `;
  }

  renderAssetFrame(assetUrl, alt) {
    if (assetUrl) {
      return `<img src="${assetUrl}" alt="${alt}" class="camera-preview-image">`;
    }

    return `
      <div class="camera-preview-copy">
        <strong>${alt}</strong>
        <span>Preview image will render here after the first admin upload.</span>
      </div>
    `;
  }

  async setupAdminPage() {
    const panel = document.getElementById('camera-admin-status');
    const form = document.getElementById('camera-admin-form');
    if (!panel || !form) return;

    try {
      const user = await api.getMe();
      if (user.role !== 'admin') {
        panel.innerHTML = '<div class="empty-state">This upload workspace is reserved for admins.</div>';
        return;
      }

      panel.innerHTML = '<div class="empty-state">Admin confirmed. Upload a published combo set below.</div>';
      form.classList.remove('hidden');
      form.addEventListener('submit', (event) => this.handleAdminSubmit(event));
    } catch (err) {
      panel.innerHTML = '<div class="empty-state">Please log in with an admin account to use this page.</div>';
    }
  }

  async handleAdminSubmit(event) {
    event.preventDefault();

    const vtxFile = document.getElementById('camera-vtx-file').files[0];
    const vrxFile = document.getElementById('camera-vrx-file').files[0];
    if (!vtxFile || !vrxFile) {
      alert('Please upload both VTX DVR and VRX DVR images.');
      return;
    }

    try {
      const [vtxAsset, vrxAsset] = await Promise.all([
        fileToDataUrl(vtxFile),
        fileToDataUrl(vrxFile),
      ]);

      await api.createCameraTest({
        tab: document.getElementById('camera-tab-input').value,
        combo_name: document.getElementById('camera-combo-name').value.trim(),
        camera_name: document.getElementById('camera-name').value.trim(),
        vtx_name: document.getElementById('camera-vtx-name').value.trim(),
        vrx_name: document.getElementById('camera-vrx-name').value.trim(),
        firmware: document.getElementById('camera-firmware').value.trim(),
        scene_name: document.getElementById('camera-scene-name').value.trim(),
        latency_method: document.getElementById('camera-latency-method').value.trim(),
        exposure_notes: document.getElementById('camera-exposure-notes').value.trim(),
        summary: document.getElementById('camera-summary').value.trim(),
        notes: document.getElementById('camera-notes').value.trim(),
        tags: document.getElementById('camera-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
        vtx_asset_data_url: vtxAsset,
        vrx_asset_data_url: vrxAsset,
      });

      alert('Camera combo published.');
      window.location.href = '/camera.html';
    } catch (err) {
      alert('Failed to publish camera combo: ' + err.message);
    }
  }

  formatTabLabel(tab) {
    if (tab === 'low-light') return 'Low Light';
    if (tab === 'latency') return 'Latency';
    return 'Quality';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.camera-page') || window.location.pathname.endsWith('/camera-admin.html')) {
    new CameraPage();
  }
});
