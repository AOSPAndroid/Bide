"""Build-time only: a compact index of the open fonts of Google Fonts (OFL,
Apache, UFL; Latin), so the app can shortlist faces from a page's letters and
download only those (src/web-fonts.ts). The shipped application never runs
this script. Requires fonttools and Pillow.

For every family at the pinned revision of google/fonts (the one the bundled
library was cut from), its Regular and Bold are drawn and each of 62 characters
(a-z A-Z 0-9) is reduced to a descriptor: the glyph's ink box scaled to 8x8
(4 bits a cell), its width over its height, and its height over the cap height.
Writes public/fonts/index.bin (descriptors) and public/fonts/index.json
(family, category, licence, files with sha256 and size).

  python3 scripts/build-font-index.py [--limit N] [--workers 8]
  python3 scripts/build-font-index.py --append bevietnampro
  python3 scripts/build-font-index.py --refresh-descriptors

The append mode reads only the requested families at the pinned revision. It
preserves the existing family records, row numbers, and descriptor bytes.
Refresh mode regenerates descriptors for the existing records only, checking
each source file against its existing pinned size and SHA-256.
"""
from pathlib import Path
import json,re,sys,io,hashlib,urllib.request,urllib.parse,urllib.error,concurrent.futures,argparse,struct
from PIL import Image,ImageDraw,ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT=Path(__file__).resolve().parent.parent
REV=json.loads((ROOT/'scripts/font-library-manifest.json').read_text())['revision']
RAW=f'https://raw.githubusercontent.com/google/fonts/{REV}/'
CACHE=ROOT/'node_modules/.cache/font-index';CACHE.mkdir(parents=True,exist_ok=True)
CHARS='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
SIZE=64

def get(url,binary=True):
 key=CACHE/hashlib.sha1(url.encode()).hexdigest()
 if key.exists():return key.read_bytes()
 with urllib.request.urlopen(url,timeout=120) as r:data=r.read()
 key.write_bytes(data);return data

def families():
 # The family list of fonts.google.com; each is looked for under ofl/, apache/ then ufl/ at the pinned revision.
 raw=get('https://fonts.google.com/metadata/fonts').decode('utf-8','replace');raw=raw[raw.index('{'):]
 return {re.sub('[^a-z0-9]','',f['family'].lower()):None for f in json.loads(raw)['familyMetadataList']}

def licence_of(slug):
 for licence in ('ofl','apache','ufl'):
  try:get(f'{RAW}{licence}/{slug}/METADATA.pb');return licence
  except urllib.error.HTTPError:continue
 return None

def descriptor(font_bytes):
 f=ImageFont.truetype(io.BytesIO(font_bytes),SIZE)
 cap_im=Image.new('L',(SIZE*3,SIZE*3),0);ImageDraw.Draw(cap_im).text((SIZE,SIZE),'H',font=f,fill=255);cap=cap_im.getbbox() or (0,0,1,SIZE);cap_h=max(1,cap[3]-cap[1]);out=bytearray()
 for ch in CHARS:
  # The ink itself: drawn with room around it, then cut to the pixels at 30% or more
  # (the font's own box starts at the origin, side bearing included).
  big=Image.new('L',(SIZE*3,SIZE*3),0);ImageDraw.Draw(big).text((SIZE,SIZE),ch,font=f,fill=255)
  box=big.point(lambda v:255 if v>=77 else 0).getbbox()
  if not box:out+=bytes(34);continue
  im=big.crop(box);w,h=im.size
  small=im.resize((8,8),Image.BOX).tobytes()
  cells=bytes(((small[i]>>4)<<4)|(small[i+1]>>4) for i in range(0,64,2))
  out+=cells+bytes([min(255,round(64*w/h)),min(255,round(128*h/cap_h))])
 return bytes(out)

def static(raw,weight):
 font=TTFont(io.BytesIO(raw))
 if 'fvar' not in font:return raw
 axes={a.axisTag:(max(a.minValue,min(a.maxValue,weight)) if a.axisTag=='wght' else a.defaultValue) for a in font['fvar'].axes}
 font=instantiateVariableFont(font,axes,inplace=True);buf=io.BytesIO();font.save(buf);return buf.getvalue()

def build(item):
 slug,licence=item
 try:
  licence=licence or licence_of(slug)
  if not licence:return None
  base=f'{RAW}{licence}/{slug}/';meta=get(base+'METADATA.pb').decode('utf-8','replace')
  if 'subsets: "latin"' not in meta:return None
  name=re.search(r'^name: "([^"]+)"',meta,re.M).group(1);category=(re.search(r'category: "([^"]+)"',meta) or [None,'DISPLAY'])[1]
  records=[(re.search(r'filename: "([^"]+)"',b).group(1),re.search(r'style: "([^"]+)"',b).group(1),int(re.search(r'weight: (\d+)',b).group(1))) for b in re.findall(r'fonts \{(.*?)\n\}',meta,re.S)]
  upright=[r for r in records if r[1]=='normal']
  if not upright:return None
  pick=lambda w:min(upright,key=lambda r:(abs(r[2]-w) if '[' not in r[0] else 0,r[0]))
  regular,bold=pick(400),pick(700);files={};descs=[]
  for style,rec,weight in (('Regular',regular,400),('Bold',bold,700)):
   variable='[' in rec[0] and 'wght' in rec[0]
   if style=='Bold' and not variable and rec[2]<600:continue
   raw=get(base+urllib.parse.quote(rec[0]))
   if rec[0] not in files:files[rec[0]]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'variable':variable}
   descs.append((style,rec[0],descriptor(static(raw,weight) if variable else raw)))
  # A face without the Latin alphabet (symbols, icons) is no use here.
  if sum(1 for i in range(0,len(descs[0][2]),34) if any(descs[0][2][i:i+32]))<50:return None
  return {'family':name,'slug':slug,'licence':licence,'category':{'SANS_SERIF':'sans','SERIF':'serif','MONOSPACE':'mono','HANDWRITING':'script'}.get(category,'display'),'files':files,'faces':[{'style':s,'file':f} for s,f,_ in descs],'_d':[d for _,_,d in descs]}
 except Exception as e:
  print('skip',slug,type(e).__name__,str(e)[:80],file=sys.stderr);return None

def validate_index(index,blob):
 if (index.get('revision'),index.get('chars'),index.get('cell'))!=(REV,CHARS,34):
  raise ValueError('The existing index must use the current pinned revision and descriptor format')
 rows=[face['row'] for family in index['families'] for face in family['faces']]
 if rows!=list(range(index['rows'])) or len(blob)!=index['rows']*len(CHARS)*34:
  raise ValueError('The existing descriptor rows or binary length are invalid')
 if len({family['slug'] for family in index['families']})!=len(index['families']):
  raise ValueError('The existing index contains duplicate family slugs')

def refresh_descriptors(index):
 blob=bytearray(index['rows']*len(CHARS)*34)
 for family in index['families']:
  files={}
  for name,pin in family['files'].items():
   raw=get(f"{RAW}{family['licence']}/{family['slug']}/{urllib.parse.quote(name)}")
   if len(raw)!=pin['bytes'] or hashlib.sha256(raw).hexdigest()!=pin['sha256']:
    raise ValueError(f"Pinned size or SHA-256 mismatch: {family['family']}/{name}")
   files[name]=raw
  for face in family['faces']:
   raw=files[face['file']]
   if family['files'][face['file']]['variable']:
    raw=static(raw,{'Regular':400,'Bold':700}[face['style']])
   d=descriptor(raw);at=face['row']*len(CHARS)*34
   if len(d)!=len(CHARS)*34:raise ValueError('Invalid descriptor length')
   blob[at:at+len(d)]=d
 return blob

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--limit',type=int,default=0)
 p.add_argument('--workers',type=int,default=8)
 p.add_argument('--append',action='append',default=[],metavar='SLUG',help='Append only this pinned Google Fonts family; repeat for more families')
 p.add_argument('--refresh-descriptors',action='store_true',help='Regenerate only existing rows from their size/SHA-256-verified pinned source files')
 a=p.parse_args()
 if a.workers<1 or a.limit<0:p.error('--workers must be positive and --limit cannot be negative')
 if a.append and a.limit:p.error('--append cannot be combined with --limit')
 if a.refresh_descriptors and (a.append or a.limit):p.error('--refresh-descriptors cannot be combined with --append or --limit')
 if any(not re.fullmatch('[a-z0-9]+',slug) for slug in a.append):p.error('--append requires a lowercase Google Fonts directory slug')
 out=ROOT/'public/fonts'
 if a.refresh_descriptors:
  index=json.loads((out/'index.json').read_text());blob=(out/'index.bin').read_bytes()
  validate_index(index,blob);blob=refresh_descriptors(index);validate_index(index,blob)
  (out/'index.bin').write_bytes(bytes(blob))
  print(len(index['families']),'families,',index['rows'],'faces,',len(blob),'bytes refreshed')
  return
 if a.append:
  index=json.loads((out/'index.json').read_text());blob=bytearray((out/'index.bin').read_bytes())
  validate_index(index,blob)
  existing={family['slug'] for family in index['families']}
  items=[(slug,None) for slug in sorted(set(a.append)-existing)]
 else:
  index={'revision':REV,'chars':CHARS,'cell':34,'rows':0,'families':[]};blob=bytearray()
  items=sorted(families().items())
  if a.limit:items=items[:a.limit]
 print(len(items),'families to append' if a.append else 'families listed',flush=True)
 done=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
  for n,r in enumerate(pool.map(build,items)):
   if r:done.append(r)
   if n%100==99:print(n+1,'read,',len(done),'kept',flush=True)
 if a.append and len(done)!=len(items):raise ValueError('A requested family could not be built; the existing index was not changed')
 for r in done:
  descs=r.pop('_d')
  for face,d in zip(r['faces'],descs):
   if len(d)!=len(CHARS)*34:raise ValueError('Invalid descriptor length')
   face['row']=index['rows'];blob+=d;index['rows']+=1
  index['families'].append(r)
 validate_index(index,blob)
 if not a.append or done:
  out.mkdir(parents=True,exist_ok=True)
  (out/'index.bin').write_bytes(bytes(blob))
  (out/'index.json').write_text(json.dumps(index,separators=(',',':')))
 print(len(index['families']),'families,',index['rows'],'faces,',len(blob),'bytes')

if __name__=='__main__':main()
