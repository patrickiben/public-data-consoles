"""Offline official-workbook fixtures for automatic Coastal treatment context."""
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from coastal_utility import (HEADERS, LISTING_URL, UtilityContextError,
                             collect_utility_context, parse_workbook)


X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
FIXED_NOW = datetime(2026, 10, 23, 18, tzinfo=timezone.utc)
DEFAULT_ROWS = [
    ["Pinellas", "St. Petersburg Master Urban Reuse System", "St. Petersburg Northwest WRF", "FLA128821", "HI", 20, 9.57],
    ["Pinellas", "St. Petersburg Master Urban Reuse System", "St. Petersburg Southwest WRF", "FLA128848", "HI", 20, 17.72],
    ["Pinellas", "St. Petersburg Master Urban Reuse System", "St. Petersburg Northeast WRF", "FLA128856", "HI", 16, 7.89],
]


def workbook(*, rows=None, year=2025, headers=None, master_rows=None, empty_a=False):
    """Different member names/order, mixed inline/shared strings, no Excel dependency."""
    shared = []

    def sheet(rows):
        doc = ET.Element("worksheet", xmlns=X)
        data = ET.SubElement(doc, "sheetData")
        for row_number, values in enumerate(rows, 1):
            row = ET.SubElement(data, "row", r=str(row_number))
            for column, value in enumerate(values):
                cell = ET.SubElement(row, "c", r=chr(65 + column) + str(row_number))
                if isinstance(value, str):
                    if column % 2:
                        cell.set("t", "s")
                        if value not in shared:
                            shared.append(value)
                        ET.SubElement(cell, "v").text = str(shared.index(value))
                    else:
                        cell.set("t", "inlineStr")
                        ET.SubElement(ET.SubElement(cell, "is"), "t").text = value
                elif value is not None:
                    ET.SubElement(cell, "v").text = str(value)
        return ET.tostring(doc)

    a = [] if empty_a else [["County", "Reuse System Name", "Report Year", "Facility ID"]]
    a += master_rows if master_rows is not None else [["Pinellas", "St. Petersburg Master Urban Reuse System", year, "FLA012881"]]
    a_xml = sheet(a)
    b_xml = sheet([HEADERS if headers is None else headers] + (DEFAULT_ROWS if rows is None else rows))
    strings = ET.Element("sst", xmlns=X)
    for s in shared:
        ET.SubElement(ET.SubElement(strings, "si"), "t").text = s
    stream = BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", f'<workbook xmlns="{X}" xmlns:r="{R}"><sheets><sheet name="Appendix B" sheetId="12" r:id="data"/><sheet name="Appendix A" sheetId="81" r:id="meta"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="meta" Type="{R}/worksheet" Target="worksheets/year-meta.xml"/><Relationship Id="data" Type="{R}/worksheet" Target="/xl/worksheets/annual-data.xml"/><Relationship Id="unused" Type="{R}/customXml" Target="../customXml/item1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/year-meta.xml", a_xml)
        archive.writestr("xl/worksheets/annual-data.xml", b_xml)
        archive.writestr("xl/sharedStrings.xml", ET.tostring(strings))
    return stream.getvalue()


def sources(raw=None, year=2025):
    document = f"https://floridadep.gov/water/domestic-wastewater/documents/{year}-reuse-inventory-report-appendices"
    # The attachment name deliberately is not guessable from the document slug.
    attachment = f"https://floridadep.gov/sites/default/files/{year}%20Reuse%20Appendices_revision_7.xlsx"
    data = {
        LISTING_URL: f'<a href="/archive/2024-reuse-inventory-report-appendices">2024 appendices</a><a href="{document}">{year} Reuse Inventory Report Appendices</a>'.encode(),
        document: f'<a href="{attachment}">{year} Reuse Inventory Report Appendices.xlsx</a>'.encode(),
        attachment: workbook(year=year) if raw is None else raw,
    }
    return data, document, attachment


def replace_member(raw, name, transform):
    stream = BytesIO()
    with ZipFile(BytesIO(raw)) as source, ZipFile(stream, "w", ZIP_DEFLATED) as target:
        for member in source.namelist():
            content = source.read(member)
            target.writestr(member, transform(content) if member == name else content)
    return stream.getvalue()


class CoastalUtility(unittest.TestCase):
    def test_discovers_actual_attachment_and_returns_three_facility_context(self):
        data, document, attachment = sources()
        calls = []
        result = collect_utility_context(fetch=lambda u: (calls.append(u), data[u])[1], now=FIXED_NOW)
        self.assertEqual(calls, [LISTING_URL, document, attachment])
        self.assertEqual(result["utilitySummary"]["averageDailyFlowMGD"], 35.18)
        self.assertEqual(result["utilitySummary"]["permittedCapacityMGD"], 56)
        self.assertEqual([r["id"] for r in result["flowAggregates"]], ["FLA128821", "FLA128848", "FLA128856"])
        self.assertTrue(all(r["areaIds"] == [] for r in result["flowAggregates"]))
        self.assertIn("2024-10-01 to 2025-09-30", result["flowAggregates"][0]["period"])
        self.assertEqual(result["utilitySummary"]["referencePeriod"], {"start": "2024-10-01", "end": "2025-09-30"})
        self.assertTrue(all(len(s["sha256"]) == 64 and s["retrievedAt"] == "2026-10-23T18:00:00Z" for s in result["sources"]))
        self.assertIn("not forecast wastewater spill", " ".join(result["utilityLimitations"]))

    def test_year_rollover_is_discovered_and_previous_vintage_is_not_hardcoded(self):
        data, _, _ = sources(year=2026)
        result = collect_utility_context(fetch=data.__getitem__, now="2027-03-01T00:00:00Z")
        self.assertEqual(result["utilitySummary"]["reportYear"], 2026)
        self.assertEqual(result["utilitySummary"]["referencePeriod"]["start"], "2025-10-01")

    def test_valid_zero_and_flow_above_permitted_capacity_are_reported_honestly(self):
        rows = [r[:] for r in DEFAULT_ROWS]
        rows[0][6] = 0
        rows[1][6] = 25.5
        result = parse_workbook(workbook(rows=rows), 2025)
        self.assertEqual(result[0]["averageDailyFlowMGD"], 0)
        self.assertEqual(result[1]["averageDailyFlowMGD"], 25.5)
        self.assertEqual(result[1]["permittedCapacityMGD"], 20)

    def test_missing_expected_facility_duplicate_permit_and_swapped_identity_fail(self):
        swapped = [r[:] for r in DEFAULT_ROWS]
        swapped[0][2] = "St. Petersburg Northeast WRF"
        for rows in [DEFAULT_ROWS[:2], DEFAULT_ROWS + [DEFAULT_ROWS[0]], swapped]:
            with self.subTest(rows=rows), self.assertRaises(UtilityContextError):
                parse_workbook(workbook(rows=rows), 2025)

    def test_unrelated_facilities_are_not_counted_or_misread_as_city_throughput(self):
        other = ["Pinellas", "Other utility", "Other WRF", "FL0099999", "HI", 500, 400]
        result = parse_workbook(workbook(rows=[other, *reversed(DEFAULT_ROWS), other]), 2025)
        self.assertAlmostEqual(sum(r["averageDailyFlowMGD"] for r in result), 35.18)

    def test_missing_text_negative_and_nonfinite_numeric_values_are_refused(self):
        for column in [5, 6]:
            for value in [None, "Not reported.", "0", -0.1, float("nan"), float("inf")]:
                rows = [r[:] for r in DEFAULT_ROWS]
                rows[0][column] = value
                with self.subTest(column=column, value=value), self.assertRaises(UtilityContextError):
                    parse_workbook(workbook(rows=rows), 2025)

    def test_changed_headers_cannot_swap_reuse_flow_for_treatment_flow(self):
        changed = HEADERS[:]
        changed[6] = "Reuse Flow (mgd)"
        with self.assertRaisesRegex(UtilityContextError, "schema changed"):
            parse_workbook(workbook(headers=changed), 2025)

    def test_year_identity_requires_one_matching_master_record(self):
        good = ["Pinellas", "St. Petersburg Master Urban Reuse System", 2025, "FLA012881"]
        for master in [[], [good, good], [[*good[:2], 2024, good[3]]]]:
            with self.subTest(master=master), self.assertRaises(UtilityContextError):
                parse_workbook(workbook(master_rows=master), 2025)
        with self.assertRaises(UtilityContextError):
            parse_workbook(workbook(master_rows=[], empty_a=True), 2025)

    def test_bad_latest_workbook_does_not_silently_fall_back_to_old_report(self):
        data, _, attachment = sources(raw=b"<html>temporary error</html>")
        calls = []
        with self.assertRaisesRegex(UtilityContextError, "not an XLSX"):
            collect_utility_context(fetch=lambda u: (calls.append(u), data[u])[1], now=FIXED_NOW)
        self.assertEqual(calls[-1], attachment)
        self.assertEqual(len(calls), 3)

    def test_external_or_ambiguous_document_and_attachment_links_are_refused(self):
        data, document, attachment = sources()
        for listing in [b'<a href="https://example.com/2025-reuse-inventory-appendices">2025 Reuse Inventory Appendices</a>',
                        data[LISTING_URL] + b'<a href="/other-2025-reuse-inventory-appendices">2025 Reuse Inventory Appendices</a>']:
            modified = dict(data)
            modified[LISTING_URL] = listing
            with self.subTest(listing=listing), self.assertRaises(UtilityContextError):
                collect_utility_context(fetch=modified.__getitem__, now=FIXED_NOW)
        for body in [b"No workbook available", data[document].replace(attachment.encode(), b"https://example.com/2025-Reuse-Appendices.xlsx")]:
            modified = dict(data)
            modified[document] = body
            with self.subTest(body=body), self.assertRaises(UtilityContextError):
                collect_utility_context(fetch=modified.__getitem__, now=FIXED_NOW)

    def test_future_report_and_incomplete_reporting_period_are_not_published(self):
        for now in ["2024-10-23T00:00:00Z", "2025-01-03T00:00:00Z"]:
            data, _, _ = sources()
            with self.subTest(now=now), self.assertRaises(UtilityContextError):
                collect_utility_context(fetch=data.__getitem__, now=now)
        with self.assertRaises(UtilityContextError):
            collect_utility_context(fetch=lambda _: b"", now=datetime(2026, 10, 23))

    def test_aggregate_overflow_is_refused_even_when_individual_cells_are_finite(self):
        rows = [r[:] for r in DEFAULT_ROWS]
        for row in rows:
            row[6] = 1e308
        data, _, _ = sources(raw=workbook(rows=rows))
        with self.assertRaisesRegex(UtilityContextError, "overflow"):
            collect_utility_context(fetch=data.__getitem__, now=FIXED_NOW)

    def test_corrupt_row_and_cell_addresses_cannot_shift_the_interpreted_table(self):
        for old, new in [(b'r="A1"', b'r="A2"'), (b'<row r="2">', b'<row r="1">')]:
            raw = replace_member(workbook(), "xl/worksheets/annual-data.xml", lambda b: b.replace(old, new, 1))
            with self.subTest(old=old), self.assertRaises(UtilityContextError):
                parse_workbook(raw, 2025)

    def test_entity_declarations_and_external_sheet_relationships_are_refused(self):
        raw = replace_member(workbook(), "xl/worksheets/annual-data.xml", lambda b: b'<!DOCTYPE worksheet [<!ENTITY sample "unwanted">]>' + b)
        with self.assertRaisesRegex(UtilityContextError, "entity declaration"):
            parse_workbook(raw, 2025)
        raw = replace_member(workbook(), "xl/_rels/workbook.xml.rels", lambda b: b.replace(b'Target="/xl/worksheets/annual-data.xml"', b'Target="https://example.com/data.xml" TargetMode="External"'))
        with self.assertRaisesRegex(UtilityContextError, "sheet relationship"):
            parse_workbook(raw, 2025)


if __name__ == "__main__":
    unittest.main()
