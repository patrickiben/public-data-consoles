#!/usr/bin/env python3
"""Keep the bounded WDI reader inline so public consoles remain standalone."""
from pathlib import Path
import argparse,re
ROOT=Path(__file__).resolve().parents[1]
SLUGS=['global-air-pollution','global-demographic-transition','global-health-atlas','global-health-systems','global-hiv-tb-malaria','global-immunization','global-maternal-child-health','global-mental-health','global-ncd-burden','global-nutrition','global-road-safety','global-wash','usaid-consequence']
START='<!-- WORLD_BANK_PUBLIC_RUNTIME_START -->';END='<!-- WORLD_BANK_PUBLIC_RUNTIME_END -->'
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args();block=START+'\n<script>\n'+(ROOT/'public-data-runtime/worldbank.js').read_text()+'\n</script>\n'+END
 dirty=[]
 for slug in SLUGS:
  p=ROOT/'consoles'/slug/'index.html';old=p.read_text();new=re.sub(re.escape(START)+r'[\s\S]*?'+re.escape(END),lambda _:block,old) if START in old else old.replace('<head>','<head>\n'+block,1)
  if new!=old:
   dirty.append(slug)
   if not args.check:p.write_text(new)
 if args.check and dirty:raise SystemExit('WDI runtime embedding differs: '+', '.join(dirty))
 print('PASS: canonical WDI runtime '+('matches' if args.check else 'embedded')+' in '+str(len(SLUGS))+' consoles')
if __name__=='__main__':main()
