"""Build-time only: refresh the extended offline font library from Google Fonts.
Requires fonttools; shipped application never runs this script or downloads fonts.
"""
from pathlib import Path
import json,re,urllib.request,hashlib,concurrent.futures,sys,io
sys.path.insert(0,str(Path('tmp/font-build').resolve()))
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont
ROOT=Path(__file__).resolve().parent.parent
families=json.loads((ROOT/'scripts/font-families.json').read_text())
manifest=ROOT/'scripts/font-library-manifest.json'
revision=json.loads(manifest.read_text())['revision'] if manifest.exists() else json.load(urllib.request.urlopen('https://api.github.com/repos/google/fonts/commits/main'))['sha']
base=f'https://raw.githubusercontent.com/google/fonts/{revision}/ofl/'
folder=ROOT/'src/browser/fonts/library';folder.mkdir(exist_ok=True)
licenses=ROOT/'public/licenses/fonts';licenses.mkdir(exist_ok=True)
def get(url):
 with urllib.request.urlopen(url,timeout=90) as r:return r.read()
def build(family):
 slug=re.sub('[^a-z0-9]','',family.lower());url=base+slug+'/'
 metadata=get(url+'METADATA.pb').decode();blocks=re.findall(r'fonts \{(.*?)\n\}',metadata,re.S)
 records=[]
 for block in blocks:
  def field(name):return re.search(name+r': "([^"]+)"',block).group(1)
  records.append((field('filename'),field('style'),int(re.search(r'weight: (\d+)',block).group(1))))
 license=get(url+'OFL.txt');(licenses/(slug+'-OFL.txt')).write_bytes(license)
 faces=[];cache={}
 for style,weight,italic in [('Regular',400,False),('Bold',700,False),('Italic',400,True),('BoldItalic',700,True)]:
  candidates=[r for r in records if (r[1]=='italic')==italic and (r[2]==weight or '[' in r[0])]
  if not candidates:continue
  filename=min(candidates,key=lambda r:abs(r[2]-weight))[0]
  if filename not in cache:cache[filename]=get(url+urllib.parse.quote(filename))
  raw=cache[filename];target=folder/(slug+'-'+style+'.ttf')
  font=TTFont(io.BytesIO(raw));variable='fvar' in font
  if variable:
   axes={a.axisTag:(weight if a.axisTag=='wght' else a.defaultValue) for a in font['fvar'].axes}
   font=instantiateVariableFont(font,axes,inplace=True)
   # Static derivatives use a distinct internal family name, respecting reserved names.
   internal='bide '+family
   for ident,value in [(1,internal),(2,style),(3,internal+' '+style),(4,internal+' '+style),(6,'bide-'+slug+'-'+style),(16,internal),(17,style)]:
    font['name'].setName(value,ident,3,1,0x409)
  options=subset.Options();options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
  subsetter=subset.Subsetter(options=options);subsetter.populate(unicodes=list(range(0x250))+list(range(0x1e00,0x1f00))+list(range(0x2000,0x2070))+list(range(0x20a0,0x20d0))+list(range(0x2100,0x2300)));subsetter.subset(font)
  internal='bide '+family
  for ident,value in [(1,internal),(2,style),(3,internal+' '+style),(4,internal+' '+style),(6,'bide-'+slug+'-'+style),(16,internal),(17,style)]:
   for record in list(font['name'].names):
    if record.nameID==ident:font['name'].names.remove(record)
   font['name'].setName(value,ident,3,1,0x409)
  target=folder/(slug+'-'+style+'.ttf');font.save(target);font.close()
  faces.append({'style':style,'file':target.name,'source':url+urllib.parse.quote(filename),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 if not any(f['style']=='Regular' for f in faces):raise ValueError('Missing regular '+family)
 category=re.search(r'category: "([^"]+)"',metadata).group(1)
 print(family+' '+str(len(faces)),flush=True)
 return {'family':family,'category':{'SANS_SERIF':'sans','SERIF':'serif','MONOSPACE':'mono','HANDWRITING':'script'}.get(category,'display'),'faces':faces}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(build,families))
(ROOT/'scripts/font-library-manifest.json').write_text(json.dumps({'revision':revision,'families':results},indent=2)+'\n')
imports=[];entries=[]
for i,f in enumerate(results):
 faces=[]
 for j,face in enumerate(f['faces']):
  var=f'library{i}face{j}';imports.append(f"import {var} from './browser/fonts/library/{face['file']}';")
  faces.append('{style:'+json.dumps(face['style'])+',url:'+var+'}')
 entries.append('{family:'+json.dumps(f['family'])+',category:'+json.dumps(f['category'])+',faces:['+','.join(faces)+']}')
(ROOT/'src/font-library.ts').write_text('\n'.join(imports)+'\nexport const extendedFonts=[\n'+',\n'.join(entries)+'\n];\n')
