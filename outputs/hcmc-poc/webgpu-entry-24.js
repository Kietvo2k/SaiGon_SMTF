/* Entry point from the stable WebGL demo into the isolated WebGPU/TSL material engine. */
(() => {
  'use strict';
  const button=document.createElement('button');
  button.id='webgpuMaterials24';
  button.innerHTML='✦ <span>WebGPU · vật liệu thật hóa</span>';
  button.title='Mở lõi vật liệu Three.js WebGPU/TSL';
  button.onclick=()=>{location.href='webgpu-materials-24.html?v=31a&view=bason';};
  if(typeof window.addVisualControl==='function')window.addVisualControl(button);else document.querySelector('.tools')?.append(button);
  const view=document.createElement('button');
  view.dataset.view='materials24';
  view.innerHTML='<small>24</small> WebGPU Materials';
  view.onclick=e=>{e.stopImmediatePropagation();location.href='webgpu-materials-24.html?v=31a&view=bason';};
  document.querySelector('.views')?.append(view);
  window.webgpuMaterialEntry24={version:'30b',href:'webgpu-materials-24.html?v=31a&view=bason'};
})();
