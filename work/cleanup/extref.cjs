const {execSync}=require('child_process');const fs=require('fs'),path=require('path');
const dir=__dirname+'/';const root=path.resolve(dir,'../..');process.chdir(root);
const list=fs.readFileSync(dir+(process.argv[2]||'FINAL-B.list'),'utf8').split('\0').filter(Boolean);
let total=0;
for(const p of list){
  let out='';
  try{ out=execSync(`git grep -l --fixed-strings -- ${JSON.stringify(p)} -- ":!work/**"`,{encoding:'utf8'}); }catch(e){ out=''; }
  const hits=out.split(/\r?\n/).filter(Boolean).filter(f=>f!==p);
  if(hits.length){ total+=hits.length; console.log(p+'\n   <= '+hits.join('\n   <= ')); }
}
console.log('TOTAL external refs: '+total);
