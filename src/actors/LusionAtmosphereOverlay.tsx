import { useEffect, useRef } from 'react'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { getDomLayer } from '../composition/layerRegistry'
import {
  centralStarScreenAnchorId,
  planetScreenAnchorId,
  planetParticleIndexAnchorId,
  planetScreenRadiusAnchorId,
  readAnchorValue,
  type ScreenCircle,
  type ScreenPoint,
} from '../composition/coreAnchors'
import { useScrollStore } from '../stores/scrollStore'
import { registerLusionAtmosphereRenderer } from './lusionAtmosphereBridge'
import './LusionAtmosphereOverlay.css'

const MAX_DPR = 0.65
const PLANET_COUNT = 3
const EMPTY_STAR: ScreenCircle = { x: 0, y: 0, r: 0, visible: false }
const EMPTY_PLANET: ScreenPoint = { x: 0, y: 0, visible: false }

interface LightShaftDebugPlanet {
  x: number
  y: number
  r: number
  visible: boolean
  occluderWeight: number
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_alpha;
uniform float u_theme;
uniform float u_focusTrack;
uniform float u_focusBlend;
uniform vec4 u_star;
uniform vec4 u_planets[3];
uniform vec3 u_occluderWeights;
varying vec2 v_uv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += noise(p) * a;
    p = p * 2.03 + 17.7;
    a *= 0.5;
  }
  return v;
}

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

float focusMask(int i) {
  if (u_focusTrack < -0.5) return 1.0;
  if (abs(float(i) - u_focusTrack) < 0.5) return 1.0;
  return 1.0 - u_focusBlend;
}

bool usePlanet(int i) {
  return focusMask(i) > 0.001;
}

float occluderWeight(int i) {
  if (i == 0) return u_occluderWeights.x;
  if (i == 1) return u_occluderWeights.y;
  return u_occluderWeights.z;
}

float planetBodyMask(vec2 p) {
  float mask = 1.0;
  for (int i = 0; i < 3; i++) {
    vec4 planet = u_planets[i];
    if (planet.w < 0.5) continue;

    vec2 c = planet.xy;
    float r = max(planet.z, 1.0);
    float d = length(p - c);
    mask *= mix(1.0, smoothstep(r * 0.9, r * 0.99, d), focusMask(i));
  }
  return mask;
}

float occlusionAt(vec2 p) {
  float visibility = 1.0;
  for (int i = 0; i < 3; i++) {
    vec4 planet = u_planets[i];
    if (planet.w < 0.5) continue;
    if (!usePlanet(i)) continue;
    float occ = occluderWeight(i) * focusMask(i);
    if (occ <= 0.001) continue;

    vec2 c = planet.xy;
    float r = max(planet.z, 1.0);
    float core = r * 0.98;
    float shell = r * 1.22;
    float d = length(p - c);

    float coreVisibility = smoothstep(core - 1.5, core + 1.5, d);
    float shellAbsorb = mix(0.74, 1.0, smoothstep(core, shell, d));
    visibility *= mix(1.0, coreVisibility * shellAbsorb, occ);
  }
  return clamp(visibility, 0.0, 1.0);
}

float shadowCone(vec2 p) {
  float shadow = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 planet = u_planets[i];
    if (planet.w < 0.5) continue;
    if (!usePlanet(i)) continue;
    float occ = occluderWeight(i) * focusMask(i);
    if (occ <= 0.001) continue;

    vec2 c = planet.xy;
    float r = max(planet.z * 1.04, 1.0);
    vec2 starToPlanet = c - u_star.xy;
    float lightDistance = max(length(starToPlanet), 1.0);
    vec2 axis = starToPlanet / lightDistance;
    vec2 rel = p - c;
    float behind = dot(rel, axis);
    if (behind <= r * 0.18) continue;

    float lateral = abs(cross2(axis, rel));
    float starAngular = max(u_star.z, 1.0) / lightDistance;
    float umbra = max(0.0, r - behind * starAngular * 0.72);
    float penumbra = max(14.0, u_star.z * 0.36 + behind * starAngular * 1.75);
    float cone = 1.0 - smoothstep(umbra, umbra + penumbra, lateral);
    float startFade = smoothstep(r * 0.18, r * 1.2, behind);
    float lengthFade = exp(-(behind - r * 0.18) / max(760.0, r * 9.0));
    shadow = max(shadow, cone * startFade * lengthFade * occ);
  }
  return clamp(shadow, 0.0, 1.0);
}

float radialVisibility(vec2 p, vec2 jitter) {
  float visibility = 0.0;
  const int STEPS = 36;
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + 0.5) / float(STEPS);
    vec2 samplePoint = mix(p, u_star.xy + jitter, t);
    float sampleVisibility = occlusionAt(samplePoint);
    float nearLightWeight = mix(0.42, 1.4, t * t);
    visibility += sampleVisibility * nearLightWeight;
  }
  return visibility / float(STEPS);
}

void main() {
  if (u_alpha <= 0.001 || u_star.w < 0.5) discard;

  vec2 p = vec2(gl_FragCoord.x / u_dpr, u_resolution.y - gl_FragCoord.y / u_dpr);
  vec2 toStar = u_star.xy - p;
  float distToStar = length(toStar);
  float starDisk = 1.0 - smoothstep(u_star.z * 0.72, u_star.z * 1.4, distToStar);

  vec2 dir = normalize(toStar + 0.0001);
  vec2 jitterA = vec2(-dir.y, dir.x) * u_star.z * 0.28;
  float v0 = radialVisibility(p, vec2(0.0));
  float v1 = radialVisibility(p, jitterA);
  float visibility = (v0 * 0.68 + v1 * 0.32);

  float shadow = shadowCone(p);
  float mediumNoise = fbm(p * 0.006 + vec2(u_time * 0.018, -u_time * 0.011));
  mediumNoise = mix(0.72, 1.18, mediumNoise);

  float distanceFalloff = exp(-distToStar * 0.00125);
  float shaft = visibility * distanceFalloff * mediumNoise;
  shaft *= mix(0.92, 0.08, shadow);
  shaft += starDisk * 0.38;
  shaft *= planetBodyMask(p);

  vec3 nightColor = vec3(1.0, 0.76, 0.45);
  vec3 dayColor = vec3(0.78, 0.88, 1.0);
  vec3 lightColor = mix(nightColor, dayColor, u_theme);

  float lightAlpha = clamp(shaft * 0.2 * u_alpha, 0.0, 0.34);
  vec3 color = lightColor * shaft * 0.72;

  float alpha = clamp(lightAlpha, 0.0, 0.34);
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(color, alpha);
}
`

interface LightShaftRenderer {
  gl: WebGLRenderingContext
  program: WebGLProgram
  buffer: WebGLBuffer
  uniforms: {
    resolution: WebGLUniformLocation | null
    dpr: WebGLUniformLocation | null
    time: WebGLUniformLocation | null
    alpha: WebGLUniformLocation | null
    theme: WebGLUniformLocation | null
    focusTrack: WebGLUniformLocation | null
    focusBlend: WebGLUniformLocation | null
    star: WebGLUniformLocation | null
    planets: WebGLUniformLocation | null
    occluderWeights: WebGLUniformLocation | null
  }
}

function readPlanetScreen(index: number): ScreenPoint {
  return readAnchorValue<ScreenPoint>(planetScreenAnchorId(index)) ?? EMPTY_PLANET
}

function readPlanetRadius(index: number): number {
  return readAnchorValue<number>(planetScreenRadiusAnchorId(index)) ?? 0
}

let focusBlendState = 0
let focusBlendLastTime = -1
let focusTrackState = -1

function updateFocusBlend(target: number, time: number): number {
  if (focusBlendLastTime < 0 || time < focusBlendLastTime) {
    focusBlendLastTime = time
    focusBlendState = target
    return focusBlendState
  }

  const dt = Math.min(0.1, Math.max(0, time - focusBlendLastTime))
  focusBlendLastTime = time
  const response = target > focusBlendState ? 7 : 5
  const ease = 1 - Math.exp(-dt * response)
  focusBlendState += (target - focusBlendState) * ease
  return focusBlendState
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create light shaft shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(info)
  }
  return shader
}

function createLightShaftRenderer(canvas: HTMLCanvasElement): LightShaftRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  })
  if (!gl) return null

  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  if (!program || !buffer) return null

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown light shaft link error'
    gl.deleteProgram(program)
    throw new Error(info)
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.useProgram(program)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  gl.clearColor(0, 0, 0, 0)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.CULL_FACE)

  return {
    gl,
    program,
    buffer,
    uniforms: {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      dpr: gl.getUniformLocation(program, 'u_dpr'),
      time: gl.getUniformLocation(program, 'u_time'),
      alpha: gl.getUniformLocation(program, 'u_alpha'),
      theme: gl.getUniformLocation(program, 'u_theme'),
      focusTrack: gl.getUniformLocation(program, 'u_focusTrack'),
      focusBlend: gl.getUniformLocation(program, 'u_focusBlend'),
      star: gl.getUniformLocation(program, 'u_star'),
      planets: gl.getUniformLocation(program, 'u_planets[0]'),
      occluderWeights: gl.getUniformLocation(program, 'u_occluderWeights'),
    },
  }
}

function renderLightShafts(
  renderer: LightShaftRenderer,
  width: number,
  height: number,
  dpr: number,
  alpha: number,
  time: number,
  occluderWeights: [number, number, number] = [1, 1, 1],
) {
  const { gl, program, uniforms } = renderer
  const star = readAnchorValue<ScreenCircle>(centralStarScreenAnchorId) ?? EMPTY_STAR
  const focusedPlanetIdx = useScrollStore.getState().focusedPlanetIdx
  let focusTrack = -1
  const planets = new Float32Array(PLANET_COUNT * 4)
  for (let i = 0; i < PLANET_COUNT; i++) {
    const planet = readPlanetScreen(i)
    const radius = readPlanetRadius(i)
    const particleIdx = readAnchorValue<number>(planetParticleIndexAnchorId(i))
    if (focusedPlanetIdx >= 0 && particleIdx === focusedPlanetIdx) focusTrack = i
    planets[i * 4 + 0] = planet.x
    planets[i * 4 + 1] = planet.y
    planets[i * 4 + 2] = radius
    planets[i * 4 + 3] = planet.visible ? 1 : 0
  }
  if (focusTrack >= 0 && focusTrack !== focusTrackState) {
    focusTrackState = focusTrack
    focusBlendState = 0
  }
  const focusBlend = updateFocusBlend(focusTrack >= 0 ? 1 : 0, time)
  const shaderFocusTrack = focusBlend > 0.001 ? focusTrackState : -1

  gl.useProgram(program)
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.uniform2f(uniforms.resolution, width, height)
  gl.uniform1f(uniforms.dpr, dpr)
  gl.uniform1f(uniforms.time, time)
  gl.uniform1f(uniforms.alpha, alpha)
  gl.uniform1f(uniforms.theme, document.documentElement.dataset.theme === 'day' ? 1 : 0)
  gl.uniform1f(uniforms.focusTrack, shaderFocusTrack)
  gl.uniform1f(uniforms.focusBlend, focusBlend)
  gl.uniform4f(uniforms.star, star.x, star.y, star.r, star.visible ? 1 : 0)
  gl.uniform4fv(uniforms.planets, planets)
  gl.uniform3f(uniforms.occluderWeights, occluderWeights[0], occluderWeights[1], occluderWeights[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function readLightShaftDebugPlanets(
  occluderWeights: [number, number, number] = [1, 1, 1],
): LightShaftDebugPlanet[] {
  return Array.from({ length: PLANET_COUNT }, (_, i) => {
    const planet = readPlanetScreen(i)
    return {
      x: planet.x,
      y: planet.y,
      r: readPlanetRadius(i),
      visible: planet.visible,
      occluderWeight: occluderWeights[i],
    }
  })
}

function drawDebugOverlay(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  planets: LightShaftDebugPlanet[],
): void {
  if (canvas.width !== Math.max(1, Math.floor(width * dpr)) || canvas.height !== Math.max(1, Math.floor(height * dpr))) {
    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
  }
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const star = readAnchorValue<ScreenCircle>(centralStarScreenAnchorId) ?? EMPTY_STAR
  if (star.visible) {
    ctx.save()
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.85)'
    ctx.fillStyle = 'rgba(0, 255, 255, 0.9)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.arc(star.x, star.y, Math.max(1, star.r), 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillRect(star.x - 3, star.y - 3, 6, 6)
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace'
    ctx.fillText(`star r=${Math.round(star.r)}`, star.x + 8, star.y - 8)
    ctx.restore()
  }

  planets.forEach((planet, index) => {
    if (!planet.visible) return
    ctx.save()
    ctx.strokeStyle = planet.occluderWeight > 0.01 ? 'rgba(255, 0, 180, 0.95)' : 'rgba(255, 180, 0, 0.95)'
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 1.25
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.arc(planet.x, planet.y, Math.max(1, planet.r), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(planet.x - 8, planet.y)
    ctx.lineTo(planet.x + 8, planet.y)
    ctx.moveTo(planet.x, planet.y - 8)
    ctx.lineTo(planet.x, planet.y + 8)
    ctx.stroke()
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace'
    ctx.fillText(`p${index} r=${Math.round(planet.r)} occ=${planet.occluderWeight.toFixed(2)}`, planet.x + 10, planet.y + 14)
    ctx.restore()
  })
}

export default function LusionAtmosphereOverlay() {
  useActorRuntime('lusionAtmosphereOverlay', true)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const debugCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const layer = getDomLayer('dom.lusionAtmosphere')

  useEffect(() => {
    const canvas = canvasRef.current
    const debugCanvas = debugCanvasRef.current
    if (!canvas) return

    const renderer = createLightShaftRenderer(canvas)
    if (!renderer) return
    const debugCtx = debugCanvas?.getContext('2d') ?? null

    let width = 1
    let height = 1
    let dpr = 1
    let debugDpr = 1
    let cleared = false

    const resize = () => {
      width = Math.max(1, window.innerWidth)
      height = Math.max(1, window.innerHeight)
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      debugDpr = Math.min(1.25, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      if (debugCanvas) {
        debugCanvas.width = Math.max(1, Math.floor(width * debugDpr))
        debugCanvas.height = Math.max(1, Math.floor(height * debugDpr))
        debugCanvas.style.width = `${width}px`
        debugCanvas.style.height = `${height}px`
      }
      cleared = false
    }

    const unregisterRenderer = registerLusionAtmosphereRenderer((frame) => {
      touchActorFrame('lusionAtmosphereOverlay', Math.round(frame.time * 60), frame.active)
      if (!frame.active) {
        if (!cleared) {
          renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT)
          debugCtx?.clearRect(0, 0, width, height)
          cleared = true
        }
        return
      }

      cleared = false
      renderLightShafts(renderer, width, height, dpr, frame.alpha, frame.time, frame.occluderWeights)
      if (debugCanvas && debugCtx) {
        if (useScrollStore.getState().debugMode) {
          drawDebugOverlay(debugCanvas, debugCtx, width, height, debugDpr, readLightShaftDebugPlanets(frame.occluderWeights))
        } else {
          debugCtx.clearRect(0, 0, width, height)
        }
      }
    })

    resize()
    window.addEventListener('resize', resize)

    return () => {
      unregisterRenderer()
      window.removeEventListener('resize', resize)
      renderer.gl.deleteBuffer(renderer.buffer)
      renderer.gl.deleteProgram(renderer.program)
    }
  }, [])

  return (
    <div
      className="lusion-atmosphere-overlay"
      aria-hidden="true"
      style={{
        position: layer.position,
        inset: 0,
        zIndex: layer.zIndex,
        pointerEvents: 'none',
      }}
    >
      <canvas ref={canvasRef} className="lusion-atmosphere-overlay__tyndall" />
      <canvas ref={debugCanvasRef} className="lusion-atmosphere-overlay__debug" />
    </div>
  )
}
