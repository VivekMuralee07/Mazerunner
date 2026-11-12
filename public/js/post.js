// Post-processing chain (MSAA scene -> bloom -> god rays -> tone mapping -> finishing pass). One per view, so a split screen can have two.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function buildFx(renderer, scene, camera) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.07, 0.35, 1.05);
  composer.addPass(bloom);
  const rays = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, sun: { value: new THREE.Vector2(0.3, 1.2) }, intensity: { value: 0.2 } },
    vertexShader: VERT,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sun; uniform float intensity; varying vec2 vUv;
      void main(){
        vec4 base = texture2D(tDiffuse, vUv); vec2 dir = (sun - vUv) * (0.95 / 28.0), uv = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 28; i++) { uv += dir; vec3 s = texture2D(tDiffuse, uv).rgb; float l = dot(s, vec3(0.2126, 0.7152, 0.0722)); acc += s * smoothstep(0.8, 1.5, l) * decay; decay *= 0.94; }
        gl_FragColor = vec4(base.rgb + acc / 28.0 * intensity * vec3(1.0, 0.94, 0.8), base.a);
      }`,
  });
  composer.addPass(rays);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1280, 720) }, sat: { value: 1.1 }, contrast: { value: 1.12 }, vig: { value: 0.3 }, warm: { value: 0.012 }, sharp: { value: 0.38 }, ca: { value: 0.0018 }, grain: { value: 0.013 }, time: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float sat, contrast, vig, warm, sharp, ca, grain, time; varying vec2 vUv;
      void main(){
        vec2 q = vUv - 0.5; vec2 off = q * ca * dot(q, q) * 4.0;
        vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        vec2 px = 1.0 / res;
        vec3 n = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
        c += (c - n * 0.25) * sharp;                                                       // unsharp mask: crisper texture detail
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, sat); c = (c - 0.5) * contrast + 0.5; c += vec3(warm, warm * 0.4, -warm * 0.6);
        c *= 1.0 - vig * smoothstep(0.35, 0.95, length(q * vec2(1.1, 1.0)));
        c += (fract(sin(dot(vUv * res + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * grain;     // fine film grain
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  composer.addPass(grade);
  return { composer, bloom, rays, grade };
}

export function applyFxQuality(fx, cfg) {
  fx.bloom.enabled = cfg.bloom; fx.rays.enabled = cfg.rays;
  for (const t of [fx.composer.renderTarget1, fx.composer.renderTarget2]) { t.samples = cfg.samples; t.dispose(); }
}

export function disposeFx(fx) {
  try { fx.composer.renderTarget1.dispose(); fx.composer.renderTarget2.dispose(); fx.bloom.dispose && fx.bloom.dispose(); } catch { /* ignore */ }
}
