"""Source-shaped offline tests for coherent public-only inventory refreshes."""
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import coastal_inventory as inv
import refresh_coastal_impact as orchestration

NOW = datetime(2026, 10, 23, 20, tzinfo=timezone.utc)
EDIT = int(datetime(2026, 10, 3, tzinfo=timezone.utc).timestamp() * 1000)


def feature(id_, x, y, facility, owner=1):
    return {"attributes": {"OBJECTID": id_, "FACILITYID": facility, "GLOBALID": f"00000000-0000-0000-0000-{id_:012d}",
            "NAME": f"Public {id_}", "LSID": str(id_), "STATUS": "C", "BASINNUMBER": str(100+id_), "OWNEDBY": owner, "MAINTBY": owner},
            "geometry": {"x": x, "y": y}}


def polygon(id_, zone, left, bottom, right, top):
    return {"attributes": {"OBJECTID": id_, "EvacZone": zone}, "geometry": {"rings": [[[left,bottom],[left,top],[right,top],[right,bottom],[left,bottom]]]}}


class Source:
    def __init__(self):
        self.stations = [feature(1,-82.61,27.81,"0001"),feature(2,-82.64,27.84,"0002",0),feature(3,-82.67,27.87,None)]
        self.polygons = [polygon(21,"A",-82.62,27.80,-82.60,27.82),polygon(22,"Non Evac",-82.65,27.83,-82.63,27.85)]
        self.calls = []; self.truncate = False; self.bad_ids = False; self.error = False; self.terrain_error = False
        self.edition = EDIT; self.zone_change = False; self.zone_meta_calls = 0; self.datum = "North American Vertical Datum of 1988 (NAVD 88)"

    def __call__(self, url):
        self.calls.append(url); p=urlsplit(url); q={k:v[0] for k,v in parse_qs(p.query).items()}
        if url.startswith(inv.CITY): base, rows, fields = inv.CITY,self.stations,inv.FIELDS
        elif url.startswith(inv.ZONE): base,rows,fields = inv.ZONE,self.polygons,["OBJECTID","EvacZone"]
        elif url.startswith(inv.EPQS):
            if self.terrain_error: raise OSError("point source unavailable")
            return json.dumps({"value":0,"rasterId":77,"attributes":{"AcquisitionDate":"3/4/2019"}}).encode()
        elif url.startswith(inv.RASTER): return json.dumps({"attributes":{"OBJECTID":77,"VerticalDatum":self.datum,"StartDate":20181204,"EndDate":"20190425","Name":"Public terrain","AcquisitionDate":1556150400000}}).encode()
        else: raise AssertionError("Unexpected endpoint "+url)
        if self.error: return b'{"error":{"message":"provider down"}}'
        if p.path.endswith('/query'):
            if q.get('returnCountOnly')=='true': data={"count":len(rows)}
            elif q.get('returnIdsOnly')=='true': data={"objectIdFieldName":"OBJECTID","objectIds":[r['attributes']['OBJECTID'] for r in rows]}
            else:
                start=int(q.get('resultOffset',0)); size=int(q.get('resultRecordCount',200)); batch=rows[start:start+size]
                if self.truncate: batch=batch[:-1]
                data={"features":batch,"spatialReference":{"wkid":4326}}
            if self.bad_ids and 'objectIds' in data:data['objectIds']=[1]*len(rows)
        else:
            edit=self.edition
            if base==inv.ZONE:
                self.zone_meta_calls+=1
                if self.zone_change and self.zone_meta_calls>1:edit+=1000
            data={"fields":[{"name":f}for f in fields],"maxRecordCount":2000,"editingInfo":{"dataLastEditDate":edit}}
        return json.dumps(data).encode()


class InventoryTests(unittest.TestCase):
    def collect(self, source, prior=None, **kw):
        return inv.collect_inventory(prior, fetch=source, now=NOW, **kw)

    def test_complete_public_capture_ownership_unknown_zone_and_true_zero_terrain(self):
        data=self.collect(Source());rows=data['stations']
        self.assertEqual([s['officialZone']for s in rows],['A','Non Evac',None])
        self.assertEqual(rows[2]['zoneMatchStatus'],'no-intersection')
        self.assertEqual(sum(s['isCityOwned']for s in rows),2)
        self.assertEqual(data['completeness']['publicPrivatelyOwnedRecordCount'],1)
        self.assertTrue(all(s['groundElevationFt']==0 for s in rows))
        self.assertEqual(data['elevation']['validCount'],3)
        self.assertEqual(data['completeness']['nullFacilityIdCount'],1)
        self.assertEqual(len({s['agencyGlobalId']for s in rows}),3)

    def test_legacy_ids_bootstrap_and_global_id_survives_facility_and_oid_change(self):
        old=self.collect(Source())
        for s in old['stations']:s.pop('agencyGlobalId');s['id']='PUBLIC-legacy-'+str(s['objectId'])
        first=self.collect(Source(),old)
        self.assertEqual([s['id']for s in first['stations']],[s['id']for s in old['stations']])
        source=Source();source.stations[0]['attributes'].update(OBJECTID=10,FACILITYID='replacement-code')
        source.stations.sort(key=lambda f:f['attributes']['OBJECTID'])
        next_=self.collect(source,first)
        match=next(s for s in next_['stations']if s['agencyGlobalId']==first['stations'][0]['agencyGlobalId'])
        self.assertEqual(match['id'],'PUBLIC-legacy-1')

    def test_same_coordinates_retain_real_terrain_dates_without_requery(self):
        old=self.collect(Source());source=Source();source.terrain_error=True
        new=self.collect(source,old)
        self.assertFalse(any(u.startswith(inv.EPQS)for u in source.calls))
        self.assertEqual(new['completeness']['elevationRetainedCount'],3)
        self.assertEqual([s['elevationRetrievedAt']for s in new['stations']],[s['elevationRetrievedAt']for s in old['stations']])
        self.assertTrue(all(s['elevationRetained']for s in new['stations']))

    def test_moved_station_never_inherits_old_point_elevation_on_failure(self):
        old=self.collect(Source());source=Source();source.stations[0]['geometry']['x']-=.001;source.terrain_error=True
        new=self.collect(source,old)
        self.assertIsNone(new['stations'][0]['groundElevationFt'])
        self.assertEqual(new['stations'][0]['elevationQuality'],'unavailable')
        self.assertEqual(new['completeness']['elevationRetainedCount'],2)
        self.assertTrue(any(u.startswith(inv.EPQS)for u in source.calls))

    def test_new_station_needs_its_own_sample_and_forced_full_refresh_is_explicit(self):
        old=self.collect(Source());source=Source();source.stations.append(feature(4,-82.68,27.88,'0004'))
        source.edition+=1000
        new=self.collect(source,old)
        self.assertEqual(new['completeness']['elevationQueriedCount'],1)
        self.assertEqual(new['stations'][-1]['groundElevationFt'],0)
        source=Source();forced=self.collect(source,old,refresh_terrain=True)
        self.assertEqual(forced['completeness']['elevationQueriedCount'],3)
        self.assertEqual(forced['completeness']['elevationRetainedCount'],0)

    def test_boundary_ambiguous_unknown_and_unsupported_zones_are_not_safety(self):
        source=Source();source.stations[0]['geometry']['x']=-82.62
        self.assertEqual(self.collect(source)['stations'][0]['zoneMatchStatus'],'boundary')
        source=Source();source.polygons.append(polygon(23,'B',-82.62,27.80,-82.60,27.82))
        self.assertEqual(self.collect(source)['stations'][0]['zoneMatchStatus'],'ambiguous')
        source=Source();source.polygons[0]['attributes']['EvacZone']='NEW-CODE'
        data=self.collect(source);self.assertIsNone(data['stations'][0]['officialZone']);self.assertEqual(data['stations'][0]['zoneMatchStatus'],'unsupported-code')

    def test_missing_partial_duplicate_or_provider_error_fails_before_publication(self):
        for key in ['truncate','bad_ids','error','zone_change']:
            source=Source();setattr(source,key,True)
            with self.subTest(case=key),self.assertRaises(ValueError):self.collect(source)
        for mutate in [lambda s:s.stations[0]['attributes'].pop('GLOBALID'),lambda s:s.stations[0]['attributes'].update(BASINNUMBER=None),lambda s:s.stations[0]['attributes'].update(STATUS='UNKNOWN'),lambda s:s.stations[0]['geometry'].update(x=None),lambda s:s.stations[1]['attributes'].update(FACILITYID='0001')]:
            source=Source();mutate(source)
            with self.assertRaises(ValueError):self.collect(source)

    def test_non_navd_or_nodata_point_is_unassessed_not_ground(self):
        source=Source();source.datum='Mean Sea Level'
        data=self.collect(source);self.assertTrue(all(s['groundElevationFt']is None for s in data['stations']))
        self.assertEqual(data['elevation']['missingCount'],3)

    def test_source_editions_future_and_previous_identity_corruption_fail_closed(self):
        old=self.collect(Source());source=Source();source.edition-=1000
        with self.assertRaisesRegex(ValueError,'regressed'):self.collect(source,old)
        source=Source();source.edition=int(datetime(2027,1,1,tzinfo=timezone.utc).timestamp()*1000)
        with self.assertRaisesRegex(ValueError,'future'):self.collect(source)
        broken=copy.deepcopy(old);broken['stations'][1]['id']=broken['stations'][0]['id']
        with self.assertRaisesRegex(ValueError,'duplicate'):self.collect(Source(),broken)
        source=Source();source.stations.pop()
        with self.assertRaisesRegex(ValueError,'membership changed'):self.collect(source,old)

    def test_fingerprint_covers_record_content_and_capture_not_json_key_order(self):
        data=self.collect(Source());proof=inv.inventory_fingerprint(data)
        reordered=json.loads(json.dumps(data,sort_keys=True));self.assertEqual(inv.inventory_fingerprint(reordered),proof)
        reordered['stations'][0]['basin']='other';self.assertNotEqual(inv.inventory_fingerprint(reordered),proof)

    def test_real_cached_fetcher_still_rereads_mutable_metadata_and_count_controls(self):
        class Response:
            def __init__(self,url,raw):self.url,self.raw,self.headers=url,raw,{}
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return self.raw
        for mode in ['count','metadata']:
            source=Source();reads={'count':0,'metadata':0}
            def transport(request,timeout):
                url=request.full_url;raw=source(url)
                if url.startswith(inv.CITY+'/query') and parse_qs(urlsplit(url).query).get('returnCountOnly')==['true']:
                    reads['count']+=1
                    if mode=='count' and reads['count']==2:raw=json.dumps({'count':4}).encode()
                if url.startswith(inv.CITY+'?'):
                    reads['metadata']+=1
                    if mode=='metadata' and reads['metadata']==2:
                        data=json.loads(raw);data['editingInfo']['dataLastEditDate']+=1000;raw=json.dumps(data).encode()
                return Response(url,raw)
            fetch=orchestration.PublicFetch()
            with self.subTest(mode=mode),patch.object(orchestration,'urlopen',side_effect=transport),self.assertRaisesRegex(ValueError,'changed during capture'):
                self.collect(fetch)
            self.assertEqual(reads[mode],2)
            # Ordinary payload requests may still coalesce; controls may not.
            self.assertTrue(fetch.receipts)

    def test_unchanged_zone_edition_cannot_withdraw_a_known_lookup(self):
        prior=self.collect(Source());source=Source();source.polygons=[]
        with self.assertRaisesRegex(ValueError,'classification changed'):
            self.collect(source,prior)
        source=Source();source.polygons=[];source.edition+=1000
        revised=self.collect(source,prior)
        self.assertTrue(all(s['officialZone']is None for s in revised['stations']))


if __name__=='__main__':unittest.main()
