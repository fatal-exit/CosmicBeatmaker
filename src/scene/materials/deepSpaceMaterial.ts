import * as THREE from "three";

export interface DeepSpaceUpdate {
  time?: number;
  intensity?: number;
  visualSeed?: number;
  nebulaColorA?: THREE.ColorRepresentation;
  nebulaColorB?: THREE.ColorRepresentation;
  backgroundColor?: THREE.ColorRepresentation;
  starfieldColor?: THREE.ColorRepresentation;
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
uniform vec3 uBackgroundColor;
uniform vec3 uStarfieldColor;

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

float simpleStarLayer(vec2 uv, float scale, float threshold, float size) {
  vec2 grid = uv * vec2(scale, scale * 0.5);
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float identity = hash31(vec3(cell, size * 13.0));
  float radius = mix(0.025, 0.075, hash31(vec3(cell, size * 21.0))) * size;
  float star = 1.0 - smoothstep(0.0, radius, length(local));
  float glint = 0.96 + 0.04 * sin(uTime * 0.16 + identity * 71.0);
  return star * step(threshold, identity) * glint;
}

float narrowBand(vec3 direction, vec3 axis, float center, float width,
  float sharedWarpNoise) {
  float coordinate = dot(direction, axis);
  float warp = (sharedWarpNoise - 0.5) * 0.09;
  return exp(-pow((coordinate - center + warp) / width, 2.0) * 4.0);
}

void main() {
  vec3 direction = normalize(vDirection);
  vec2 uv = sphereUv(direction);
  float seedAngle = uSeed * PI2 + uTime * 0.009;
  vec3 axisA = normalize(vec3(cos(seedAngle), 0.48, sin(seedAngle)));
  vec3 axisB = normalize(vec3(-sin(seedAngle * 0.7), -0.35, cos(seedAngle * 0.7)));
  vec3 axisC = normalize(vec3(
    0.35 + 0.18 * sin(seedAngle * 0.42),
    -0.72,
    0.46 + 0.16 * cos(seedAngle * 0.58)
  ));
  // Low/Balanced deliberately use a few narrow directional lanes. Keeping
  // the cloud mask local prevents value noise from becoming a viewport-wide
  // cellular wallpaper on phone-sized canvases.
  float frontWindow = smoothstep(-0.12, 0.68, -direction.z);
  // Reuse one shared 3D lane warp across all bands to keep the cheap profile
  // bounded to two value-noise samples while preserving coherent structure.
  float sharedLaneNoise = valueNoise(direction * 7.0 + axisA * 2.4);
  float bandA = narrowBand(direction, axisA, 0.06, 0.12, sharedLaneNoise)
    * frontWindow * smoothstep(-0.38, 0.56, direction.x);
  float bandB = narrowBand(direction, axisB, -0.26, 0.085, sharedLaneNoise)
    * frontWindow * smoothstep(-0.38, 0.56, -direction.x) * 0.72;
  float bandC = narrowBand(direction, axisC, 0.04, 0.06, sharedLaneNoise)
    * frontWindow * 0.28;
  float laneTexture = sharedLaneNoise;
  float filament = pow(
    1.0 - abs(sin(dot(direction, vec3(13.0, 7.0, -11.0))
      + seedAngle * 1.6 + laneTexture * 1.8)),
    12.0
  );
  float dustCutout = 1.0 - smoothstep(0.5, 0.78,
    valueNoise(direction * 11.0 + axisB * 2.2)) * 0.52;
  float laneMask = clamp(
    (bandA * (0.36 + filament * 0.64) + bandB + bandC) * dustCutout,
    0.0,
    1.0
  );
  vec3 authoredPalette = mix(uNebulaColorA, uNebulaColorB,
    0.24 + bandB * 0.6 + laneTexture * 0.12);
  vec3 nebula = authoredPalette * laneMask * 0.58;
  // Two very thin dust cuts and a handful of deterministic specks supply
  // texture in the quiet pockets without rebuilding a second broad cloud.
  float dustLaneA = pow(
    1.0 - abs(sin(dot(direction, vec3(8.0, 3.0, -5.0)) + seedAngle * 1.7)),
    18.0
  ) * frontWindow;
  float dustLaneB = pow(
    1.0 - abs(sin(dot(direction, vec3(-4.0, 5.0, 8.0)) - seedAngle * 0.8)),
    24.0
  ) * frontWindow;
  nebula += mix(uNebulaColorA, uNebulaColorB, 0.52)
    * (dustLaneA * 0.035 + dustLaneB * 0.024);
  vec3 dustCell = floor(direction * 54.0 + vec3(uSeed * 9.0));
  vec3 dustLocal = fract(direction * 54.0 + vec3(uSeed * 9.0)) - 0.5;
  float dustIdentity = hash31(dustCell);
  float dustPoint = 1.0 - smoothstep(0.018, 0.072, length(dustLocal));
  nebula += mix(uNebulaColorA, uNebulaColorB, 0.58)
    * dustPoint * step(0.945, dustIdentity) * 0.045;
  vec2 driftingUv = uv + vec2(uTime * 0.0007, -uTime * 0.0004);
  vec3 stars = uStarfieldColor * (
    simpleStarLayer(driftingUv, 76.0, 0.865, 0.66) * 0.72
    + simpleStarLayer(driftingUv + vec2(0.017, 0.009), 42.0, 0.94, 1.08) * 1.2
    + simpleStarLayer(driftingUv + vec2(0.031, -0.011), 124.0, 0.93, 0.42) * 0.52
    + simpleStarLayer(driftingUv + vec2(-0.021, 0.024), 174.0, 0.968, 0.28) * 0.28
  );

  vec3 color = uBackgroundColor + nebula + stars;
  color = mix(uBackgroundColor, color, clamp(uIntensity, 0.0, 1.0));
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
uniform vec3 uBackgroundColor;
uniform vec3 uStarfieldColor;

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
  // Three broad octaves keep the high profile's filaments coherent while
  // avoiding the fourth full value-noise lattice at every fragment.
  for (int octave = 0; octave < 3; octave++) {
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
  float radius = mix(0.009, 0.032, hash31(vec3(cell, seedOffset + 8.0)));
  float distanceToCenter = length(local);
  float halo = 1.0 - smoothstep(0.0, radius, distanceToCenter);
  float core = 1.0 - smoothstep(0.0, radius * 0.34, distanceToCenter);
  float star = halo * 0.24 + core * 0.92;
  float present = step(threshold, identity);
  float twinkle = 0.95 + 0.05 * sin(uTime * 0.18 + identity * 93.0);
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
  float y = dot(direction, axisY) * 2.9;
  float radius = length(vec2(x, y));
  float angle = atan(y, x);
  float spiral = 0.5 + 0.5 * cos(angle * 2.0 - radius * 39.0 + seedOffset);
  float disc = exp(-radius * 10.2) * smoothstep(-0.04, 0.94, facing);
  float arms = 0.1 + pow(spiral, 7.0) * 0.9;
  float dustLane = 1.0 - smoothstep(0.014, 0.052, abs(y + sin(x * 17.0) * 0.012));
  float core = exp(-radius * 38.0) * smoothstep(0.34, 0.994, facing);
  return vec3(disc * arms * (1.0 - dustLane * 0.72), core, disc);
}

vec3 magellanicCluster(vec3 direction, vec3 center, vec3 axisX, vec3 axisY,
  float seedOffset, float irregularSignal) {
  vec3 normal = normalize(center);
  vec3 tangentX = normalize(axisX - normal * dot(axisX, normal));
  vec3 tangentY = normalize(cross(normal, tangentX));
  vec3 projectedY = axisY - normal * dot(axisY, normal);
  tangentY *= dot(tangentY, projectedY) < 0.0 ? -1.0 : 1.0;
  float facing = dot(direction, normal);
  float x = dot(direction, tangentX);
  float y = dot(direction, tangentY);
  // Reuse a detail signal already sampled by the main lane instead of
  // evaluating a second cluster-specific noise field.
  float irregular = clamp(irregularSignal, 0.0, 1.0);
  float radius = length(vec2(x * 1.48, y * 0.92));
  float edgeWarp = (irregular - 0.5) * 0.045;
  float silhouette = (1.0 - smoothstep(0.018, 0.16 + edgeWarp, radius))
    * smoothstep(0.18, 0.82, facing)
    * (0.72 + irregular * 0.28);
  float knots = starLayer(
    vec2(atan(y, x) / PI2 + 0.5, radius),
    34.0,
    0.945,
    seedOffset + 19.0
  );
  float knotField = smoothstep(0.62, 0.9, irregular)
    * (1.0 - smoothstep(0.025, 0.18, radius));
  float compactKnot = pow(max(0.0, knotField), 1.6);
  return vec3(silhouette, max(knots, compactKnot), irregular * silhouette);
}

void main() {
  vec3 direction = normalize(vDirection);
  vec2 uv = sphereUv(direction);
  float seedAngle = uSeed * PI2 + uTime * 0.007;
  vec3 seedVector = vec3(cos(seedAngle), sin(seedAngle * 0.73), sin(seedAngle));
  vec3 flowVector = vec3(uTime * 0.012, -uTime * 0.009, uTime * 0.008);

  // High keeps its extra detail inside authored astronomical structures. The
  // chromatic base is intentionally calm; filaments and dust are local lanes,
  // never an all-sky FBM mask that reads as fluid wallpaper.
  vec3 bandAxis = normalize(vec3(cos(seedAngle), 0.48, sin(seedAngle)));
  vec3 secondAxis = normalize(vec3(-sin(seedAngle * 0.72), -0.34,
    cos(seedAngle * 0.72)));
  float frontWindow = smoothstep(-0.12, 0.72, -direction.z);
  // Preserve a quiet focal pocket around the stellar system so nebula lanes
  // frame the planets instead of drawing a bright seam through the star.
  float centerQuiet = smoothstep(0.16, 0.44,
    length(direction - vec3(0.0, 0.0, -1.0)));
  float rightWindow = smoothstep(-0.3, 0.52, direction.x);
  float leftWindow = smoothstep(-0.3, 0.52, -direction.x);
  float laneWarp = (valueNoise(direction * 7.5 + seedVector * 2.2 + flowVector)
    - 0.5) * 0.09;
  float bandCoordinate = dot(direction, bandAxis) + laneWarp;
  float bandA = exp(-pow((bandCoordinate - 0.1) / 0.105, 2.0) * 3.7)
    * frontWindow * rightWindow;
  float bandB = exp(-pow((bandCoordinate + 0.34) / 0.075, 2.0) * 4.0)
    * frontWindow * leftWindow * 0.66;
  float bandC = exp(-pow((dot(direction, secondAxis) - 0.03) / 0.052, 2.0)
    * 4.0) * frontWindow * 0.32;
  float directionalBand = clamp(bandA + bandB + bandC, 0.0, 1.0);
  float filamentNoise = fbm(direction * 9.0 - seedVector * 2.3 + flowVector.yzx);
  float filamentFine = valueNoise(direction * 27.0 + seedVector * 4.8 + flowVector.zxy);
  float broadRidge = pow(1.0 - abs(filamentNoise * 2.0 - 1.0), 10.0);
  float fineRidge = pow(1.0 - abs(filamentFine * 2.0 - 1.0), 14.0);
  float filaments = broadRidge * 0.68 + fineRidge * 0.44;
  float dustNoise = valueNoise(direction * 8.4 - seedVector * 1.7 + flowVector);
  float laneCut = 1.0 - smoothstep(0.46, 0.78, dustNoise) * 0.7;
  float filamentShape = 0.05 + filaments * 0.72;
  float nebulaMask = directionalBand * filamentShape * laneCut;
  vec3 nebula = mix(uNebulaColorA, uNebulaColorB,
    0.2 + filamentNoise * 0.56 + filamentFine * 0.24);
  nebula *= nebulaMask * 0.66 * centerQuiet;

  // A narrow drifting thread, two dark dust cuts, and sparse grain give the
  // lane a sense of depth while leaving the majority of the sky near-dark.
  vec3 threadAxis = normalize(vec3(
    0.18 + 0.12 * cos(seedAngle * 0.67),
    0.96,
    -0.08 + 0.1 * sin(seedAngle * 0.51)
  ));
  float threadCoordinate = dot(direction, threadAxis)
    + (filamentFine - 0.5) * 0.022;
  float threadPhase = 0.015 + sin(uTime * 0.05 + seedVector.x * 2.0) * 0.028;
  float movingThread = exp(-pow((threadCoordinate - threadPhase) / 0.043, 2.0) * 4.1)
    * frontWindow * (0.22 + fineRidge * 0.78);
  nebula += mix(uNebulaColorA, uNebulaColorB, 0.56)
    * movingThread * centerQuiet * 0.12;
  float dustCutA = pow(
    1.0 - abs(sin(dot(direction, vec3(6.0, 2.0, -7.0))
      + seedAngle * 1.3)),
    24.0
  ) * frontWindow;
  float dustCutB = pow(
    1.0 - abs(sin(dot(direction, vec3(-4.0, 5.0, 8.0))
      - seedAngle * 0.8)),
    26.0
  ) * frontWindow;
  nebula += mix(uNebulaColorA, uNebulaColorB, 0.52)
    * (dustCutA * 0.042 + dustCutB * 0.034) * centerQuiet;
  float dustSpecks = pow(
    1.0 - abs(filamentFine * 2.0 - 1.0),
    12.0
  );
  nebula += mix(uNebulaColorA, uNebulaColorB, 0.5)
    * dustSpecks * directionalBand * centerQuiet * (0.014 + movingThread * 0.024);

  vec3 galaxyCenterA = normalize(vec3(
    -0.56 + seedVector.x * 0.08,
    -0.34 + seedVector.y * 0.08,
    -0.76
  ));
  vec3 galaxyCenterB = normalize(vec3(
    0.58 + seedVector.z * 0.08,
    -0.46 + seedVector.x * 0.06,
    -0.74
  ));
  vec3 galaxyA = galaxyProfile(direction, galaxyCenterA, seedAngle);
  vec3 galaxyB = galaxyProfile(direction, galaxyCenterB, seedAngle + 2.4);
  vec3 clusterAxisA = normalize(vec3(0.18, 0.76, 0.35));
  vec3 clusterAxisB = normalize(vec3(-0.48, 0.32, 0.81));
  vec3 clusterA = magellanicCluster(
    direction,
    normalize(vec3(-0.2, 0.52, -0.72)),
    clusterAxisA,
    normalize(cross(clusterAxisA, vec3(0.42, 0.12, 0.9))),
    seedAngle + 3.0,
    filamentFine
  );
  vec3 clusterB = magellanicCluster(
    direction,
    normalize(vec3(0.58, -0.08, -0.72)),
    clusterAxisB,
    normalize(cross(clusterAxisB, vec3(0.12, 0.88, 0.2))),
    seedAngle + 5.0,
    dustNoise
  );
  vec3 galaxies = mix(uNebulaColorB, uStarfieldColor, 0.52)
    * galaxyA.x * 1.28;
  galaxies += mix(uStarfieldColor, uNebulaColorA, 0.16) * galaxyA.y * 1.62;
  galaxies += mix(uNebulaColorA, uNebulaColorB, 0.42)
    * galaxyB.x * 0.42;
  galaxies += mix(uStarfieldColor, uNebulaColorB, 0.3) * galaxyB.y * 0.66;
  galaxies += mix(uNebulaColorB, uStarfieldColor, 0.52)
    * clusterA.x * 0.52 + uStarfieldColor * clusterA.y * 1.28;
  galaxies += mix(uNebulaColorA, uStarfieldColor, 0.62)
    * clusterB.x * 0.44 + uStarfieldColor * clusterB.y * 1.04;
  // Keep compact galaxy/cloud cues local and slightly irregular rather than
  // allowing high-frequency noise to cover the complete viewport.
  galaxies *= 0.86 + dustNoise * 0.14;

  vec2 driftingUv = uv + vec2(uTime * 0.00045, -uTime * 0.00028);
  float smallStars = starLayer(driftingUv, 104.0, 0.84, 11.0);
  float brightStars = starLayer(driftingUv + vec2(0.003, 0.007), 54.0, 0.965, 29.0);
  float distantStars = starLayer(driftingUv + vec2(-0.013, 0.019), 142.0, 0.86, 57.0);
  vec3 starColor = uStarfieldColor * smallStars * 0.74;
  starColor += mix(uStarfieldColor, uNebulaColorB, 0.24) * brightStars * 1.18;
  starColor += uStarfieldColor * distantStars * 0.38;
  // Sparse peak sparkles sit inside the brightest round stars and stay below
  // the stellar core value. They never draw separate cross-shaped geometry.
  float peakSparkle = brightStars * (0.5 + 0.5 * sin(uv.x * 900.0 + uSeed * 17.0));
  starColor += uStarfieldColor * pow(max(peakSparkle, 0.0), 8.0) * 0.16;

  vec3 color = uBackgroundColor;
  color += nebula + galaxies + starColor;
  color = mix(uBackgroundColor, color, clamp(uIntensity, 0.0, 1.0));
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
      uBackgroundColor: { value: new THREE.Color(0x04050d) },
      uStarfieldColor: { value: new THREE.Color(0xb7c8ff) },
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
  if (update.backgroundColor !== undefined) {
    (material.uniforms.uBackgroundColor.value as THREE.Color).set(
      update.backgroundColor,
    );
  }
  if (update.starfieldColor !== undefined) {
    (material.uniforms.uStarfieldColor.value as THREE.Color).set(
      update.starfieldColor,
    );
  }
}
