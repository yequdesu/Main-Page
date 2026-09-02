export const shallowWaterVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const shallowWaterFragmentShader = /* glsl */`
  precision highp float;

  uniform sampler2D uState;
  uniform sampler2D uObstacle;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uReset;
  varying vec2 vUv;

  float obstacleAt(vec2 uv) {
    if (uv.x <= 0.002 || uv.x >= 0.998 || uv.y <= 0.002 || uv.y >= 0.998) return 1.0;
    return texture2D(uObstacle, uv).r;
  }

  float reflectedHeight(vec2 uv, float centerHeight) {
    return obstacleAt(uv) > 0.5 ? centerHeight : texture2D(uState, uv).r;
  }

  void main() {
    float obstacle = obstacleAt(vUv);
    if (obstacle > 0.5) {
      gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
      return;
    }

    if (uReset > 0.5) {
      float seed =
        sin(vUv.y * 72.0 + vUv.x * 7.0) * 0.055 +
        sin(vUv.y * 43.0 - vUv.x * 13.0 + 1.7) * 0.035 +
        sin(vUv.x * 31.0 + vUv.y * 19.0) * 0.018;
      gl_FragColor = vec4(seed, 0.0, 0.0, 1.0);
      return;
    }

    vec4 state = texture2D(uState, vUv);
    float height = state.r;
    float velocity = state.g;
    float foam = state.b;

    vec2 leftUv = vUv - vec2(uTexel.x, 0.0);
    vec2 rightUv = vUv + vec2(uTexel.x, 0.0);
    vec2 downUv = vUv - vec2(0.0, uTexel.y);
    vec2 upUv = vUv + vec2(0.0, uTexel.y);
    float hL = reflectedHeight(leftUv, height);
    float hR = reflectedHeight(rightUv, height);
    float hD = reflectedHeight(downUv, height);
    float hU = reflectedHeight(upUv, height);
    float laplacian = hL + hR + hD + hU - 4.0 * height;

    velocity = velocity * 0.993 + laplacian * 0.205;
    float wind =
      sin(vUv.x * 29.0 + vUv.y * 11.0 + uTime * 1.45) +
      sin(vUv.x * -17.0 + vUv.y * 23.0 + uTime * 1.07);
    velocity += wind * 0.000075;
    height = clamp(height + velocity, -0.72, 0.72);

    // A directional swell enters from the far edge (v=1). Keeping this as a
    // boundary condition lets the real reef mask produce reflection and
    // diffraction instead of merely decorating an analytic wave.
    float boundary = smoothstep(0.94, 0.995, vUv.y);
    float incoming =
      sin(uTime * 1.8 + vUv.x * 11.0) * 0.19 +
      sin(uTime * 1.17 - vUv.x * 18.0 + 0.8) * 0.07;
    height = mix(height, incoming, boundary * 0.16);
    velocity = mix(velocity, 0.0, boundary * 0.08);

    float shore = max(max(obstacleAt(leftUv), obstacleAt(rightUv)), max(obstacleAt(downUv), obstacleAt(upUv)));
    float crest = smoothstep(0.018, 0.105, abs(laplacian)) * smoothstep(-0.02, 0.20, height);
    float impact = shore * smoothstep(0.008, 0.075, abs(velocity));
    foam = max(foam * 0.982, crest * 0.72);
    foam = clamp(foam + impact * 0.18, 0.0, 1.0);

    gl_FragColor = vec4(height, velocity, foam, 1.0);
  }
`

