// Determine which DELETE-ALL paths still exist/tracked, and their refs from narrow runtime roots.
const fs=require('fs'), path=require('path');
const { execSync } = require('child_process');
const root = path.resolve(__dirname,'../..');
process.chdir(root);
const dir=__dirname+'/';
const read=f=>fs.readFileSync(dir+f,'utf8').split(/\r?\n/).filter(Boolean);

const ls = new Set(execSync('git ls-files -z',{maxBuffer:1<<30}).toString().split('\0').filter(Boolean));
const groups = { A:[...read('DEL2.txt'),...read('DECA.txt'),...read('REVIEW.txt')], B:read('legacy-only.txt'), C:read('TACH.txt') };
const deleteAll = read('DELETE-ALL.txt');

// narrow runtime roots
function walk(d,out){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); e.isDirectory()?walk(p,out):out.push(p);} }
const roots=new Set();
const hp=path.join(root,'outputs','hcmc-poc');
for(const f of fs.readdirSync(hp)){
  if(/^webgpu-materials-24\.(js|html)$/.test(f)) roots.add(path.join(hp,f));
  if(/-(2[4-9]|3[0-2])\.(js|css)$/.test(f)) roots.add(path.join(hp,f));
}
const sh=path.join(root,'outputs','shared'); if(fs.existsSync(sh)){const l=[];walk(sh,l);l.forEach(p=>roots.add(p));}
const scr=path.join(hp,'scripts');
for(const f of fs.readdirSync(scr)) if(/^qa-.*-3[12]\.cjs$/.test(f)) roots.add(path.join(scr,f));

const files=[...roots].filter(p=>fs.existsSync(p)).map(p=>({p, t:fs.readFileSync(p,'utf8')}));

const out={};
for(const [g,arr] of Object.entries(groups)){
  const existing=[...new Set(arr)].filter(p=>ls.has(p));
  const keepRef=[], del=[];
  for(const p of existing){
    const base=path.basename(p);
    const hit=files.filter(f=>f.t.includes(base)||f.t.includes(p)).map(f=>path.relative(root,f.p).split(path.sep).join('/'));
    if(hit.length) keepRef.push({p,hit}); else del.push(p);
  }
  out[g]={existing:existing.length, keepRef, del};
  fs.writeFileSync(dir+`remaining-${g}.list`, (del.length?del.join('\0')+'\0':''),'utf8');
}
console.log(JSON.stringify({A:out.A.existing,B:out.B.existing,C:out.C.existing},null,0));
console.log('A del',out.A.del.length,'keepRef',out.A.keepRef.length);
console.log('B del',out.B.del.length,'keepRef',out.B.keepRef.length);
console.log('C del',out.C.del.length,'keepRef',out.C.keepRef.length);
fs.writeFileSync(dir+'remaining-keep-ref.json',JSON.stringify(out,null,2),'utf8');
for(const g of ['A','B','C']){ console.log('--- '+g+' keepRef:'); for(const k of out[g].keepRef) console.log('  '+k.p+'  <= '+k.hit.join(', ')); }
