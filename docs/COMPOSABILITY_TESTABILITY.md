# R3F vs TresJS vs Vanilla：可组合性与可测试性深度对比

> 对 R3F 在可组合性和可测试性上的潜在短板进行诚实评估。不回避问题。

---

## 一、可组合性对比

"可组合性"在此定义为：将复杂场景拆解为独立、可复用、可独立开发的模块的能力，以及将这些模块自由组合的灵活度。

### 1.1 R3F 的可组合性

**优势 — 组件树 = 场景图：**

```jsx
// 天然的组合 — JSX 嵌套就是 Three.js 层级
<Lighthouse position={[0, -2.5, -16]} scale={0.7}>
  <Foundation />
  <TowerBody />
  <LanternRoom>
    <GlassCylinder />
    <LightBulb />
    <FramePosts count={6} />
  </LanternRoom>
  <RoofStructure />
</Lighthouse>
```

每个子组件自包含其几何体、材质、动画逻辑。父组件不关心子组件内部实现。这是 R3F 最强的组合性优势。

**优势 — 行为 Hook 可组合：**

```jsx
function DustField() {
  const ref = useRef()
  useScreenSpaceHover(ref)     // 独立的行为 hook
  useOrbitPosition(ref, sp)    // 独立的行为 hook
  useAppearanceFade(ref, sp)   // 独立的行为 hook
  useOcclusionCulling(ref)     // 独立的行为 hook
  return <instancedMesh ref={ref} args={[null, null, 135]} />
}
```

Hook 可以跨组件复用——`useScreenSpaceHover` 不绑定到特定对象类型。

**劣势 — Hook 规则约束：**

```
❌ 不能在条件语句中调用 useFrame
❌ 不能在循环中调用 useFrame
❌ useFrame 必须在 <Canvas> 子组件内
❌ useFrame 调用顺序不可靠（与子组件数量相关，见 Issue #3549）
```

**影响：** 如果需要在运行时动态决定"是否启用某个动画行为"，不能用 `if (condition) useFrame(...)`——必须改为在 `useFrame` 内部做 early return：

```jsx
// ❌ 不可行
{enableBeam && <BeamAnimator />}

// ✅ 替代方案
function BeamAnimator({ enabled }) {
  useFrame((_, delta) => {
    if (!enabled) return    // early return 而非条件 hook
    // ...
  })
}
```

这种约束意味着所有可能的动画行为必须在组件定义时预先声明——不能像 Vanilla 那样在运行时动态组合。

**劣势 — 全局帧回调的边界问题：**

如果 App.vue（Canvas 外部）需要知道某帧的数据（例如更新聚焦 SVG 叠加层），必须绕过 React 的 props 系统：

```jsx
// ❌ 不可行 — 每帧更新 prop 会触发 React 重渲染
const [screenPos, setScreenPos] = useState({x:0, y:0})
useFrame(() => setScreenPos(calculate())) // 60fps 的 re-render！

// ✅ 替代方案 — 共享可变对象（绕过 React）
export const screenState = { star: {x:0,y:0,r:0}, planet: {x:0,y:0,r:0} }
useFrame(() => { Object.assign(screenState, calculate()) })

// Canvas 外部轮询（~30fps 而非 60fps）
useEffect(() => {
  const id = setInterval(() => {
    setOverlayData({...screenState}) // 低频读取
  }, 33)
  return () => clearInterval(id)
}, [])
```

这是 R3F 最显著的组合性代价——**Canvas 内外的通信必须通过可变对象桥接，而非 React 的标准 props 传递**。

### 1.2 TresJS 的可组合性

**优势：** 与 R3F 同级别的声明式组合——Vue 模板嵌套对应 Three.js 层级。

**劣势 — 与 R3F 相同的问题：**
- Vue composable（`useLoop`）必须在 `TresCanvas` 子组件中调用
- 高频数据不能通过 props 传递（必须用 shallowRef + 直接操作）
- Canvas 内外通信同样需要可变对象桥接

**额外劣势：**
- TresJS v5 的 `useLoop` API 命名经历过多次变动（`onBeforeRender→onBeforeLoop→onBeforeRender`），稳定的 composable API 仍在沉淀
- 社区参考案例远少于 R3F，遇到复杂组合场景时缺少可参考的解决方案

### 1.3 Vanilla Three.js 的可组合性

**优势 — 无框架约束，最大灵活度：**

```js
// 纯函数 — 可以在任何地方、任何条件下调用
function updateParticlePosition(particle, time, scrollProgress) {
  // 零依赖，完全可测试
}

function updateParticleAppearance(particle, time, scrollProgress) {
  // 零依赖，完全可测试
}

// 运行时动态组合 — 不需要预先声明
function animate(currentActs, sp) {
  for (const act of currentActs) {
    if (act.shouldUpdateBeam) updateBeam(sp)     // 条件执行
    if (act.shouldUpdateWaves) updateWaves(sp)    // 条件执行
  }
}
```

**优势 — 数据流完全自由：**

```js
// 不需要"绕过 React"——直接传递值即可
function updateOverlay(camera, planet, star) {
  const screenData = projectToScreen(camera, planet, star)
  app.overlayData = screenData  // 直接赋值，无中间层
}
```

没有 Canvas 边界概念。App.vue 和 Three.js 场景之间的数据通道就是普通的 JavaScript 赋值——不需要可变对象桥接、不需要轮询。

**劣势 — 没有组件化抽象：**

Vanilla 需要自己搭建：
- 对象生命周期管理（创建/销毁/ dispose）
- 场景图变更追踪
- 模块间依赖管理
- Act 切换检测

这些在 R3F/TresJS 中是自动的，在 Vanilla 中是手动的。

### 1.4 可组合性结论

| 维度 | R3F | TresJS | Vanilla |
|------|-----|--------|---------|
| 组件层级组合 | ✅ 最优（JSX = scene graph） | ✅（Vue template） | ❌ 手动 |
| 行为 Hook 复用 | ✅ 可复用，但有 hook 规则约束 | ✅ 类似 | ✅✅ 完全自由 |
| 运行时动态组合 | ⚠️ 受限于 hook 规则 | ⚠️ 同上 | ✅ 最优 |
| Canvas 内外通信 | ❌ 需可变对象桥接 | ❌ 同上 | ✅ 直接赋值 |
| 对象生命周期 | ✅ 自动 | ✅ 自动 | ❌ 手动 |
| **综合** | **结构化组合最优，但灵活性受框架约束** | **同上，生态更小** | **灵活性最优，但结构化需自己搭建** |

---

## 二、可测试性对比

### 2.1 R3F 的可测试性

**`@react-three/test-renderer` 能力：**

```tsx
import ReactThreeTestRenderer from '@react-three/test-renderer'

test('RotatingMesh rotates on each frame', async () => {
  const { scene, advanceFrames } =
    await ReactThreeTestRenderer.create(<RotatingMesh />)

  const mesh = scene.children[0].instance as THREE.Mesh
  await advanceFrames(2, 0.1)          // 前进 2 帧，每帧 delta=0.1

  expect(mesh.rotation.x).toBeCloseTo(0.2)
})

test('scene structure matches expectations', async () => {
  const renderer = await ReactThreeTestRenderer.create(<Lighthouse />)
  const meshes = renderer.scene.findAllByType('Mesh')
  expect(meshes.length).toBeGreaterThan(20)
  const glass = renderer.scene.findByProps({ name: 'glassCylinder' })
  expect(glass).toBeDefined()
})
```

**优势：**
- 真正的 headless 测试——不需要浏览器、不需要 GPU、不需要 WebGL
- `advanceFrames()` 提供确定性的逐帧测试
- `findByType` / `findByProps` 提供场景图查询
- `fireEvent` 支持交互事件模拟

**劣势：**
1. **测试的是框架行为，而非业务逻辑：** 上面的测试验证的是"mesh 确实旋转了 0.2 弧度"——验证的是 R3F + Three.js 的行为，而非 "rotate 函数正确计算了旋转角度"。后者才是我们真正关心的业务逻辑。

2. **工具生态窄：** React Testing Library 的 `render`/`screen`/`waitFor` 不适用于 3D。需要专门学习 `ReactThreeTestRenderer` 的 API。遇到社区没有覆盖的测试场景时，需要自己造工具。

3. **Mock 复杂度高：** 如果要 mock `useFrame` 中的特定行为（例如 mock camera 的 projection matrix），需要深入理解 R3F 内部状态结构。

4. **与 DOM 测试割裂：** 项目中 App.vue（DOM 层）和 LighthouseScene.vue（3D 层）需要分别用 RTL + R3F Test Renderer 测试——两个测试框架、两套概念。

### 2.2 TresJS 的可测试性

**官方解决方案：** TresJS 没有像 `@react-three/test-renderer` 这样的专用测试工具。

**可用的近似方案：** Vue Test Utils + 手动 mock：

```ts
// 只能测试组件是否渲染、props 是否正确——不能测试 3D 行为
vi.mock('three', () => ({ ... })) // 模拟整个 Three.js
import { mount } from '@vue/test-utils'

test('TresCanvas renders', () => {
  const wrapper = mount(TresCanvas, { ... })
  expect(wrapper.find('canvas').exists()).toBe(true)
})
```

**结论：** TresJS 的可测试性在三者中最弱——缺乏专用测试工具 + 生态太小导致没有社区方案。

### 2.3 Vanilla Three.js 的可测试性

**关键区别：** Vanilla 场景中，业务逻辑和 Three.js API 调用可以完全分离：

```js
// ===== 纯业务逻辑 — 零依赖，完美可测 =====
// behaviors/positionUpdate.js
export function updateParticlePosition(p, time, sp) {
  const smoothProgress3 = smoothstep(clamp((sp - 0.85) / 0.15))
  const bx = p.wx + Math.sin(time * 0.4 + p.ph) * 0.25
  const ox = Math.cos(p.orbitAngle) * p.orbitR

  return {
    x: lerp(bx, ox, smoothProgress3),
    y: lerp(p.wy, -1.0, smoothProgress3),
    z: lerp(p.wz, orbitZ, smoothProgress3),
  }
}

// ===== 测试 — 纯函数，完全确定 =====
import { describe, it, expect } from 'vitest'

describe('updateParticlePosition', () => {
  it('returns Act1 position when sp = 0', () => {
    const p = { wx: 1, wy: 2, wz: 3, ph: 0, orbitAngle: 0, orbitR: 3.6 }
    const result = updateParticlePosition(p, 0, 0)
    expect(result.x).toBeCloseTo(1.25)  // bx + sin 项
  })

  it('returns orbital position when sp = 1', () => {
    const p = { wx: 1, wy: 2, wz: 3, ph: 0, orbitAngle: Math.PI/2, orbitR: 3.6 }
    const result = updateParticlePosition(p, 0, 1)
    expect(result.x).toBeCloseTo(0)       // cos(PI/2) * 3.6 ≈ 0
    expect(result.y).toBeCloseTo(-1.0)     // lerp → cy
  })

  it('interpolates at sp = 0.925', () => {
    // 验证 50% Act 3 过渡点的插值正确性
  })
})
```

**优势：**
- **纯函数业务逻辑零环境依赖** — 不需要 mock WebGL、不需要 headless canvas、不需要框架测试工具。`vitest` + 纯 JavaScript。
- **精细粒度测试** — 可以单独测试粒子位置、缩放、不透明度、遮挡计算、光束角度、颜色过渡中的每一个数学函数。
- **快速反馈** — 纯函数测试在毫秒级完成，不会因为需要渲染 canvas 而等待。
- **代码本身就是可测试的** — 不需要为了测试而重新组织代码。将业务逻辑提取为纯函数 = 可测试。

**劣势：**
- **集成测试困难** — 无法测试 "所有动画函数在动画循环中按正确顺序执行" 或 "渲染器输出正确的像素"。
- **需要自己搭建集成测试** — 如果需要端到端测试，需要 headless WebGL（如 puppeteer + `--use-gl=swiftshader`）。

### 2.4 可测试性结论

| 维度 | R3F | TresJS | Vanilla |
|------|-----|--------|---------|
| 单元测试业务逻辑 | ⚠️ 需从 hook 中提取纯函数 | ⚠️ 同上 | ✅ 最优（天然分离） |
| 测试 useFrame/hook 行为 | ✅ `advanceFrames()` 确定性 | ❌ 无专用工具 | N/A |
| 场景图结构验证 | ✅ `findByType/findByProps` | ❌ 无 | ❌ 需自建 |
| 测试环境复杂度 | ⚠️ 需专用 test-renderer | ❌ 需 mock 整个 Three.js | ✅ vitest 即可 |
| CI/CD 友好度 | ✅ headless | ⚠️ | ✅ 纯函数测试 |
| 交互模拟 | ✅ `fireEvent` | ❌ | ❌ 需 Puppeteer |
| **综合** | **框架行为可测，但业务逻辑需额外提取** | **最弱** | **业务逻辑可测性最优** |

---

## 三、与当前项目场景的对照

### 场景：测试粒子从 Act 1 漂浮位置过渡到 Act 3 轨道位置

**Vanilla:**

```js
// 纯函数 — 1 个 import，3 行测试，0 mock
import { updateParticlePosition } from './behaviors/positionUpdate'
test('particle transitions to orbit at sp=1', () => { ... })
```

**R3F:**

```js
// 方案 A：用 test-renderer 测 hook — 需要 mock 整个 R3F 上下文
const { scene, advanceFrames } = await ReactThreeTestRenderer.create(
  <DustField scrollProgress={1.0} />
)
const mesh = scene.findAllByType('instancedMesh')[0]
// ...但 instancedMesh 的 matrix 难以逐粒子断言

// 方案 B：提取纯函数（和 Vanilla 一样） — 失去 R3F 的便利性
import { updateParticlePosition } from './behaviors/positionUpdate'
test('particle transitions to orbit at sp=1', () => { ... })
```

**关键洞察：** 对于"纯数据计算"这类测试，Vanilla 和 R3F 最终都归结为提取纯函数。但对"useFrame 逐帧调用了正确的函数序列"这类测试，Vanilla 很难测（需要 hook 进动画循环），而 R3F 有 `advanceFrames`。

### 场景：动态决定是否启用光束动画

**Vanilla:**

```js
function animate(sp, activeActs) {
  if (activeActs.includes('OceanVoyage') && sp < WHITE_OUT_END) {
    animateBeam(time, sp)  // 运行时决定——完全灵活
  }
}
```

**R3F:**

```jsx
function BeamAnimator({ enabled }) {
  useFrame((_, delta) => {
    if (!enabled) return   // 必须用 early return，不能省略整个 useFrame
    // 光束动画
  })
}
```

Vanilla 更灵活——可以在运行时动态组合函数调用列表。R3F 的 useFrame 是静态声明的，不支持运行时增删。

---

## 四、最终裁决

### 可组合性

**R3F 不落于下风，但有结构性代价。**

R3F 的组件树组合（JSX = scene graph）远优于 Vanilla 的手动管理。Hook 行为组合也足够灵活——但 hook 规则（不能条件调用、不能动态增删 useFrame）确实增加了约束。Vanilla 在这些边缘场景下更灵活。

**实际影响：** 对于我们的项目（3 个 Act、6 个动画函数、135 个粒子），R3F 的约束**不会构成实际障碍**——early return 模式可以覆盖所有条件动画需求。但如果未来出现"Act 4 在运行时动态决定启用 5 种不同行为"的场景，Vanilla 的灵活性优势会显现。

### 可测试性

**R3F 不落于下风——但方式不同。**

这是最重要的发现：R3F 没有降低可测试性，它只是**改变了测试的层次**：

| 测试层次 | Vanilla | R3F |
|----------|---------|-----|
| 纯数据计算（粒子位置/颜色/透明度） | ✅ 纯函数，零依赖 | ✅ 提取纯函数——和 Vanilla 完全一样 |
| useFrame 调用序列 | ❌ 难以测试 | ✅ `advanceFrames` 确定性 |
| 场景图结构 | ❌ 需自建断言 | ✅ `findByType/findByProps` |
| 交互事件 | ❌ 需 Puppeteer | ✅ `fireEvent` |

**关键洞察：** Vanilla 的可测试性优势来自**将业务逻辑提取为纯函数**——而这一做法在 R3F 中**同样适用**。R3F 不会阻止你把数学计算提取到 `behaviors/` 目录下用 vitest 测试。R3F 额外提供了 `advanceFrames` 和场景图断言——这是 Vanilla 做不到的。

**唯一需要注意的：** 不要把所有逻辑都塞进 `useFrame` 中。保持纯函数和行为 hook 的分离——纯函数负责计算，hook 负责调用 Three.js API。这样既享受 R3F 的声明式优势，又保持 Vanilla 级别的业务逻辑可测试性。

### 综合裁决

| 方案 | 可组合性 | 可测试性 | 综合评价 |
|------|----------|----------|----------|
| **R3F** | ⭐⭐⭐⭐ 结构化强，hook 规则有约束 | ⭐⭐⭐⭐ 需分层设计，测试工具成熟 | **推荐** |
| **TresJS** | ⭐⭐⭐ 与 R3F 同级但 API 待稳定 | ⭐⭐ 缺乏专用测试工具 | 不推荐 |
| **Vanilla** | ⭐⭐⭐ 灵活但需自己搭建结构 | ⭐⭐⭐⭐⭐ 纯函数测试零依赖 | 仅在团队不愿引入 React 时考虑 |

**R3F 在可组合性和可测试性上均不落于下风。** 它在结构化组合和框架级测试能力上领先，代价是 hook 规则约束——但这种约束对我们项目规模不构成实际障碍。保持纯函数与 hook 的分离是关键——这正是重构方案中 `actors/` + `behaviors/` 分层的设计意图。
