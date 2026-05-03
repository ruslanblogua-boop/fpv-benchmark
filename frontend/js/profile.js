// Profile Page

class ProfilePage {
  constructor() {
    this.currentFilter = 'all';
    this.init();
  }

  async init() {
    // Check auth
    if (!api.token) {
      window.location.href = '/';
      return;
    }

    // Load user data
    try {
      const user = await api.getMe();
      document.getElementById('display-name').value = user.display_name || '';
    } catch (err) {
      console.error('Failed to load user:', err);
    }

    // Save name button
    document.getElementById('save-name').addEventListener('click', () => this.saveName());

    // Profile CRUD
    document.getElementById('add-profile').addEventListener('click', () => this.toggleNewProfileForm());
    document.getElementById('create-profile').addEventListener('click', () => this.createProfile());
    document.getElementById('cancel-profile').addEventListener('click', () => this.toggleNewProfileForm());

    // Test list filtering
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.loadTests();
      });
    });

    // Load initial data
    await this.loadProfiles();
    await this.loadTests();
  }

  async saveName() {
    try {
      const displayName = document.getElementById('display-name').value;
      await api.updateMe({ display_name: displayName });
      alert('Name saved!');
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async loadProfiles() {
    try {
      const { profiles } = await api.getProfiles();
      this.renderProfiles(profiles);
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  }

  renderProfiles(profiles) {
    const list = document.getElementById('profile-list');
    list.innerHTML = '';
    profiles.forEach(profile => {
      const item = document.createElement('div');
      item.className = 'profile-item';
      item.innerHTML = `
        <div class="profile-name">${profile.name}</div>
        <div class="profile-specs">${profile.frame} / ${profile.motors} / ${profile.fc}</div>
        <button data-id="${profile.id}" class="delete-profile">Delete</button>
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
      const profile = {
        name: document.getElementById('new-name').value,
        frame: document.getElementById('new-frame').value,
        motors: document.getElementById('new-motors').value,
        fc: document.getElementById('new-fc').value,
        vtx: document.getElementById('new-vtx').value,
        props: document.getElementById('new-props').value,
        weight_g: parseFloat(document.getElementById('new-weight').value),
        notes: document.getElementById('new-notes').value,
      };

      await api.createProfile(profile);
      this.toggleNewProfileForm();
      await this.loadProfiles();
      alert('Profile created!');
    } catch (err) {
      alert('Failed to create profile: ' + err.message);
    }
  }

  async deleteProfile(id) {
    if (confirm('Delete this profile?')) {
      try {
        await api.deleteProfile(id);
        await this.loadProfiles();
      } catch (err) {
        alert('Failed to delete: ' + err.message);
      }
    }
  }

  async loadTests() {
    try {
      const { tests } = await api.getMyTests();
      let filtered = tests;
      if (this.currentFilter === 'draft') {
        filtered = tests.filter(t => t.status === 'draft');
      } else if (this.currentFilter === 'published') {
        filtered = tests.filter(t => t.status === 'published');
      }
      this.renderTests(filtered);
    } catch (err) {
      console.error('Failed to load tests:', err);
    }
  }

  renderTests(tests) {
    const list = document.getElementById('my-test-list');
    list.innerHTML = '';

    if (tests.length === 0) {
      list.textContent = 'No tests yet.';
      return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Name</th>
          <th>System</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tests.map(t => `
          <tr>
            <td>${t.custom_name || t.auto_name}</td>
            <td>${t.system_under_test}</td>
            <td><span class="status-badge status-${t.status}">${t.status}</span></td>
            <td>${new Date(t.created_at).toLocaleDateString()}</td>
            <td>
              <a href="/?test=${t.id}" class="btn btn-small">View</a>
              ${t.status === 'draft' ? `<button class="delete-test" data-id="${t.id}">Delete</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
    list.appendChild(table);

    document.querySelectorAll('.delete-test').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteTest(e.target.dataset.id));
    });
  }

  async deleteTest(id) {
    if (confirm('Delete this test?')) {
      try {
        await api.deleteTest(id);
        await this.loadTests();
      } catch (err) {
        alert('Failed to delete: ' + err.message);
      }
    }
  }
}

// Initialize profile page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ProfilePage();
});
