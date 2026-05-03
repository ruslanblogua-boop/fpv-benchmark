# fpv-heatmap — FPV Systems Benchmarking Platform

Community-driven FPV gear comparison platform. Upload GPS-correlated link quality tests on standardized tracks; compare heatmaps across pilots, systems, and conditions.

## Quick Links
- **BRIEFING.yaml** — Full spec, architecture, decisions
- **tools/walksnail_osd_parser.py** — Convert WalkSnail OSD files → CSV (ready to use)
- **tools/track_processor.py** — Convert CSV → GeoJSON (local processing)

## Architecture

```
User's Machine (local)
  ├─ OSD file (.osd)
  ├─ walksnail_osd_parser.py  → CSV
  └─ track_processor.py        → heatmap.geojson + path.geojson
              ↓
Website (minimal, display-only)
  ├─ Cloudflare Pages (frontend)
  ├─ Cloudflare Workers (API)
  ├─ Cloudflare D1 (metadata)
  └─ Cloudflare R2 (GeoJSON archive)
```

## Folder Structure

```
fpv-heatmap/
├── workers/              # Cloudflare Worker API
│   ├── src/
│   │   ├── index.ts              # Router + middleware
│   │   ├── lib/utils.ts          # JWT, CORS, helpers
│   │   └── routes/               # Handlers (auth, profiles, tracks, tests, upload)
│   ├── wrangler.toml             # Worker config
│   └── package.json
├── frontend/             # Static HTML/CSS/JS (deployed to Pages)
│   ├── index.html                # Public viewer
│   ├── upload.html               # Authenticated wizard
│   ├── profile.html              # User profiles & test mgmt
│   ├── js/
│   │   ├── api.js                # API client
│   │   ├── viewer.js             # Heatmap viewer
│   │   ├── upload.js             # Upload wizard
│   │   └── profile.js            # Profile page
│   ├── css/
│   │   ├── style.css             # Global styles
│   │   └── map.css               # Map & layout
│   └── package.json
├── db/
│   └── migrations/
│       └── 0001_initial.sql      # Database schema (COMPLETE)
├── tools/
│   ├── walksnail_osd_parser.py   # OSD → CSV (COMPLETE)
│   └── track_processor.py        # CSV → GeoJSON (COMPLETE)
├── Tests/                        # Sample test data
│   └── 02.05_VX35_non-standard/
├── package.json                  # Root workspace
├── .gitignore
└── BRIEFING.yaml                 # Full specification
```

## Setup Steps

### Phase 1: Cloudflare Setup (YOU NEED TO DO THIS)

**1. Create D1 Database:**
```bash
wrangler d1 create fpv-heatmap-db
```
Note the database ID, then paste into `workers/wrangler.toml` line 10:
```toml
database_id = "YOUR_DB_ID_HERE"
```

**2. Create R2 Bucket:**
```bash
wrangler r2 bucket create fpv-heatmap-storage
```

**3. Apply migrations:**
```bash
wrangler d1 migrations apply fpv-heatmap-db --local
```

**4. Set JWT secret (from Supabase):**
```bash
wrangler secret put SUPABASE_JWT_SECRET
# (paste your Supabase JWT secret when prompted)
```

**5. Update wrangler.toml:**
- Line 19: Set `SUPABASE_URL`
- Line 20: Set `FRONTEND_URL` to your domain

**6. Deploy Worker:**
```bash
cd workers
npm install
wrangler deploy
```

**7. Create Pages project:**
```bash
wrangler pages project create fpv-heatmap
```

### Phase 2: Supabase Setup (YOU NEED TO DO THIS)

**1. Create Supabase project** at supabase.com

**2. Enable Google OAuth:**
- Go to Auth → Providers → Google
- Add your credentials (or use test/test for development)

**3. Copy to wrangler.toml:**
- Project URL → line 19 (`SUPABASE_URL`)
- JWT Secret → save for `wrangler secret put`

**4. Set redirect URLs:**
- Auth → URL Configuration → Redirect URLs
- Add: `https://YOUR_DOMAIN.com/`

### Phase 3: Development

**Frontend (local dev):**
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5000
```

**Worker (local dev):**
```bash
cd workers
wrangler dev
# Listens on http://localhost:8787
```

**Database (local schema):**
```bash
npm run db:migrate
# Applies migrations to local D1
```

## How to Use

### Users (Pilots)

1. **Prepare your test locally:**
   ```bash
   python3 tools/walksnail_osd_parser.py path/to/file.osd
   python3 tools/track_processor.py file.csv \
     --lap-gate "[[52.1, 21.1], [52.2, 21.2]]" \
     --grid-size 1.0
   ```

2. **Upload on the website:**
   - Visit `/upload`
   - Login with Supabase (Google OAuth)
   - Select `heatmap.geojson` + `path.geojson`
   - Set metadata (system, track, weather, drone)
   - Publish

3. **View & Compare:**
   - Visit `/` to browse all published tests
   - Filter by track, category, system
   - Compare two tests side-by-side
   - Playback slider to scrub the flight path

### Admins

- Create & manage standard tracks
- Promote non-standard tracks to standard (when enough tests accumulate)

## API Endpoints

**Public:**
- `GET /api/health` — Health check
- `GET /api/tracks` — List all tracks
- `GET /api/tests` — List published tests (filterable)
- `GET /api/tests/:id/geojson/{heatmap|path}` — Download GeoJSON

**Authenticated:**
- `POST /api/auth/sync` — Sync Supabase user to D1
- `GET /api/me` / `PUT /api/me` — User profile
- `GET/POST/PUT/DEL /api/me/profiles` — Drone profiles
- `POST /api/tests` — Create draft
- `PUT /api/tests/:id` — Update draft metadata
- `POST /api/tests/:id/publish` — Publish
- `POST /api/upload/{heatmap|path}` — Upload GeoJSON to R2

**Admin:**
- `POST /api/tracks` — Create track
- `PUT /api/tracks/:slug` — Update track geometry
- `POST /api/tracks/:slug/promote` — Promote to standard

## File Format Reference

### Input: CSV (from parser)
```csv
frame_index,timestamp_ms,latitude,longitude,gps_locked,rc_snr_db,video_signal_level,bitrate_mbps,altitude_m,speed_ms,...
0,0,52.18123,21.13456,True,42,8,15.2,45.3,2.1,...
```

### Output: heatmap.geojson
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lon, lat] },
      "properties": {
        "avg_rc_snr": 38.5,
        "min_rc_snr": 10,
        "avg_bitrate": 12.3,
        "link_loss": false,
        "cell_samples": 45
      }
    }
  ],
  "metadata": { "grid_size_m": 1.0, "total_cells": 120 }
}
```

### Output: path.geojson
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lon, lat] },
      "properties": {
        "timestamp_ms": 1234,
        "bearing_deg": 45,
        "rc_snr_db": 42,
        "bitrate_mbps": 15.2,
        "altitude_m": 45.3,
        "speed_ms": 2.1,
        "lap_number": 1
      }
    }
  ]
}
```

## Testing

**Local test data provided:**
- `Tests/02.05_VX35_non-standard/` — Sample heatmap + path GeoJSON

**Parse a test OSD:**
```bash
python3 tools/walksnail_osd_parser.py Tests/02.05_VX35_non-standard/AvatarS0025.osd --output Tests/02.05_VX35_non-standard/output.csv
python3 tools/track_processor.py Tests/02.05_VX35_non-standard/output.csv --output Tests/02.05_VX35_non-standard/
```

## Next Steps

1. ✅ **Structure complete** — all files scaffolded
2. ⏳ **Await your Cloudflare/Supabase setup** — set placeholders in wrangler.toml + secrets
3. ⏳ **Implement Worker routes** — handlers in `workers/src/routes/`
4. ⏳ **Test locally** — `npm run dev:worker` + `npm run dev:frontend`
5. ⏳ **Deploy** — `npm run deploy:worker` + `npm run deploy:frontend`

## Storage Assumptions (Free Tier)

- **D1:** ~1 KB per test metadata (200 tests = 200 KB)
- **R2:** ~50 KB per test GeoJSON (200 tests = 10 MB)
- **Free egress:** ~1 GB/month

This is well within Cloudflare free tier limits.

## Questions?

Refer to `BRIEFING.yaml` for full technical spec, decisions, and rationale.
