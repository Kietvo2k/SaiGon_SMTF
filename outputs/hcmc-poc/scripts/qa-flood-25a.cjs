const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const assert=require('assert');

const project=path.resolve(__dirname,'../../..');
const data=path.join(project,'outputs/hcmc-poc/data');
const domain=path.join(project,'research/hcmc-flood-digital-twin/refinery/hcmc-flood-sources');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};

const registry=readJson(path.join(data,'flood-source-registry-25.json'));
const catalog=readJson(path.join(data,'flood-scenario-catalog-25.json'));
const contract=readJson(path.join(data,'flood-model-contract-25.json'));
const manifest=readJson(path.join(domain,'capture-manifest.json'));
const floodUi=fs.readFileSync(path.join(project,'outputs/hcmc-poc/flood-ui-25.js'),'utf8');
const floodHtml=fs.readFileSync(path.join(project,'outputs/hcmc-poc/webgpu-materials-24.html'),'utf8');

check('Every captured raw source and normalized snapshot matches its SHA-256',()=>{
  assert.equal(manifest.sources.length,9);
  for(const source of manifest.sources){
    const raw=path.join(domain,source.raw),snapshot=path.join(domain,source.snapshot);
    assert(fs.existsSync(raw),`missing raw ${source.id}`);
    assert(fs.existsSync(snapshot),`missing snapshot ${source.id}`);
    assert.equal(sha256(raw),source.raw_sha256,`raw hash ${source.id}`);
    assert.equal(sha256(snapshot),source.snapshot_sha256,`snapshot hash ${source.id}`);
  }
});

check('Registry preserves provenance and honest-null semantics',()=>{
  assert.equal(registry.status,'refinery_verified');
  assert.equal(registry.sourceCount,9);
  assert.equal(registry.claimCount,64);
  assert.equal(registry.truthPolicy.honestNull,true);
  assert.equal(registry.truthPolicy.disputedValuesNotAutoResolved,true);
  for(const entity of registry.entities){
    for(const cell of Object.values(entity.fields)){
      assert(['null','sourced','corroborated','disputed'].includes(cell.state));
      if(cell.state==='null')assert.equal(cell.value,null);
      else for(const source of cell.sources){
        assert(source.url?.startsWith('https://'));
        assert.equal(source.rawSha256.length,64);
        assert(source.evidenceSpan.length>0);
      }
    }
  }
});

check('Scenario controls are bounded and incomplete physics fails closed',()=>{
  assert.equal(catalog.policy.unboundedControls,false);
  assert.equal(catalog.policy.syntheticPairsRequireJointProbability,true);
  assert.equal(catalog.policy.missingInputsDisableRun,true);
  assert.equal(catalog.citywide.warningLevels,3);
  assert(catalog.scenarios.length>=4);
  for(const scenario of catalog.scenarios){
    assert.notEqual(scenario.status,'runnable',`unexpected runnable scenario ${scenario.id}`);
    if(scenario.rain?.hyetograph===null)assert.notEqual(scenario.status,'runnable');
    if(scenario.tide?.datum===null)assert.notEqual(scenario.status,'runnable');
  }
});

check('Citywide contract and scenario catalogue agree',()=>{
  assert.equal(contract.scenarioPolicy.controlsAreBounded,true);
  assert.equal(contract.scenarioPolicy.unboundedSlidersForbidden,true);
  assert.equal(contract.warningPolicy.levels,catalog.citywide.warningLevels);
  assert.equal(contract.pilotArea.id,'thao-dien-compound-flood');
  assert.equal(contract.citywideScope.coverage,'Entire official Ho Chi Minh City administrative extent');
});

check('Demo keeps hydraulic solver fail-closed and labels visual depth as proxy',()=>{
  assert(floodHtml.includes('id="floodLab"'));
  assert(floodHtml.includes('flood-ui-25.js?v=31a'));
  assert(floodUi.includes("mode:'fail-closed'"));
  assert(floodUi.includes("$('#runFloodScenario').disabled=blocked"));
  assert(floodUi.includes("view=flood25"));
  assert(!floodUi.includes('Math.random'));
});

check('Rain interaction is scientifically bounded and zooms to observed corridors',()=>{
  assert(floodHtml.includes('id="rainAmount"'));
  assert(floodHtml.includes('max="200"'));
  assert(floodHtml.includes('id="toggleRain"'));
  assert(floodHtml.includes('id="focusFloodRoads"'));
  assert(floodUi.includes("api.selectView('flood25')"));
  assert(floodUi.includes("Math.min(200,Number(value)"));
  assert(floodUi.includes("visualProxy:'bounded_rain_tide'"));
});

check('IOC compound controls remain bounded and worst case is labelled stress test',()=>{
  assert(floodHtml.includes('id="tideLevel"'));
  assert(floodHtml.includes('min="1.40" max="1.80"'));
  assert(floodHtml.includes('id="worstCase"'));
  assert(floodHtml.includes('STRESS TEST · KHÔNG PHẢI DỰ BÁO'));
  assert(floodUi.includes('Math.min(1.8,Number(value)'));
  assert(floodUi.includes("mode:'bounded_visual_stress_test'"));
  assert(floodUi.includes("api.selectView('overview')"));
});

console.log(JSON.stringify({suite:'flood-25a',passed:checks.length,checks},null,2));
