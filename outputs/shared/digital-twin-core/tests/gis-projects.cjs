'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Source=require('../source-core.js'),Gis=require('../gis.js');
const outputs=path.resolve(__dirname,'../../..');
function load(id){const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../projects/'+id+'.json')));const data=JSON.parse(fs.readFileSync(path.join(outputs,config.input.path)));const normalized=Source.normalizeScene(data,config);return {config,normalized,engine:Gis.createEngine(normalized)};}
test('HCMC actual sample normalizes 70726 representations and excludes 10 illustrations',()=>{
 const {normalized,engine}=load('hcmc');
 assert.equal(normalized.features.length,70726);assert.equal(normalized.normalization.excludedCount,0);
 assert.equal(engine.info().eligibleRepresentations,70716);assert.equal(engine.info().excludedRepresentations,10);assert.equal(engine.info().invalidRepresentations,0);
 const r=engine.query({mode:'corridor',geometry:{type:'LineString',coordinates:[[106.70057,10.77681],[106.70605,10.77247]]},distances:[25,50,100]});
 assert.deepEqual(r.scenarios.map(s=>s.summary.identityCount),[47,114,218]);
 assert.deepEqual(r.scenarios.map(s=>s.coverage.status),['within','within','within']);
 assert.ok(r.scenarios.every(s=>s.summary.unionAreaM2<=s.summary.intersectionAreaM2+.001));
 assert.ok(r.scenarios.every(s=>s.features.features.every(f=>f.properties.height.surveyed===false)));
 const sourceRoad=JSON.parse(fs.readFileSync(path.join(outputs,'hcmc-poc/data/scene.json'))).roads.find(r=>String(r.id)==='341504312');
 const mapped=engine.query({mode:'corridor',geometry:{type:'LineString',coordinates:sourceRoad.c.map(p=>Source.inverseLocal(p,normalized.frame))},distances:[25,50,100]});
 assert.deepEqual(mapped.scenarios.map(s=>s.summary.identityCount),[46,92,224]);
});
test('Gia Loc project was removed with the Tây Ninh datasets; the shared kernel keeps only the HCMC contract',()=>{
 assert.equal(fs.existsSync(path.resolve(__dirname,'../projects/gia-loc.json')),false);
});
