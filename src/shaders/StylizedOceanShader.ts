const stylizedOceanWaveDisplacement = /* glsl */`
  const float TAU = 6.28318530718;

  vec2 oceanUvFromLocalXZ(vec2 localXZ) {
    return vec2(
      (localXZ.x - uOceanOrigin.x) / uOceanExtent.x,
      (uOceanOrigin.y - localXZ.y) / uOceanExtent.y
    );
  }

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
    float phaseBreakup =
      sin(dot(point, vec2(0.37, -0.29)) + uTime * 0.17 + phaseOffset * 1.7) * 0.24 +
      sin(dot(point, vec2(-0.21, 0.43)) * 1.7 - uTime * 0.11) * 0.10 +
      sin(dot(point, vec2(0.73, 0.51)) * 2.65 + uTime * 0.23 + phaseOffset) * 0.075;
    phase += phaseBreakup;
    float sine = sin(phase);
    float cosine = cos(phase);
    float crestProfile = 2.0 * pow(0.5 + 0.5 * sine, 3.45) - 0.58;
    float sharpenedSine = mix(sine, crestProfile, 0.88);
    float crestPush = mix(0.58, 1.08, smoothstep(-0.08, 0.86, sharpenedSine));
    displacement.xz += waveDirection * (steepness * amplitude) * cosine * crestPush;
    displacement.y += amplitude * sharpenedSine;
    float brokenCrest = 0.72 + 0.28 * sin(
      point.x * 0.83 - point.y * 0.57 + phaseOffset * 2.3
    );
    compression += max(0.0, sharpenedSine * steepness) * brokenCrest;
  }

  void sampleOceanDisplacement(
    vec2 restPoint,
    out vec2 warpedPoint,
    out vec3 displacement,
    out float compression
  ) {
    warpedPoint = restPoint + vec2(
      sin(restPoint.y * 0.105 + uTime * 0.075),
      cos(restPoint.x * 0.092 - uTime * 0.061)
    ) * 1.25;
    warpedPoint += vec2(
      sin(restPoint.x * 0.57 - restPoint.y * 0.31 + uTime * 0.18),
      cos(restPoint.y * 0.49 + restPoint.x * 0.28 - uTime * 0.14)
    ) * 0.34;

    displacement = vec3(0.0);
    compression = 0.0;
    addWave(displacement, compression, warpedPoint, vec2(0.82, 0.57), 19.5, 0.42, 1.04, 0.50, 0.0);
    addWave(displacement, compression, warpedPoint, vec2(-0.34, 0.94), 13.0, 0.27, 0.98, 0.62, 1.3);
    addWave(displacement, compression, warpedPoint, vec2(0.96, -0.27), 8.2, 0.16, 0.92, 0.78, 2.5);
    addWave(displacement, compression, warpedPoint, vec2(-0.72, -0.69), 5.4, 0.090, 0.86, 0.96, 0.7);
    addWave(displacement, compression, warpedPoint, vec2(0.19, 0.98), 3.4, 0.050, 0.78, 1.15, 3.4);
    addWave(displacement, compression, warpedPoint, vec2(0.67, -0.74), 2.25, 0.030, 0.72, 1.38, 4.1);
    addWave(displacement, compression, warpedPoint, vec2(-0.91, 0.41), 1.62, 0.021, 0.68, 1.56, 2.1);
    addWave(displacement, compression, warpedPoint, vec2(0.48, 0.88), 1.18, 0.015, 0.64, 1.72, 5.0);
    addWave(displacement, compression, warpedPoint, vec2(0.99, 0.12), 0.86, 0.010, 0.60, 1.91, 0.4);
    addWave(displacement, compression, warpedPoint, vec2(-0.57, -0.82), 0.64, 0.006, 0.56, 2.12, 3.0);
  }
`

export const stylizedOceanVertexShader = /* glsl */`
  uniform sampler2D uReefField;
  uniform vec2 uOceanOrigin;
  uniform vec2 uOceanExtent;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying float vWaveHeight;
  varying float vCrest;
  varying float vReefProximity;
  varying float vObstacle;
  #include <fog_pars_vertex>

  ${stylizedOceanWaveDisplacement}

  void main() {
    vUv = uv;
    vec4 restReefField = texture2D(uReefField, uv);

    vec2 restPoint = position.xz;
    vec2 warpedPoint;
    vec3 displacement;
    float compression;
    sampleOceanDisplacement(restPoint, warpedPoint, displacement, compression);

    // Gerstner waves move vertices horizontally. Damp that movement before
    // entering the reef, then resample from the displaced local XZ position so
    // the rendered response remains attached to the actual GLB footprint.
    float restInfluence = smoothstep(0.04, 0.68, restReefField.g);
    displacement.xz *= mix(1.0, 0.035, restInfluence);
    vec2 collisionUv = oceanUvFromLocalXZ(position.xz + displacement.xz);
    vec4 collisionField = texture2D(uReefField, collisionUv);
    float displacedInfluence = smoothstep(0.04, 0.68, collisionField.g);
    displacement.xz *= mix(1.0, 0.035, displacedInfluence);
    collisionUv = oceanUvFromLocalXZ(position.xz + displacement.xz);
    collisionField = texture2D(uReefField, collisionUv);

    float obstacle = collisionField.r;
    float reefProximity = collisionField.g * (1.0 - obstacle);
    float reefInfluence = pow(collisionField.g, 1.35);
    displacement.y *= mix(1.0, 0.34, reefInfluence);
    compression *= mix(1.0, 0.44, reefInfluence);

    // The smooth proximity field creates a compressed reflected wave around
    // the actual imported reef footprint without a discontinuous simulation.
    float reflectedPhase = (1.0 - collisionField.g) * 25.0;
    float reflectedWave =
      sin(reflectedPhase - uTime * 1.45 + warpedPoint.x * 0.22) *
      reefProximity * 0.11;
    displacement.y += reflectedWave;

    vec3 displaced = position + displacement;
    vec2 containerMin = vec2(
      uOceanOrigin.x,
      uOceanOrigin.y - uOceanExtent.y
    ) + vec2(0.015);
    vec2 containerMax = vec2(
      uOceanOrigin.x + uOceanExtent.x,
      uOceanOrigin.y
    ) - vec2(0.015);
    displaced.xz = clamp(displaced.xz, containerMin, containerMax);
    vLocalPosition = displaced;
    vWaveHeight = displacement.y;
    vCrest = clamp(compression / 3.65, 0.0, 1.0);
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
    float toneBreakup = (valueNoise(vLocalPosition.xz * 0.16 + 17.0) - 0.5) * 0.10;
    float heightLift = clamp(vWaveHeight * 0.055, -0.04, 0.07);
    float tone = clamp(diffuse + toneBreakup + heightLift, 0.0, 1.0);

    // Four close-value toon bands prevent one dark face from swallowing large
    // parts of the ocean while keeping every transition crisp and low-poly.
    vec3 deepColor = vec3(0.030, 0.061, 0.086);
    vec3 shadowColor = vec3(0.041, 0.078, 0.106);
    vec3 middleColor = vec3(0.057, 0.102, 0.135);
    vec3 lightColor = vec3(0.083, 0.137, 0.176);
    vec3 color = deepColor;
    color = mix(color, shadowColor, step(0.16, tone));
    color = mix(color, middleColor, step(0.36, tone));
    color = mix(color, lightColor, step(0.62, tone));

    float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
    color = mix(color, lightColor * 1.04, smoothstep(0.22, 0.78, fresnel) * 0.18);

    vec2 foamPoint = vLocalPosition.xz * 0.235 + vec2(uTime * 0.075, -uTime * 0.047);
    vec2 foamWarp = vec2(
      valueNoise(foamPoint * 0.72 + 9.3),
      valueNoise(foamPoint * 0.72 - 5.7)
    ) - 0.5;
    float broadFoam = fbm(foamPoint + foamWarp * 1.7);
    float fineFoam = fbm(foamPoint * 2.35 - vec2(uTime * 0.045, uTime * 0.018));
    vec2 streakPoint = vec2(
      dot(vLocalPosition.xz, vec2(0.84, 0.54)) * 0.38,
      dot(vLocalPosition.xz, vec2(-0.54, 0.84)) * 1.42
    );
    float streakFoam = fbm(streakPoint + vec2(uTime * 0.055, -uTime * 0.11));
    float brokenStreaks = smoothstep(0.54, 0.68, streakFoam) *
      smoothstep(0.20, 0.62, vCrest + max(vWaveHeight, 0.0) * 0.34);
    float crestSignal =
      vCrest * 0.78 +
      smoothstep(0.26, 0.96, vWaveHeight) * 0.30 +
      (broadFoam - 0.50) * 0.34 +
      (fineFoam - 0.52) * 0.16;
    float crestFoam = max(smoothstep(0.64, 0.72, crestSignal), brokenStreaks * 0.82);

    vec2 contactFlow = vec2(-uTime * 0.085, uTime * 0.052);
    float shoreNoise = fbm(vLocalPosition.xz * 0.48 + contactFlow);
    float contactDetail = fbm(
      vLocalPosition.xz * 1.14 - contactFlow * 1.7 + vec2(4.8, -7.2)
    );
    float contactPhase =
      (1.0 - vReefProximity) * 23.0 -
      uTime * 1.85 +
      dot(vLocalPosition.xz, vec2(0.38, -0.27)) +
      shoreNoise * 3.2;
    float movingContactFront = pow(max(sin(contactPhase), 0.0), 4.5);
    float contactFragments = smoothstep(
      0.51,
      0.68,
      shoreNoise * 0.66 + contactDetail * 0.34
    );
    float contactEnvelope = smoothstep(0.08, 0.38, vReefProximity) *
      (1.0 - smoothstep(0.96, 1.0, vReefProximity));
    float movingContactFoam = contactEnvelope * movingContactFront * contactFragments;

    // A narrow near-shore rim follows the actual rasterised reef footprint.
    // Noise only varies its thickness and energy, so it reads as surf without
    // exposing the broader distance field as a perfect static ring.
    float shorelineBand = smoothstep(0.72, 0.84, vReefProximity) *
      (1.0 - smoothstep(0.955, 0.995, vReefProximity));
    float shorelineVariation = mix(0.58, 1.0, contactFragments) *
      (0.82 + 0.18 * sin(contactPhase * 0.72 + uTime * 0.65));
    float shorelineFoam = shorelineBand * shorelineVariation;
    float contactFoam = max(movingContactFoam, shorelineFoam) * (1.0 - vObstacle);

    vec3 toSurface = vWorldPosition - uBeamOrigin;
    float alongBeam = dot(toSurface, uBeamDirection);
    vec3 radialVector = toSurface - uBeamDirection * alongBeam;
    float beamRadius = 1.35 + max(0.0, alongBeam) * 0.22;
    vec3 beamRight = normalize(cross(uBeamDirection, vec3(0.0, 1.0, 0.0)));
    vec3 beamUp = normalize(cross(beamRight, uBeamDirection));
    vec2 beamPlane = vec2(dot(radialVector, beamRight), dot(radialVector, beamUp));
    float beamAngle = atan(beamPlane.y, beamPlane.x);
    const float beamSides = 9.0;
    const float PI = 3.14159265359;
    float beamSector = 2.0 * PI / beamSides;
    float sectorAngle = mod(beamAngle + PI, beamSector) - beamSector * 0.5;
    float polygonRadius = beamRadius * cos(PI / beamSides) / max(cos(sectorAngle), 0.001);
    float radialRatio = length(beamPlane) / max(polygonRadius, 0.001);
    float beamRange = step(0.0, alongBeam) * step(alongBeam, 64.0);
    float beamOuter = step(radialRatio, 1.0) * beamRange;
    float beamMiddle = step(radialRatio, 0.63) * beamRange;
    float beamCore = step(radialRatio, 0.29) * beamRange;
    float beamLight = (beamOuter * 0.18 + beamMiddle * 0.18 + beamCore * 0.22) *
      (0.72 + max(normal.y, 0.0) * 0.28);
    color = mix(color, vec3(0.27, 0.39, 0.49), beamLight);

    float beamFoam = clamp(beamOuter * 0.30 + beamMiddle * 0.34 + beamCore * 0.36, 0.0, 1.0);
    vec3 foamColor = mix(
      vec3(0.16, 0.22, 0.26),
      vec3(0.82, 0.87, 0.90),
      beamFoam
    );
    float crestOpacity = smoothstep(0.48, 0.62, crestFoam) * mix(0.30, 0.96, beamFoam);
    float contactOpacity = smoothstep(0.30, 0.56, contactFoam) * mix(0.20, 0.82, beamFoam);
    float foamOpacity = max(crestOpacity, contactOpacity);
    color = mix(color, foamColor, foamOpacity);

    gl_FragColor = vec4(color, uOpacity);
    #include <fog_fragment>
  }
`

export const stylizedOceanVolumeVertexShader = /* glsl */`
  attribute float aSurfaceEdge;
  uniform vec2 uOceanOrigin;
  uniform vec2 uOceanExtent;
  uniform float uTime;
  varying float vLocalY;
  varying vec3 vWorldPosition;
  #include <fog_pars_vertex>

  ${stylizedOceanWaveDisplacement}

  void main() {
    vec3 displaced = position;
    if (aSurfaceEdge > 0.5) {
      vec2 warpedPoint;
      vec3 waveDisplacement;
      float compression;
      sampleOceanDisplacement(position.xz, warpedPoint, waveDisplacement, compression);
      displaced += waveDisplacement;
      vec2 containerMin = vec2(
        uOceanOrigin.x,
        uOceanOrigin.y - uOceanExtent.y
      ) + vec2(0.015);
      vec2 containerMax = vec2(
        uOceanOrigin.x + uOceanExtent.x,
        uOceanOrigin.y
      ) - vec2(0.015);
      displaced.xz = clamp(displaced.xz, containerMin, containerMax);
    }

    vLocalY = displaced.y;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
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
    vec3 upperColor = vec3(0.020, 0.047, 0.068);
    vec3 lowerColor = vec3(0.006, 0.014, 0.024);
    vec3 color = mix(upperColor, lowerColor, smoothstep(0.0, 0.82, depth));

    // A faint horizontal band keeps the block readable as water in the dark
    // miniature view without making the volume glow.
    float depthBand = 1.0 - smoothstep(0.0, 0.18, depth);
    color += vec3(0.012, 0.026, 0.035) * depthBand;
    gl_FragColor = vec4(color, uOpacity);
    #include <fog_fragment>
    // Fade the volume's color over the former solid night backdrop, keeping
    // its depth occlusion and its visible background occlusion consistent.
    gl_FragColor.rgb = mix(vec3(5.0, 8.0, 17.0) / 255.0,
      gl_FragColor.rgb, clamp(uOpacity, 0.0, 1.0));
    gl_FragColor.a = 1.0;
  }
`
