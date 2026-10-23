#!/usr/bin/env python3
"""Publish complete, dated Public Health Scotland reports without provider keys."""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request

from refresh_grid_snapshot import atomic_outputs

ROOT = Path(__file__).resolve().parents[1]
PAGE = Path('consoles/nhs-scotland-strain/index.html')
DATA = PAGE.parent / 'data/latest.json'
SNAP = re.compile(r'^let SNAP=(.*);$', re.M)
RESOURCES = {
    'ae': 'a5f7ca94-c810-41b5-a7c9-25c18d43e5a4',
    'sites': '1a4e3f48-3d9b-4769-80e9-3ef6d27852fe',
    'beds': 'f272bb7d-5320-4491-84c1-614a2c064007',
    'dd': '49ca8a39-7f01-4e2b-acd6-205bc9827852',
    'flow': '083ee176-4729-474b-958a-328954b72a5a',
}
BOARDS = dict(zip(
    ['S08000015','S08000016','S08000017','S08000019','S08000020','S08000022','S08000024',
     'S08000025','S08000026','S08000028','S08000029','S08000030','S08000031','S08000032'],
    ['NHS Ayrshire & Arran','NHS Borders','NHS Dumfries & Galloway','NHS Forth Valley',
     'NHS Grampian','NHS Highland','NHS Lothian','NHS Orkney','NHS Shetland',
     'NHS Western Isles','NHS Fife','NHS Tayside','NHS Greater Glasgow & Clyde','NHS Lanarkshire']))
FLOW_ORIGINS = set(BOARDS) | {'RA2701', 'RA2702', 'RA2703', 'RA2704'}
FLOW_PROVIDERS = set(BOARDS) | {'S27000001', 'SB0801'}


def quarter_end(quarter):
    if not isinstance(quarter, str) or not re.fullmatch(r'20\d{2}Q[1-4]', quarter):
        raise ValueError('Invalid quarter')
    year, q = int(quarter[:4]), int(quarter[-1])
    return dt.date(year + (q == 4), 1 if q == 4 else q * 3 + 1, 1) - dt.timedelta(days=1)


def collect_care_use(rows):
    """Published SMR01 stays by residence→treatment, never transfers/people.

    Preserve explicit zero cells. Unpublished cells are not filled with zero;
    disclosure/missing tokens fail closed until their meaning can be reviewed.
    """
    quarter = max(row['Quarter'] for row in rows)
    selected = [row for row in rows if row['Quarter'] == quarter]
    cells, seen = [], set()
    for row in selected:
        origin, target = row['HBR'], row['HBT']
        if origin not in FLOW_ORIGINS or target not in FLOW_PROVIDERS or (origin, target) in seen:
            raise ValueError('Unknown/duplicate residence-treatment identity')
        seen.add((origin, target))
        stays, episodes = number(row['Stays'], True), number(row['Episodes'], True)
        flag = str(row['CrossBoundaryFlag'])
        if flag not in {'0', '1'} or stays > episodes:
            raise ValueError('Inconsistent published care-use counts/boundary flag')
        cells.append({'residence': origin, 'treatment': target, 'stays': stays, 'episodes': episodes,
                      'crossBoundary': origin != target, 'sourceBoundaryFlag': int(flag)})
    cohort = [row for row in cells if row['residence'] in BOARDS]
    reported = len(cohort)
    # A provider with no published cell is still an eligible unknown column.
    providers = sorted(FLOW_PROVIDERS)
    return {'quarter': quarter, 'quarterQualifier': sorted({row['QuarterQF'] for row in selected if row['QuarterQF']}),
            'sourceId': 'flow', 'measure': 'published inpatient/day-case stays',
            'direction': 'board of residence to board of treatment', 'residenceBoards': sorted(BOARDS),
            'providerCodes': providers, 'cells': sorted(cells, key=lambda row: (row['residence'], row['treatment'])),
            'publishedCellCount': len(cells), 'cohortCellCount': reported,
            'unreportedCohortCells': len(BOARDS) * len(providers) - reported,
            'totalStays': sum(row['stays'] for row in cohort),
            'outsideBoardStays': sum(row['stays'] for row in cohort if row['crossBoundary']),
            'missingCellMeaning': 'Unpublished cells remain unknown, not zero. Any nonnumeric/suppressed cell rejects refresh.',
            'boundaryMethod': 'Compare paired HBR and HBT codes directly. Raw source flag is retained for audit; its dictionary wording contradicts the currently published values.',
            'limitations': 'Repeated stays, not unique patients or interhospital transfers. Special provider codes retain source identities. Published counts may be disclosure-controlled; this is a reported numeric-stay share, not all care need or current capacity.'}


def validate_care_use(data, captured, baseline=None):
    if not isinstance(data, dict) or data.get('sourceId') != 'flow' or data.get('measure') != 'published inpatient/day-case stays' or data.get('direction') != 'board of residence to board of treatment':
        raise ValueError('Invalid care-use estimand/source')
    if quarter_end(data['quarter']) > captured.date():
        raise ValueError('Future care-use quarter')
    if data.get('residenceBoards') != sorted(BOARDS) or not isinstance(data.get('cells'), list) or not isinstance(data.get('quarterQualifier'), list) or any(q not in {'p','r'} for q in data['quarterQualifier']):
        raise ValueError('Incomplete care-use origin coverage')
    seen, origins, providers, cohort = set(), set(), set(), []
    for row in data['cells']:
        a, b = row['residence'], row['treatment']
        if a not in FLOW_ORIGINS or b not in FLOW_PROVIDERS or (a, b) in seen or type(row.get('crossBoundary')) is not bool or row['crossBoundary'] != (a != b) or type(row.get('sourceBoundaryFlag')) is not int or row['sourceBoundaryFlag'] not in {0,1}:
            raise ValueError('Invalid/duplicate care-use cell identity')
        seen.add((a,b)); origins.add(a); providers.add(b)
        stays, episodes = number(row['stays'],True), number(row['episodes'],True)
        if stays > episodes or episodes > 2**53-1:
            raise ValueError('Invalid care-use count')
        if a in BOARDS: cohort.append(row)
    if not set(BOARDS) <= origins or not all((code,code) in seen for code in BOARDS):
        raise ValueError('Missing territorial origin/self-cell; absence is not zero')
    total, outside = sum(r['stays'] for r in cohort), sum(r['stays'] for r in cohort if r['crossBoundary'])
    if not total or total > 2**53-1 or data.get('providerCodes') != sorted(FLOW_PROVIDERS) or data.get('publishedCellCount') != len(seen) or data.get('cohortCellCount') != len(cohort) or data.get('unreportedCohortCells') != len(BOARDS)*len(FLOW_PROVIDERS)-len(cohort) or data.get('totalStays') != total or data.get('outsideBoardStays') != outside:
        raise ValueError('Care-use denominator or coverage controls disagree')
    if baseline:
        if data['quarter'] < baseline['quarter']:
            raise ValueError('Care-use quarter regressed')
        if data['quarter'] == baseline['quarter'] and not {(r['residence'],r['treatment']) for r in baseline['cells']} <= seen:
            raise ValueError('Previously published same-quarter care-use cells disappeared')
    return data


def fetch_bytes(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'www.opendata.nhs.scot':
        raise ValueError('Only official HTTPS PHS downloads are permitted')
    req = urllib.request.Request(url, headers={'User-Agent': 'public-data-consoles/1.0'})
    with urllib.request.urlopen(req, timeout=40) as response:
        if urllib.parse.urlsplit(response.url).netloc != parsed.netloc:
            raise ValueError('Unexpected download redirect')
        raw = response.read(24_000_001)
    if len(raw) > 24_000_000:
        raise ValueError('PHS response exceeds size bound')
    return raw


def number(value, integer=False, maximum=None):
    if isinstance(value, bool) or value is None or str(value).strip() == '':
        raise ValueError('Missing numeric report value')
    value = float(value)
    if not math.isfinite(value) or value < 0 or (integer and not value.is_integer()) or (maximum is not None and value > maximum):
        raise ValueError('Invalid numeric report value')
    return int(value) if integer else value


def date_key(value, month=False):
    text = str(value)
    date = dt.datetime.strptime(text, '%Y%m' if month else '%Y%m%d').date()
    if len(text) != (6 if month else 8):
        raise ValueError('Malformed report period')
    return date


def unique(rows, key):
    values = [row[key] for row in rows]
    if len(set(values)) != len(values):
        raise ValueError('Duplicate report identity: ' + key)
    return {row[key]: row for row in rows}


def load_source(name, fetch, now):
    rid = RESOURCES[name]
    metadata_url = 'https://www.opendata.nhs.scot/api/3/action/resource_show?id=' + rid
    metadata_raw = fetch(metadata_url)
    metadata = json.loads(metadata_raw)
    if metadata.get('success') is not True or metadata.get('result', {}).get('id') != rid:
        raise ValueError('PHS resource metadata mismatch')
    info = metadata['result']
    url = info['url']
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'www.opendata.nhs.scot' or ('/resource/' + rid + '/download/') not in parsed.path:
        raise ValueError('Unexpected PHS resource download URL')
    raw = fetch(url)
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    if not rows or len(rows) > 250_000:
        raise ValueError('Empty or excessive report capture')
    count_url = 'https://www.opendata.nhs.scot/api/3/action/datastore_search?resource_id=' + rid + '&limit=1'
    control = json.loads(fetch(count_url))
    if control.get('success') is not True or control.get('result',{}).get('total') != len(rows):
        raise ValueError('CSV count disagrees with independent CKAN record count')
    return rows, {'id': name, 'resourceId': rid, 'url': url, 'metadataUrl': metadata_url,
                  'retrievedAt': now.isoformat(), 'sourceModified': info.get('last_modified'),
                  'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(rows), 'countUrl': count_url,
                  'verifiedRecordCount': control['result']['total']}


def collect(baseline, fetch=fetch_bytes, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    sources, raw = [], {}
    for name in RESOURCES:
        raw[name], source = load_source(name, fetch, now)
        sources.append(source)
    lookup = unique(raw['sites'], 'TreatmentLocationCode')
    ae = [r for r in raw['ae'] if r['DepartmentType'] == 'Type 1' and r['AttendanceCategory'] == 'All']
    if not ae:
        raise ValueError('No Type-1 All-attendance reports')
    periods = sorted({int(r['WeekEndingDate']) for r in ae})[-30:]
    if len(periods) != 30 or any((date_key(b)-date_key(a)).days != 7 for a,b in zip(periods,periods[1:])):
        raise ValueError('Incomplete 30-week reporting window')
    latest = periods[-1]
    national, sites = [], []
    for period in periods:
        rows = [r for r in ae if int(r['WeekEndingDate']) == period]
        unique(rows, 'TreatmentLocation')
        total, within = 0, 0
        for r in rows:
            code, hb = r['TreatmentLocation'], r['HBT']
            if hb not in BOARDS or code not in lookup or lookup[code]['HB'] != hb:
                raise ValueError('Unresolved site/board identity')
            att = number(r['NumberOfAttendancesEpisode'], True)
            n4 = number(r['NumberWithin4HoursEpisode'], True, att)
            n8 = number(r['NumberOver8HoursEpisode'], True, att)
            n12 = number(r['NumberOver12HoursEpisode'], True, n8)
            if not att or n4 + number(r['NumberOver4HoursEpisode'], True) != att or n8 > att-n4:
                raise ValueError('Inconsistent attendance counts')
            total += att
            within += n4
            if period == latest:
                sites.append({'code': code, 'name': lookup[code]['TreatmentLocationName'],
                              'hb': hb, 'board': BOARDS[hb], 'att': att, 'pct4': round(100*n4/att,1),
                              'o8': n8, 'pct8': round(100*n8/att,1), 'o12': n12, 'pct12': round(100*n12/att,1)})
        national.append({'wk': period, 'att': total, 'pct4': round(100*within/total,1)})
    current_codes = {r['code'] for r in sites}
    if not {r['code'] for r in baseline['sites']} <= current_codes:
        raise ValueError('Previously reported sites disappeared; review source coverage')
    quarter = max(r['Quarter'] for r in raw['beds'])
    bed_rows = [r for r in raw['beds'] if r['Quarter'] == quarter and r['HB'] in BOARDS
                and r['Location'] == r['HB'] and r['SpecialtyName'] == 'All Specialties']
    bed_rows = unique(bed_rows, 'HB')
    if set(bed_rows) != set(BOARDS):
        raise ValueError('Incomplete territorial-board occupancy coverage')
    occupancy = []
    for hb, r in bed_rows.items():
        available = number(r['AllStaffedBeddays'])
        occupied = number(r['TotalOccupiedBeddays'])
        if not available:
            raise ValueError('Zero staffed-bed denominator')
        pct = 100*occupied/available
        if abs(pct-number(r['PercentageOccupancy'])) > 0.15:
            raise ValueError('Bed-day ratio disagrees with published percentage')
        occupancy.append({'hb': hb, 'board': BOARDS[hb], 'occPct': round(pct,1)})
    month = max(int(r['MonthOfDelay']) for r in raw['dd'])
    delay_rows = unique([r for r in raw['dd'] if int(r['MonthOfDelay']) == month and r['HBT'] in BOARDS
                         and r['AgeGroup'] == '18plus' and r['ReasonForDelay'] == 'All Delay Reasons'], 'HBT')
    if set(delay_rows) != set(BOARDS):
        raise ValueError('Incomplete territorial-board delayed-discharge coverage')
    delayed = [{'hb': hb, 'board': BOARDS[hb], 'n': number(r['NumberOfCensusDelays'], True)} for hb,r in delay_rows.items()]
    data = {'schemaVersion': 1, 'capturedAt': now.isoformat(), 'refreshEveryHours': 168, 'sources': sources,
            'meta': {'source': 'Public Health Scotland — official CKAN downloads', 'fetched': now.date().isoformat(),
                     'aeWeek': latest, 'bedsQuarter': quarter, 'ddMonth': month, 'res': RESOURCES,
                     'allSpecialtyLabels': ['All Specialties'],
                     'definitions': 'Type-1 EDs, AttendanceCategory=All counted once; territorial-board All Specialties bed days; age18plus All Delay Reasons census counts. The 95% line is a planning reference, not a full A&E standard assessment.'},
            'sites': sorted(sites,key=lambda r:r['pct4']), 'national': national,
            'occupancy': sorted(occupancy,key=lambda r:-r['occPct']), 'delayed': sorted(delayed,key=lambda r:-r['n']),
            'careUse': collect_care_use(raw['flow'])}
    validate(data, baseline, now)
    return data


def validate(data, baseline=None, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    if type(data.get('schemaVersion')) is not int or data.get('schemaVersion') != 1 or data.get('refreshEveryHours') != 168:
        raise ValueError('Unexpected PHS payload schema')
    captured = dt.datetime.fromisoformat(data['capturedAt'])
    if captured.tzinfo is None or captured > now+dt.timedelta(minutes=5):
        raise ValueError('Invalid capture time')
    meta = data['meta']
    if meta['fetched'] != captured.date().isoformat() or meta['res'] != RESOURCES:
        raise ValueError('Capture/resource provenance mismatch')
    if date_key(meta['aeWeek']) > captured.date() or date_key(meta['ddMonth'], True) > captured.date():
        raise ValueError('Future report period')
    if not re.fullmatch(r'20\d{2}Q[1-4]',meta['bedsQuarter']):
        raise ValueError('Invalid quarter')
    q = meta['bedsQuarter']; qend = dt.date(int(q[:4])+(q[-1]=='4'), 1 if q[-1]=='4' else int(q[-1])*3+1, 1)-dt.timedelta(days=1)
    if qend > captured.date():
        raise ValueError('Future quarter')
    if {r['id'] for r in data['sources']} != set(RESOURCES) or len(data['sources']) != len(RESOURCES):
        raise ValueError('Missing source provenance')
    for source in data['sources']:
        if not re.fullmatch(r'[0-9a-f]{64}',source['sha256']) or source['resourceId'] != RESOURCES[source['id']]:
            raise ValueError('Invalid source identity/hash')
        if not number(source['rows'],True) or source['rows'] != source['verifiedRecordCount']:
            raise ValueError('Source coverage control mismatch')
    for collection, key in [('sites','code'),('national','wk'),('occupancy','hb'),('delayed','hb')]:
        if not data[collection]: raise ValueError('Missing report collection')
        unique(data[collection],key)
    if len(data['sites']) < 20 or len(data['sites']) > 100 or len(data['national']) != 30:
        raise ValueError('Incomplete site/history coverage')
    for r in data['sites']:
        if r['hb'] not in BOARDS or r['board'] != BOARDS[r['hb']] or not isinstance(r['name'],str) or re.search(r'[<>]',r['name']):
            raise ValueError('Invalid site identity')
        att = number(r['att'],True)
        if not att: raise ValueError('Empty attendance denominator')
        number(r['o12'],True,number(r['o8'],True,att))
        for key in ['pct4','pct8','pct12']:number(r[key],maximum=100)
        if any(abs(r[pct]-100*r[count]/att)>0.051 for pct,count in [('pct8','o8'),('pct12','o12')]):
            raise ValueError('Site percentages disagree with published counts')
    weeks = [date_key(r['wk']) for r in data['national']]
    if any((b-a).days != 7 for a,b in zip(weeks,weeks[1:])) or data['national'][-1]['wk'] != meta['aeWeek']:
        raise ValueError('Invalid reporting sequence')
    for row in data['national']:
        if not number(row['att'],True):raise ValueError('Empty national denominator')
        number(row['pct4'],maximum=100)
    if sum(r['att'] for r in data['sites']) != data['national'][-1]['att']:
        raise ValueError('National/site counts disagree')
    weighted=sum(r['att']*r['pct4'] for r in data['sites'])/data['national'][-1]['att']
    if abs(weighted-data['national'][-1]['pct4'])>0.11:
        raise ValueError('National/site four-hour percentages disagree')
    for collection,key in [('occupancy','occPct'),('delayed','n')]:
        if {r['hb'] for r in data[collection]} != set(BOARDS):raise ValueError('Incomplete board coverage')
        for row in data[collection]:
            if row['board'] != BOARDS[row['hb']]:raise ValueError('Invalid board identity')
            number(row[key],integer=key=='n',maximum=200 if key=='occPct' else None)
    validate_care_use(data.get('careUse'), captured, baseline.get('careUse') if baseline else None)
    if baseline:
        old = baseline['meta']
        if meta['aeWeek'] < old['aeWeek'] or meta['bedsQuarter'] < old['bedsQuarter'] or meta['ddMonth'] < old['ddMonth']:
            raise ValueError('Reporting periods regressed')
        if baseline.get('capturedAt') and captured < dt.datetime.fromisoformat(baseline['capturedAt']):
            raise ValueError('Capture time regressed')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo-root',type=Path,default=ROOT)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args(); page=args.repo_root/PAGE; portable=args.repo_root/DATA
    text=page.read_text(); match=SNAP.search(text)
    if not match:raise ValueError('Expected exactly one native SNAP marker')
    baseline=json.loads(match[1])
    if args.check:
        validate(baseline)
        if json.loads(portable.read_text()) != baseline:raise ValueError('Portable/embedded reports disagree')
        print('PASS: PHS source periods, identities, counts and offline/public JSON agree')
        return
    data=collect(baseline)
    text=page.read_text()
    output,count=SNAP.subn(lambda _: 'let SNAP='+json.dumps(data,separators=(',',':'),ensure_ascii=False)+';',text)
    if count != 1:raise ValueError('Native SNAP marker changed during refresh')
    atomic_outputs({page: output.encode(), portable: (json.dumps(data,indent=2,ensure_ascii=False)+'\n').encode()})
    print('Updated PHS:',len(data['sites']),'EDs;',data['meta']['aeWeek'],'A&E;',data['meta']['bedsQuarter'],'beds;',data['meta']['ddMonth'],'delays')


if __name__ == '__main__':main()
