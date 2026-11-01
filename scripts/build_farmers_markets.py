#!/usr/bin/env python3
"""Build the Food Desert Oases farmers market snapshot from USDA's own directory download.

USDA's Local Food Directories offers the full farmers market directory with no key:
https://www.usdalocalfoodportal.com/fe/datasharing/ (Data Sharing, Download Selected Directory Data).
Download it in a browser, then run:

  python3 scripts/build_farmers_markets.py PATH_TO_DOWNLOAD --date YYYY-MM-DD

Pass the date you downloaded it. With --check, this validates the committed snapshot and needs no network.
"""
import argparse
import json
import pathlib
import re
import sys

OUT = pathlib.Path(__file__).resolve().parent.parent / 'consoles/food-desert-oases/data/usda-farmers-markets.json'
FIELDS = ['name', 'address', 'lat', 'lon', 'updated', 'programs']
SOURCE = 'USDA Local Food Directories, farmers market directory (USDA Agricultural Marketing Service)'
SOURCE_URL = 'https://www.usdalocalfoodportal.com/fe/datasharing/'
# Rough state boxes (south, north, west, east), only to catch coordinates in the wrong state or country.
BOX = {'AL': (30.1, 35.1, -88.6, -84.8), 'AK': (51, 71.6, -180, -129), 'AZ': (31.2, 37.1, -115, -109), 'AR': (33, 36.6, -94.7, -89.6), 'CA': (32.4, 42.1, -124.6, -114), 'CO': (36.9, 41.1, -109.1, -102), 'CT': (40.9, 42.1, -73.8, -71.7), 'DE': (38.4, 39.9, -75.8, -75), 'DC': (38.7, 39, -77.2, -76.9), 'FL': (24.4, 31.1, -87.7, -79.9), 'GA': (30.3, 35.1, -85.7, -80.8), 'HI': (18.8, 22.4, -160.4, -154.7), 'ID': (41.9, 49.1, -117.3, -111), 'IL': (36.9, 42.6, -91.6, -87.4), 'IN': (37.7, 41.8, -88.2, -84.7), 'IA': (40.3, 43.6, -96.7, -90.1), 'KS': (36.9, 40.1, -102.1, -94.5), 'KY': (36.4, 39.2, -89.6, -81.9), 'LA': (28.9, 33.1, -94.1, -88.8), 'ME': (42.9, 47.5, -71.1, -66.9), 'MD': (37.8, 39.8, -79.5, -75), 'MA': (41.2, 42.9, -73.6, -69.9), 'MI': (41.6, 48.3, -90.5, -82.1), 'MN': (43.4, 49.4, -97.3, -89.4), 'MS': (30.1, 35.1, -91.7, -88), 'MO': (35.9, 40.7, -95.8, -89.1), 'MT': (44.3, 49.1, -116.1, -104), 'NE': (39.9, 43.1, -104.1, -95.3), 'NV': (35, 42.1, -120.1, -114), 'NH': (42.6, 45.4, -72.6, -70.6), 'NJ': (38.9, 41.4, -75.6, -73.9), 'NM': (31.3, 37.1, -109.1, -103), 'NY': (40.4, 45.1, -79.8, -71.8), 'NC': (33.8, 36.6, -84.4, -75.4), 'ND': (45.9, 49.1, -104.1, -96.5), 'OH': (38.4, 42.4, -84.9, -80.5), 'OK': (33.6, 37.1, -103.1, -94.4), 'OR': (41.9, 46.3, -124.7, -116.4), 'PA': (39.7, 42.3, -80.6, -74.6), 'RI': (41.1, 42.1, -71.9, -71.1), 'SC': (32, 35.3, -83.4, -78.5), 'SD': (42.4, 46, -104.1, -96.4), 'TN': (34.9, 36.7, -90.4, -81.6), 'TX': (25.8, 36.6, -106.7, -93.5), 'UT': (36.9, 42.1, -114.1, -109), 'VT': (42.7, 45.1, -73.5, -71.4), 'VA': (36.5, 39.5, -83.7, -75.2), 'WA': (45.5, 49.1, -124.9, -116.9), 'WV': (37.1, 40.7, -82.7, -77.7), 'WI': (42.4, 47.1, -92.9, -86.2), 'WY': (40.9, 45.1, -111.1, -104), 'PR': (17.8, 18.6, -67.4, -65.2), 'VI': (17.6, 18.5, -65.1, -64.5), 'GU': (13.2, 13.7, 144.6, 145), 'AS': (-14.4, -11, -171, -168), 'MP': (14, 20.6, 144.8, 146)}
NAMES = {'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY', 'puerto rico': 'PR'}
MARGIN = 0.3


def clean(value, limit):
    text = re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', str(value or ''))).strip()
    text = text.replace('—', ' - ').replace('–', '-')
    return '' if text.lower() == 'none' else text[:limit].strip()


def state_of(address):
    tail = re.sub(r',?\s*(USA|United States)\.?$', '', address, flags=re.I)
    codes = re.findall(r'\b([A-Z]{2})\b', tail)
    for code in reversed(codes):
        if code in BOX:
            return code
    low = tail.lower()
    # Longest names first, so West Virginia is not read as Virginia.
    for name in sorted(NAMES, key=len, reverse=True):
        if re.search(r'\b' + name + r'\b', low):
            return NAMES[name]
    return None


def in_box(code, lat, lon):
    south, north, west, east = BOX[code]
    if code == 'AK' and lon > 170:
        return south - MARGIN <= lat <= north + MARGIN
    return south - MARGIN <= lat <= north + MARGIN and west - MARGIN <= lon <= east + MARGIN


def programs(row):
    text = str(row.get('FNAP') or '') + ';' + str(row.get('SNAP_option') or '')
    found = []
    if re.search(r'\bSNAP\b|\bEBT\b', text):
        found.append('SNAP or EBT')
    if re.search(r'\bWIC\b', text):
        found.append('WIC')
    if re.search(r'SFMNP|senior', text, re.I):
        found.append('Senior Farmers Market Nutrition Program')
    return found


def build(rows, date):
    out, dropped = [], {'no coordinates': 0, 'coordinates outside its state or the U.S.': 0, 'no name': 0}
    seen = set()
    for row in rows:
        name = clean(row.get('listing_name'), 140)
        address = re.sub(r',?\s*(USA|United States)\.?$', '', clean(row.get('location_address'), 200), flags=re.I)
        try:
            lat, lon = float(row.get('location_y')), float(row.get('location_x'))
        except (TypeError, ValueError):
            dropped['no coordinates'] += 1
            continue
        if not name:
            dropped['no name'] += 1
            continue
        code = state_of(address)
        if not (in_box(code, lat, lon) if code else any(in_box(c, lat, lon) for c in BOX)):
            dropped['coordinates outside its state or the U.S.'] += 1
            continue
        key = (name.lower(), round(lat, 4), round(lon, 4))
        if key in seen:
            continue
        seen.add(key)
        updated = clean(row.get('update_time'), 10)
        out.append([name, address, round(lat, 5), round(lon, 5), updated if re.fullmatch(r'\d{4}-\d{2}-\d{2}', updated) else '', programs(row)])
    out.sort(key=lambda r: (r[2], r[3]))
    return {'source': SOURCE, 'sourceUrl': SOURCE_URL, 'downloaded': date, 'listedInDownload': len(rows), 'dropped': dropped, 'fields': FIELDS, 'rows': out}


def check(data):
    assert data['fields'] == FIELDS and re.fullmatch(r'\d{4}-\d{2}-\d{2}', data['downloaded']), 'bad header'
    assert len(data['rows']) > 5000, 'too few rows'
    for row in data['rows']:
        assert len(row) == len(FIELDS) and row[0] and isinstance(row[2], float) and isinstance(row[3], float) and isinstance(row[5], list), row
    return f"{len(data['rows'])} markets, downloaded {data['downloaded']}"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('download', nargs='?')
    ap.add_argument('--date')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    if a.check:
        print('PASS: farmers market snapshot,', check(json.loads(OUT.read_text())))
        return
    if not a.download or not a.date:
        sys.exit('Pass the downloaded file and --date YYYY-MM-DD.')
    data = build(json.loads(pathlib.Path(a.download).read_text(errors='replace')), a.date)
    check(data)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Wrote {OUT.name}: {len(data['rows'])} of {data['listedInDownload']} listings; dropped {data['dropped']}; {OUT.stat().st_size} bytes")


if __name__ == '__main__':
    main()
