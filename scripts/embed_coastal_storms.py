#!/usr/bin/env python3
"""Embed the recorded storm data and its engine analysis in the Coastal console, so the page works offline.
Sources: consoles/coastal-water-resilience/data/storm-gauges.json and storm-analysis.json. --check fails if they differ."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'consoles/coastal-water-resilience/index.html'
DATA = ROOT / 'consoles/coastal-water-resilience/data'
START, END = '<!-- BEGIN COASTAL STORMS -->', '<!-- END COASTAL STORMS -->'
ANCHOR = '<script type="application/json" id="public-station-snapshot">'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    blocks = []
    for name, key in (('storm-gauges.json', 'coastal-storm-gauges'), ('storm-analysis.json', 'coastal-storm-analysis')):
        text = (DATA / name).read_text().strip().replace('<', '\\u003c')
        blocks.append(f'<script type="application/json" id="{key}">{text}</script>')
    block = START + '\n' + '\n'.join(blocks) + '\n' + END
    html = TARGET.read_text()
    if START in html:
        assert html.count(START) == html.count(END) == 1
        a, b = html.index(START), html.index(END) + len(END)
        updated = html[:a] + block + html[b:]
    else:
        if args.check:
            parser.exit(1, 'Missing embedded storm data\n')
        assert html.count(ANCHOR) == 1
        updated = html.replace(ANCHOR, block + '\n' + ANCHOR, 1)
    if args.check and updated != html:
        parser.exit(1, 'Embedded storm data differs from its source files\n')
    if not args.check and updated != html:
        TARGET.write_text(updated)
    print('PASS: embedded storm data matches its source files' if args.check else 'Embedded recorded storm data and analysis')

if __name__ == '__main__':
    main()
