const {execSync}=require("child_process");const fs=require("fs");
const files=execSync("git ls-files",{maxBuffer:1e9}).toString().split("\n").filter(Boolean);
const skip=/^(node_modules|\.git)\//;
const max=3*1024*1024;
const hits=[];
for(const f of files){
  if(skip.test(f))continue;
  let st;try{st=fs.statSync(f)}catch(e){continue}
  if(st.size>max)continue;
  const b=fs.readFileSync(f);
  if(b.includes(0))continue;
  const t=b.toString("utf8");
  if(/gia-loc|gia_loc|giaLoc|tay-ninh|tayninh|Gia Lộc|Tây Ninh/i.test(t)){
    const lines=t.split(/\r?\n/).map((l,i)=>[i+1,l]).filter(([i,l])=>/gia-loc|gia_loc|giaLoc|tay-ninh|tayninh|Gia Lộc|Tây Ninh/i.test(l));
    hits.push([f,lines.length]);
  }
}
for(const [f,n] of hits)console.log(n+"\t"+f);
console.log("TOTAL_FILES="+hits.length);
