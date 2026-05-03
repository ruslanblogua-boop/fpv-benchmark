#!/usr/bin/env python3
"""
FPV Test Track Processor

Converts parsed OSD CSV into GeoJSON heatmaps and path files.
Usage:
    python3 track_processor.py <input.csv> --lap-gate "[[52.1, 21.1], [52.2, 21.2]]" --grid-size 1.0

Input CSV must have columns (from walksnail_osd_parser.py):
    frame_index, timestamp_ms, latitude, longitude, gps_locked, rc_snr_db,
    video_signal_level, bitrate_mbps, altitude_m, speed_ms, ...

Output:
    - heatmap.geojson (spatial grid cells with aggregated metrics)
    - path.geojson (time-ordered path for playback slider)
"""

import json
import sys
import argparse
import csv
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from math import atan2, degrees, radians, cos, sin, sqrt

def load_csv(filepath: str) -> List[Dict]:
    """Load CSV from parser output."""
    rows = []
    with open(filepath, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields
            row['timestamp_ms'] = int(float(row['timestamp_ms']))
            row['latitude'] = float(row['latitude'])
            row['longitude'] = float(row['longitude'])
            row['gps_locked'] = row['gps_locked'] == 'True'
            row['rc_snr_db'] = int(float(row['rc_snr_db'])) if row['rc_snr_db'] else 0
            row['video_signal_level'] = int(float(row['video_signal_level'])) if row['video_signal_level'] else 0
            row['bitrate_mbps'] = float(row['bitrate_mbps']) if row['bitrate_mbps'] else 0.0
            row['altitude_m'] = float(row['altitude_m']) if row['altitude_m'] else 0.0
            row['speed_ms'] = float(row['speed_ms']) if row['speed_ms'] else 0.0
            rows.append(row)
    return rows

def filter_gps_locked(rows: List[Dict]) -> List[Dict]:
    """Keep only GPS-locked frames."""
    return [r for r in rows if r['gps_locked']]

def detect_link_loss(rows: List[Dict]) -> Dict:
    """Detect RC and video loss events."""
    events = []
    in_loss = False
    loss_type = None
    loss_start = None

    for i, row in enumerate(rows):
        is_rc_loss = row['rc_snr_db'] == 0
        is_video_loss = row['bitrate_mbps'] == 0 or row['video_signal_level'] == 0

        current_loss_type = None
        if is_rc_loss and is_video_loss:
            current_loss_type = 'both'
        elif is_rc_loss:
            current_loss_type = 'rc'
        elif is_video_loss:
            current_loss_type = 'video'

        if current_loss_type and not in_loss:
            in_loss = True
            loss_type = current_loss_type
            loss_start = i
        elif not current_loss_type and in_loss:
            # Loss ended
            duration_ms = rows[i-1]['timestamp_ms'] - rows[loss_start]['timestamp_ms']
            if duration_ms > 0:
                events.append({
                    'lat': rows[loss_start]['latitude'],
                    'lon': rows[loss_start]['longitude'],
                    'timestamp_ms': rows[loss_start]['timestamp_ms'],
                    'type': loss_type,
                    'duration_ms': duration_ms,
                })
            in_loss = False
            loss_type = None

    return events

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing (0-360 degrees) from point 1 to point 2."""
    dlon = radians(lon2 - lon1)
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)

    x = sin(dlon) * cos(lat2_rad)
    y = cos(lat1_rad) * sin(lat2_rad) - sin(lat1_rad) * cos(lat2_rad) * cos(dlon)

    bearing = degrees(atan2(x, y))
    return (bearing + 360) % 360

def smooth_bearing(bearings: List[float], window: int = 5) -> List[float]:
    """Apply rolling average smoothing to bearing values."""
    if len(bearings) <= window:
        return bearings

    smoothed = []
    for i in range(len(bearings)):
        start = max(0, i - window // 2)
        end = min(len(bearings), i + window // 2 + 1)
        avg = sum(bearings[start:end]) / (end - start)
        smoothed.append(avg)
    return smoothed

def add_bearings(rows: List[Dict]) -> List[Dict]:
    """Calculate and smooth bearing for each point."""
    if len(rows) < 2:
        return rows

    bearings = []
    for i in range(len(rows)):
        if i == 0:
            # Use heading to next point, or 0 if no movement
            if i + 1 < len(rows):
                bearing = calculate_bearing(rows[i]['latitude'], rows[i]['longitude'],
                                           rows[i+1]['latitude'], rows[i+1]['longitude'])
            else:
                bearing = 0.0
        else:
            # Calculate from previous point to current
            bearing = calculate_bearing(rows[i-1]['latitude'], rows[i-1]['longitude'],
                                       rows[i]['latitude'], rows[i]['longitude'])

        # Freeze bearing if speed < 3 km/h
        speed_kmh = rows[i]['speed_ms'] * 3.6
        if speed_kmh < 3:
            if bearings:
                bearing = bearings[-1]
            else:
                bearing = 0.0

        bearings.append(bearing)

    # Smooth bearings (5-point rolling average)
    bearings = smooth_bearing(bearings, window=5)

    for i, row in enumerate(rows):
        row['bearing_deg'] = bearings[i]

    return rows

def detect_laps(rows: List[Dict], lap_gate: List[Tuple[float, float]]) -> List[Dict]:
    """Detect lap crossings based on lap gate line."""
    if not lap_gate or len(lap_gate) < 2:
        # No lap detection
        for row in rows:
            row['lap_number'] = 1
        return rows

    gate_p1 = lap_gate[0]
    gate_p2 = lap_gate[1]

    lap_number = 0
    last_side = None
    min_lap_duration = 10000  # 10 seconds in ms
    last_crossing_time = -min_lap_duration - 1

    for i, row in enumerate(rows):
        if i == 0:
            row['lap_number'] = 1
            continue

        # Check if point crosses the gate line
        curr = (row['latitude'], row['longitude'])
        prev = (rows[i-1]['latitude'], rows[i-1]['longitude'])

        # Simple point-in-line-segment check (simplified 2D cross product)
        cross = line_side(gate_p1, gate_p2, curr) * line_side(gate_p1, gate_p2, prev)

        current_time = row['timestamp_ms']

        # Start at 5 seconds (ignore takeoff noise)
        if current_time < 5000:
            row['lap_number'] = 1
            continue

        # Detect crossing and respect minimum lap duration
        if cross < 0 and (current_time - last_crossing_time) > min_lap_duration:
            lap_number += 1
            last_crossing_time = current_time

        row['lap_number'] = max(1, lap_number)

    return rows

def line_side(p1: Tuple[float, float], p2: Tuple[float, float],
              p: Tuple[float, float]) -> float:
    """Calculate which side of the line point p is on."""
    return (p2[0] - p1[0]) * (p[1] - p1[1]) - (p2[1] - p1[1]) * (p[0] - p1[0])

def grid_cell_key(lat: float, lon: float, grid_size_m: float) -> Tuple[int, int]:
    """Map lat/lon to grid cell key based on grid size."""
    # Approximate: 1 degree ≈ 111 km
    meters_per_degree = 111000
    grid_degrees = grid_size_m / meters_per_degree

    cell_x = int(lon / grid_degrees)
    cell_y = int(lat / grid_degrees)
    return (cell_x, cell_y)

def create_heatmap(rows: List[Dict], grid_size_m: float) -> Dict:
    """Create heatmap GeoJSON with spatial aggregation."""
    cells: Dict[Tuple, Dict] = {}

    for row in rows:
        key = grid_cell_key(row['latitude'], row['longitude'], grid_size_m)

        if key not in cells:
            cells[key] = {
                'lat_sum': 0.0,
                'lon_sum': 0.0,
                'count': 0,
                'samples': [],
                'rc_snr_values': [],
                'bitrate_values': [],
                'video_signal_values': [],
                'altitude_values': [],
                'speed_values': [],
                'has_rc_loss': False,
                'has_video_loss': False,
            }

        cell = cells[key]
        cell['lat_sum'] += row['latitude']
        cell['lon_sum'] += row['longitude']
        cell['count'] += 1
        cell['samples'].append(row)
        cell['rc_snr_values'].append(row['rc_snr_db'])
        cell['bitrate_values'].append(row['bitrate_mbps'])
        cell['video_signal_values'].append(row['video_signal_level'])
        cell['altitude_values'].append(row['altitude_m'])
        cell['speed_values'].append(row['speed_ms'])

        if row['rc_snr_db'] == 0:
            cell['has_rc_loss'] = True
        if row['bitrate_mbps'] == 0 or row['video_signal_level'] == 0:
            cell['has_video_loss'] = True

    features = []
    for key, cell in cells.items():
        lat_avg = cell['lat_sum'] / cell['count']
        lon_avg = cell['lon_sum'] / cell['count']

        rc_snr_values = [v for v in cell['rc_snr_values'] if v > 0]
        bitrate_values = [v for v in cell['bitrate_values'] if v > 0]

        properties = {
            'avg_rc_snr': sum(rc_snr_values) / len(rc_snr_values) if rc_snr_values else 0,
            'min_rc_snr': min(rc_snr_values) if rc_snr_values else 0,
            'max_rc_snr': max(rc_snr_values) if rc_snr_values else 0,
            'avg_bitrate': sum(bitrate_values) / len(bitrate_values) if bitrate_values else 0,
            'min_bitrate': min(bitrate_values) if bitrate_values else 0,
            'max_bitrate': max(bitrate_values) if bitrate_values else 0,
            'avg_video_signal': sum(cell['video_signal_values']) / len(cell['video_signal_values']),
            'min_video_signal': min(cell['video_signal_values']),
            'avg_altitude': sum(cell['altitude_values']) / len(cell['altitude_values']),
            'avg_speed': sum(cell['speed_values']) / len(cell['speed_values']),
            'cell_samples': cell['count'],
            'link_loss': cell['has_rc_loss'] or cell['has_video_loss'],
            'link_loss_type': (
                'both' if (cell['has_rc_loss'] and cell['has_video_loss'])
                else 'rc' if cell['has_rc_loss']
                else 'video' if cell['has_video_loss']
                else None
            ),
        }

        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [lon_avg, lat_avg],
            },
            'properties': properties,
        }
        features.append(feature)

    return {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'grid_size_m': grid_size_m,
            'total_cells': len(features),
        },
    }

def create_path(rows: List[Dict]) -> Dict:
    """Create path GeoJSON for playback slider."""
    features = []

    for row in rows:
        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [row['longitude'], row['latitude']],
            },
            'properties': {
                'timestamp_ms': row['timestamp_ms'],
                'bearing_deg': row.get('bearing_deg', 0),
                'rc_snr_db': row['rc_snr_db'],
                'bitrate_mbps': row['bitrate_mbps'],
                'video_signal_level': row['video_signal_level'],
                'altitude_m': row['altitude_m'],
                'speed_ms': row['speed_ms'],
                'lap_number': row.get('lap_number', 1),
            },
        }
        features.append(feature)

    return {
        'type': 'FeatureCollection',
        'features': features,
    }

def main():
    parser = argparse.ArgumentParser(description='Convert OSD CSV to heatmap GeoJSON')
    parser.add_argument('input', help='Input CSV file')
    parser.add_argument('--lap-gate', type=str, help='Lap gate as JSON [[lat1,lon1],[lat2,lon2]]')
    parser.add_argument('--grid-size', type=float, default=1.0, help='Grid size in meters (default: 1.0)')
    parser.add_argument('--output-dir', default='.', help='Output directory')

    args = parser.parse_args()

    print(f"Loading {args.input}...")
    rows = load_csv(args.input)
    print(f"  Loaded {len(rows)} frames")

    print("Filtering GPS-locked frames...")
    rows = filter_gps_locked(rows)
    print(f"  {len(rows)} GPS-locked frames")

    print("Calculating bearings...")
    rows = add_bearings(rows)

    print("Detecting link loss events...")
    link_loss_events = detect_link_loss(rows)
    print(f"  Found {len(link_loss_events)} link loss events")

    if args.lap_gate:
        print("Detecting laps...")
        lap_gate = json.loads(args.lap_gate)
        rows = detect_laps(rows, lap_gate)

    print(f"Creating heatmap (grid size: {args.grid_size}m)...")
    heatmap = create_heatmap(rows, args.grid_size)

    print("Creating path...")
    path = create_path(rows)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    heatmap_file = output_dir / 'heatmap.geojson'
    path_file = output_dir / 'path.geojson'

    print(f"Writing {heatmap_file}...")
    with open(heatmap_file, 'w') as f:
        json.dump(heatmap, f, indent=2)

    print(f"Writing {path_file}...")
    with open(path_file, 'w') as f:
        json.dump(path, f, indent=2)

    print("Done!")

if __name__ == '__main__':
    main()
