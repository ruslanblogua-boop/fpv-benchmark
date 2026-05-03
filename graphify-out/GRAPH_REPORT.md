# Graph Report - .  (2026-05-03)

## Corpus Check
- Corpus is ~7,879 words - fits in a single context window. You may not need a graph.

## Summary
- 183 nodes · 276 edges · 17 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_FPVApi & Related|FPVApi & Related]]
- [[_COMMUNITY_track_processor.py & Related|track_processor.py & Related]]
- [[_COMMUNITY_upload.js & Related|upload.js & Related]]
- [[_COMMUNITY_.getTestHeatmap() & Related|.getTestHeatmap() & Related]]
- [[_COMMUNITY_Auth Flow Error Catch-22 of Broken Login and Upload Block & Related|Auth Flow Error: Catch-22 of Broken Login and Upload Block & Related]]
- [[_COMMUNITY_.setToken() & Related|.setToken() & Related]]
- [[_COMMUNITY_.getMe() & Related|.getMe() & Related]]
- [[_COMMUNITY_fetch() & Related|fetch() & Related]]
- [[_COMMUNITY_systems.js & Related|systems.js & Related]]
- [[_COMMUNITY_walksnail_osd_parser.py & Related|walksnail_osd_parser.py & Related]]
- [[_COMMUNITY_API Client Dynamic Configuration Changes  Hardcoded API Endpoint  API Endpoint Configuration|API Client Dynamic Configuration Changes / Hardcoded API Endpoint / API Endpoint Configuration]]
- [[_COMMUNITY_profiles.ts|profiles.ts]]
- [[_COMMUNITY_tests.ts|tests.ts]]
- [[_COMMUNITY_tracks.ts|tracks.ts]]
- [[_COMMUNITY_upload.ts|upload.ts]]
- [[_COMMUNITY_auth.ts|auth.ts]]
- [[_COMMUNITY_FPV Systems Benchmarking Platform|FPV Systems Benchmarking Platform]]

## God Nodes (most connected - your core abstractions)
1. `FPVApi` - 28 edges
2. `UploadWizard` - 25 edges
3. `HeatmapViewer` - 16 edges
4. `ProfilePage` - 12 edges
5. `AuthManager` - 11 edges
6. `SystemManager` - 10 edges
7. `main()` - 8 edges
8. `Supabase Authentication System File` - 6 edges
9. `System Architecture` - 6 edges
10. `add_bearings()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Supabase Google OAuth Configuration` --semantically_similar_to--> `Google OAuth Setup`  [INFERRED] [semantically similar]
  README.md → SETUP_AUTH.md
- `Supabase Authentication System File` --references--> `Supabase Credentials Configuration`  [INFERRED]
  BUTTON_FIXES.md → SETUP_AUTH.md
- `Frontend Supabase Configuration` --references--> `Supabase Authentication System File`  [EXTRACTED]
  SETUP_AUTH.md → BUTTON_FIXES.md
- `Upload Button Blocked by Auth Check` --shares_data_with--> `API Endpoints Specification`  [INFERRED]
  BUTTON_FIXES.md → README.md
- `Login Button Not Working` --rationale_for--> `Google OAuth Setup`  [EXTRACTED]
  BUTTON_FIXES.md → SETUP_AUTH.md

## Hyperedges (group relationships)
- **Complete Authentication System Setup and Implementation** — setup_auth_supabase_credentials, setup_auth_google_oauth, button_fixes_auth_js, button_fixes_viewer_js_changes, button_fixes_html_changes [EXTRACTED 1.00]
- **Dynamic API Endpoint Configuration System** — setup_auth_api_endpoint, button_fixes_hardcoded_api_issue, button_fixes_api_js_changes [EXTRACTED 1.00]

## Communities

### Community 0 - "FPVApi & Related"
Cohesion: 0.14
Nodes (2): FPVApi, getAPIBase()

### Community 1 - "track_processor.py & Related"
Cohesion: 0.12
Nodes (23): add_bearings(), calculate_bearing(), create_heatmap(), create_path(), detect_laps(), detect_link_loss(), filter_gps_locked(), grid_cell_key() (+15 more)

### Community 2 - "upload.js & Related"
Cohesion: 0.14
Nodes (1): UploadWizard

### Community 3 - ".getTestHeatmap() & Related"
Cohesion: 0.15
Nodes (1): HeatmapViewer

### Community 4 - "Auth Flow Error: Catch-22 of Broken Login and Upload Block & Related"
Cohesion: 0.11
Nodes (19): Auth Flow Error: Catch-22 of Broken Login and Upload Block, Supabase Authentication System File, HTML Files Script Loading Order Changes, Login Button Not Working, Configuration Guide for Developers, Upload Button Blocked by Auth Check, Login Button Implementation in Viewer, API Endpoints Specification (+11 more)

### Community 5 - ".setToken() & Related"
Cohesion: 0.17
Nodes (3): AuthManager, getSupabaseConfig(), initSupabase()

### Community 6 - ".getMe() & Related"
Cohesion: 0.22
Nodes (1): ProfilePage

### Community 7 - "fetch() & Related"
Cohesion: 0.19
Nodes (7): fetch(), withAdmin(), withAuth(), corsHeaders(), errorResponse(), jsonResponse(), verifyJWT()

### Community 8 - "systems.js & Related"
Cohesion: 0.27
Nodes (1): SystemManager

### Community 9 - "walksnail_osd_parser.py & Related"
Cohesion: 0.47
Nodes (5): main(), parse_osd_file(), parse_osd_frame(), Parse WalkSnail Avatar OSD file and extract frames., Extract telemetry from OSD grid.

### Community 10 - "API Client Dynamic Configuration Changes / Hardcoded API Endpoint / API Endpoint Configuration"
Cohesion: 1.0
Nodes (3): API Client Dynamic Configuration Changes, Hardcoded API Endpoint, API Endpoint Configuration

### Community 11 - "profiles.ts"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "tests.ts"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "tracks.ts"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "upload.ts"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "auth.ts"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "FPV Systems Benchmarking Platform"
Cohesion: 1.0
Nodes (1): FPV Systems Benchmarking Platform

## Knowledge Gaps
- **26 isolated node(s):** `Parse WalkSnail Avatar OSD file and extract frames.`, `Extract telemetry from OSD grid.`, `Load CSV from parser output.`, `Keep only GPS-locked frames.`, `Detect RC and video loss events.` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `profiles.ts`** (1 nodes): `profiles.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `tests.ts`** (1 nodes): `tests.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `tracks.ts`** (1 nodes): `tracks.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `upload.ts`** (1 nodes): `upload.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `auth.ts`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FPV Systems Benchmarking Platform`** (1 nodes): `FPV Systems Benchmarking Platform`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FPVApi` connect `FPVApi & Related` to `.getTestHeatmap() & Related`, `.setToken() & Related`, `.getMe() & Related`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `UploadWizard` connect `upload.js & Related` to `FPVApi & Related`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `fetch()` connect `fetch() & Related` to `FPVApi & Related`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **What connects `Parse WalkSnail Avatar OSD file and extract frames.`, `Extract telemetry from OSD grid.`, `Load CSV from parser output.` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `FPVApi & Related` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `track_processor.py & Related` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `upload.js & Related` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._