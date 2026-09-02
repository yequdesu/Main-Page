export const stylizedOceanVertexShader = /* glsl */`
  uniform sampler2D uReefField;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying float vWaveHeight;
  varying float vCrest;
  varying float vReefProximity;
  varying float vObstacle;
  #include <fog_pars_vertex>

  const float TAU = 6.28318530718;

  void addWave(
    inout vec3 displacement,
    inout float compression,
    vec2 point,
    vec2 direction,
    float wavelength,
    float amplitude,
    float steepness,
    float speed,
    float phaseOffset
  ) {
    vec2 waveDirection = normalize(direction);
    float waveNumber = TAU / wavelength;
    float phase = waveNumber * dot(waveDirection, point) - uTime * speed + phaseOffset;
    float sine = sin(phase);
    float cosine = cos(phase);
    float sharpenedSine = mix(
      sine,
      sign(sine) * pow(abs(sine), 1.45),
      0.58
    );
    displacement.xz += waveDirection * (steepness * amplitude) * cosine;
    displacement.y += amplitude * sharpenedSine;
    compression += max(0.0, sharpenedSine * steepness);
  }

  void main() {
    vUv = uv;
    vec4 reefField = texture2D(uReefField, uv);
    float obstacle = reefField.r;
    float reefProximity = reefField.g * (1.0 - obstacle);

    vec2 restPoint = position.xz;
    vec2 warpedPoint = restPoint + vec2(
      sin(restPoint.y * 0.105 + uTime * 0.075),
      cos(restPoint.x * 0.092 - uTime * 0.061)
    ) * 1.25;

    vec3 displacement = vec3(0.0);
    float compression = 0.0;
    addWave(displacement, compression, warpedPoint, vec2(0.82, 0.57), 19.5, 0.46, 0.94, 0.50, 0.0);
    addWave(displacement, compression, warpedPoint, vec2(-0.34, 0.94), 13.0, 0.30, 0.88, 0.62, 1.3);
    addWave(displacement, compression, warpedPoint, vec2(0.96, -0.27), 8.2, 0.18, 0.82, 0.78, 2.5);
    addWave(displacement, compression, warpedPoint, vec2(-0.72, -0.69), 5.4, 0.105, 0.74, 0.96, 0.7);
    addWave(displacement, compression, warpedPoint, vec2(0.19, 0.98), 3.4, 0.060, 0.64, 1.15, 3.4);
    addWave(displacement, compression, warpedPoint, vec2(0.67, -0.74), 2.25, 0.035, 0.55, 1.38, 4.1);

    float reefInfluence = pow(reefField.g, 1.35);
    float waveScale = mix(1.0, 0.34, reefInfluence);
    displacement *= waveScale;

    // The smooth proximity field creates a compressed reflected wave around
    // the actual imported reef footprint without a discontinuous simulation.
    float reflectedPhase = (1.0 - reefField.g) * 25.0;
    float reflectedWave =
      sin(reflectedPhase - uTime * 1.45 + warpedPoint.x * 0.22) *
      reefProximity * 0.11;
    displacement.y += reflectedWave;

    vec3 displaced = position + displacement;
    vLocalPosition = displaced;
    vWaveHeight = displacement.y;
    vCrest = clamp(compression / 3.0, 0.0, 1.0);
    vReefProximity = reefProximity;
    vObstacle = obstacle;

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

export const stylizedOceanFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uBeamOrigin;
  uniform vec3 uBeamDirection;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying float vWaveHeight;
  varying float vCrest;
  varying float vReefProximity;
  varying float vObstacle;
  #include <fog_pars_fragment>

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 4; octave++) {
      value += valueNoise(point) * amplitude;
      point = rotation * point * 2.03 + vec2(7.1, 3.7);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (normal.y < 0.0) normal = -normal;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 keyDirection = normalize(vec3(-0.38, 0.84, 0.39));

    float diffuse = clamp(dot(normal, keyDirection) * 0.5 + 0.5, 0.0, 1.0);
    float toonTone = step(0.34, diffuse) * 0.48 + step(0.66, diffuse) * 0.52;
    float highFace = smoothstep(0.10, 1.12, vWaveHeight) * 0.18;

    // Lifted dark-scene palette: the shadow band stays blue-grey instead of
    // collapsing into the near-black scene background.
    vec3 deepColor = vec3(0.018, 0.045, 0.075);
    vec3 middleColor = vec3(0.055, 0.120, 0.180);
    vec3 lightColor = vec3(0.145, 0.245, 0.325);
    vec3 color = mix(deepColor, middleColor, min(toonTone * 1.45 + highFace, 1.0));
    color = mix(color, lightColor, max(0.0, toonTone - 0.48) * 1.92);

    float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
    color = mix(color, lightColor * 1.08, smoothstep(0.18, 0.70, fresnel) * 0.34);

    vec2 foamPoint = vLocalPosition.xz * 0.235 + vec2(uTime * 0.075, -uTime * 0.047);
    vec2 foamWarp = vec2(
      valueNoise(foamPoint * 0.72 + 9.3),
      valueNoise(foamPoint * 0.72 - 5.7)
    ) - 0.5;
    float broadFoam = fbm(foamPoint + foamWarp * 1.7);
    float fineFoam = fbm(foamPoint * 2.35 - vec2(uTime * 0.045, uTime * 0.018));
    float crestSignal =
      vCrest * 0.72 +
      smoothstep(0.22, 1.10, vWaveHeight) * 0.42 +
      (broadFoam - 0.48) * 0.52 +
      (fineFoam - 0.50) * 0.16;
    float crestFoam = smoothstep(0.600, 0.675, crestSignal);

    float shoreNoise = fbm(
      vLocalPosition.xz * 0.42 + vec2(-uTime * 0.055, uTime * 0.031)
    );
    float contactPulse = 0.78 + sin(
      uTime * 1.55 + vLocalPosition.x * 0.34 - vLocalPosition.z * 0.21
    ) * 0.22;
    float contactFoam =
      smoothstep(0.14, 0.62, vReefProximity) *
      smoothstep(0.42, 0.52, shoreNoise + contactPulse * 0.22) *
      (1.0 - vObstacle);

    float foam = clamp(max(crestFoam, contactFoam), 0.0, 1.0);

    vec3 toSurface = vWorldPosition - uBeamOrigin;
    float alongBeam = dot(toSurface, uBeamDirection);
    vec3 radialVector = toSurface - uBeamDirection * alongBeam;
    float beamRadius = 1.35 + max(0.0, alongBeam) * 0.22;
    float beam = smoothstep(beamRadius, beamRadius * 0.25, length(radialVector));
    beam *= smoothstep(-0.35, 2.2, alongBeam) *
      (1.0 - smoothstep(42.0, 64.0, alongBeam));
    float beamLight = beam * (0.55 + max(normal.y, 0.0) * 0.45);
    color = mix(color, vec3(0.40, 0.56, 0.68), beamLight * 0.62);

    vec3 foamColor = mix(
      vec3(0.52, 0.62, 0.70),
      vec3(0.80, 0.86, 0.90),
      toonTone * 0.65 + beam * 0.35
    );
    color = mix(color, foamColor, smoothstep(0.46, 0.60, foam));

    gl_FragColor = vec4(color, uOpacity);
    #include <fog_fragment>
  }
`

export const stylizedOceanVolumeVertexShader = /* glsl */`
  varying float vLocalY;
  varying vec3 vWorldPosition;
  #include <fog_pars_vertex>

  void main() {
    vLocalY = position.y;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

export const stylizedOceanVolumeFragmentShader = /* glsl */`
  precision highp float;

  uniform float uSurfaceY;
  uniform float uVolumeDepth;
  uniform float uOpacity;
  varying float vLocalY;
  varying vec3 vWorldPosition;
  #include <fog_pars_fragment>

  void main() {
    float depth = clamp((uSurfaceY - vLocalY) / uVolumeDepth, 0.0, 1.0);
    vec3 upperColor = vec3(0.018, 0.050, 0.078);
    vec3 lowerColor = vec3(0.004, 0.012, 0.022);
    vec3 color = mix(upperColor, lowerColor, smoothstep(0.0, 0.82, depth));

    // A faint horizontal band keeps the block readable as water in the dark
    // miniature view without making the volume glow.
    float depthBand = 1.0 - smoothstep(0.0, 0.18, depth);
    color += vec3(0.012, 0.026, 0.035) * depthBand;
    gl_FragColor = vec4(color, uOpacity);
    #include <fog_fragment>
  }
`
