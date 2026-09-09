import { soilShader } from './soilShader'
import { sunsetSkyShader } from './sunsetSky'

export const wheatWind = /* glsl */`
  vec3 bendWheat(vec3 p, vec3 root, float phase) {
    float edge = smoothstep(0.0, 0.8, uHalf - max(abs(root.x), abs(root.y)));
    float wave = sin(root.x * 0.23 + root.y * 0.18 - uTime * 1.05);
    float gust = sin(root.x * 0.075 - root.y * 0.11 - uTime * 0.43);
    float detail = sin(phase + uTime * 1.7 + root.y * 0.8) * 0.06;
    float amount = (0.15 + wave * 0.12 + gust * 0.10 + detail) * edge;
    float weight = max(p.y, 0.0) * max(p.y, 0.0);
    p.x += amount * weight;
    p.z += (amount * 0.36 + sin(phase + uTime * 0.8) * 0.025 * edge) * weight;
    p.y -= abs(amount) * weight * 0.20;
    return p;
  }
`
export const wheatVertex = /* glsl */`
  uniform float uTime;
  uniform float uHalf;
  uniform float uFloor;
  attribute vec3 aRoot;
  attribute vec3 aVariation;
  attribute float aPart;
  varying vec3 vLocal;
  varying float vTint;
  varying float vPart;
  ${wheatWind}
  void main() {
    vec3 p = position;
    float c = cos(aVariation.x), s = sin(aVariation.x);
    p.xz = mat2(c, -s, s, c) * p.xz;
    p = bendWheat(p, aRoot, aVariation.y) * aRoot.z;
    p += vec3(aRoot.x, uFloor, aRoot.y);
    vLocal = p; vTint = aVariation.z; vPart = aPart;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
export const worldVertex = /* glsl */`
  uniform vec3 uOffset;
  uniform float uFloor;
  uniform float uTime;
  uniform float uKind;
  varying vec3 vLocal;
  varying float vTint;
  varying float vPart;
  void main() {
    vLocal = position + uOffset; vTint = 0.5; vPart = 0.0;
    if (uKind > 2.5 && position.y > uFloor + .1) {
      vLocal.y += sin(position.x*.23+position.z*.18-uTime*1.05)*.07
        + sin(position.x*.075-position.z*.11-uTime*.43)*.05;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vLocal, 1.0);
  }
`
export const worldClip = /* glsl */`
  if (any(greaterThan(abs(vLocal), vec3(uHalf)))) discard;
`
export const worldFragment = /* glsl */`
  uniform float uHalf;
  uniform float uFloor;
  uniform float uKind;
  uniform vec3 uCameraLocal;
  uniform vec3 uSunDirection;
  uniform float uDetail;
  varying vec3 vLocal;
  varying float vTint;
  varying float vPart;
  ${soilShader}
  ${sunsetSkyShader}
  void main() {
    ${worldClip}
    vec3 color;
    vec3 sunDir = normalize(vec3(-0.45, 0.20, -0.86));
    if (uKind < 0.5) {
      // Fine stalks dissolve onto the continuous canopy; the canopy fills their
      // gaps so this never creates transparent holes or changes the soil volume.
      float pixel = soilHash(vec3(floor(gl_FragCoord.xy), 7.0));
      if (pixel > uDetail) discard;
      vec3 n = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
      float light = abs(dot(n, sunDir));
      float bands = 0.40 + 0.30 * smoothstep(0.12, 0.42, light) + 0.30 * smoothstep(0.6, 0.9, light);
      float canopy = smoothstep(uFloor + .35, uFloor + 1.9, vLocal.y);
      vec3 gold = mix(vec3(.34,.135,.025), vec3(.78,.47,.12), vTint);
      gold = mix(gold * .7, gold, step(.5, vPart));
      color = gold * bands * mix(.36, 1.0, canopy);
      color += vec3(.28,.12,.025) * pow(light, 4.0) * canopy;
      if (vPart > 1.5) color = mix(color, vec3(.85,.60,.26), .36);
      // Scene-local atmospheric perspective, never the shared scene fog.
      float distanceHaze = smoothstep(12.0, 64.0, 32.0 - vLocal.z) * .22;
      color = mix(color, vec3(.42,.20,.075), distanceHaze);
    } else if (uKind < 1.5) {
      color = soilColor(vLocal, uFloor);
    } else if (uKind < 2.5) {
      color = sunsetSky(normalize(vLocal-uCameraLocal), uSunDirection);
    } else {
      vec3 n = normalize(cross(dFdx(vLocal),dFdy(vLocal)));
      float waves = soilNoise(vec3(vLocal.x*.19, 1.5, vLocal.z*.19));
      color = mix(vec3(.33,.16,.036),vec3(.60,.34,.09),waves);
      color *= .78 + .22 * abs(dot(n,sunDir));
      color *= mix(.4, 1.0, smoothstep(uFloor+.1,uFloor+1.5,vLocal.y));
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
