#!/usr/bin/env python3
"""Embed the Community Resilience engine, sources and place configs into the standalone page."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'consoles/community-resilience/index.html'
PLACES = ROOT / 'consoles/community-resilience/places'
BLOCKS = [
    ('ENGINE', ROOT / 'public-data-runtime/community-resilience-engine.js'),
    ('SOURCES', ROOT / 'public-data-runtime/community-resilience-sources.js'),
]
ANCHOR = '<!-- COMMUNITY RESILIENCE RUNTIME -->'


def markers(name):
    return '<!-- BEGIN COMMUNITY RESILIENCE ' + name + ' -->', '<!-- END COMMUNITY RESILIENCE ' + name + ' -->'


def script_block(name, path):
    source = path.read_text().strip()
    if '</script' in source.lower():
        raise SystemExit(path.name + ' contains a closing script tag')
    start, end = markers(name)
    return start + '\n<script>\n' + source + '\n</script>\n' + end


def places_block():
    configs = []
    for path in sorted(PLACES.glob('*.json')):
        configs.append(json.loads(path.read_text()))
    text = json.dumps(configs, indent=1, ensure_ascii=False).replace('</', '<\\/')
    start, end = markers('PLACES')
    return start + '\n<script type="application/json" id="rs-places">' + text + '</script>\n' + end


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    blocks = [(name, script_block(name, path)) for name, path in BLOCKS] + [('PLACES', places_block())]
    html = TARGET.read_text()
    updated = html
    if markers('ENGINE')[0] not in updated:
        if args.check:
            parser.exit(1, 'Missing embedded Community Resilience runtime\n')
        assert updated.count(ANCHOR) == 1, 'runtime anchor missing from the page'
        updated = updated.replace(ANCHOR, '\n'.join(block for _, block in blocks))
    else:
        for name, block in blocks:
            start, end = markers(name)
            assert updated.count(start) == updated.count(end) == 1, name + ' markers must appear once'
            a, b = updated.index(start), updated.index(end) + len(end)
            updated = updated[:a] + block + updated[b:]
    order = [updated.index(markers(name)[0]) for name, _ in blocks]
    assert order == sorted(order), 'blocks must appear as engine, sources, places'
    if args.check and updated != html:
        parser.exit(1, 'Embedded Community Resilience runtime differs from its canonical files\n')
    if not args.check and updated != html:
        TARGET.write_text(updated)
    print('PASS: embedded Community Resilience runtime and places match their canonical files' if args.check else 'Embedded Community Resilience runtime and places')


if __name__ == '__main__':
    main()
