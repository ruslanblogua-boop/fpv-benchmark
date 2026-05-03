# Moonlet Button Fixes — Summary

## Issues Found

### 1. **Login Button Not Working**
- **Location**: `frontend/js/viewer.js:51-54`
- **Problem**: Button only logged to console with a TODO comment
- **Impact**: Users couldn't authenticate
- **Fix**: Integrated Supabase Google OAuth authentication

### 2. **Upload Button Blocked by Auth Check**
- **Location**: `frontend/js/upload.js:16-19`
- **Problem**: Upload page checked for `api.token` and redirected unauthenticated users to `/`
- **Symptom**: Users couldn't upload even if they went to `/upload.html` directly
- **Root Cause**: No way to get a token since login didn't work (catch-22)
- **Fix**: Made login work first, auth page now properly redirects after login

### 3. **Hardcoded API Endpoint**
- **Location**: `frontend/js/api.js:3`
- **Problem**: API_BASE was hardcoded to `https://fpv-heatmap-api.moonlet.workers.dev`
- **Impact**: If your Worker is deployed elsewhere, API calls fail silently
- **Fix**: Made endpoint configurable via environment variable or localStorage

---

## Changes Made

### New Files
- **`frontend/js/auth.js`** — Complete Supabase authentication system
  - Handles Google OAuth sign-in/sign-out
  - Manages JWT token storage in localStorage
  - Syncs user data to backend
  - Updates UI based on auth state

- **`SETUP_AUTH.md`** — Configuration guide for developers
  - How to get Supabase credentials
  - How to enable Google OAuth
  - How to set up the frontend

### Modified Files

#### `frontend/js/api.js`
- ✅ Added dynamic API endpoint configuration
- ✅ `setAPIBase(url)` method to change endpoint at runtime
- ✅ `getAPIBase()` function checks env vars, localStorage, then defaults
- ✅ `setToken(null)` now properly clears localStorage

#### `frontend/js/viewer.js`
- ✅ Login button now calls `auth.login()` or `auth.logout()`
- ✅ Replaced console.log TODO with functional code

#### `frontend/index.html`, `upload.html`, `profile.html`
- ✅ Added Supabase client library via CDN (ESM importmap)
- ✅ Included `auth.js` before viewer/upload/profile scripts
- ✅ Proper script loading order: api.js → auth.js → feature scripts

---

## How It Works Now

1. **Page loads** → `auth.js` initializes Supabase client
2. **Check session** → Restores logged-in state from localStorage
3. **Listen for changes** → Updates UI and redirects after login
4. **Login button clicked** → Opens Google OAuth dialog
5. **User authenticates** → Supabase returns JWT token
6. **Token stored** → Saved to localStorage and passed to API
7. **Upload button enabled** → User can now access `/upload`

---

## Configuration Required

Before login works, you need to set Supabase credentials. In browser console:

```javascript
auth.setSupabaseConfig('YOUR_SUPABASE_URL', 'YOUR_ANON_PUBLIC_KEY');
```

See `SETUP_AUTH.md` for detailed instructions.

---

## Testing Checklist

- [ ] Click "Login" button → Opens Google OAuth
- [ ] After login → Button changes to "Logout"
- [ ] "Logout" button → Signs out user
- [ ] Click "+ New Test" while logged in → Opens `/upload`
- [ ] Click "+ New Test" while logged out → Shows alert
- [ ] Refresh page → Session persists (token in localStorage)
- [ ] Check browser DevTools → `api_base` and `auth_token` in localStorage

---

## Next Steps

1. **Set up Supabase project** (see SETUP_AUTH.md)
2. **Configure Supabase credentials** in browser
3. **Deploy Worker API** (if not already done)
4. **Set API endpoint** if Worker is not at default URL
5. **Test upload flow** end-to-end

The frontend is now ready to accept authenticated requests!
