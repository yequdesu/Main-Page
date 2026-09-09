// Cube-local, non-periodic volume texture: adjacent cut faces sample the same
// field instead of restarting a UV texture at each corner. No animated noise.
export const soilShader = /* glsl */`
  float soilHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float soilNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(soilHash(i), soilHash(i + vec3(1,0,0)), f.x),
          mix(soilHash(i + vec3(0,1,0)), soilHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(soilHash(i + vec3(0,0,1)), soilHash(i + vec3(1,0,1)), f.x),
          mix(soilHash(i + vec3(0,1,1)), soilHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  vec3 soilColor(vec3 p, float surfaceY) {
    float depth = max(0.0, surfaceY - p.y);
    float broad = soilNoise(vec3(p.x * .085, 2.4, p.z * .085));
    float folds = soilNoise(vec3(p.x * .24, 8.7, p.z * .24));
    float strataDepth = depth + (broad - .5) * 4.8 + (folds - .5) * 1.3;
    // Uneven humus / ochre loam / red clay / weathered parent rock horizons.
    float edge = max(.28, fwidth(strataDepth) * 1.25);
    vec3 humus = vec3(.058, .027, .014);
    vec3 loam = vec3(.19, .088, .036);
    vec3 clay = vec3(.145, .051, .028);
    vec3 parent = vec3(.23, .135, .075);
    vec3 color = mix(humus, loam, smoothstep(2.6-edge, 2.6+edge, strataDepth));
    color = mix(color, clay, smoothstep(10.2-edge*1.8, 10.2+edge*1.8, strataDepth));
    color = mix(color, parent, smoothstep(21.0-edge*2.2, 21.0+edge*2.2, strataDepth));
    // Discontinuous sediment lenses, elongated horizontally but not repeated.
    float lenses = soilNoise(vec3(p.x * .16, strataDepth * .72, p.z * .16) + vec3(16,3,9));
    float lensEdge = max(.045, fwidth(lenses));
    float lens = smoothstep(.58-lensEdge, .58+lensEdge, lenses);
    color = mix(color, color * vec3(1.28, 1.20, 1.10), lens * .65);
    float mottles = soilNoise(p * vec3(.42, .65, .42) + vec3(3,9,5));
    color *= .84 + mottles * .32;
    // Sparse angular mineral flecks, filtered away when smaller than a pixel.
    vec3 cell = p * 1.9;
    float footprint = max(max(fwidth(cell.x), fwidth(cell.y)), fwidth(cell.z));
    float detail = 1.0 - smoothstep(.35, 1.2, footprint);
    float grain = soilHash(floor(cell));
    color = mix(color, color * .72, step(.84, grain) * detail * .35);
    color = mix(color, vec3(.30,.20,.12), step(.975, grain) * detail * .32);
    // Keep the planting surface dark and continuous with the exposed root zone.
    color = mix(color, humus * (.9 + .25 * mottles), 1.0-smoothstep(.15, 1.3, depth));
    vec3 n = normalize(cross(dFdx(p), dFdy(p)));
    float sideLight = .83 + .17 * abs(dot(n, normalize(vec3(-.45,.20,-.86))));
    return color * sideLight;
  }
`
