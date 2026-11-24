// Print exact-ish reference context for the candidates from remaining-keep-ref.json
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'); process.chdir(root);
const data=JSON.parse(fs.readFileSync(__dirname+'/remaining-keep-ref.json','utf8'));
function walk(d,out){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p,out):out.push(p);}}
const roots=new Set();
const hp='outputs/hcmc-poc';
for(const f of fs.readdirSync(hp)){ if(/^webgpu-materials-24\.(js|html)$/.test(f)||/-(2[4-9]|3[0-2])\.(js|css)$/.test(f)) roots.add(hp+'/'+f); }
const l=[];walk('outputs/shared',l); l.forEach(p=>roots.add(p.split(path.sep).join('/')));
for(const f of fs.readdirSync(hp+'/scripts')) if(/^qa-.*-3[12]\.cjs$/.test(f)) roots.add(hp+'/scripts/'+f);

for(const g of ['A','B','C']){
  for(const k of data[g].keepRef){
    const base=path.basename(k.p);
    console.log('\n### '+k.p);
    for(const rf of roots){
      const t=fs.readFileSync(rf,'utf8');
      let idx=0, found=0;
      while((idx=t.indexOf(base,idx))!==-1 && found<3){
        const s=Math.max(0,idx-60), e=Math.min(t.length,idx+base.length+20);
        console.log('  ['+rf+'] ...'+t.slice(s,e).replace(/\s+/g,' ')+'...');
        idx+=base.length; found++;
      }
    }
  }
}
