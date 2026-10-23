#!/usr/bin/env python3
"""Collect keyless WDI population/land denominators for the displayed country comparisons."""
from pathlib import Path
import argparse,datetime,hashlib,json,math,re,urllib.parse,urllib.request
ROOT=Path(__file__).resolve().parents[1]
SLUGS=['global-air-pollution','global-demographic-transition','global-health-atlas','global-health-systems','global-hiv-tb-malaria','global-immunization','global-maternal-child-health','global-mental-health','global-ncd-burden','global-nutrition','global-road-safety','global-wash']
OUT=ROOT/'consoles/global-health-atlas/data/population-area.json'
IND={'population':'SP.POP.TOTL','landArea':'AG.LND.TOTL.K2'}
def validate(data):
 if data.get('schemaVersion')!=1:raise ValueError('Unknown context schema')
 if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z',data['capturedAt']):raise ValueError('Invalid UTC capture')
 captured=datetime.datetime.fromisoformat(data['capturedAt'].replace('Z','+00:00'))
 if captured>datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1):raise ValueError('Future capture')
 if not data.get('countries') or len(data.get('sources',[]))!=2:raise ValueError('Missing context coverage')
 for key,indicator in IND.items():
  if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',data['sourceUpdatedAt'][key]):raise ValueError('Invalid source edition date')
  date=datetime.date.fromisoformat(data['sourceUpdatedAt'][key])
  if date>datetime.date.today()+datetime.timedelta(days=1):raise ValueError('Future edition')
  source=next(s for s in data['sources'] if s['id']==key)
  if source['indicator']!=indicator or not re.fullmatch(r'[a-f0-9]{64}',source['responseSha256']):raise ValueError('Invalid provenance')
 for code,row in data['countries'].items():
  if not re.fullmatch(r'[A-Z]{3}',code):raise ValueError('Invalid country')
  for key in IND:
   if not row.get(key) or not any(v is not None for v in row[key].values()):raise ValueError('Missing country series')
   for y,v in row[key].items():
    if not re.fullmatch(r'\d{4}',y) or not 2000<=int(y)<=datetime.date.today().year:raise ValueError('Invalid observation year')
    if v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0 or key=='population' and v>2**53-1):raise ValueError('Invalid denominator')
 return data

def collect():
 codes=set()
 for slug in SLUGS:
  snap=json.loads(re.search(r'let SNAP=(.*?);\s*\n',(ROOT/'consoles'/slug/'index.html').read_text()).group(1));codes.update(snap['cty'])
 end=datetime.date.today().year;data={'schemaVersion':1,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'sourceUpdatedAt':{},'sources':[],'countries':{c:{'population':{},'landArea':{}}for c in sorted(codes)}}
 for key,indicator in IND.items():
  rows=[];dig=hashlib.sha256();seen=set();page=1;pages=1;edition=None;total=None
  while page<=pages:
   url='https://api.worldbank.org/v2/country/'+';'.join(sorted(codes))+'/indicator/'+indicator+'?'+urllib.parse.urlencode({'format':'json','date':f'2000:{end}','per_page':20000,'page':page})
   with urllib.request.urlopen(url,timeout=20) as response:raw=response.read()
   dig.update(raw);d=json.loads(raw);m,items=d
   if not isinstance(items,list) or int(m['page'])!=page or not 1<=int(m['pages'])<=20 or int(m['total'])<1:raise ValueError('Incomplete WDI pagination')
   if edition is not None and (edition!=m['lastupdated'] or total!=int(m['total']) or pages!=int(m['pages'])):raise ValueError('Changing WDI edition')
   edition=m['lastupdated'];total=int(m['total']);pages=int(m['pages']);rows.extend(items);page+=1
  if len(rows)!=total:raise ValueError('Truncated WDI series')
  for row in rows:
   c=row['countryiso3code'];y=row['date'];value=row['value'];identity=(c,y)
   if c not in codes or row['indicator']['id']!=indicator or identity in seen:raise ValueError('Unexpected/duplicate WDI observation')
   seen.add(identity);data['countries'][c][key][y]=value
  data['sourceUpdatedAt'][key]=edition;data['sources'].append({'id':key,'indicator':indicator,'url':'https://api.worldbank.org/v2/country/'+';'.join(sorted(codes))+'/indicator/'+indicator+'?format=json&date=2000:'+str(end)+'&per_page=20000','definitionUrl':'https://api.worldbank.org/v2/indicator/'+indicator+'?format=json','unit':'people (midyear resident estimate)' if key=='population' else 'km² (land excluding inland waters)','responseSha256':dig.hexdigest(),'retrievedAt':data['capturedAt']})
 validate(data)
 if OUT.exists():
  old=validate(json.loads(OUT.read_text()))
  for key in IND:
   if data['sourceUpdatedAt'][key]<old['sourceUpdatedAt'][key]:raise ValueError('Older source edition')
  for c,row in old['countries'].items():
   for key in IND:
    for y,v in row[key].items():
     if v is not None and data['countries'].get(c,{}).get(key,{}).get(y) is None:raise ValueError('Prior denominator withdrawn; retain last-good artifact for review')
 return data

def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args()
 if a.check:data=validate(json.loads(OUT.read_text()))
 else:
  data=collect();OUT.parent.mkdir(exist_ok=True);tmp=OUT.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':'))+'\n');tmp.replace(OUT)
 print('PASS WDI population/land context:',len(data['countries']),'countries; source editions',data['sourceUpdatedAt'])
if __name__=='__main__':main()
