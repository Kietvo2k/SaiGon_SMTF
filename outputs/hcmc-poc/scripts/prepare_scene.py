import json,math,pathlib,re,collections,hashlib
from shapely.geometry import Polygon,LineString,box,mapping,shape
from shapely.ops import unary_union,polygonize,transform
from shapely import make_valid
r=pathlib.Path(__file__).resolve().parents[1]
lon0,lat0=106.7115,10.779; sx=111320*math.cos(math.radians(lat0)); sy=110574
bbox=[106.684,10.750,106.739,10.808]; clip=box(*bbox)
def xy(lon,lat):return ((lon-lon0)*sx,(lat0-lat)*sy)
def coords(g):return [(p['lon'],p['lat']) for p in g if 'lon'in p]
def poly(g):
 c=coords(g)
 if len(c)<4 or c[0]!=c[-1]:return None
 p=make_valid(Polygon(c)).intersection(clip)
 return p if not p.is_empty else None
def rings(p):
 if p.geom_type=='Polygon':return [[[round(v,2) for v in xy(*c)] for c in list(p.exterior.coords)[:-1]]]+[[[round(v,2) for v in xy(*c)] for c in list(i.coords)[:-1]] for i in p.interiors]
 return None
def polys(p):
 if p is None:return []
 if p.geom_type=='Polygon':return [p]
 return [q for q in getattr(p,'geoms',[]) if q.geom_type=='Polygon']
def num(s):
 try:return float(re.search(r'[\d.]+',str(s)).group())
 except:return None
ROAD_SKIP=['steps','construction','proposed']
def is_road(e):
 t=e.get('tags',{});return e['type']=='way' and 'highway'in t and t.get('highway') not in ROAD_SKIP
def road_parts(e):
 # Clipped lon/lat LineStrings of one road way, in the order emitted to D.roads.
 c=coords(e.get('geometry',[]))
 if len(c)<2:return []
 ln=LineString(c).intersection(clip)
 return [l for l in ([ln] if ln.geom_type=='LineString' else getattr(ln,'geoms',[])) if l.geom_type=='LineString']
def road_xy(l):return [[round(v,2) for v in xy(*c)]for c in l.coords]
def main():
 raw=json.loads((r/'data/osm-raw.json').read_text(encoding='utf-8')); es=raw['elements']
 parts=[]
 for e in es:
  if e['type']=='way' and 'building:part' in e.get('tags',{}):
   p=poly(e.get('geometry',[]))
   if p is not None:parts.extend(polys(p))
 # Parent shells receive low podiums when mapped parts cover them, avoiding full-height duplicates.
 from shapely.strtree import STRtree
 ptree=STRtree(parts)
 B=[];quality=collections.Counter();skips=collections.Counter()
 for e in es:
  t=e.get('tags',{})
  if e['type']!='way' or not ('building'in t or 'building:part'in t):continue
  p=poly(e.get('geometry',[]))
  if p is None:skips['invalid_or_outside']+=1;continue
  for p in polys(p):
   area=p.area*sx*sy
   if area<8:skips['area_below_8m2']+=1;continue
   height=num(t.get('height'));levels=num(t.get('building:levels'));src='height' if height else 'levels' if levels else 'estimated'
   h=height or (levels*3.2 if levels else (7.5 if area<55 else 12 if area<180 else 17 if area<700 else 24))
   # deterministic low-rise morphology; no fictitious towers
   if src=='estimated':h+=((e['id']%5)-2)*.65
   if 'building:part' not in t:
    hits=ptree.query(p,predicate='intersects')
    if len(hits) and sum(p.intersection(parts[i]).area for i in hits)/p.area>.25:h=min(h,9);src='podium';skips['parent_podium']+=1
   mn=num(t.get('min_height')) or 0
   if mn>=h:mn=0;skips['inconsistent_min_height']+=1
   c=p.centroid;glass=t.get('building:material')=='glass' or h>70
   name=t.get('name:vi',t.get('name',''))
   B.append({'id':e['id'],'name':name,'r':rings(p),'h':round(h,2),'min':mn,'q':src,'levels':levels,'rawHeight':height,'glass':glass,'type':t.get('building',t.get('building:part')),'roof':t.get('roof:shape'),'roofHeight':num(t.get('roof:height')),'roofDirection':num(t.get('roof:direction')),'center':[round(v,2) for v in xy(c.x,c.y)]})
   quality[src]+=1
 # Landmark 81: visual silhouette refinement; dimensions below are explicit illustrations.
 # Raw three OSM building parts are retained in osm-raw.json, not silently overwritten there.
 B=[b for b in B if b['id'] not in [622296616,622296617,622296618]]
 origin=(1124,-1768);angle=-.67
 heights=[[190,250,210],[295,410,350],[245,325,280]]
 for row in range(3):
  for col in range(3):
   cx=(col-1)*17;cz=(row-1)*17;rr=[]
   for dx,dz in [(-8,-8),(8,-8),(8,8),(-8,8)]:
    x=cx+dx;z=cz+dz;rr.append([round(origin[0]+x*math.cos(angle)-z*math.sin(angle),2),round(origin[1]+x*math.sin(angle)+z*math.cos(angle),2)])
   B.append({'id':622296615,'partIndex':row*3+col,'name':'Landmark 81 · bó tháp minh họa','r':[rr],'h':heights[row][col],'min':0,'q':'estimated','levels':None,'rawHeight':None,'glass':True,'type':'illustrative-landmark-part','roof':None,'roofHeight':None,'center':[sum(p[0]for p in rr)/4,sum(p[1]for p in rr)/4]})
 B.append({'id':622296615,'name':'Landmark 81 · đỉnh minh họa','r':[[[1121,-1771],[1127,-1771],[1127,-1765],[1121,-1765]]],'h':461.2,'min':410,'q':'estimated','levels':None,'rawHeight':461.2,'glass':True,'type':'illustrative-landmark-spire','roof':None,'roofHeight':None,'center':[1124,-1768]})
 # Merge Overture candidates conservatively by geometry overlap; preserve per-feature sources.
 overture_file=r/'data/overture-region.geojson'
 over_stats={}
 if overture_file.exists():
  ob=json.loads(overture_file.read_text(encoding='utf-8'))['features'];geom=[Polygon(b['r'][0],b['r'][1:]).buffer(0) for b in B];tree=STRtree(geom);added=[];matched=0;invalid=0
  for index,f in enumerate(ob):
   pr=f['properties']
   if pr.get('is_underground'):continue
   world=make_valid(shape(f['geometry'])).intersection(clip)
   for world in polys(world):
    p=transform(lambda x,y:((x-lon0)*sx,(lat0-y)*sy),world).buffer(0)
    if p.area<8:invalid+=1;continue
    ids=tree.query(p,predicate='intersects');overlap=sum(p.intersection(geom[i]).area for i in ids)/p.area
    if overlap>.1:matched+=1;continue
    h=pr.get('height');lv=pr.get('num_floors');q='height' if h else 'levels' if lv else 'estimated'
    ht=h or (lv*3.2 if lv else (7.5 if p.area<55 else 12 if p.area<180 else 17 if p.area<700 else 24))
    name=(pr.get('names') or {}).get('primary','');cp=p.representative_point()
    added.append({'id':2000000000+index,'gers':f['id'],'origin':'Overture','sourceRecords':[{'dataset':v.get('dataset'),'confidence':v.get('confidence')} for v in pr.get('sources',[])],'name':name,'r':rings(world),'h':round(ht,2),'min':0,'q':q,'levels':lv,'rawHeight':h,'glass':ht>70,'type':pr.get('class','yes'),'roof':None,'roofHeight':None,'center':[round(cp.x,2),round(cp.y,2)]})
  B.extend(added)
  over_stats={'release':'2026-08-19.0','downloaded':len(ob),'added':len(added),'overlappingExcluded':matched,'tinyExcluded':invalid,'heightPresentInDownload':sum(f['properties'].get('height') is not None for f in ob),'floorPresentInDownload':sum(f['properties'].get('num_floors') is not None for f in ob),'rule':'Reject candidate when >10% area overlaps OSM geometry. No claim of verified identity matching.'}
 # Apply the separately reviewed live-building delta. The patch is deliberately
 # fail-closed: stale locators or newly overlapping footprints are skipped.
 gap_file=r/'data/building-gap-22.json';gap_stats={}
 if gap_file.exists():
  gap=json.loads(gap_file.read_text(encoding='utf-8'));height_applied=0;height_skipped=0
  for correction in gap.get('heightCorrections',[]):
   candidates=[]
   for index,b in enumerate(B):
    if correction.get('gers') and b.get('gers')==correction['gers']:candidates.append((index,b))
    elif not correction.get('gers') and b.get('id')==correction.get('modelId'):candidates.append((index,b))
   candidates=[(index,b) for index,b in candidates if math.dist(b['center'],correction['center'])<.5 and abs(b['h']-correction['baselineHeightM'])<.05]
   if len(candidates)!=1:height_skipped+=1;continue
   index,b=candidates[0];b['baselineHeight']=b['h'];b['h']=correction['heightM'];b['q']='crosschecked';b['heightEvidence']={'method':'HCMGIS point-in-footprint + footprint-area compatibility + Google Temporal height agreement','googleHeightM':correction['googleHeightM'],'records':correction['evidence']};height_applied+=1
  geom=[Polygon(b['r'][0],b['r'][1:]).buffer(0) for b in B];tree=STRtree(geom);footprints_added=0;footprints_skipped=0
  for addition in gap.get('additions',[]):
   if any(b.get('id')==addition['osmId'] for b in B):footprints_skipped+=1;continue
   world=make_valid(Polygon(addition['coordinates'])).intersection(clip)
   for world_part in polys(world):
    p=transform(lambda x,y:((x-lon0)*sx,(lat0-y)*sy),world_part).buffer(0)
    if p.is_empty or p.area<8:footprints_skipped+=1;continue
    ids=tree.query(p,predicate='intersects');overlap=unary_union([p.intersection(geom[i]) for i in ids]).area/p.area if len(ids) else 0
    if overlap>.1:footprints_skipped+=1;continue
    height=num(addition.get('height'));levels=num(addition.get('levels'));q='height' if height else 'levels' if levels else 'estimated'
    h=height or (levels*3.2 if levels else (7.5 if p.area<55 else 12 if p.area<180 else 17 if p.area<700 else 24))
    if q=='estimated':h+=((addition['osmId']%5)-2)*.65
    cp=p.representative_point();B.append({'id':addition['osmId'],'origin':'OpenStreetMap-live','editTime':addition.get('editTime'),'name':addition.get('name') or '','r':rings(world_part),'h':round(h,2),'min':0,'q':q,'levels':levels,'rawHeight':height,'glass':h>70,'type':addition.get('building','yes'),'roof':None,'roofHeight':None,'roofDirection':None,'center':[round(cp.x,2),round(cp.y,2)]});geom.append(p);tree=STRtree(geom);footprints_added+=1
  gap_stats={'version':gap.get('version'),'osmChangesReviewed':gap.get('summary',{}).get('osmChangesReviewed'),'alreadyCovered':gap.get('summary',{}).get('alreadyCovered'),'geometryReviewQueue':gap.get('summary',{}).get('geometryReviewQueue'),'heightCorrectionsApplied':height_applied,'heightCorrectionsSkipped':height_skipped,'footprintsAdded':footprints_added,'footprintsSkipped':footprints_skipped,'status':gap.get('status')}
 quality=collections.Counter(b['q'] for b in B)
 skips['landmark_raw_parts_replaced_with_labeled_illustration']=3
 W=[];G=[];R=[]
 for e in es:
  t=e.get('tags',{}); p=None
  if t.get('natural')=='water':
   if e['type']=='way':p=poly(e.get('geometry',[]))
   elif e['type']=='relation':
    out=[];inn=[]
    for m in e.get('members',[]):
     c=coords(m.get('geometry',[]))
     if len(c)>1:(inn if m.get('role')=='inner' else out).append(LineString(c))
    if out:
     po=list(polygonize(unary_union(out)))
     if po:p=unary_union(po)
     if p is not None and inn:p=p.difference(unary_union(list(polygonize(unary_union(inn)))))
     if p is not None:p=make_valid(p).intersection(clip)
   W.extend(polys(p))
  elif e['type']=='way' and (t.get('leisure')=='park' or t.get('landuse') in ['forest','grass','meadow','recreation_ground','village_green']):
   G.extend(polys(poly(e.get('geometry',[]))))
  if is_road(e):
   for l in road_parts(e):R.append({'id':e['id'],'name':t.get('name',''),'type':t['highway'],'bridge':t.get('bridge') in ['yes','viaduct'],'tunnel':t.get('tunnel')=='yes','lanes':num(t.get('lanes')),'c':road_xy(l)})
 water=unary_union(W);greens=unary_union(G)
 data={'meta':{'center':[lon0,lat0],'bbox':bbox,'width':round((bbox[2]-bbox[0])*sx),'depth':round((bbox[3]-bbox[1])*sy),'areaKm2':round((bbox[2]-bbox[0])*sx*(bbox[3]-bbox[1])*sy/1e6,2),'sourceDate':raw['osm3s']['timestamp_osm_base'],'quality':dict(quality),'overture':over_stats,'buildingGap22':gap_stats,'renderedBuildings':len(B),'roads':len(R),'rawFeatures':len(es),'rawBuildingFeatures':sum('building' in e.get('tags',{}) or 'building:part' in e.get('tags',{}) for e in es),'ground':'flat reference plane; not surveyed terrain','imagery':'EOX Sentinel-2 2016/2017 CC BY 4.0'},'buildings':B,'roads':R,'water':[rings(p)for p in polys(water)],'green':[rings(p) for p in polys(greens)]}
 (r/'data/scene.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8',newline='\n')
 (r/'data/scene.js').write_text('window.CITY_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8',newline='\n')
 (r/'data/quality-report.json').write_text(json.dumps({'meta':data['meta'],'filterLog':dict(skips),'sourceSha256':hashlib.sha256((r/'data/osm-raw.json').read_bytes()).hexdigest(),'heightsAreSurveyed':False,'heightRule':'OSM height; else building:levels*3.2m; else footprint-area classes + deterministic <=1.3m variation. Parent footprints with mapped parts are rendered as <=9m podiums. Batch 22 corrections require an HCMGIS point inside the footprint, compatible area, and an independent Google Temporal 2023 height within the declared tolerance; they remain non-surveyed.','geometry':'OSM ways clipped with Shapely; water multipolygon relations assembled; local equirectangular metre projection; not a survey CRS'},ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
 print(json.dumps(data['meta'],ensure_ascii=False,indent=2));print('water rings',len(data['water']),'greens',len(data['green']),'bytes',(r/'data/scene.json').stat().st_size)
if __name__=='__main__':main()
