from PIL import Image, __version__
from pathlib import Path
import json, hashlib
root=Path(__file__).parent/'fixtures';root.mkdir(exist_ok=True)
rows=[]
for name,w,h,seed in [('a',640,480,17),('b',800,600,43),('c',720,480,71)]:
 im=Image.new('RGB',(w,h));im.putdata([((x+seed)%256,(y*2+seed)%256,(x//8+y//8+seed*3)%256) for y in range(h) for x in range(w)])
 p=root/(name+'.jpg');im.save(p,'JPEG',quality=85);im.close()
 rows.append(dict(name=name+'.jpg',width=w,height=h,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
assert len({r['sha256'] for r in rows})==3
(root/'manifest.json').write_text(json.dumps({'pillow':__version__,'fixtures':rows},indent=2))
