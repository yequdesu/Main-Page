export const stylizedOceanVertexShader = /* glsl */`
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform float uHeightScale;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vHeight;
  varying float vFoam;
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    vec4 state = texture2D(uState, uv);
    vec3 displaced = position;
    displaced.y += state.r * uHeightScale;
    vHeight = state.r;
    vFoam = state.b;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

export const stylizedOceanFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uState;
  uniform sampler2D uObstacle;
  uniform vec2 uTexel;
  uniform vec3 uBeamOrigin;
  uniform vec3 uBeamDirection;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vHeight;
  varying float vFoam;
  #include <fog_pars_fragment>

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (normal.y < 0.0) normal = -normal;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(vec3(-0.32, 0.86, 0.38));
    float diffuse = clamp(dot(normal, lightDirection) * 0.5 + 0.5, 0.0, 1.0);
    float tone = floor(diffuse * 3.0) / 3.0;
    float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);

    vec3 deepColor = vec3(0.025, 0.060, 0.105);
    vec3 midColor = vec3(0.075, 0.185, 0.265);
    vec3 lightColor = vec3(0.23, 0.43, 0.54);
    vec3 color = mix(deepColor, midColor, tone);
    color = mix(color, lightColor, fresnel * 0.56);

    float hL = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
    float hR = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
    float hD = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
    float hU = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
    float gradient = length(vec2(hR - hL, hU - hD));
    float curvature = abs(hL + hR + hD + hU - 4.0 * vHeight);
    float crest = smoothstep(0.018, 0.072, gradient + curvature * 1.8) * smoothstep(0.015, 0.20, vHeight);
    float noise = hash21(floor(vWorldPosition.xz * 3.8) + floor(uTime * 5.0));
    crest *= smoothstep(0.18, 0.68, noise + crest * 0.85);

    float shore = 0.0;
    for (int oy = -2; oy <= 2; oy++) {
      for (int ox = -2; ox <= 2; ox++) {
        vec2 offset = vec2(float(ox), float(oy)) * uTexel;
        shore = max(shore, texture2D(uObstacle, vUv + offset).r);
      }
    }
    float foam = clamp(max(vFoam, crest) + shore * vFoam * 0.65, 0.0, 1.0);

    vec3 toSurface = vWorldPosition - uBeamOrigin;
    float alongBeam = dot(toSurface, uBeamDirection);
    vec3 radialVector = toSurface - uBeamDirection * alongBeam;
    float beamRadius = 1.45 + max(0.0, alongBeam) * 0.235;
    float beam = smoothstep(beamRadius, beamRadius * 0.24, length(radialVector));
    beam *= smoothstep(-0.5, 2.5, alongBeam) * (1.0 - smoothstep(42.0, 64.0, alongBeam));
    color = mix(color, vec3(0.84, 0.92, 1.0), beam * 0.72);
    foam = clamp(foam + beam * crest * 0.55, 0.0, 1.0);

    vec3 foamColor = vec3(0.94, 0.97, 1.0);
    color = mix(color, foamColor, smoothstep(0.18, 0.82, foam));
    gl_FragColor = vec4(color, uOpacity);
    #include <fog_fragment>
  }
`

