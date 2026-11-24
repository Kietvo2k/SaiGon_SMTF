const fs=require('fs'),path=require('path');
const dir=__dirname+'/';const root=path.resolve(dir,'../..');process.chdir(root);
const deleted=new Set([...fs.readFileSync(dir+'FINAL-A.list','utf8').split('\0'),...fs.readFileSync(dir+'FINAL-B.list','utf8').split('\0')].filter(Boolean));
const kept=['README.md','outputs/hcmc-poc/README.md','GIT-DATA-PACKAGING.md','outputs/shared/digital-twin-core/README.md','outputs/hcmc-poc/index.html'];
for(const k of kept){
  if(!fs.existsSync(k)){console.log('MISSING '+k);continue;}
  const t=fs.readFileSync(k,'utf8');
  const hits=[];
  for(const p of deleted){
    const base=path.basename(p);
    if(t.includes(base)) hits.push({p,base});
  }
  console.log('\n### '+k+' : '+hits.length+' hits');
  for(const h of hits) console.log('   '+h.p);
}
