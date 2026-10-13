import json,pathlib,statistics,sys
lab=pathlib.Path(__file__).parent;root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else lab/'runs';runs=[json.loads(((root/f'{i}-{mode}'/'result.json') if (root/f'{i}-{mode}').is_dir() else root/f'{i}-{mode}.json').read_text()) for i,mode in enumerate(['off','on','off','on','off','on'],1)]
assert all(r['status']=='passed' for r in runs)
assert len({r.get('checkoutSha',r.get('sourceSha')) for r in runs})==1
assert len({r['packageSha256'] for r in runs})==1
assert all([s['canvasHash'] for s in r['steps']]==[s['canvasHash'] for s in runs[0]['steps']] for r in runs)
for r in runs:
 assert r['counts']==runs[0]['counts']
 if r['instrument']:
  assert len(r['snapshots'])==24
  assert sum(x['op']=='pixels' for x in r['snapshots'])==r['counts']['pixels']
  assert sum(x['op']=='ready' for x in r['snapshots'])==r['counts']['ready']
  for s in r['steps']:
   f=next(f for f in r['manifest']['fixtures'] if f['name']==s['name']);rgba=4*f['width']*f['height']
   assert s['after']['pixels']-s['before']['pixels']==3
   assert sum(x['op']=='pixels' and x['step']==s['i'] for x in r['snapshots'])==3
   assert s['allocations']['readbacks']==1 and s['allocations']['readbackBytes']==rgba
   assert s['allocations']['typedBytes']==3*rgba+(2304 if s['i'] in [2,3,4] else 1536)
  for op in ['status','preview','adjustments']:
   rs=[x for x in r['records'] if x['op']==op]
   assert len(rs)==(12 if op=='adjustments' else 6)
   assert all(x['ok'] and len(x['hashes'])==1 and x['allocations']==1 for x in rs)
def stats(v):return {'n':len(v),'min':min(v),'median':statistics.median(v),'max':max(v)}
summary={'runSet':root.name,'reportedCheckoutSha':runs[0].get('checkoutSha',runs[0].get('sourceSha')),'packageSha256':runs[0]['packageSha256'],'countsPerRun':runs[0]['counts'],'timings':{},'mainPerInstrumentedRun':{},'workerPerInstrumentedRun':{},'versions':runs[0]['versions']}
for mode in [False,True]:
 rr=[r for r in runs if r['instrument']==mode];summary['timings']['on' if mode else 'off']={k:stats([s[k] for r in rr for s in r['steps']]) for k in ['openMs','editMs','totalMs']}
r=runs[1]
for op in ['status','preview','adjustments']:
 rs=[x for x in r['records'] if x['op']==op];summary['mainPerInstrumentedRun'][op]={k:sum(x[k] for x in rs) for k in ['allocations','allocationBytes','payloadCopies','payloadBytes']};summary['mainPerInstrumentedRun'][op]['authenticatedHashes']=sum(len(x['hashes']) for x in rs)
summary['workerPerInstrumentedRun']={k:sum(s['allocations'][k] for s in r['steps']) for k in ['typedArrays','typedBytes','readbacks','readbackBytes']}
summary['pairedTotalDifferenceMs']=[sum(s['totalMs'] for s in runs[i+1]['steps'])-sum(s['totalMs'] for s in runs[i]['steps']) for i in [0,2,4]]
(lab/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
