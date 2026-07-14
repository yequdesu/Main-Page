import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  LinearFilter,
  Mesh,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three'
import { computeHudTangentGeometry } from '../composition/focusCorridorGeometry'
import { registerFocusHudRenderer, type FocusHudFrame } from '../actors/focusHudBridge'
import type { ScreenCircle, TangentLine } from '../types'
import { TIMELINE } from '../composition/timeline'
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

const squareMaskFragmentShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform vec2 uSquareSize;

  varying vec2 vUv;

  void main() {
    vec2 screenPoint = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
    vec2 distanceFromCenter = abs(screenPoint - uResolution * 0.5);
    vec2 halfSize = uSquareSize * 0.5;
    float inside = step(distanceFromCenter.x, halfSize.x) * step(distanceFromCenter.y, halfSize.y);
    gl_FragColor = vec4(inside, inside, inside, 1.0);
  }
`

const effectFragmentShader = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uCorridorMask;
  uniform sampler2D uSquareMask;
  uniform float uStrength;
  uniform float uBinaryStrength;

  varying vec2 vUv;

  vec3 linearToSrgb(vec3 value) {
    vec3 low = value * 12.92;
    vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), value));
  }

  void main() {
    vec4 source = texture2D(uScene, vUv);
    float corridor = texture2D(uCorridorMask, vUv).r;
    float square = texture2D(uSquareMask, vUv).r;
    float outside = 1.0 - corridor;
    float transition = smoothstep(0.0, 1.0, uStrength);

    float luminance = dot(source.rgb, vec3(0.299, 0.587, 0.114));
    vec3 grayscale = vec3(luminance);
    vec3 processed = mix(source.rgb, grayscale, outside * transition * 0.30);

    // Experiment: binary-quantize each linear RGB channel only inside the square.
    vec3 binaryColor = step(vec3(0.42), source.rgb);
    processed = mix(processed, binaryColor, square * uBinaryStrength);

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
  const squareMaskTarget = useMemo(() => new WebGLRenderTarget(1, 1, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    format: RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  }), [])
  sceneTarget.texture.colorSpace = NoColorSpace
  corridorMaskTarget.texture.colorSpace = NoColorSpace
  squareMaskTarget.texture.colorSpace = NoColorSpace

  const maskScene = useMemo(() => new Scene(), [])
  const squareMaskScene = useMemo(() => new Scene(), [])
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
  const squareMaskUniforms = useMemo(() => ({
    uResolution: { value: new Vector2(1, 1) },
    uSquareSize: { value: new Vector2(1, 1) },
  }), [])
  const effectUniforms = useMemo(() => ({
    uScene: { value: sceneTarget.texture },
    uCorridorMask: { value: corridorMaskTarget.texture },
    uSquareMask: { value: squareMaskTarget.texture },
    uStrength: { value: 0 },
    uBinaryStrength: { value: 0 },
  }), [corridorMaskTarget.texture, sceneTarget.texture, squareMaskTarget.texture])
  const maskMaterial = useMemo(() => new ShaderMaterial({
    uniforms: maskUniforms,
    vertexShader,
    fragmentShader: corridorMaskFragmentShader,
    depthTest: false,
    depthWrite: false,
  }), [maskUniforms])
  const squareMaskMaterial = useMemo(() => new ShaderMaterial({
    uniforms: squareMaskUniforms,
    vertexShader,
    fragmentShader: squareMaskFragmentShader,
    depthTest: false,
    depthWrite: false,
  }), [squareMaskUniforms])
  const effectMaterial = useMemo(() => new ShaderMaterial({
    uniforms: effectUniforms,
    vertexShader,
    fragmentShader: effectFragmentShader,
    depthTest: false,
    depthWrite: false,
  }), [effectUniforms])
  const maskQuad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), maskMaterial), [maskMaterial])
  const squareMaskQuad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), squareMaskMaterial), [squareMaskMaterial])
  const effectQuad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), effectMaterial), [effectMaterial])

  useEffect(() => {
    maskScene.add(maskQuad)
    squareMaskScene.add(squareMaskQuad)
    effectScene.add(effectQuad)
    return () => {
      maskScene.remove(maskQuad)
      squareMaskScene.remove(squareMaskQuad)
      effectScene.remove(effectQuad)
      maskQuad.geometry.dispose()
      squareMaskQuad.geometry.dispose()
      effectQuad.geometry.dispose()
      maskMaterial.dispose()
      squareMaskMaterial.dispose()
      effectMaterial.dispose()
      sceneTarget.dispose()
      corridorMaskTarget.dispose()
      squareMaskTarget.dispose()
    }
  }, [corridorMaskTarget, effectMaterial, effectQuad, maskMaterial, maskQuad, maskScene, sceneTarget, squareMaskMaterial, squareMaskQuad, squareMaskScene, squareMaskTarget])

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
    squareMaskTarget.setSize(width, height)
    maskUniforms.uResolution.value.set(size.width, size.height)
    squareMaskUniforms.uResolution.value.set(size.width, size.height)
    const squareSize = Math.max(160, Math.min(size.width, size.height) * 0.34)
    squareMaskUniforms.uSquareSize.value.set(squareSize, squareSize)
  }, [corridorMaskTarget, gl, maskUniforms, sceneTarget, size.height, size.width, squareMaskTarget, squareMaskUniforms])

  useFrame(() => {
    const frame = frameRef.current
    const strength = frame.focused && frame.star && frame.planet ? Math.max(0, Math.min(1, frame.alpha)) : 0
    const sp = useScrollStore.getState().scrollProgress
    const binaryActive = sp < TIMELINE.act1OceanVoyage.end
    effectUniforms.uBinaryStrength.value = binaryActive ? 1 : 0

    let focusMaskActive = false
    if (strength > 0.001 && frame.star && frame.planet) {
      const geometry = computeHudTangentGeometry(frame.star, frame.planet, size.width, size.height)
      if (geometry && geometry.lines.length >= 2) {
        const midpoint = {
          x: (frame.star.x + frame.planet.x) * 0.5,
          y: (frame.star.y + frame.planet.y) * 0.5,
        }
        updateLineUniform(maskUniforms.uRayA.value, makeRayLineUniform(geometry.lines[0], midpoint))
        updateLineUniform(maskUniforms.uRayB.value, makeRayLineUniform(geometry.lines[1], midpoint))
        focusMaskActive = true
      }
    }
    effectUniforms.uStrength.value = focusMaskActive ? strength : 0

    if (!binaryActive && !focusMaskActive) {
      gl.render(scene, camera)
      return
    }

    const previousTarget = gl.getRenderTarget()

    gl.setRenderTarget(sceneTarget)
    gl.clear()
    gl.render(scene, camera)

    if (focusMaskActive) {
      gl.setRenderTarget(corridorMaskTarget)
      gl.clear()
      gl.render(maskScene, postCamera)
    }

    if (binaryActive) {
      gl.setRenderTarget(squareMaskTarget)
      gl.clear()
      gl.render(squareMaskScene, postCamera)
    }

    gl.setRenderTarget(previousTarget)
    gl.clear()
    gl.render(effectScene, postCamera)
  }, 1)

  return null
}
