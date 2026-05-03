// Supabase Authentication
const getSupabaseConfig = () => {
  return {
    url: localStorage.getItem('supabase_url') || 'https://fkbjviqahbonwtwjutkc.supabase.co',
    key: localStorage.getItem('supabase_key') || '',
  };
};

let _supabaseClient = null;

const initSupabase = async () => {
  if (_supabaseClient) return _supabaseClient;

  const config = getSupabaseConfig();
  if (!window.createClient && !window.supabase?.createClient) {
    console.warn('Supabase client not loaded. Waiting...');
    // Retry in 100ms
    await new Promise(r => setTimeout(r, 100));
    return initSupabase();
  }

  const createClientFn = window.createClient || window.supabase.createClient;
  _supabaseClient = createClientFn(config.url, config.key);
  return _supabaseClient;
};

class AuthManager {
  constructor() {
    this.user = null;
    this.token = null;
    this.supabase = null;
    this.init();
  }

  async init() {
    this.supabase = await initSupabase();
    if (!this.supabase) {
      console.error('Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in localStorage');
      return;
    }

    const storedToken = localStorage.getItem('auth_token');
    if (storedToken && typeof api !== 'undefined') {
      this.token = storedToken;
      api.setToken(storedToken);
    }

    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        this.user = session.user;
        this.token = session.access_token;
        localStorage.setItem('auth_token', this.token);
        if (typeof api !== 'undefined') api.setToken(this.token);
        this.updateUI();
      }
    } catch (err) {
      console.error('Session check failed:', err);
    }

    this.supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        this.user = session.user;
        this.token = session.access_token;
        localStorage.setItem('auth_token', this.token);
        if (typeof api !== 'undefined') api.setToken(this.token);
        this.syncUserToBackend();
        this.updateUI();

        if (window.location.pathname === '/upload.html' || window.location.pathname === '/profile.html') {
          window.location.href = '/';
        }
      } else {
        this.user = null;
        this.token = null;
        localStorage.removeItem('auth_token');
        if (typeof api !== 'undefined') api.setToken(null);
        this.updateUI();
      }
    });
  }

  async login() {
    if (!this.supabase) {
      alert('Supabase not configured. Please set your Supabase credentials.');
      return;
    }

    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      alert('Login failed: ' + error.message);
    }
  }

  async logout() {
    if (!this.supabase) return;

    const { error } = await this.supabase.auth.signOut();
    if (error) {
      alert('Logout failed: ' + error.message);
    }
  }

  async syncUserToBackend() {
    if (!this.token || typeof api === 'undefined') return;

    try {
      await api.syncUser(this.token);
    } catch (err) {
      console.error('Failed to sync user to backend:', err);
    }
  }

  updateUI() {
    const loginBtn = document.getElementById('topbar-login');
    const uploadBtn = document.querySelector('.topbar-upload');
    const profileBtn = document.querySelector('.controls a[href="/profile"]');

    if (this.user) {
      if (loginBtn) {
        loginBtn.textContent = 'Logout';
      }
      if (uploadBtn) {
        uploadBtn.style.opacity = '1';
        uploadBtn.style.pointerEvents = 'auto';
      }
      if (profileBtn) {
        profileBtn.style.opacity = '1';
        profileBtn.style.pointerEvents = 'auto';
      }
    } else {
      if (loginBtn) {
        loginBtn.textContent = 'Login';
      }
      if (uploadBtn) {
        uploadBtn.style.opacity = '0.5';
        uploadBtn.style.pointerEvents = 'none';
      }
      if (profileBtn) {
        profileBtn.style.opacity = '0.5';
        profileBtn.style.pointerEvents = 'none';
      }
    }
  }

  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  getUser() {
    return this.user;
  }

  getToken() {
    return this.token;
  }

  setSupabaseConfig(url, key) {
    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_key', key);
    this.supabase = null;
    this.init();
  }
}

const auth = new AuthManager();
