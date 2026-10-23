#!/usr/bin/env python3
"""Keep Coastal's public-data planning engine portable and independently testable."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'consoles/coastal-water-resilience/index.html'
START = '<!-- BEGIN PUBLIC COASTAL PLANNING -->'
END = '<!-- END PUBLIC COASTAL PLANNING -->'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    source = (ROOT / 'public-data-runtime/coastal-planning.js').read_text().strip()
    block = START + '\n<script>\n' + source + '\n</script>\n' + END
    html = TARGET.read_text()
    if START not in html:
        if args.check:
            parser.exit(1, 'Missing embedded public Coastal engine\n')
        anchor = '<script>\n/* ===== SYNTHETIC NETWORK'
        assert html.count(anchor) == 1
        updated = html.replace(anchor, block + '\n' + anchor)
    else:
        assert html.count(START) == html.count(END) == 1
        a, b = html.index(START), html.index(END) + len(END)
        updated = html[:a] + block + html[b:]
    if args.check and updated != html:
        parser.exit(1, 'Public Coastal engine differs from its canonical source\n')
    if not args.check and updated != html:
        TARGET.write_text(updated)
    print('PASS: canonical public Coastal planning engine matches standalone HTML' if args.check else 'Embedded public Coastal planning engine')

if __name__ == '__main__':
    main()
