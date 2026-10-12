const $=selector=>document.querySelector(selector);
const panel=$('#floodLab');
const launches=[...document.querySelectorAll('[data-open-flood]')];
const close=$('#closeFloodLab');
const select=$('#floodScenario');
const state=$('#floodState');
const observed=$('#floodObserved');
const missing=$('#floodMissing');
const missingCount=$('#floodMissingCount');
const evidence=$('#floodEvidence');
const rainInput=$('#rainAmount');
const rainOutput=$('#rainAmountValue');
const rainToggle=$('#toggleRain');
const rainCaption=$('#rainCaption');
const tideInput=$('#tideLevel');
const tideOutput=$('#tideLevelValue');
const severityOutput=$('#iocSeverity');
const depthOutput=$('#proxyDepth');
const windOutput=$('#windSpeed');
const alertBar=$('#iocAlertBar');
const collapsePanel=$('#collapseFloodLab');
const compactLevel=$('#floodCompactLevel');
const compactDepth=$('#floodCompactDepth');
const rainCanvas=$('#rainFx');
const rainContext=rainCanvas.getContext('2d',{alpha:true});

const labels={
  'rain hyetograph':'Biểu đồ mưa theo thời gian',
  'tide hydrograph':'Đường quá trình triều',
  'vertical datum':'Mốc cao độ thống nhất',
  'DTM':'DTM mặt đất',
  'drainage network':'Mạng thoát nước',
  'exact event year/time':'Thời điểm sự kiện chính xác',
  'station IDF/DDF curves':'Đường cong IDF/DDF trạm',
  'joint-probability method':'Xác suất đồng thời mưa–triều',
  'official alert thresholds':'Ngưỡng cảnh báo được duyệt'
};
const statusText={
  calibration_target_not_runnable:'Mục tiêu hiệu chỉnh · chưa đủ dữ liệu để chạy',
  blocked_missing_official_curves:'Kịch bản thiết kế · chờ đường cong chính thức',
  forcing_sources_ready_terrain_insufficient:'Sàng lọc vùng · địa hình chưa đủ cho độ sâu theo phố'
};
const statusClass=status=>status==='runnable'?'ready':status.includes('screening')?'screening':'blocked';

let catalog=null,registry=null;
let rainMm=0,tideM=1.4,rainPlaying=false,lastRainFrame=performance.now(),lastRainSync=0,redOverviewTriggered=false;
const drops=Array.from({length:1800},(_,index)=>({
  x:(index*73%1799)/1799,
  y:(index*151%1789)/1789,
  speed:.62+(index*47%101)/128,
  length:.5+(index*29%83)/83
}));

function resizeRain(){
  const scale=Math.min(devicePixelRatio||1,1.5);
  rainCanvas.width=Math.round(innerWidth*scale);rainCanvas.height=Math.round(innerHeight*scale);
  rainCanvas.style.width=`${innerWidth}px`;rainCanvas.style.height=`${innerHeight}px`;
  rainContext.setTransform(scale,0,0,scale,0,0);
}
resizeRain();window.addEventListener('resize',resizeRain);

function rendererApi(){return window.webgpuMaterials24?.setFloodRain?window.webgpuMaterials24:null;}
function focusPilot(){
  const api=rendererApi();
  if(api)api.selectView('flood25');
  else window.addEventListener('citylab:renderer-ready',()=>window.webgpuMaterials24?.selectView?.('flood25'),{once:true});
}
function focusOverview(){
  const api=rendererApi();
  if(api)api.selectView('overview');
  else window.addEventListener('citylab:renderer-ready',()=>window.webgpuMaterials24?.selectView?.('overview'),{once:true});
}
function rainfallLabel(mm){
  if(mm===0)return 'Khô · chưa tích lũy';
  if(mm<50)return 'Mưa nhẹ đến vừa';
  if(mm<100)return 'Mưa lớn';
  if(mm<150)return 'Mưa rất lớn';
  return 'Cực đoan · tiến tới sự kiện gần 200 mm';
}
function riskLabel(level){return level==='red'?'Đỏ':level==='orange'?'Cam':level==='yellow'?'Vàng':'Theo dõi';}
function updateIOC(){
  const rainRatio=rainMm/200,tideRatio=(tideM-1.4)/.4,severity=Math.min(1,rainRatio*.64+tideRatio*.36);
  const level=severity>=.78?'red':severity>=.55?'orange':severity>=.3?'yellow':'monitor';
  const proxyDepthM=Math.max(0,(severity-.08)/.92*.5),windKmh=rainMm<1?0:Math.round(8+rainRatio*42);
  const api=rendererApi();
  api?.setFloodScenario?.(rainMm,tideM);
  severityOutput.textContent=riskLabel(level);depthOutput.textContent=`${Math.round(proxyDepthM*100)} cm`;windOutput.textContent=`${windKmh} km/h`;
  compactLevel.textContent=`Cảnh báo ${riskLabel(level).toLowerCase()}`;compactDepth.textContent=`${Math.round(proxyDepthM*100)} cm`;
  document.body.dataset.iocLevel=level;
  alertBar.hidden=level!=='red';
  $('#alertRain').textContent=`${Math.round(rainMm)} mm`;$('#alertTide').textContent=`${tideM.toFixed(2).replace('.',',')} m`;$('#alertDepth').textContent=`${Math.round(proxyDepthM*100)} cm proxy`;
  if(level==='red'&&!redOverviewTriggered){redOverviewTriggered=true;focusOverview();history.replaceState(null,'','?v=31a&view=overview&scenario=stress-test');}
  if(level!=='red')redOverviewTriggered=false;
  window.floodIOC25={version:'30b',rainMm,tideM,severity,level,proxyDepthM,windKmh,mode:'bounded_visual_stress_test',forecast:false};
  return{rainRatio,tideRatio,severity,level,proxyDepthM,windKmh};
}
function updateRain(value,{syncInput=true}={}){
  rainMm=Math.max(0,Math.min(200,Number(value)||0));
  if(syncInput)rainInput.value=String(Math.round(rainMm));
  rainOutput.value=`${Math.round(rainMm)} mm`;
  rainOutput.textContent=`${Math.round(rainMm)} mm`;
  updateIOC();
  rainCaption.textContent=`${rainfallLabel(rainMm)} · Lớp nước là proxy thị giác chưa hiệu chỉnh. ${rainPlaying?'Bấm Dừng để giữ trạng thái và zoom.':'Có thể zoom, xoay và kiểm tra tuyến đường.'}`;
}
function updateTide(value,{syncInput=true}={}){
  tideM=Math.max(1.4,Math.min(1.8,Number(value)||1.4));
  if(syncInput)tideInput.value=tideM.toFixed(2);
  tideOutput.value=`${tideM.toFixed(2).replace('.',',')} m`;tideOutput.textContent=tideOutput.value;
  updateIOC();
}
function updateRainButton(){
  rainToggle.classList.toggle('active',rainPlaying);
  rainToggle.querySelector('b').textContent=rainPlaying?'Dừng mưa':rainMm>=200?'Chạy lại':'Chạy mưa';
}
function renderRain(now){
  const dt=Math.min(.05,(now-lastRainFrame)/1000);lastRainFrame=now;
  if(rainPlaying){
    rainMm=Math.min(200,rainMm+dt*8);
    if(now-lastRainSync>80){lastRainSync=now;updateRain(rainMm);}
  }
  rainContext.clearRect(0,0,innerWidth,innerHeight);
  const ratio=rainMm/200;
  if(ratio>0){
    rainContext.fillStyle=`rgba(206,220,222,${.035+ratio*.34})`;
    rainContext.fillRect(0,0,innerWidth,innerHeight);
    if(rainPlaying){
      const count=Math.round(80+ratio*1500),speed=260+ratio*720,gust=Math.sin(now*.0017)*(.35+ratio*.65),wind=4+ratio*13+gust*9;
      rainContext.lineWidth=.55+ratio*.85;
      rainContext.strokeStyle=`rgba(232,242,242,${.14+ratio*.48})`;
      rainContext.beginPath();
      for(let index=0;index<count;index++){
        const drop=drops[index],travel=(now*.001*drop.speed*speed)%(innerHeight+180),x=drop.x*innerWidth,y=(drop.y*innerHeight+travel)%(innerHeight+180)-90,length=7+ratio*28*drop.length;
        rainContext.moveTo(x,y);rainContext.lineTo(x-wind,y+length);
      }
      rainContext.stroke();
      rainContext.strokeStyle=`rgba(220,238,239,${.035+ratio*.11})`;rainContext.lineWidth=1+ratio*1.2;
      for(let band=0;band<3;band++){const y=(now*.045+band*innerHeight*.38)%(innerHeight+240)-120;rainContext.beginPath();rainContext.moveTo(-80,y);rainContext.bezierCurveTo(innerWidth*.3,y-35-gust*40,innerWidth*.7,y+28+gust*45,innerWidth+100,y-18);rainContext.stroke();}
    }
  }
  requestAnimationFrame(renderRain);
}
requestAnimationFrame(renderRain);

function sourceUrl(scenario){
  for(const id of scenario.sourceIds||[]){
    const entity=registry?.entities?.find(item=>item.id===id);
    const url=entity&&Object.values(entity.fields||{}).flatMap(cell=>cell.sources||[]).find(item=>item.url)?.url;
    if(url)return url;
  }
  return 'https://dost.hochiminhcity.gov.vn/hoat-dong-so-khcn/tp-ho-chi-minh-xay-dung-he-thong-moc-canh-bao-ngap-lut-tang-kha-nang-ung-pho-thien-tai-do-thi/';
}

function observationHtml(scenario){
  const o=scenario.observed||{};
  const items=[];
  if(o.quocHuongDepthM)items.push(`<div><span>Quốc Hương</span><b>${Math.round(o.quocHuongDepthM[0]*100)}–${Math.round(o.quocHuongDepthM[1]*100)} cm</b></div>`);
  if(o.thaoDienDepthM)items.push(`<div><span>Thảo Điền</span><b>${Math.round(o.thaoDienDepthM*100)} cm</b></div>`);
  if(o.nguyenVanHuongDepthM)items.push(`<div><span>Nguyễn Văn Hưởng</span><b>${Math.round(o.nguyenVanHuongDepthM*100)} cm</b></div>`);
  if(o.durationHoursLowerBound)items.push(`<div><span>Thời gian ngập</span><b>&gt; ${o.durationHoursLowerBound} giờ</b></div>`);
  if(scenario.rain?.totalApproxMm)items.push(`<div><span>Lượng mưa báo cáo</span><b>≈ ${scenario.rain.totalApproxMm} mm</b></div>`);
  if(!items.length&&scenario.kind==='screening_only')items.push('<div><span>Mức sử dụng</span><b>Chỉ sàng lọc vùng</b></div>');
  return items.join('');
}

function renderScenario(){
  if(!catalog)return;
  const scenario=catalog.scenarios.find(item=>item.id===select.value)||catalog.scenarios[0];
  const blocked=scenario.status!=='runnable';
  state.className=`flood-state ${statusClass(scenario.status)}`;
  state.innerHTML=`<i></i><span>${statusText[scenario.status]||scenario.status}</span>`;
  observed.innerHTML=observationHtml(scenario);
  const gaps=scenario.blockedBy||[];
  missing.innerHTML=gaps.length?gaps.map(item=>`<span>${labels[item]||item}</span>`).join(''):'<span class="screening-chip">Địa hình 30 m chỉ là proxy</span>';
  missingCount.textContent=gaps.length?`${gaps.length} mục`:'Giới hạn sử dụng';
  $('#runFloodScenario').disabled=blocked;
  evidence.href=sourceUrl(scenario);
}

function openPanel({focus=true}={}){
  panel.hidden=false;
  launches.forEach(button=>button.classList.add('active'));
  document.body.classList.add('flood-open');
  if(focus){focusPilot();history.replaceState(null,'','?v=31a&view=flood25');}
}
function closePanel(){panel.hidden=true;launches.forEach(button=>button.classList.remove('active'));document.body.classList.remove('flood-open');}

function savedCollapsed(){try{return localStorage.getItem('citylab.30b.panel.flood.collapsed')==='true';}catch{return false;}}
function setFloodCollapsed(collapsed){
  panel.classList.toggle('collapsed',collapsed);
  collapsePanel.classList.toggle('is-collapsed',collapsed);
  collapsePanel.setAttribute('aria-expanded',String(!collapsed));
  collapsePanel.setAttribute('aria-label',collapsed?'Mở rộng Flood Lab':'Thu gọn Flood Lab');
  try{localStorage.setItem('citylab.30b.panel.flood.collapsed',String(collapsed));}catch{}
}
setFloodCollapsed(savedCollapsed());

launches.forEach(button=>button.addEventListener('click',openPanel));
close.addEventListener('click',closePanel);
document.querySelectorAll('.nav-views [data-view]').forEach(button=>button.addEventListener('click',closePanel));
collapsePanel.addEventListener('click',()=>setFloodCollapsed(!panel.classList.contains('collapsed')));
select.addEventListener('change',renderScenario);
rainInput.addEventListener('input',()=>updateRain(rainInput.value));
tideInput.addEventListener('input',()=>updateTide(tideInput.value));
rainToggle.addEventListener('click',()=>{
  if(!rainPlaying&&rainMm>=200)updateRain(0);
  rainPlaying=!rainPlaying;updateRainButton();updateRain(rainMm);
});
$('#focusFloodRoads').addEventListener('click',focusPilot);
function activateWorstCase(){
  rainPlaying=true;updateRain(200);updateTide(1.8);updateRainButton();focusOverview();redOverviewTriggered=true;
  history.replaceState(null,'','?v=31a&view=overview&scenario=stress-test');
}
$('#worstCase').addEventListener('click',activateWorstCase);
window.addEventListener('citylab:renderer-ready',()=>{updateRain(rainMm);updateTide(tideM);});

try{
  [catalog,registry]=await Promise.all([
    fetch('data/flood-scenario-catalog-25.json').then(response=>{if(!response.ok)throw new Error(`catalog ${response.status}`);return response.json();}),
    fetch('data/flood-source-registry-25.json').then(response=>{if(!response.ok)throw new Error(`registry ${response.status}`);return response.json();})
  ]);
  select.innerHTML=catalog.scenarios.map(item=>`<option value="${item.id}">${item.label}</option>`).join('');
  if(catalog.scenarios.some(item=>item.id==='observed-thao-dien-august-report'))select.value='observed-thao-dien-august-report';
  $('#floodSources').textContent=registry.sourceCount;
  $('#floodClaims').textContent=registry.claimCount;
  renderScenario();
  updateRain(0);updateTide(1.4);updateRainButton();
  window.floodLab25={version:'30b',catalog,registry,mode:'fail-closed',state:'ready',visualProxy:'bounded_rain_tide'};
  const pageParams=new URLSearchParams(location.search);
  if(pageParams.get('scenario')==='stress-test'){openPanel({focus:false});activateWorstCase();}
  else if(pageParams.get('view')==='flood25')openPanel();
}catch(error){
  console.error('FLOOD25_ERROR',error);
  state.className='flood-state blocked';
  state.innerHTML='<i></i><span>Không nạp được registry · mô phỏng đã khóa</span>';
  window.floodLab25={version:'30b',mode:'fail-closed',state:'error',error:String(error)};
}
