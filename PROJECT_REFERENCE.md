# FPV Heatmap — Project Reference

**Last Updated:** 2026-05-03

This file documents critical URLs, configuration values, and project metadata for future development sessions.

## Quick Reference

### Repository
- **GitHub:** https://github.com/ruslanblogua-boop/fpv-benchmark
- **Local Path:** `/Users/ruslanyanko/Desktop/AI_Data/Moonlet_Website/fpv-heatmap`

### Deployment
- **Live URL:** https://moonlet-9sg.pages.dev
- **Hosting:** Cloudflare Pages (Git-integrated, auto-deploys on push to main)
- **Build Directory:** `frontend` (auto-detected, no custom build needed)

### Environment Setup

#### Supabase (Authentication & Database)
- **Project:** FPV Benchmark (or equivalent)
- **Config Location:** `frontend/js/api.js` and `frontend/js/auth.js`
- **OAuth Provider:** Google
- **Frontend Config (index.html):**
  ```javascript
  import { createClient } from '@supabase/supabase-js';
  // Supabase instance created via api.js
  ```

#### API Configuration
- **Base Endpoint:** Configured dynamically at runtime in `frontend/js/api.js`
- **Expected Methods:**
  - `getTracks()` - fetch all flight tracks
  - `getTests(filters)` - fetch tests with optional filtering
  - `getTest(testId)` - fetch single test details
  - `getTestHeatmap(testId)` - fetch heatmap GeoJSON
  - `getTestPath(testId)` - fetch flight path GeoJSON

### Frontend Stack
- **Framework:** Vanilla JavaScript (no framework)
- **Mapping:** Leaflet v1.9.4 + leaflet-heat v0.2.0
- **Styling:** Custom CSS (dark theme, --bg-dark: #0f1115, --accent-orange: #ff8c42)
- **Authentication:** Supabase + Google OAuth

### Key Files

#### HTML Pages
- `frontend/index.html` - Main viewer with map, sidebar, filters
- `frontend/upload.html` - 4-step upload wizard (Files → Map Setup → Metadata → Preview)

#### JavaScript (Frontend)
- `frontend/js/viewer.js` - `HeatmapViewer` class (map init, test loading, event listeners)
- `frontend/js/auth.js` - `AuthManager` class (login/logout, token management)
- `frontend/js/api.js` - `APIClient` class (Supabase integration, fetch wrappers)
- `frontend/js/upload.js` - Upload wizard state machine
- `frontend/js/systems.js` - System selection modal handler

#### Styling
- `frontend/css/style.css` - Global styles (colors, topbar, buttons, tables, badges)
- `frontend/css/map.css` - Leaflet customization, layout, sidebar, test browser, playback controls

#### Configuration Docs
- `README.md` - Architecture overview, API schema, OAuth setup
- `SETUP_AUTH.md` - Step-by-step Supabase + Google OAuth configuration
- `BUTTON_FIXES.md` - Auth flow fixes and implementation details

### Known Issues (as of latest session)

#### Auth System
- **Login Button:** Previously broken, fixed via auth.js
- **Upload Block:** Upload was blocked by auth check; fixed via viewer.js
- **API Hardcoding:** Previous hardcoded API endpoint; now dynamic via api.js

#### TODO Items in Code
- `viewer.js:168` - `renderHeatmap()` - Render heatmap with leaflet-heat, metric selection
- `viewer.js:173` - `renderPath()` - Render flight path as dashed line overlay
- `viewer.js:194` - `updateHeatmap()` - Re-render with new metric selected
- `viewer.js:198` - `toggleCompareMode()` - Side-by-side test comparison
- `viewer.js:202` - `togglePlayback()` - Animate drone along path
- `viewer.js:206` - `updatePlayback()` - Update playback position from slider

### Architecture

**Frontend Flow:**
1. User visits `moonlet-9sg.pages.dev`
2. Cloudflare Pages serves `frontend/index.html`
3. `viewer.js` initializes on DOM load
4. Loads tracks via `api.getTracks()`
5. User filters and selects test
6. Loads heatmap + path GeoJSON
7. Renders on Leaflet map

**Upload Flow:**
1. User navigates to upload page
2. 4-step wizard (upload.js state machine)
3. Step 1: Select GeoJSON files (heatmap + path)
4. Step 2: Map setup + pilot position
5. Step 3: Metadata (systems, track, profile, notes)
6. Step 4: Preview + publish
7. POSTs to API endpoint

### Colors & Theme
- **Dark Background:** `#0f1115` (--bg-dark)
- **Darker Background:** `#1a1d21` (--bg-darker)
- **Accent Orange:** `#ff8c42`
- **Accent Red:** `#ff4444`
- **Border:** `#333333` (--border-dim)
- **Text Light:** `#e5e7eb` (--fg-light)
- **Text Lighter:** `#f9fafb` (--fg-lighter)

### Critical CSS Classes
- `.topbar` - Navigation bar (56px height)
- `.sidebar` - Right sidebar (350px width, scrollable)
- `.test-item` - Test list item (clickable, selects test)
- `.metric-picker` - Radio buttons for heatmap metric
- `.test-detail-panel` - Floating info panel (bottom-left)
- `.playback-controls` - Slider + play button

### Responsive Breakpoints
- Desktop: ≥769px (full sidebar)
- Tablet: 481–768px (sidebar below map, max-height 300px)
- Mobile: ≤480px (hide topbar categories, compact layout)

### Form Inputs (upload.html)
- System Type: VRX, VTX, POWER, CONTROL_LINK
- Control Link Type (if CONTROL_LINK): Single, Diversity, Gemini
- Wind Speed: Calm, Light, Moderate, Strong
- Wind Direction: N, NE, E, SE, S, SW, W, NW

### Cloudflare Pages Setup

**Git Connection:**
- Repo: `ruslanblogua-boop/fpv-benchmark` (GitHub)
- Branch: `main`
- Auto-deploys on push

**Build Settings:**
- Framework Preset: None
- Build Command: _(leave blank — frontend is pre-built HTML/CSS/JS)_
- Build Output Directory: `/` (or leave blank)

**Environment Variables:** _(if needed)_
- Set in Cloudflare Pages dashboard
- Available to `frontend/*` via build time or client-side fetch

### Network Requests
All API calls route through `api.js`:
- `getAPIBase()` - returns configured API endpoint
- `setAPIToken(token)` - sets auth token for subsequent requests
- Requests include `Authorization: Bearer <token>` header

### Testing Checklist
- [ ] Deployment: Visit https://moonlet-9sg.pages.dev
- [ ] Page loads: HTML renders, CSS loads, no 404s
- [ ] Map: Leaflet loads, displays CartoDB dark tile layer
- [ ] Sidebar: Filters appear, test list loads
- [ ] Auth: Login button responsive, OAuth flow works
- [ ] Upload: Upload page accessible, wizard steps navigate correctly
- [ ] Heatmap: Test selection loads GeoJSON, renders on map (once `renderHeatmap()` implemented)

### Quick Debugging

**No tests loading?**
- Check `api.js`: does `getAPIBase()` return correct endpoint?
- Check browser DevTools → Network: are `getTracks()` / `getTests()` requests succeeding?
- Check console for errors (auth, CORS, JSON parsing)

**Map not showing?**
- Check Leaflet loaded: `window.L` defined?
- Check Supabase config: `api.createClient()` working?
- Check GeoJSON format: valid FeatureCollection?

**Upload stuck?**
- Check form validation: required fields filled?
- Check file selection: both GeoJSON files selected?
- Check console for JavaScript errors

### Useful Commands

**Local development (if server added later):**
```bash
cd /Users/ruslanyanko/Desktop/AI_Data/Moonlet_Website/fpv-heatmap
# Serve frontend locally
python3 -m http.server 8000 --directory frontend
# Open http://localhost:8000
```

**Graphify knowledge graph:**
```bash
cd /Users/ruslanyanko/Desktop/AI_Data/Moonlet_Website/fpv-heatmap
graphify-out/graph.html  # Open interactive graph in browser
# or
less graphify-out/GRAPH_REPORT.md  # Read analysis report
```

---

## History

| Date | Event |
|------|-------|
| 2026-05-03 | Verified Cloudflare Pages deployment, created graphify knowledge graph, generated this reference |
| | Auth system fixes: login button, upload block, API endpoint configuration |
| | Project structure: 15 code files + 3 docs = 18 total, ~7,879 words |

