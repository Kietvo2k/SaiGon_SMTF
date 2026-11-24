const fs=require('fs');const dir=__dirname+'/';
const readNul=f=>fs.readFileSync(dir+f,'utf8').split('\0').filter(Boolean);
for(const g of ['FINAL-A','FINAL-B']){
  const a=readNul(g+'.list');
  const map={};
  for(const p of a){const parts=p.split('/');const key=parts.slice(0,3).join('/');map[key]=(map[key]||0)+1;}
  console.log('== '+g+' ('+a.length+')');
  Object.entries(map).sort((x,y)=>y[1]-x[1]).forEach(([k,v])=>console.log('  '+v+'\t'+k));
}
