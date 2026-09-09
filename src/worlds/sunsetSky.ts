import { Matrix4, Vector3 } from 'three'

// A ray between two points in the same interior frame has no cube-face UV seam.
export function interiorViewRay(cameraWorld: Vector3, surfaceLocal: Vector3, worldMatrix: Matrix4): Vector3 {
  const cameraLocal = cameraWorld.clone().applyMatrix4(worldMatrix.clone().invert())
  return surfaceLocal.clone().sub(cameraLocal).normalize()
}

export const sunsetSkyShader = /* glsl */`
  vec3 sunsetSky(vec3 ray, vec3 sunDirection) {
    float altitude = max(ray.y, 0.0);
    vec3 horizon = vec3(.88,.43,.15);
    vec3 zenith = vec3(.095,.066,.15);
    vec3 sky = mix(horizon, zenith, smoothstep(0.015, .62, altitude));
    sky = mix(sky, vec3(.34,.15,.075), smoothstep(.06,.45,-ray.y));
    float solarDistance = length(ray - sunDirection);
    float aa = max(fwidth(solarDistance), .0004);
    float sun = 1.0 - smoothstep(.054-aa,.054+aa,solarDistance);
    sky = mix(sky, vec3(1.0,.77,.38), sun);
    // Tangent-plane cloud patches are at optical infinity, not on a cube wall.
    // Clip this patch well before its denominator reaches zero; other directions
    // see the continuous sky gradient, including cube corners and the back view.
    if (ray.z < -.3) {
      vec2 q = ray.xy / -ray.z;
      for (int j = 0; j < 12; j++) {
        float i = float(j);
        float r = fract(sin(i * 73.19 + 4.1) * 43758.5453);
        float r2 = fract(sin(i * 21.73 + 7.6) * 23421.631);
        vec2 center = vec2(-1.1 + i * .19, .14 + r * .34);
        vec2 d = (q-center) / vec2(.12 + r2 * .17, .009 + r * .012);
        // Six-sided silhouette and two broad facets, with pixel-width AA only.
        float shape = max(abs(d.y), abs(d.x) * .68 + abs(d.y) * .48);
        float edge = max(fwidth(shape), .015);
        float mask = (1.0-smoothstep(1.0-edge,1.0+edge,shape)) * smoothstep(.3,.5,-ray.z);
        vec3 cloud = mix(vec3(.28,.14,.17), vec3(.62,.31,.17), step(d.y, -.18+r2*.4));
        sky = mix(sky, cloud, mask * .72);
      }
    }
    return sky;
  }
`
