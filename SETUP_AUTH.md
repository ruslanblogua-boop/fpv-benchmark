# Moonlet Auth Setup

The login and upload buttons now work! Follow these steps to enable authentication:

## Step 1: Get Your Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and create a project
2. In the Supabase dashboard, go to **Project Settings → API**
3. Copy your:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon Public Key** (the public anonymous key)

## Step 2: Enable Google OAuth

1. In your Supabase project, go to **Authentication → Providers**
2. Find **Google** and enable it
3. Add your OAuth credentials (or use test credentials for development)
4. Set your redirect URLs:
   - `http://localhost:5000` (for local dev)
   - `https://yourdomain.com` (for production)

## Step 3: Configure Frontend

Open **browser DevTools Console** and run:

```javascript
auth.setSupabaseConfig(
  'https://xxxxx.supabase.co',
  'your-anon-public-key-here'
)
```

Or manually set localStorage:
```javascript
localStorage.setItem('supabase_url', 'https://xxxxx.supabase.co');
localStorage.setItem('supabase_key', 'your-anon-public-key-here');
```

Then refresh the page.

## Step 4: Set API Endpoint (Optional)

If your Worker API is deployed somewhere other than the default, configure it:

```javascript
api.setAPIBase('https://your-api-endpoint.com');
```

Or set localStorage:
```javascript
localStorage.setItem('api_base', 'https://your-api-endpoint.com');
```

## Testing

1. Click the **Login** button in the top-right
2. You should be redirected to Google OAuth
3. After login, the button should change to **Logout**
4. The **+ New Test** button should now be clickable

## What Changed

- ✅ **Login button** now opens Google OAuth login
- ✅ **Upload button** now works after login
- ✅ **API endpoint** is configurable
- ✅ **Auth token** is stored in localStorage and passed to API

## For Developers

- `frontend/js/auth.js` - All Supabase authentication logic
- `frontend/js/api.js` - API client with dynamic endpoint support
- `frontend/index.html` - Includes Supabase client library via CDN

The auth system uses localStorage to persist credentials across page loads.
