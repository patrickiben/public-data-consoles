"""Guard the public denominators and CDC fallback artifacts against drift from published HTML."""
import json,math,re,shutil,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SLUGS=['global-air-pollution','global-demographic-transition','global-health-atlas','global-health-systems','global-hiv-tb-malaria','global-immunization','global-maternal-child-health','global-mental-health','global-ncd-burden','global-nutrition','global-road-safety','global-wash']
def snapshot(html):return json.loads(re.search(r'let SNAP=(.*?);\s*\n',html).group(1))
class HealthPublication(unittest.TestCase):
 def test_offline_cdc_check_runs_without_installed_browser_dependencies(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   files=['scripts/refresh_health_snapshots.mjs']+[f'consoles/{slug}/{name}' for slug in ['us-respiratory-surveillance','us-overdose-surveillance'] for name in ['index.html','data/cdc-context.json']]
   for name in files:
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target)
   checked=subprocess.run(['node','scripts/refresh_health_snapshots.mjs','--check'],cwd=root,capture_output=True,text=True,timeout=30)
   self.assertEqual(checked.returncode,0,checked.stdout+checked.stderr)
   self.assertEqual(checked.stdout.count('PASS CDC portable/embedded snapshot'),2)
 def test_population_land_source_and_exact_displayed_country_coverage(self):
  data=json.loads((ROOT/'consoles/global-health-atlas/data/population-area.json').read_text());expected=set()
  self.assertEqual(data['schemaVersion'],1);self.assertEqual(len(data['sources']),2)
  self.assertEqual({s['indicator'] for s in data['sources']},{'SP.POP.TOTL','AG.LND.TOTL.K2'})
  for s in data['sources']:self.assertRegex(s['responseSha256'],r'^[a-f0-9]{64}$');self.assertTrue(s['url'].startswith('https://api.worldbank.org/v2/'))
  for slug in SLUGS:
   html=(ROOT/'consoles'/slug/'index.html').read_text();countries=set(snapshot(html)['cty']);expected.update(countries);embedded=json.loads(re.search(r'<script type="application/json" id="worldbank-population-area">([\s\S]*?)</script>',html).group(1));subset={**data,'countries':{c:data['countries'][c]for c in sorted(countries)}};self.assertEqual(embedded,subset,slug)
  self.assertEqual(set(data['countries']),expected)
 def test_denominator_gaps_remain_null_and_finite_counts_are_not_invented(self):
  data=json.loads((ROOT/'consoles/global-health-atlas/data/population-area.json').read_text());nulls=0
  for row in data['countries'].values():
   for key in ['population','landArea']:
    self.assertTrue(any(v is not None for v in row[key].values()))
    for year,value in row[key].items():
     self.assertRegex(year,r'^\d{4}$')
     if value is None:nulls+=1
     else:self.assertIsInstance(value,(int,float));self.assertFalse(isinstance(value,bool));self.assertTrue(math.isfinite(value));self.assertGreaterEqual(value,0)
  self.assertGreater(nulls,0,'Missing source years must remain explicit, rather than forward-filled')
 def test_cdc_public_source_snapshots_equal_native_fallbacks(self):
  for slug in ['us-respiratory-surveillance','us-overdose-surveillance']:
   data=json.loads((ROOT/'consoles'/slug/'data/cdc-context.json').read_text());self.assertEqual(data['schemaVersion'],1);self.assertEqual(snapshot((ROOT/'consoles'/slug/'index.html').read_text()),data['snapshot']);self.assertEqual(data['snapshot']['embedded'],data['capturedAt'][:10]);self.assertTrue(data['sources'])
   for s in data['sources']:self.assertTrue(s['url'].startswith('https://data.cdc.gov/resource/'));self.assertEqual(s['status'],200);self.assertRegex(s['decodedResponseSha256'],r'^[a-f0-9]{64}$')
   if slug=='us-respiratory-surveillance':self.assertTrue(data['snapshot']['wval_state_series']);self.assertTrue(data['snapshot']['wval_state_expected'])
   else:self.assertTrue(data['snapshot']['stateMonthly']);self.assertTrue(data['snapshot']['stateHistoryExpectedJurisdictions'])
if __name__=='__main__':unittest.main()
