import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  LinearFilter,
  CanvasTexture,
  Mesh,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three'
import { computeHudTangentGeometry } from '../composition/focusCorridorGeometry'
import { registerFocusHudRenderer, type FocusHudFrame } from '../actors/focusHudBridge'
import type { ScreenCircle, TangentLine } from '../types'
import { readBeamWorldDirection, readBeamWorldOrigin } from '../composition/coreAnchors'
import { TIMELINE } from '../composition/timeline'
import { clamped } from './ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const corridorMaskFragmentShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform vec4 uRayA;
  uniform vec4 uRayB;

  varying vec2 vUv;

  float lineInside(vec4 line, vec2 point) {
    float signedDistance = (line.x * point.x + line.y * point.y + line.z) * line.w;
    return step(0.0, signedDistance);
  }

  void main() {
    vec2 screenPoint = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
    float corridor = min(lineInside(uRayA, screenPoint), lineInside(uRayB, screenPoint));
    gl_FragColor = vec4(corridor, corridor, corridor, 1.0);
  }
`

const effectFragmentShader = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uCorridorMask;
  uniform sampler2D uSweepMask;
  uniform float uStrength;
  uniform float uSweepStrength;

  varying vec2 vUv;

  vec3 linearToSrgb(vec3 value) {
    vec3 low = value * 12.92;
    vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), value));
  }

  void main() {
    vec4 source = texture2D(uScene, vUv);
    float corridor = texture2D(uCorridorMask, vUv).r;
    float sweep = texture2D(uSweepMask, vUv).r;
    float outside = 1.0 - corridor;
    float focusTransition = smoothstep(0.0, 1.0, uStrength);
    float sweepTransition = smoothstep(0.0, 1.0, uSweepStrength);

    float luminance = dot(source.rgb, vec3(0.299, 0.587, 0.114));
    vec3 grayscale = vec3(luminance);
    float grayMix = max(outside * focusTransition * 0.30, sweep * sweepTransition);
    vec3 processed = mix(source.rgb, grayscale, clamp(grayMix, 0.0, 1.0));

    // The scene target is linear. Encode once here, at the final screen pass.
    gl_FragColor = vec4(linearToSrgb(clamp(processed, 0.0, 1.0)), source.a);
  }
`

interface RayLine {
  a: number
  b: number
  c: number
  side: number
}

interface FocusRayFrame {
  focused: boolean
  alpha: number
  star?: ScreenCircle
  planet?: ScreenCircle
}

interface SweepParticle {
  angle: number
  start: number
  travelDuration: number
  radius: number
}

const SWEEP_PARTICLE_COUNT = 28
const SWEEP_DURATION = 1.8

function createSweepParticles(): SweepParticle[] {
  const jitter = (Math.random() - 0.5) * (Math.PI * 2 / SWEEP_PARTICLE_COUNT) * 0.72
  return Array.from({ length: SWEEP_PARTICLE_COUNT }, (_, index) => ({
    angle: jitter + index * Math.PI * 2 / SWEEP_PARTICLE_COUNT + (Math.random() - 0.5) * 0.09,
    // Keep all starts early enough that the shape can close during white-out.
    start: 0.03 + Math.random() * 0.27,
    travelDuration: 0.72 + Math.random() * 0.56,
    radius: 0.78 + Math.random() * 0.22,
  })).sort((a, b) => a.start - b.start)
}

function updateSweepMask(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  texture: CanvasTexture,
  particles: SweepParticle[],
  age: number,
  sourceX: number,
  sourceY: number,
): void {
  const width = canvas.width
  const height = canvas.height
  ctx.clearRect(0, 0, width, height)
  if (age <= 0) {
    texture.needsUpdate = true
    return
  }

  const maxRadius = Math.hypot(width, height) * 0.82
  const emitted: { x: number; y: number }[] = []
  for (const particle of particles) {
    if (age < particle.start) continue
    const travel = Math.min(1, Math.max(0, (age - particle.start) / particle.travelDuration))
    const radius = maxRadius * particle.radius * travel
    emitted.push({
      x: sourceX + Math.cos(particle.angle) * radius,
      y: sourceY + Math.sin(particle.angle) * radius,
    })
  }

  if (emitted.length < 2) {
    texture.needsUpdate = true
    return
  }

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  for (let index = 1; index < emitted.length; index += 1) {
    const previous = emitted[index - 1]
    const current = emitted[index]
    ctx.moveTo(sourceX, sourceY)
    ctx.lineTo(previous.x, previous.y)
    ctx.lineTo(current.x, current.y)
    ctx.closePath()
  }
  ctx.fill()
  texture.needsUpdate = true
}

const EMPTY_FRAME: FocusRayFrame = { focused: false, alpha: 0 }

function makeRayLineUniform(line: TangentLine, midpoint: { x: number; y: number }): RayLine {
  const { x1, y1, x2, y2 } = line
  const a = y1 - y2
  const b = x2 - x1
  const c = x1 * y2 - x2 * y1
  const length = Math.hypot(a, b) || 1
  const normalA = a / length
  const normalB = b / length
  const normalC = c / length
  const side = normalA * midpoint.x + normalB * midpoint.y + normalC >= 0 ? 1 : -1
  return { a: normalA, b: normalB, c: normalC, side }
}

function updateLineUniform(target: Vector4, line: RayLine): void {
  target.set(line.a, line.b, line.c, line.side)
}

export default function WebglCollagePostProcess() {
  const { gl, scene, camera, size } = useThree()
  const frameRef = useRef<FocusRayFrame>(EMPTY_FRAME)
  const sweepParticles = useMemo(createSweepParticles, [])
  const sweepCanvas = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    return canvas
  }, [])
  const sweepContext = useMemo(() => sweepCanvas.getContext('2d'), [sweepCanvas])
  const sweepTexture = useMemo(() => {
    const texture = new CanvasTexture(sweepCanvas)
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    return texture
  }, [sweepCanvas])
  const sceneTarget = useMemo(() => new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  }), [])
  const corridorMaskTarget = useMemo(() => new WebGLRenderTarget(1, 1, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    format: RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  }), [])
  sceneTarget.texture.colorSpace = NoColorSpace
  corridorMaskTarget.texture.colorSpace = NoColorSpace

  const maskScene = useMemo(() => new Scene(), [])
  const effectScene = useMemo(() => new Scene(), [])
  const postCamera = useMemo(() => {
    const nextCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    nextCamera.position.z = 1
    return nextCamera
  }, [])
  const maskUniforms = useMemo(() => ({
    uResolution: { value: new Vector2(1, 1) },
    uRayA: { value: new Vector4(0, 0, 0, 1) },
    uRayB: { value: new Vector4(0, 0, 0, 1) },
  }), [])
  const effectUniforms = useMemo(() => ({
    uScene: { value: sceneTarget.texture },
    uCorridorMask: { value: corridorMaskTarget.texture },
    uSweepMask: { value: sweepTexture },
    uStrength: { value: 0 },
    uSweepStrength: { value: 0 },
  }), [corridorMaskTarget.texture, sceneTarget.texture, sweepTexture])
  const maskMaterial = useMemo(() => new ShaderMaterial({
    uniforms: maskUniforms,
    vertexShader,
    fragmentShader: corridorMaskFragmentShader,
    depthTest: false,
    depthWrite: false,
  }), [maskUniforms])
  const effectMaterial = useMemo(() => new ShaderMaterial({
    uniforms: effectUniforms,
    vertexShader,
    fragmentShader: effectFragmentShader,
    depthTest: false,
    depthWrite: false,
  }), [effectUniforms])
  const maskQuad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), maskMaterial), [maskMaterial])
  const effectQuad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), effectMaterial), [effectMaterial])

  useEffect(() => {
    maskScene.add(maskQuad)
    effectScene.add(effectQuad)
    return () => {
      maskScene.remove(maskQuad)
      effectScene.remove(effectQuad)
      maskQuad.geometry.dispose()
      effectQuad.geometry.dispose()
      maskMaterial.dispose()
      effectMaterial.dispose()
      sceneTarget.dispose()
      corridorMaskTarget.dispose()
      sweepTexture.dispose()
    }
  }, [corridorMaskTarget, effectMaterial, effectQuad, maskMaterial, maskQuad, maskScene, sceneTarget, effectScene])

  useEffect(() => {
    const unregister = registerFocusHudRenderer((frame: FocusHudFrame) => {
      frameRef.current = {
        focused: frame.focused,
        alpha: frame.alpha,
        star: frame.star,
        planet: frame.planet,
      }
    })
    return unregister
  }, [])

  useEffect(() => {
    const pixelRatio = gl.getPixelRatio()
    const width = Math.max(1, Math.floor(size.width * pixelRatio))
    const height = Math.max(1, Math.floor(size.height * pixelRatio))
    sceneTarget.setSize(width, height)
    corridorMaskTarget.setSize(width, height)
    sweepCanvas.width = Math.max(1, Math.floor(size.width))
    sweepCanvas.height = Math.max(1, Math.floor(size.height))
    maskUniforms.uResolution.value.set(size.width, size.height)
  }, [corridorMaskTarget, gl, maskUniforms, sceneTarget, size.height, size.width, sweepCanvas])

  useFrame(() => {
    const frame = frameRef.current
    const strength = frame.focused && frame.star && frame.planet ? Math.max(0, Math.min(1, frame.alpha)) : 0
    const sp = useScrollStore.getState().scrollProgress
    const whiteOutProgress = clamped(sp, TIMELINE.whiteOut.start, TIMELINE.whiteOut.end)
    const beamOrigin = readBeamWorldOrigin()
    const beamDirection = readBeamWorldDirection()
    const viewDirection = new Vector3()
    camera.getWorldDirection(viewDirection)
    const beamFacing = beamDirection
      ? Math.max(0, Math.min(1, -beamDirection.x * viewDirection.x - beamDirection.y * viewDirection.y - beamDirection.z * viewDirection.z))
      : 0
    const sweepGate = Math.max(0, Math.min(1, (beamFacing - 0.62) / 0.28))
    const sweepStrength = whiteOutProgress * sweepGate
    effectUniforms.uSweepStrength.value = sweepStrength
    effectUniforms.uStrength.value = strength

    if (sweepContext) {
      const projectedOrigin = new Vector3(
        beamOrigin?.x ?? 0,
        beamOrigin?.y ?? -0.428,
        beamOrigin?.z ?? -16,
      ).project(camera)
      const sourceX = (projectedOrigin.x * 0.5 + 0.5) * size.width
      const sourceY = (1 - (projectedOrigin.y * 0.5 + 0.5)) * size.height
      updateSweepMask(
        sweepCanvas,
        sweepContext,
        sweepTexture,
        sweepParticles,
        whiteOutProgress * SWEEP_DURATION,
        sourceX,
        sourceY,
      )
    }

    if (strength <= 0.001 && sweepStrength <= 0.001) {
      gl.render(scene, camera)
      return
    }

    if (strength <= 0.001 || !frame.star || !frame.planet) {
      const previousTarget = gl.getRenderTarget()
      gl.setRenderTarget(sceneTarget)
      gl.clear()
      gl.render(scene, camera)
      gl.setRenderTarget(previousTarget)
      gl.clear()
      gl.render(effectScene, postCamera)
      return
    }

    const geometry = computeHudTangentGeometry(frame.star, frame.planet, size.width, size.height)
    if (!geometry || geometry.lines.length < 2) {
      gl.render(scene, camera)
      return
    }
    const midpoint = {
      x: (frame.star.x + frame.planet.x) * 0.5,
      y: (frame.star.y + frame.planet.y) * 0.5,
    }
    updateLineUniform(maskUniforms.uRayA.value, makeRayLineUniform(geometry.lines[0], midpoint))
    updateLineUniform(maskUniforms.uRayB.value, makeRayLineUniform(geometry.lines[1], midpoint))

    const previousTarget = gl.getRenderTarget()

    gl.setRenderTarget(sceneTarget)
    gl.clear()
    gl.render(scene, camera)

    gl.setRenderTarget(corridorMaskTarget)
    gl.clear()
    gl.render(maskScene, postCamera)

    gl.setRenderTarget(previousTarget)
    gl.clear()
    gl.render(effectScene, postCamera)
  }, 1)

  return null
}
