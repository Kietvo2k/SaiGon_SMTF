import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, STEP } from '../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../outputs/hcmc-poc/signal-plan-32.js?v=32a';
import { createSignalController32 } from '../outputs/hcmc-poc/traffic-controller-32.js?v=32a';
import { regionPolygon } from '../outputs/hcmc-poc/city-region-31.js?v=31a';
import { NORTH_DEMAND_32, lockNorthRegion32 } from '../outputs/hcmc-poc/smart-app-32.js?v=32a';
import { DEMAND_BY_HOUR_32 } from '../outputs/hcmc-poc/clock-32.js?v=32a';
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway:16,trunk:15,primary:14,secondary:11,tertiary:8,residential:5,living_street:4,service:3.5,unclassified:5,footway:2.5,pedestrian:12,cycleway:2,path:1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type]||4, D.roads[i].lanes*3.1) : WIDTHS[D.roads[i].type]||4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender!=='hide';
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const demand = { ...NORTH_DEMAND_32 };
const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: 31031, demand });
lockNorthRegion32(sim, regionPolygon('bac'));
sim.setLightFactor(1); sim.setFraction(DEMAND_BY_HOUR_32[17]);
const lanes = net.lanes;
const inDeg = new Map(), outDeg = new Map();
for (let l=0;l<net.NL;l++){ inDeg.set(lanes.to[l],(inDeg.get(lanes.to[l])||0)+1); outDeg.set(lanes.from[l],(outDeg.get(lanes.from[l])||0)+1); }
const q = new Float64Array(net.G.nodes.length); let n=0;
const steps=Math.round(300/STEP);
for(let k=0;k<steps;k++){ sim.step(); if(k%10===0){ const c=new Float64Array(net.G.nodes.length); for(let i=0;i<sim.N;i++) if(sim.active[i]&&sim.v[i]<.15) c[lanes.to[sim.lane[i]]]++; for(let x=0;x<c.length;x++) q[x]+=c[x]; n++; } }
const arr=[]; for(let x=0;x<q.length;x++) if((inDeg.get(x)||0)>=2&&(outDeg.get(x)||0)>=2) arr.push({node:x,mean:q[x]/n,in:inDeg.get(x),out:outDeg.get(x)});
arr.sort((a,b)=>b.mean-a.mean);
console.log('top congested nodes (in>=2,out>=2):');
for(const a of arr.slice(0,8)) console.log(a.node, 'mean=',a.mean.toFixed(2), 'in=',a.in,'out=',a.out, 'roads=', Array.from(new Set(Array.from({length:net.NL},(_,l)=>lanes.from[l]===a.node? net.G.roads[net.E[lanes.edge[l]].road]?.name:null).filter(Boolean))).slice(0,4).join(' / '));
// node 6702 natural
console.log('node 6702 mean q=', (q[6702]/n).toFixed(2), 'in=',inDeg.get(6702),'out=',outDeg.get(6702));
console.log('total stopped mean=', Array.from(q).reduce((a,b)=>a+b,0)/n);