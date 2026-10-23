"""Read official, annual St. Petersburg treatment throughput without visitor keys.

This collector performs no writes. Annual average treatment flow is context, not a
prediction of spills or the flow attributable to an individual station/catchment.
"""
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
from io import BytesIO
import math
import posixpath
import re
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile


LISTING_URL = "https://floridadep.gov/water/domestic-wastewater/content/reuse-inventory-database-and-annual-report"
PERMITS = {
    "FLA128821": ("Northwest", "St. Petersburg Northwest WRF"),
    "FLA128848": ("Southwest", "St. Petersburg Southwest WRF"),
    "FLA128856": ("Northeast", "St. Petersburg Northeast WRF"),
}
HEADERS = ["County", "Reuse System Name", "WWTP Name", "Facility ID",
           "Disinfection Level", "WWTP Capacity (mgd)", "WWTP Flow (mgd)"]
SHEET_NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
MAX_DOWNLOAD = 24 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024


class UtilityContextError(ValueError):
    """An official source could not be safely interpreted; keep last-good data."""


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.href, self.parts = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href, self.parts = dict(attrs).get("href"), []

    def handle_data(self, data):
        if self.href is not None:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.href is not None:
            self.links.append((self.href, " ".join(self.parts)))
            self.href, self.parts = None, []


def _official_url(base, href):
    url = urljoin(base, href)
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"floridadep.gov", "www.floridadep.gov"} or parsed.username or parsed.password:
        raise UtilityContextError("FDEP source link leaves the official HTTPS origin")
    return url


def _links(raw):
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_DOWNLOAD:
        raise UtilityContextError("FDEP listing/document must be nonempty bounded bytes")
    try:
        parser = Links()
        parser.feed(raw.decode("utf-8"))
        return parser.links
    except (UnicodeError, TypeError) as exc:
        raise UtilityContextError("FDEP listing/document is not UTF-8 HTML") from exc


def discover_appendices(raw, now):
    """Choose the latest published appendix year, never a calendar-guessed URL."""
    candidates = {}
    for href, label in _links(raw):
        combined = (href + " " + label).lower()
        if not ("reuse" in combined and "inventor" in combined and "append" in combined):
            continue
        years = set(re.findall(r"\b20\d{2}\b", combined))
        if len(years) != 1:
            raise UtilityContextError("Ambiguous report year in FDEP appendix link")
        year = int(years.pop())
        if year > now.year:
            raise UtilityContextError("FDEP appendix link has a future reporting year")
        url = _official_url(LISTING_URL, href)
        candidates.setdefault(year, set()).add(url)
    if not candidates:
        raise UtilityContextError("No official annual reuse appendix link found")
    year = max(candidates)
    if len(candidates[year]) != 1:
        raise UtilityContextError("Conflicting appendix documents for the latest report year")
    return year, next(iter(candidates[year]))


def discover_workbook(raw, document_url, year):
    matches = set()
    for href, label in _links(raw):
        if not urlparse(href).path.lower().endswith(".xlsx"):
            continue
        combined = href + " " + label
        if not (str(year) in combined and "reuse" in combined.lower() and "append" in combined.lower()):
            continue
        matches.add(_official_url(document_url, href))
    if len(matches) != 1:
        raise UtilityContextError("Expected one official XLSX attachment for the chosen reporting year")
    return matches.pop()


def fetch_bytes(url):
    request = Request(url, headers={"User-Agent": "public-data-consoles coastal annual-data refresh"})
    with urlopen(request, timeout=30) as response:
        # urllib may follow redirects; credentials and third-party mirrors are unnecessary.
        _official_url(url, response.geturl())
        raw = response.read(MAX_DOWNLOAD + 1)
    if not raw or len(raw) > MAX_DOWNLOAD:
        raise UtilityContextError("FDEP source is empty or exceeds the download limit")
    return raw


def _xml(archive, name):
    try:
        raw = archive.read(name)
    except (KeyError, BadZipFile, RuntimeError) as exc:
        raise UtilityContextError("Missing, corrupt or unreadable XLSX member: " + name) from exc
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise UtilityContextError("Unexpected XML entity declaration in annual workbook")
    try:
        return ET.fromstring(raw)
    except ET.ParseError as exc:
        raise UtilityContextError("Malformed XLSX XML: " + name) from exc


def _sheet_rows(archive, member, shared):
    rows, seen_rows = [], set()
    for row in _xml(archive, member).findall("x:sheetData/x:row", SHEET_NS):
        row_id = row.get("r", "")
        if not re.fullmatch(r"[1-9][0-9]*", row_id) or row_id in seen_rows:
            raise UtilityContextError("Invalid/duplicate workbook row reference")
        seen_rows.add(row_id)
        values = {}
        for cell in row.findall("x:c", SHEET_NS):
            address = cell.get("r", "")
            match = re.fullmatch(r"([A-Z]+)([1-9][0-9]*)", address)
            if not match or match.group(2) != row_id:
                raise UtilityContextError("Invalid/duplicate workbook cell reference")
            column = match.group(1)
            if column in values:
                raise UtilityContextError("Duplicate column in workbook row")
            kind = cell.get("t")
            value = cell.find("x:v", SHEET_NS)
            raw = value.text if value is not None else None
            if kind == "inlineStr":
                result = "".join(t.text or "" for t in cell.findall(".//x:t", SHEET_NS))
            elif kind == "s":
                if raw is None or not re.fullmatch(r"[0-9]+", raw) or int(raw) >= len(shared):
                    raise UtilityContextError("Invalid shared-string reference")
                result = shared[int(raw)]
            elif raw is None:
                result = None
            elif kind in {None, "n"}:
                try:
                    result = float(raw)
                except ValueError as exc:
                    raise UtilityContextError("Invalid numeric workbook cell") from exc
            elif kind == "str":
                result = raw
            else:
                result = None  # errors/booleans cannot become valid flow measurements
            values[column] = result
        if values:
            rows.append((row.get("r"), values))
    return rows


def parse_workbook(raw, report_year):
    """Read expected public permit records using workbook relationships and labels."""
    if not isinstance(raw, bytes) or len(raw) > MAX_DOWNLOAD:
        raise UtilityContextError("Annual workbook must be bounded XLSX bytes")
    try:
        archive = ZipFile(BytesIO(raw))
    except BadZipFile as exc:
        raise UtilityContextError("Annual appendix response is not an XLSX workbook") from exc
    with archive:
        members = archive.infolist()
        if len(members) > 1000 or sum(m.file_size for m in members) > MAX_EXPANDED or len({m.filename for m in members}) != len(members):
            raise UtilityContextError("Oversized or duplicate XLSX members")
        workbook = _xml(archive, "xl/workbook.xml")
        relationships = _xml(archive, "xl/_rels/workbook.xml.rels")
        targets = {}
        for relation in relationships.findall("r:Relationship", REL_NS):
            if relation.get("Type") != OFFICE_REL + "/worksheet":
                continue  # Unused theme/custom XML metadata is not a data sheet.
            if relation.get("TargetMode") == "External":
                continue
            member = posixpath.normpath(posixpath.join("xl", relation.get("Target", "").lstrip("/")))
            # Absolute OOXML paths already start at the archive root.
            if relation.get("Target", "").startswith("/"):
                member = posixpath.normpath(relation.get("Target").lstrip("/"))
            if not member.startswith("xl/") or ".." in member.split("/"):
                raise UtilityContextError("XLSX relationship leaves the workbook directory")
            targets[relation.get("Id")] = member
        sheets = {}
        for sheet in workbook.findall("x:sheets/x:sheet", SHEET_NS):
            name, relation_id = sheet.get("name"), sheet.get("{" + OFFICE_REL + "}id")
            if name in sheets or relation_id not in targets:
                raise UtilityContextError("Invalid/duplicate workbook sheet relationship")
            sheets[name] = targets[relation_id]
        if not {"Appendix A", "Appendix B"} <= sheets.keys():
            raise UtilityContextError("Expected Appendix A and Appendix B sheets")
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(t.text or "" for t in s.findall(".//x:t", SHEET_NS))
                      for s in _xml(archive, "xl/sharedStrings.xml").findall("x:si", SHEET_NS)]
        rows_a = _sheet_rows(archive, sheets["Appendix A"], shared)
        if not rows_a or [rows_a[0][1].get(c) for c in "ABCD"] != ["County", "Reuse System Name", "Report Year", "Facility ID"]:
            raise UtilityContextError("Appendix A year/identifier schema changed")
        master = [r for _, r in rows_a[1:] if r.get("D") == "FLA012881"]
        if len(master) != 1 or master[0].get("C") != report_year or master[0].get("A") != "Pinellas":
            raise UtilityContextError("Workbook master-system year/coverage does not match the published appendix")
        rows_b = _sheet_rows(archive, sheets["Appendix B"], shared)
        if not rows_b or [rows_b[0][1].get(c) for c in "ABCDEFG"] != HEADERS:
            raise UtilityContextError("Appendix B treatment capacity/flow schema changed")
        records = {}
        for row_number, row in rows_b[1:]:
            permit = row.get("D")
            if permit not in PERMITS:
                continue
            if permit in records:
                raise UtilityContextError("Duplicate expected treatment-facility permit: " + permit)
            direction, label = PERMITS[permit]
            if row.get("A") != "Pinellas" or direction.lower() not in str(row.get("C", "")).lower() or "petersburg" not in str(row.get("B", "")).lower():
                raise UtilityContextError("Unexpected facility identity for " + permit)
            capacity, flow = row.get("F"), row.get("G")
            if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or v < 0 for v in [capacity, flow]):
                raise UtilityContextError("Missing, nonfinite or negative treatment capacity/flow for " + permit)
            records[permit] = {"id": permit, "label": label, "averageDailyFlowMGD": flow,
                               "permittedCapacityMGD": capacity, "workbookRow": row_number}
        if set(records) != set(PERMITS):
            raise UtilityContextError("Expected all three St. Petersburg treatment facilities")
        return [records[permit] for permit in PERMITS]


def _now(value):
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise UtilityContextError("now must be a timezone-aware datetime or ISO timestamp")
    return value.astimezone(timezone.utc)


def collect_utility_context(fetch=fetch_bytes, now=None):
    """Return a portable source-backed fragment for impact-context.json, no writes."""
    stamp = _now(now)
    listing = fetch(LISTING_URL)
    year, document_url = discover_appendices(listing, stamp)
    if (year, 9, 30) > (stamp.year, stamp.month, stamp.day):
        raise UtilityContextError("Annual reporting period has not finished")
    downloaded = [("fdep-reuse-listing", LISTING_URL, "FDEP annual reuse inventory listing", listing)]
    if urlparse(document_url).path.lower().endswith(".xlsx"):
        workbook_url = document_url
    else:
        document = fetch(document_url)
        downloaded.append((f"fdep-reuse-{year}-document", document_url, f"FDEP {year} reuse appendix document", document))
        workbook_url = discover_workbook(document, document_url, year)
    workbook = fetch(workbook_url)
    records = parse_workbook(workbook, year)
    try:
        total_flow = math.fsum(r["averageDailyFlowMGD"] for r in records)
        total_capacity = math.fsum(r["permittedCapacityMGD"] for r in records)
    except OverflowError as exc:
        raise UtilityContextError("Treatment-facility totals overflow") from exc
    if not all(math.isfinite(v) for v in [total_flow, total_capacity]):
        raise UtilityContextError("Treatment-facility totals are not finite")
    source_id = f"fdep-reuse-{year}-workbook"
    downloaded.append((source_id, workbook_url, f"FDEP {year} Reuse Inventory Report Appendices", workbook))
    period = {"start": f"{year - 1}-10-01", "end": f"{year}-09-30"}
    period_label = period["start"] + " to " + period["end"] + f" (FDEP {year} annual average)"
    retrieved = stamp.isoformat().replace("+00:00", "Z")
    sources = [{"id": id_, "url": url, "title": title, "retrievedAt": retrieved,
                "sha256": hashlib.sha256(raw).hexdigest(), "reportYear": year,
                "period": period_label, "periodStart": period["start"], "periodEnd": period["end"],
                "basis": "measured", "quality": "historical"}
               for id_, url, title, raw in downloaded]
    for record in records:
        record.update({"period": period_label, "periodStart": period["start"], "periodEnd": period["end"],
                       "areaIds": [], "sourceIds": [source_id],
                       "basis": "measured", "scope": "whole treatment facility; not allocated to stations or basins"})
    return {"sources": sources, "flowAggregates": records,
            "utilitySummary": {"label": "St. Petersburg three-facility reported annual treatment throughput",
                               "reportYear": year, "referencePeriod": period,
                               "averageDailyFlowMGD": round(total_flow, 9),
                               "permittedCapacityMGD": round(total_capacity, 9),
                               "facilityIds": list(PERMITS), "sourceIds": [source_id]},
            "utilityLimitations": [
                "WWTF flow is actual wastewater through the treatment facility on an average annual basis; it is not current telemetry, distributed reuse water or spill volume.",
                "The reporting period follows FDEP's annual reuse year, October 1 through September 30; this convention is explicitly documented in the 2025 Reuse Inventory Report.",
                "Permitted capacity is a regulatory treatment maximum, not measured available capacity, redundancy or guaranteed storm performance.",
                "Whole-facility throughput is not apportioned to screened stations, Census blocks or sewer sub-basins without a verified service/flow crosswalk.",
                "Equivalent historical throughput in gallons equals annual average MGD times 1,000,000 times window hours divided by 24; this arithmetic is not forecast wastewater spill or service loss.",
                "No per-person wastewater rate, repair factor, damage amount, outage duration or FEMA funding offset is inferred from these records."]}
