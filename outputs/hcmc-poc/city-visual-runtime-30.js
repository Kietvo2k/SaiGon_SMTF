import * as THREE from 'three/webgpu';
import {
  abs, bool, builtinAOContext, clamp, dot, emissive, float, fract, length, max, mix,
  mrt, normalView, output, pass, screenSize, screenUV, sin, smoothstep, time, uniform,
  vec2, vec3, vec4, velocity
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

/*
 * City Visual Runtime 30
 *
 * A quality-scaled WebGPU/TSL presentation pipeline for the HCMC twin.
 * The geometry and evidence model remain independent from the renderer. The
 * presentation profile uses official Three.js r186 nodes instead of a WebGL
 * post-processing dependency, and keeps a direct-render escape hatch in the
 * caller if a browser cannot compile the graph.
 */

const PROFILES = Object.freeze({
  performance: Object.freeze({
    id: 'performance', label: 'Hiệu năng', temporalAA: false, gtao: false,
    gtaoScale: 0, gtaoSamples: 0, bloom: false, bloomStrength: 0,
    sharpen: true, sharpenStrength: 1.42, cascades: 1, shadowSize: 1024,
    shadowFar: 2600, minPixelRatio: .82, maxPixelRatio: 1.15,
    targetLowFps: 46, targetHighFps: 58
  }),
  balanced: Object.freeze({
    id: 'balanced', label: 'Cân bằng', temporalAA: true, gtao: true,
    gtaoScale: .42, gtaoSamples: 6, bloom: true, bloomStrength: .055,
    sharpen: true, sharpenStrength: 1.28, cascades: 2, shadowSize: 1536,
    shadowFar: 3000, minPixelRatio: .9, maxPixelRatio: 1.35,
    targetLowFps: 38, targetHighFps: 54
  }),
  presentation: Object.freeze({
    id: 'presentation', label: 'Trình diễn', temporalAA: true, gtao: true,
    gtaoScale: .55, gtaoSamples: 8, bloom: true, bloomStrength: .075,
    sharpen: true, sharpenStrength: 1.18, cascades: 3, shadowSize: 2048,
    shadowFar: 3400, minPixelRatio: 1.0, maxPixelRatio: 1.55,
    targetLowFps: 31, targetHighFps: 48
  })
});

export function resolveVisualQuality(requested = 'presentation', actualWebGPU = true) {
  const key = Object.hasOwn(PROFILES, requested) ? requested : 'presentation';
  // The WebGL backend remains a compatibility path. It retains the same TSL
  // materials but avoids the temporal/MRT stack and multi-cascade shadow node.
  if (!actualWebGPU && key !== 'performance') {
    return { ...PROFILES.balanced, id: 'balanced-webgl', label: 'Cân bằng · WebGL', temporalAA: false, gtao: false, cascades: 1 };
  }
  return { ...PROFILES[key] };
}

function gradePresentation(source) {
  const luma = dot(source.rgb, vec3(.2126, .7152, .0722));
  let graded = mix(vec3(luma), source.rgb, 1.032).sub(.5).mul(1.038).add(.5);
  const shadowWeight = float(1).sub(smoothstep(.14, .55, luma));
  const highlightWeight = smoothstep(.62, 1.15, luma);
  graded = graded.add(vec3(-.004, .006, .014).mul(shadowWeight));
  graded = graded.add(vec3(.012, .006, -.003).mul(highlightWeight));

  const radial = length(screenUV.sub(.5).mul(vec2(1, .78)));
  const vignette = float(1).sub(smoothstep(.4, .76, radial).mul(.105));
  const grain = fract(
    sin(dot(screenUV.mul(screenSize), vec2(12.9898, 78.233)).add(time.mul(17.13))).mul(43758.5453)
  ).sub(.5).mul(.0035);
  return vec4(clamp(graded.mul(vignette).add(grain), 0, 16), source.a);
}

function createFallbackDepthPipeline(renderer, scene, camera, quality) {
  const scenePass = pass(scene, camera);
  const source = scenePass.getTextureNode();
  const depthTexture = scenePass.getTextureNode('depth');
  const texel = vec2(float(1).div(screenSize.x), float(1).div(screenSize.y));
  const sample = (x, y) => source.sample(screenUV.add(texel.mul(vec2(x, y)))).rgb;
  const sampleDepth = (x, y) => depthTexture.sample(screenUV.add(texel.mul(vec2(x, y)))).r;

  const soft = source.rgb.mul(.28)
    .add(sample(1.4, 0).mul(.12)).add(sample(-1.4, 0).mul(.12))
    .add(sample(0, 1.4).mul(.12)).add(sample(0, -1.4).mul(.12))
    .add(sample(2.4, 2.4).mul(.06)).add(sample(-2.4, 2.4).mul(.06))
    .add(sample(2.4, -2.4).mul(.06)).add(sample(-2.4, -2.4).mul(.06));
  const localDetail = source.rgb.sub(soft).mul(.11);
  const centerDepth = depthTexture.sample(screenUV).r;
  const depthEdge = max(
    max(abs(centerDepth.sub(sampleDepth(1.2, 0))), abs(centerDepth.sub(sampleDepth(-1.2, 0)))),
    max(abs(centerDepth.sub(sampleDepth(0, 1.2))), abs(centerDepth.sub(sampleDepth(0, -1.2))))
  );
  const foreground = float(1).sub(smoothstep(.985, .9997, centerDepth));
  const microContact = smoothstep(.00003, .0017, depthEdge).mul(foreground).mul(.075);
  const composed = vec4(source.rgb.add(localDetail).mul(float(1).sub(microContact)), source.a);
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputNode = quality.sharpen ? sharpen(gradePresentation(composed), quality.sharpenStrength, bool(true)) : gradePresentation(composed);
  return {
    pipeline, scenePass, temporalPass: null, aoPass: null,
    effects: ['depth-micro-contact', 'bounded-local-contrast', 'grade', 'rcas-denoise']
  };
}

const WARM_FRAMES = 4;   // số khung đầu luôn chạy đủ mọi pass (pipeline dựng sẵn) kể cả khi vào thẳng Tối thiểu

export function createCityRenderPipeline(renderer, scene, camera, quality = PROFILES.presentation) {
  if (!quality.gtao && !quality.temporalAA) {
    const fallback = createFallbackDepthPipeline(renderer, scene, camera, quality);
    return {
      name: `City Visual Runtime 30 · ${quality.label}`,
      profile: quality,
      effects: fallback.effects,
      ambientOcclusion: false,
      ambientOcclusionReady: false,
      setAmbientOcclusionScale: () => false,
      setAmbientOcclusion: () => false,
      bloom: false,
      setBloom: () => false,
      render: () => fallback.pipeline.render(),
      dispose: () => fallback.pipeline.dispose()
    };
  }

  // AO needs a stable normal/depth pre-pass. Keeping it separate avoids a
  // circular graph when the beauty pass consumes the AO as a lighting context.
  const normalPass = pass(scene, camera);
  normalPass.setMRT(mrt({ output: normalView }));
  const normalTexture = normalPass.getTextureNode('output');
  const normalDepth = normalPass.getTextureNode('depth');

  const aoPass = quality.gtao ? ao(normalDepth, normalTexture, camera) : null;
  if (aoPass) {
    aoPass.resolutionScale = quality.gtaoScale;
    aoPass.samples.value = quality.gtaoSamples;
    aoPass.radius.value = 9.5;
    aoPass.thickness.value = 2.2;
    aoPass.scale.value = .92;
    aoPass.useTemporalFiltering = quality.temporalAA;
  }

  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, velocity, emissive }));
  // aoStrength = 0 ⇒ mức AO luôn là 1 (không che): tắt GTAO chỉ là đổi giá trị uniform + bỏ qua hai pass, KHÔNG đổi graph.
  const aoStrength = uniform(1);
  if (aoPass) scenePass.contextNode = builtinAOContext(mix(float(1), aoPass.getTextureNode().sample(screenUV).r, aoStrength));

  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneVelocity = scenePass.getTextureNode('velocity');
  let temporalPass = null;
  let composed = sceneColor;

  if (quality.temporalAA) {
    temporalPass = traa(sceneColor, sceneDepth, sceneVelocity, camera);
    temporalPass.depthThreshold = .00072;
    temporalPass.edgeDepthDiff = .00125;
    composed = temporalPass;
  }

  let bloomPass = null;
  if (quality.bloom) {
    const emissiveTexture = scenePass.getTextureNode('emissive');
    bloomPass = bloom(emissiveTexture, quality.bloomStrength, .28, .72);
    bloomPass.smoothWidth.value = .22;
    composed = composed.add(bloomPass);
  }

  composed = gradePresentation(composed);
  if (quality.sharpen) composed = sharpen(composed, quality.sharpenStrength, bool(true));

  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputNode = composed;

  // Mật độ "Tối thiểu" (bước G 31A) tắt GTAO và bloom mà KHÔNG dựng lại graph hay pipeline:
  // - GTAO: aoStrength = 0 làm mức AO trong pass cảnh luôn bằng 1; pass GTAO vẫn chạy ở độ phân giải rất thấp (xem bên dưới); pass pháp
  //   tuyến chỉ vẽ một tam giác "mồi" (renderObject tạm thời bỏ qua mọi vật thể khác) ⇒ không còn draw call pháp tuyến cho
  //   cảnh. Phải giữ pass GTAO chạy: pass pháp tuyến được kích hoạt từ lúc quad GTAO dựng render object (đã đo bằng log
  //   renderer.render) và bóng CSM được vẽ lồng bên trong pass pháp tuyến (MRT không velocity). Bỏ pass GTAO/pháp tuyến thì bóng
  //   chuyển sang pass cảnh (MRT có velocity ⇒ vật liệu bóng khác) và three dựng lại ~130 pipeline bóng mỗi lần đổi chế độ ở
  //   một góc nhìn chưa ghé (khung đứng hình 0,3–1,2 s; bản 30B+G: ~1,2 s). Camera, layer, graph, render target giữ nguyên nên
  //   vào/ra Tối thiểu không dựng lại pipeline nào. Bật lại: biên dịch bất đồng bộ pass pháp tuyến cho khung nhìn hiện tại
  //   (compileAsync) rồi mới vẽ lại toàn cảnh, chạy 2 khung cho texture AO mới và đặt aoStrength = 1 (không hiện AO cũ).
  // - Bloom: strength = 0, chạy thêm PAUSE_FRAMES khung để texture về 0 rồi bỏ qua pass.
  // - WARM_FRAMES khung đầu luôn chạy đủ mọi pass (kể cả khi vào thẳng Tối thiểu) để pipeline được dựng sẵn.
  const PAUSE_FRAMES = 2, skipUpdate = () => {};
  const bloomStrength = bloomPass ? bloomPass.strength.value : 0;
  let bloomEnabled = !!bloomPass, bloomPending = 0;
  const setBloom = enabled => {
    if (!bloomPass) return false;
    bloomEnabled = !!enabled;
    bloomPass.strength.value = bloomEnabled ? bloomStrength : 0;
    if (bloomEnabled) { bloomPending = 0; delete bloomPass.updateBefore; } else bloomPending = PAUSE_FRAMES;
    return bloomEnabled;
  };
  const sentinelGeometry = new THREE.BufferGeometry();
  sentinelGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -50, 0, 0.001, -50, 0, 0, -50, 0.001], 3));
  sentinelGeometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const sentinel = new THREE.Mesh(sentinelGeometry, new THREE.MeshStandardNodeMaterial({ color: '#000000' }));
  sentinel.name = 'GTAO · tam giác mồi (giữ bóng CSM ở pass pháp tuyến khi AO tắt)';
  sentinel.frustumCulled = false; sentinel.castShadow = false; sentinel.receiveShadow = true; sentinel.visible = false;
  scene.add(sentinel);
  let normalHostOnly = false;
  let warm = WARM_FRAMES;
  if (aoPass) {
    const hostOnly = (object, ...args) => { if (object === sentinel) renderer.renderObject(object, ...args); };
    const proto = Object.getPrototypeOf(normalPass).updateBefore;
    normalPass.updateBefore = function (frame) {
      if (!normalHostOnly || warm > 0) return proto.call(this, frame);
      const previous = renderer.getRenderObjectFunction();
      renderer.setRenderObjectFunction(hostOnly);
      try { return proto.call(this, frame); } finally { renderer.setRenderObjectFunction(previous); }
    };
  }
  // Độ phân giải GTAO theo mức (hệ số nhân gtaoScale): resolutionScale đổi không dựng lại shader (khác `samples` được nướng
  // vào shader nên đổi sẽ biên dịch lại), chỉ cấp lại render target AO một lần mỗi lần đổi.
  let aoScaleFactor = 1;
  const setAmbientOcclusionScale = factor => {
    if (!aoPass) return false;
    const next = Math.max(.08, Math.min(1, +factor || 1));
    if (Math.abs(next - aoScaleFactor) < 1e-6) return true;
    aoScaleFactor = next; aoPass.resolutionScale = quality.gtaoScale * next;
    return true;
  };
  let aoEnabled = !!aoPass, aoRestore = 0, aoResuming = false, aoToken = 0;
  const setAmbientOcclusion = enabled => {
    if (!aoPass) return false;
    const next = !!enabled;
    if (next === aoEnabled) return aoEnabled;
    aoEnabled = next;
    const token = ++aoToken;
    if (!aoEnabled) { aoStrength.value = 0; aoRestore = 0; aoResuming = false; normalHostOnly = true; sentinel.visible = true; return false; }
    aoResuming = true;
    const resume = () => { if (token !== aoToken || !aoEnabled) return; aoResuming = false; normalHostOnly = false; sentinel.visible = false; aoRestore = 2; };
    let compiling = null;
    const target = renderer.getRenderTarget(), activeMrt = renderer.getMRT();
    try {
      renderer.setRenderTarget(normalPass.renderTarget); renderer.setMRT(normalPass.getMRT());
      compiling = renderer.compileAsync(scene, camera);
    } catch (error) { console.warn('GTAO: biên dịch trước pass pháp tuyến lỗi, bật trực tiếp.', error); }
    finally { renderer.setRenderTarget(target); renderer.setMRT(activeMrt); }
    if (compiling) compiling.then(resume, resume); else resume();
    return true;
  };
  const effects = [
    quality.gtao && `GTAO ${quality.gtaoSamples}s @ ${Math.round(quality.gtaoScale * 100)}%`,
    quality.temporalAA && 'TRAA velocity/depth',
    quality.bloom && 'selective emissive bloom',
    'grade', quality.sharpen && 'RCAS denoise'
  ].filter(Boolean);

  return {
    name: `City Visual Runtime 30 · ${quality.label}`,
    profile: quality,
    effects,
    get ambientOcclusion() { return aoEnabled; },
    setAmbientOcclusion,
    // true khi GTAO đã chạy thật (không đang biên dịch bất đồng bộ để bật lại, không còn đếm khung chờ)
    setAmbientOcclusionScale,
    get ambientOcclusionScale() { return aoScaleFactor; },
    get ambientOcclusionReady() { return aoEnabled && !aoResuming && aoRestore === 0; },
    get bloom() { return bloomEnabled; },
    setBloom,
    render: () => {
      if (warm > 0) warm--;
      pipeline.render();
      if (aoPass && aoEnabled && aoRestore > 0 && --aoRestore === 0) aoStrength.value = 1;
      if (bloomPass && bloomPending > 0 && warm === 0 && --bloomPending === 0) bloomPass.updateBefore = skipUpdate;
    },
    dispose: () => { sentinel.removeFromParent(); sentinelGeometry.dispose(); sentinel.material.dispose(); pipeline.dispose(); }
  };
}

export function createCityShadowSystem({ renderer, light, quality, camera }) {
  if (renderer.backend?.isWebGPUBackend && quality.cascades > 1) {
    light.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    light.shadow.camera.near = 3;
    light.shadow.camera.far = quality.shadowFar + 1400;
    light.shadow.bias = -.000045;
    light.shadow.normalBias = .38;
    const csm = new CSMShadowNode(light, {
      cascades: quality.cascades,
      maxFar: quality.shadowFar,
      mode: 'practical',
      lightMargin: 420
    });
    // Leave `camera` null here. CSMShadowNode must run its own `_init()` from
    // the active node builder; pre-assigning it skips cascade allocation and
    // turns the light contribution black.
    light.shadow.shadowNode = csm;
    return {
      type: 'cascaded', cascades: quality.cascades, mapSize: quality.shadowSize,
      maxFar: quality.shadowFar, update: () => {}, dispose: () => csm.dispose()
    };
  }

  return {
    type: 'single', cascades: 1, mapSize: light.shadow.mapSize.x,
    maxFar: light.shadow.camera.far,
    update(target, cameraDistance) {
      const span = THREE.MathUtils.clamp(cameraDistance * .78, 620, 4300);
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
      const shadowCamera = light.shadow.camera;
      if (Math.abs(shadowCamera.right - span) > 12) {
        shadowCamera.left = shadowCamera.bottom = -span;
        shadowCamera.right = shadowCamera.top = span;
        shadowCamera.near = Math.max(40, cameraDistance * .018);
        shadowCamera.far = Math.max(7200, cameraDistance * 1.8);
        shadowCamera.updateProjectionMatrix();
      }
    },
    dispose() {}
  };
}

export function createAdaptiveQuality(renderer, options = {}) {
  const nativeRatio = Math.min(devicePixelRatio || 1, options.maxRatio || 1.55);
  const minRatio = Math.min(nativeRatio, options.minRatio || 1);
  const lowFps = options.lowFps || 31;
  const highFps = options.highFps || 48;
  let ratio = nativeRatio;
  let elapsed = 0;
  let frames = 0;
  let cooldown = 0;
  let fps = 60;

  const apply = next => {
    const rounded = Math.round(THREE.MathUtils.clamp(next, minRatio, nativeRatio) * 20) / 20;
    if (Math.abs(rounded - ratio) < .025) return;
    ratio = rounded;
    renderer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight, false);
  };

  return {
    get pixelRatio() { return ratio; },
    get fps() { return fps; },
    update(dt, cameraDistance, interacting) {
      elapsed += dt;
      frames++;
      cooldown = Math.max(0, cooldown - dt);
      if (elapsed < 1.35) return;
      fps = frames / elapsed;
      if (cooldown <= 0) {
        if (fps < lowFps) { apply(ratio - .12); cooldown = 3; }
        else if (fps > highFps && !interacting && cameraDistance < 6500) { apply(ratio + .08); cooldown = 4; }
      }
      elapsed = 0;
      frames = 0;
    },
    resize() {
      renderer.setPixelRatio(ratio);
      renderer.setSize(innerWidth, innerHeight, false);
    }
  };
}

export function smoothDampScalar(state, key, target, smoothTime, dt) {
  const velocityKey = `${key}Velocity`;
  const omega = 2 / Math.max(.0001, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
  const change = state[key] - target;
  const velocityValue = state[velocityKey] || 0;
  const temp = (velocityValue + omega * change) * dt;
  state[velocityKey] = (velocityValue - omega * temp) * decay;
  state[key] = target + (change + temp) * decay;
  return state[key];
}

export function smoothDampVector(current, velocityValue, target, smoothTime, dt) {
  for (const axis of ['x', 'y', 'z']) {
    const state = { value: current[axis], valueVelocity: velocityValue[axis] };
    smoothDampScalar(state, 'value', target[axis], smoothTime, dt);
    current[axis] = state.value;
    velocityValue[axis] = state.valueVelocity;
  }
  return current;
}
