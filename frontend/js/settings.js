// Settings Page

class SettingsPage {
  constructor() {
    this.currentFilter = 'all';
    this.init();
  }

  async init() {
    const authToken = api.token || localStorage.getItem('auth_token') || (typeof auth !== 'undefined' ? auth.getToken() : null);
    if (!authToken) {
      window.location.href = '/';
      return;
    }

    this.bindEvents();

    try {
      const user = await api.getMe();
      document.getElementById('display-name').value = user.display_name || '';
    } catch (err) {
      console.error('Failed to load user:', err);
    }

    await Promise.all([
      this.loadProfiles(),
      this.loadTests(),
    ]);
  }

  bindEvents() {
    document.getElementById('topbar-login').addEventListener('click', () => {
      if (auth.isAuthenticated()) {
        auth.logout();
        window.location.href = '/';
      } else {
        auth.login();
      }
    });

    document.getElementById('save-name').addEventListener('click', () => this.saveName());
    document.getElementById('add-profile').addEventListener('click', () => this.toggleNewProfileForm());
    document.getElementById('create-profile').addEventListener('click', () => this.createProfile());
    document.getElementById('cancel-profile').addEventListener('click', () => this.toggleNewProfileForm());
    document.getElementById('logout').addEventListener('click', () => {
      auth.logout();
      window.location.href = '/';
    });

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = tab.dataset.filter;
        this.loadTests();
      });
    });
  }

  async saveName() {
    try {
      const displayName = document.getElementById('display-name').value.trim();
      await api.updateMe({ display_name: displayName });
      alert('Profile updated.');
    } catch (err) {
      alert('Failed to save profile: ' + err.message);
    }
  }

  async loadProfiles() {
    try {
      const { profiles } = await api.getProfiles();
      this.renderProfiles(profiles || []);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }

  renderProfiles(profiles) {
    const list = document.getElementById('profile-list');
    if (profiles.length === 0) {
      list.innerHTML = '<div class="empty-state">No profiles yet. Add one to speed up future uploads.</div>';
      return;
    }

    list.innerHTML = '';
    profiles.forEach((profile) => {
      const item = document.createElement('div');
      item.className = 'profile-item';
      item.innerHTML = `
        <div>
          <div class="profile-name">${profile.name}</div>
          <div class="profile-specs">${[profile.frame, profile.motors, profile.fc, profile.vtx].filter(Boolean).join(' / ') || 'No components yet'}</div>
        </div>
        <button class="btn btn-small delete-profile" data-id="${profile.id}">Delete</button>
      `;
      item.querySelector('.delete-profile').addEventListener('click', () => this.deleteProfile(profile.id));
      list.appendChild(item);
    });
  }

  toggleNewProfileForm() {
    document.getElementById('new-profile-form').classList.toggle('hidden');
  }

  async createProfile() {
    try {
      await api.createProfile({
        name: document.getElementById('new-name').value,
        frame: document.getElementById('new-frame').value,
        motors: document.getElementById('new-motors').value,
        fc: document.getElementById('new-fc').value,
        vtx: document.getElementById('new-vtx').value,
        props: document.getElementById('new-props').value,
        weight_g: parseFloat(document.getElementById('new-weight').value) || null,
        notes: document.getElementById('new-notes').value,
      });

      document.getElementById('new-profile-form').classList.add('hidden');
      await this.loadProfiles();
      alert('Profile created.');
    } catch (err) {
      alert('Failed to create profile: ' + err.message);
    }
  }

  async deleteProfile(id) {
    if (!confirm('Delete this profile?')) return;

    try {
      await api.deleteProfile(id);
      await this.loadProfiles();
    } catch (err) {
      alert('Failed to delete profile: ' + err.message);
    }
  }

  async loadTests() {
    try {
      const { tests } = await api.getMyTests();
      let filtered = tests || [];
      if (this.currentFilter !== 'all') {
        filtered = filtered.filter((test) => test.status === this.currentFilter);
      }
      this.renderTests(filtered);
    } catch (err) {
      console.error('Failed to load tests:', err);
    }
  }

  renderTests(tests) {
    const list = document.getElementById('my-test-list');
    if (!tests || tests.length === 0) {
      list.innerHTML = '<div class="empty-state">No tests in this view yet.</div>';
      return;
    }

    list.innerHTML = tests.map((test) => `
      <article class="settings-test-item">
        <div>
          <div class="test-title">${test.custom_name || test.auto_name || 'Untitled Test'}</div>
          <div class="test-submeta">${test.system_under_test || 'System not specified'}</div>
          <div class="test-submeta">${test.track_name || 'Unknown track'} · ${new Date(test.created_at).toLocaleDateString()} · <span class="status-badge status-${test.status}">${test.status}</span></div>
        </div>
        <div class="settings-test-actions">
          <a href="/?test=${test.id}" class="btn">View</a>
          <button class="btn delete-test" data-id="${test.id}">Delete</button>
        </div>
      </article>
    `).join('');

    list.querySelectorAll('.delete-test').forEach((button) => {
      button.addEventListener('click', () => this.deleteTest(button.dataset.id));
    });
  }

  async deleteTest(id) {
    if (!confirm('Delete this uploaded test?')) return;

    try {
      await api.deleteTest(id);
      await this.loadTests();
    } catch (err) {
      alert('Failed to delete test: ' + err.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
