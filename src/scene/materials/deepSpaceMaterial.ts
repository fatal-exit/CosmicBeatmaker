import * as THREE from "three";

export interface DeepSpaceUpdate {
  time?: number;
  intensity?: number;
  visualSeed?: number;
  nebulaColorA?: THREE.ColorRepresentation;
  nebulaColorB?: THREE.ColorRepresentation;
}

const DEEP_SPACE_VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SIMPLE_DEEP_SPACE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uNebulaColorA;
uniform vec3 uNebulaColorB;

varying vec3 vDirection;

#include <common>
#include <dithering_pars_fragment>

float hash31(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33 + uSeed * 17.0);
  return fract((point.x + point.y) * point.z);
}

float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float n000 = hash31(cell);
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
  float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
  float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
  return mix(lower, upper, local.z);
}

vec2 sphereUv(vec3 direction) {
  return vec2(
    atan(direction.z, direction.x) / PI2 + 0.5,
    asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
  );
}

float simpleStarLayer(vec2 uv) {
  vec2 grid = uv * vec2(68.0, 34.0);
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float identity = hash31(vec3(cell, 13.0));
  float radius = mix(0.035, 0.085, hash31(vec3(cell, 21.0)));
  float star = 1.0 - smoothstep(radius * 0.15, radius, length(local));
  float twinkle = 0.94 + 0.06 * sin(uTime * 0.3 + identity * 71.0);
  return star * step(0.965, identity) * twinkle;
}

void main() {
  vec3 direction = normalize(vDirection);
  vec2 uv = sphereUv(direction);
  float seedAngle = uSeed * PI2;
  vec3 seedVector = vec3(cos(seedAngle), sin(seedAngle * 0.73), sin(seedAngle));

  float broad = valueNoise(direction * 2.35 + seedVector * 2.4);
  float wisps = valueNoise(direction * 5.1 - seedVector.yzx * 3.8);
  float softDetail = valueNoise(direction * 9.2 + seedVector.zxy * 5.1);
  float cloud = broad * 0.58 + wisps * 0.3 + softDetail * 0.12;
  float band = smoothstep(
    0.12,
    0.86,
    1.0 - abs(direction.y + (wisps - 0.5) * 0.62 + seedVector.y * 0.16)
  );
  float nebulaBody = smoothstep(0.38, 0.68, cloud) * band;
  float softRidge = 1.0 - abs(wisps * 2.0 - 1.0);
  softRidge = pow(clamp(softRidge, 0.0, 1.0), 3.0);

  vec3 authoredPalette = mix(uNebulaColorA, uNebulaColorB, wisps);
  vec3 mobileLift = mix(vec3(0.12, 0.2, 0.42), vec3(0.36, 0.14, 0.46), wisps);
  vec3 nebula = mix(authoredPalette, mobileLift, 0.45);
  nebula *= nebulaBody * (0.18 + softRidge * 0.18);
  vec3 stars = vec3(0.66, 0.78, 1.0) * simpleStarLayer(uv) * 1.25;

  vec3 color = vec3(0.004, 0.006, 0.014) + nebula + stars;
  color *= clamp(uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

const DEEP_SPACE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uNebulaColorA;
uniform vec3 uNebulaColorB;

varying vec3 vDirection;

#include <common>
#include <dithering_pars_fragment>

float hash31(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33 + uSeed * 17.0);
  return fract((point.x + point.y) * point.z);
}

float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float n000 = hash31(cell);
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
  float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
  float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
  return mix(lower, upper, local.z);
}

float fbm(vec3 point) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 4; octave++) {
    value += valueNoise(point) * amplitude;
    point = point * 2.03 + vec3(7.1, -3.7, 5.4);
    amplitude *= 0.48;
  }
  return value;
}

vec2 sphereUv(vec3 direction) {
  return vec2(
    atan(direction.z, direction.x) / PI2 + 0.5,
    asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
  );
}

float starLayer(vec2 uv, float scale, float threshold, float seedOffset) {
  vec2 grid = uv * vec2(scale, scale * 0.5);
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float identity = hash31(vec3(cell, seedOffset));
  float radius = mix(0.055, 0.16, hash31(vec3(cell, seedOffset + 8.0)));
  float star = 1.0 - smoothstep(0.0, radius, length(local));
  float present = step(threshold, identity);
  float twinkle = 0.9 + 0.1 * sin(uTime * 0.42 + identity * 93.0);
  return star * present * twinkle;
}

vec3 galaxyProfile(vec3 direction, vec3 center, float seedOffset) {
  vec3 reference = abs(center.y) < 0.88
    ? vec3(0.0, 1.0, 0.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 axisX = normalize(cross(reference, center));
  vec3 axisY = normalize(cross(center, axisX));
  float facing = dot(direction, center);
  float x = dot(direction, axisX);
  float y = dot(direction, axisY) * 2.5;
  float radius = length(vec2(x, y));
  float angle = atan(y, x);
  float spiral = 0.5 + 0.5 * cos(angle * 2.0 - radius * 30.0 + seedOffset);
  float disc = exp(-radius * 9.5) * smoothstep(0.5, 0.995, facing);
  float arms = 0.16 + pow(spiral, 6.0) * 0.84;
  float dustLane = smoothstep(0.012, 0.07, abs(y));
  float core = exp(-radius * 34.0) * smoothstep(0.78, 0.998, facing);
  return vec3(disc * arms * mix(0.25, 1.0, dustLane), core, disc);
}

void main() {
  vec3 direction = normalize(vDirection);
  vec2 uv = sphereUv(direction);
  float seedAngle = uSeed * PI2;
  vec3 seedVector = vec3(cos(seedAngle), sin(seedAngle * 0.73), sin(seedAngle));

  vec3 warp = vec3(
    valueNoise(direction * 4.1 + seedVector * 3.2),
    valueNoise(direction * 4.1 + seedVector.yzx * 4.7),
    valueNoise(direction * 4.1 - seedVector.zxy * 5.3)
  ) - 0.5;
  float cloud = fbm(direction * 3.25 + warp * 2.8 + seedVector * 1.7);
  float filamentNoise = fbm(direction * 10.5 - warp * 4.4 - seedVector * 2.3);
  float filamentFine = fbm(direction * 22.0 + warp * 6.8 + seedVector * 4.6);
  float fineGrain = valueNoise(direction * 31.0 + warp * 6.2 + seedVector * 8.0);
  float dustNoise = valueNoise(direction * 5.8 - warp * 2.1);
  float broadRidge = 1.0 - abs(filamentNoise * 2.0 - 1.0);
  float fineRidge = 1.0 - abs(filamentFine * 2.0 - 1.0);
  broadRidge = pow(clamp(broadRidge, 0.0, 1.0), 6.0);
  fineRidge = pow(clamp(fineRidge, 0.0, 1.0), 8.0);
  float curl = 0.5 + 0.5 * sin(
    direction.x * 13.0 + direction.y * 19.0 + warp.z * 11.0 + cloud * 7.0
  );
  float filaments = broadRidge * (0.28 + pow(curl, 4.0) * 0.72);
  filaments += fineRidge * 0.45;
  float knots = smoothstep(0.8, 0.94, fineGrain + fineRidge * 0.16);
  float nebulaBody = smoothstep(0.5, 0.79, cloud);
  float dustLane = smoothstep(0.5, 0.74, dustNoise) * nebulaBody;
  float nebulaMask = nebulaBody * (0.075 + filaments * 0.925);
  nebulaMask *= smoothstep(0.08, 0.78, abs(direction.y + seedVector.y * 0.2));
  vec3 nebula = mix(uNebulaColorA, uNebulaColorB, filamentNoise);
  nebula *= nebulaMask * (0.07 + cloud * 0.11);
  nebula += vec3(0.12, 0.28, 0.7) * fineRidge * nebulaBody * 0.075;
  nebula += mix(uNebulaColorB, vec3(0.54, 0.68, 1.0), 0.58)
    * knots * nebulaBody * 0.08;
  nebula *= 1.0 - dustLane * 0.7;

  vec3 galaxyCenterA = normalize(vec3(
    -0.62 + seedVector.x * 0.12,
    -0.25 + seedVector.y * 0.1,
    -0.82
  ));
  vec3 galaxyCenterB = normalize(vec3(
    0.72 + seedVector.z * 0.1,
    -0.42 + seedVector.x * 0.08,
    -0.62
  ));
  vec3 galaxyA = galaxyProfile(direction, galaxyCenterA, seedAngle);
  vec3 galaxyB = galaxyProfile(direction, galaxyCenterB, seedAngle + 2.4);
  vec3 galaxies = mix(vec3(0.52, 0.66, 1.0), uNebulaColorB, 0.42)
    * galaxyA.x * 0.78;
  galaxies += vec3(1.0, 0.75, 0.42) * galaxyA.y * 1.08;
  galaxies += mix(vec3(0.46, 0.58, 1.0), uNebulaColorA, 0.42)
    * galaxyB.x * 0.58;
  galaxies += vec3(0.82, 0.9, 1.0) * galaxyB.y * 0.68;
  galaxies *= 0.72 + valueNoise(direction * 74.0 + seedVector * 9.0) * 0.28;

  float smallStars = starLayer(uv, 132.0, 0.97, 11.0);
  float brightStars = starLayer(uv + vec2(0.003, 0.007), 62.0, 0.992, 29.0);
  vec3 starColor = vec3(0.64, 0.76, 1.0) * smallStars * 1.15;
  starColor += vec3(1.0, 0.86, 0.66) * brightStars * 2.5;

  vec3 color = vec3(0.004, 0.006, 0.014);
  color += nebula + galaxies + starColor;
  color *= clamp(uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

function clampFinite(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function createDeepSpaceShaderMaterial(
  fragmentShader: string,
  name: string,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uSeed: { value: 0 },
      uNebulaColorA: { value: new THREE.Color(0x264f9f) },
      uNebulaColorB: { value: new THREE.Color(0x7a2a78) },
    },
    vertexShader: DEEP_SPACE_VERTEX_SHADER,
    fragmentShader,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    dithering: true,
  });
  material.name = name;
  return material;
}

export function createSimpleDeepSpaceMaterial(): THREE.ShaderMaterial {
  return createDeepSpaceShaderMaterial(
    SIMPLE_DEEP_SPACE_FRAGMENT_SHADER,
    "simple-deep-space-backdrop",
  );
}

export function createDeepSpaceMaterial(): THREE.ShaderMaterial {
  return createDeepSpaceShaderMaterial(
    DEEP_SPACE_FRAGMENT_SHADER,
    "detailed-deep-space-backdrop",
  );
}

export function updateDeepSpaceMaterial(
  material: THREE.ShaderMaterial,
  update: DeepSpaceUpdate,
): void {
  if (update.time !== undefined && Number.isFinite(update.time)) {
    material.uniforms.uTime.value = update.time;
  }
  if (update.intensity !== undefined) {
    material.uniforms.uIntensity.value = clampFinite(update.intensity, 0, 1);
  }
  if (update.visualSeed !== undefined) {
    const wrapped =
      ((Math.trunc(update.visualSeed) % 65_521) + 65_521) % 65_521;
    material.uniforms.uSeed.value = wrapped / 65_521;
  }
  if (update.nebulaColorA !== undefined) {
    (material.uniforms.uNebulaColorA.value as THREE.Color).set(
      update.nebulaColorA,
    );
  }
  if (update.nebulaColorB !== undefined) {
    (material.uniforms.uNebulaColorB.value as THREE.Color).set(
      update.nebulaColorB,
    );
  }
}
