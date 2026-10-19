# uso: python3 publish.py caminho/do/novo.html  -> grava app/index.html e app/version.json
import sys,hashlib,json,shutil,time,os
src=sys.argv[1];here=os.path.dirname(os.path.abspath(__file__))
dst=os.path.join(here,'app','index.html');shutil.copyfile(src,dst)
h=hashlib.sha256(open(dst,'rb').read()).hexdigest()
v=int(time.strftime('%Y%m%d%H%M'))
json.dump({'v':v,'sha256':h},open(os.path.join(here,'app','version.json'),'w'))
print('versão',v,h[:12])
