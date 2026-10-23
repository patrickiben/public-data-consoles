import copy
import csv
import datetime as dt
import io
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import refresh_nhs as nhs


class NHSRefreshTests(unittest.TestCase):
    def setUp(self):
        self.data=json.loads((nhs.ROOT/nhs.DATA).read_text())
        self.now=dt.datetime.fromisoformat(self.data['capturedAt'])+dt.timedelta(minutes=1)

    def test_real_public_snapshot_has_consistent_counts_and_periods(self):
        nhs.validate(self.data,now=self.now)
        self.assertEqual(sum(r['att'] for r in self.data['sites']),self.data['national'][-1]['att'])
        self.assertEqual(len(self.data['occupancy']),14)
        self.assertEqual(self.data['meta']['allSpecialtyLabels'],['All Specialties'])

    def test_invalid_and_missing_values_rejected(self):
        for value in [None,'',True,float('nan'),float('inf'),-1]:
            with self.subTest(value=value),self.assertRaises((ValueError,TypeError)):
                data=copy.deepcopy(self.data);data['sites'][0]['att']=value;nhs.validate(data,now=self.now)

    def test_partial_duplicate_injected_and_inconsistent_records_rejected(self):
        mutations=[lambda d:d['occupancy'].pop(),lambda d:d['delayed'].append(d['delayed'][0]),
                   lambda d:d['sites'][0].update(name='<img src=x onerror=alert(1)>'),
                   lambda d:d['national'][-1].update(att=d['national'][-1]['att']+1),
                   lambda d:d['sources'][0].update(verifiedRecordCount=1),
                   lambda d:d['national'][4].update(wk=d['national'][3]['wk']),
                   lambda d:d['sites'][0].update(pct8=99),lambda d:d['national'][-1].update(pct4=1),
                   lambda d:d.update(schemaVersion=True)]
        for mutate in mutations:
            with self.subTest(mutate=mutate),self.assertRaises(ValueError):
                data=copy.deepcopy(self.data);mutate(data);nhs.validate(data,now=self.now)

    def test_future_and_regressing_publications_rejected(self):
        for field,value in [('aeWeek',20990101),('bedsQuarter','2099Q1'),('ddMonth',209901)]:
            with self.subTest(field=field),self.assertRaises(ValueError):
                data=copy.deepcopy(self.data);data['meta'][field]=value;nhs.validate(data,now=self.now)
        old=copy.deepcopy(self.data);old['meta']['ddMonth']=209901
        with self.assertRaises(ValueError):nhs.validate(self.data,baseline=old,now=self.now)

    def test_source_capture_has_independent_complete_row_control(self):
        rid=nhs.RESOURCES['sites'];url=f'https://www.opendata.nhs.scot/dataset/example/resource/{rid}/download/sites.csv'
        metadata={'success':True,'result':{'id':rid,'url':url}}
        def fetch(u):
            if 'resource_show' in u:return json.dumps(metadata).encode()
            if 'datastore_search?' in u:return json.dumps({'success':True,'result':{'total':2}}).encode()
            return b'Name,Value\nExample,1\n'
        with self.assertRaisesRegex(ValueError,'count'):nhs.load_source('sites',fetch,self.now)

    def test_wrong_provider_or_resource_identity_rejected_before_download(self):
        for url in ['https://example.org/private.csv','https://www.opendata.nhs.scot/wrong.csv']:
            calls=[]
            def fetch(u):
                calls.append(u);return json.dumps({'success':True,'result':{'id':nhs.RESOURCES['sites'],'url':url}}).encode()
            with self.assertRaises(ValueError):nhs.load_source('sites',fetch,self.now)
            self.assertEqual(len(calls),1)

    def test_collector_excludes_overlapping_categories_and_uses_counts(self):
        rows={key:[] for key in nhs.RESOURCES}
        end=dt.date(2026,10,11)
        for i in range(20):
            hb=list(nhs.BOARDS)[i%14];code=f'T{i:03}H'
            rows['sites'].append({'TreatmentLocationCode':code,'TreatmentLocationName':f'Example {i}','HB':hb})
            for week in range(30):
                date=int((end-dt.timedelta(weeks=week)).strftime('%Y%m%d'))
                for category in ['All','Unplanned','New Planned']:
                    rows['ae'].append({'WeekEndingDate':date,'DepartmentType':'Type 1','AttendanceCategory':category,
                        'TreatmentLocation':code,'HBT':hb,'NumberOfAttendancesEpisode':100,
                        'NumberWithin4HoursEpisode':60,'NumberOver4HoursEpisode':40,
                        'NumberOver8HoursEpisode':20,'NumberOver12HoursEpisode':10})
        for hb in nhs.BOARDS:
            for specialty,occupied in [('All Specialties',80),('All Acute',40),('Allergy',3)]:
                rows['beds'].append({'Quarter':'2025Q4','HB':hb,'Location':hb,'SpecialtyName':specialty,
                    'AllStaffedBeddays':100,'TotalOccupiedBeddays':occupied,'PercentageOccupancy':occupied})
            for age in ['18plus','75plus']:
                rows['dd'].append({'MonthOfDelay':202608,'HBT':hb,'AgeGroup':age,'ReasonForDelay':'All Delay Reasons','NumberOfCensusDelays':10})
        responses={}
        for key,rid in nhs.RESOURCES.items():
            url=f'https://www.opendata.nhs.scot/dataset/example/resource/{rid}/download/report.csv'
            stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=list(rows[key][0]));writer.writeheader();writer.writerows(rows[key])
            responses[url]=stream.getvalue().encode()
            responses['https://www.opendata.nhs.scot/api/3/action/resource_show?id='+rid]=json.dumps({'success':True,'result':{'id':rid,'url':url}}).encode()
            responses['https://www.opendata.nhs.scot/api/3/action/datastore_search?resource_id='+rid+'&limit=1']=json.dumps({'success':True,'result':{'total':len(rows[key])}}).encode()
        baseline={'meta':{'aeWeek':20260607,'bedsQuarter':'2025Q4','ddMonth':202604},'sites':[]}
        result=nhs.collect(baseline,fetch=responses.__getitem__,now=dt.datetime(2026,10,23,tzinfo=dt.timezone.utc))
        self.assertEqual(result['national'][-1]['att'],2000)
        self.assertEqual(result['national'][-1]['pct4'],60)
        self.assertEqual(sum(r['n']for r in result['delayed']),140)
        self.assertTrue(all(r['occPct']==80 for r in result['occupancy']))


if __name__=='__main__':unittest.main()
