#!/usr/bin/env python3
"""
WalkSnail Avatar OSD Parser

Converts WalkSnail Avatar .osd files to CSV format.
Usage:
    python3 walksnail_osd_parser.py <file.osd> [output.csv] [--all-frames]

Output CSV columns:
    frame_index, timestamp_ms, latitude, longitude, gps_locked, rc_snr_db,
    video_signal_level, bitrate_mbps, altitude_m, distance_m, speed_ms,
    battery_cells, battery_pct, timer_s
"""

import struct
import sys
import argparse
import csv

def parse_osd_file(filename):
    """Parse WalkSnail Avatar OSD file and extract frames."""
    with open(filename, 'rb') as f:
        # Read header
        magic = f.read(4)
        if magic != b'BTFL':
            raise ValueError(f"Invalid OSD file: magic is {magic}, expected BTFL")

        # Skip rest of header (40 bytes total)
        f.read(36)

        frames = []
        frame_num = 0

        while True:
            frame_data = f.read(2124)
            if len(frame_data) < 2124:
                break

            # Parse frame
            try:
                timestamp_ms = struct.unpack('<I', frame_data[0:4])[0]
                grid = frame_data[4:]  # 2120 bytes of OSD grid

                frame = parse_osd_frame(grid, timestamp_ms, frame_num)
                frames.append(frame)
                frame_num += 1
            except Exception as e:
                print(f"Warning: Error parsing frame {frame_num}: {e}", file=sys.stderr)
                continue

        return frames

def parse_osd_frame(grid, timestamp_ms, frame_index):
    """Extract telemetry from OSD grid."""
    # Grid is 53 cols × 20 rows of uint16 char indices

    def get_cell(row, col):
        """Get character index at grid position."""
        try:
            idx = (row * 53 + col) * 2
            return struct.unpack('<H', grid[idx:idx+2])[0]
        except:
            return 0

    def get_number_at(row, col, length):
        """Extract number from consecutive cells."""
        chars = []
        for i in range(length):
            c = get_cell(row, col + i)
            if c < 256:
                chars.append(chr(c))
            else:
                chars.append('0')
        text = ''.join(chars).strip()
        try:
            # Handle decimal points
            if '.' in text:
                return float(text)
            return int(text)
        except:
            return 0

    # Extract fields from known OSD positions (based on BRIEFING.yaml)

    # Row 1: Video signal bars + bitrate
    video_signal_level = min(9, max(0, get_cell(1, 4) - 816))  # glyph range 816-825
    bitrate_mbps = get_number_at(1, 18, 5)  # approximately

    # Row 2: Battery + RC SNR
    battery_str = ''.join(chr(get_cell(2, i)) if get_cell(2, i) < 256 else '0' for i in range(3, 10))
    rc_snr_db = get_number_at(2, 15, 3)

    # Row 4: Altitude
    altitude_m = get_number_at(4, 6, 5)

    # Row 12: Distance
    distance_m = get_number_at(12, 8, 6)

    # Row 13: Speed
    speed_ms = get_number_at(13, 8, 5)

    # Row 17: Timer
    timer_str = ''.join(chr(get_cell(17, i)) if get_cell(17, i) < 256 else '0' for i in range(15, 20))

    # Row 19: GPS coordinates
    lon_str = ''.join(chr(get_cell(19, i)) if get_cell(19, i) < 256 else '0' for i in range(15, 23))
    lat_str = ''.join(chr(get_cell(19, i)) if get_cell(19, i) < 256 else '0' for i in range(23, 31))

    # Parse GPS
    try:
        longitude = float(lon_str.strip()) if lon_str.strip() else 0.0
        latitude = float(lat_str.strip()) if lat_str.strip() else 0.0
        gps_locked = latitude != 0 and longitude != 0
    except:
        longitude = 0.0
        latitude = 0.0
        gps_locked = False

    # Parse battery
    battery_cells = 0
    battery_pct = 0
    try:
        parts = battery_str.split(':')
        if len(parts) >= 2:
            battery_cells = int(parts[0].strip('SC'))
            battery_pct = int(parts[1].strip('%'))
    except:
        pass

    # Parse timer (MM:SS format)
    timer_s = 0
    try:
        parts = timer_str.split(':')
        if len(parts) >= 2:
            timer_s = int(parts[0]) * 60 + int(parts[1])
    except:
        pass

    return {
        'frame_index': frame_index,
        'timestamp_ms': timestamp_ms,
        'timestamp_s': timestamp_ms / 1000.0,
        'latitude': latitude,
        'longitude': longitude,
        'gps_locked': gps_locked,
        'rc_snr_db': rc_snr_db,
        'video_signal_level': video_signal_level,
        'bitrate_mbps': bitrate_mbps,
        'altitude_m': altitude_m,
        'distance_m': distance_m,
        'speed_ms': speed_ms,
        'battery_cells': battery_cells,
        'battery_pct': battery_pct,
        'timer_s': timer_s,
    }

def main():
    parser = argparse.ArgumentParser(description='Parse WalkSnail OSD file to CSV')
    parser.add_argument('input', help='Input .osd file')
    parser.add_argument('--output', '-o', help='Output CSV file (default: stdout)')
    parser.add_argument('--all-frames', action='store_true', help='Include GPS-unlocked frames')

    args = parser.parse_args()

    print(f"Parsing {args.input}...", file=sys.stderr)
    frames = parse_osd_file(args.input)
    print(f"  Parsed {len(frames)} frames", file=sys.stderr)

    # Filter GPS-locked frames by default
    if not args.all_frames:
        frames = [f for f in frames if f['gps_locked']]
        print(f"  {len(frames)} GPS-locked frames", file=sys.stderr)

    # Write CSV
    output_file = args.output or sys.stdout
    mode = 'w' if isinstance(output_file, str) else 'w'

    with open(output_file, mode) if isinstance(output_file, str) else sys.stdout as f:
        writer = csv.DictWriter(f, fieldnames=[
            'frame_index', 'timestamp_ms', 'timestamp_s', 'latitude', 'longitude',
            'gps_locked', 'rc_snr_db', 'video_signal_level', 'bitrate_mbps',
            'altitude_m', 'distance_m', 'speed_ms', 'battery_cells', 'battery_pct', 'timer_s'
        ])
        writer.writeheader()
        writer.writerows(frames)

    if isinstance(output_file, str):
        print(f"Wrote {len(frames)} frames to {output_file}", file=sys.stderr)

if __name__ == '__main__':
    main()
