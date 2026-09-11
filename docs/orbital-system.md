# 轨道系统操作手册

维护说明（2026-09-09）：本次核对并更新外层轨道的线几何、配置和锯齿排查。下文保留既有坐标与力学设计说明，其文献对应关系未在本次重新核验。

## 目录

1. [系统概览](#一系统概览)
2. [坐标系与力学模型](#二坐标系与力学模型)
3. [代码结构](#三代码结构)
4. [配置参考](#四配置参考)
5. [新增轨道](#五新增轨道)
6. [调试与排查](#六调试与排查)

---

## 一、系统概览

轨道系统由两层环组成：

| 层 | 组件 | 数量 | 几何 | 行为 |
|----|------|:---:|------|------|
| 轨道参考线 | `OrbitRings.tsx` | 3 | `threeLine` — 手动构建顶点圆 | 静态，仅透明度变化 |
| 外层进动轨道线 | `OrbitalRing.tsx` × N | 3（可扩展） | `LineLoop` + 非索引 `BufferGeometry` 圆周顶点 | 倾角 + 偏心率 + 进动 |

“外层进动轨道线”即原文的“陀螺仪装饰环”，是装饰性的闭合线条；三颗行星的公转参考线由第一层提供。

**数据流：**

```
OrbitalRingConfig[]          <OrbitalRing config={…} />
─────────────────          ─────────────────────────────
GYRO_RINGS 数组  ─────────→  外层 Group: Y 旋转（进动 Ω）
                             内层 Group: X 旋转（倾角 i）+ X 拉伸（偏心率 e）
                               └─ lineLoop + 有序圆周 BufferGeometry
```

每条陀螺仪环是**独立的力学模拟单元**，拥有自己的 `useFrame`，互不干扰。

---

## 二、坐标系与力学模型

### 2.1 Three.js 坐标系

```
       Y (上)
       │
       │  黄道面 = X-Z 平面（Y 恒定）
       │  黄道面法线 = Y 轴
       │
       └────── X
      ╱
     Z
```

### 2.2 轨道要素

每条环模拟行星轨道面的两个独立自由度：

| 要素 | 符号 | 含义 | 变化性 |
|------|:---:|------|:---:|
| **倾角** | `i` | 轨道面与黄道面 (X-Z) 的夹角 | **固定** |
| **升交点经度** | `Ω` | 轨道面绕 Y 轴的旋转角 | **逐帧进动** |
| **偏心率** | `e` | 轨道椭率（0 = 正圆，→1 = 扁平） | **固定** |

### 2.3 变换链

圆周顶点创建于 X-Y 平面（轨道面法线沿 Z）。通过以下变换链映射至目标轨道面：

```
R_y(Ω) · S_x( stretch ) · R_x( π/2 − i )
 ─────   ──────────────   ───────────────
 外层     内层 scale        内层 rotation
 进动     偏心率→椭圆       倾角
```

**推导验证：** 初始轨道面法线 n₀ = (0, 0, 1)

```
n₁ = R_x(π/2 − i) · n₀ = (0, −cos(i), sin(i))
n  = R_y(Ω) · n₁ = (sin(i)·sin(Ω), −cos(i), sin(i)·cos(Ω))
```

轨道面法线 n 与黄道面法线 Y = (0, 1, 0) 的夹角：

```
|n·Y| = |−cos(i)| = cos(i)  →  θ = i  （与 Ω 无关）
```

**倾角恒常，不受进动影响。**

### 2.4 偏心率实现

圆周折线通过内层 group 的 `scale.x = 1/√(1−e²)` 拉伸为椭圆。与 ē/ī 比例遵循 Ngo & Lissauer (2016) 统计关系：

```
ē ≈ (1–2) · ī（弧度制）
```

当前配置 ē/ī ∈ [1.25, 1.36]，位于自然范围。

### 2.5 当前参数

| 环 | 半径 | 倾角 i | i (°) | 偏心率 e | 拉伸 X | ē/ī | 进动周期 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 内 | 7.8 | 0.12 | 6.9° | 0.15 | 1.011× | 1.25 | ~5.2 min |
| 中 | 9.4 | 0.22 | 12.6° | 0.30 | 1.048× | 1.36 | ~2.6 min |
| 外 | 11.0 | 0.38 | 21.8° | 0.50 | 1.155× | 1.32 | ~1.7 min |

---

## 三、代码结构

```
src/
├── types/index.ts             OrbitalRingConfig 接口定义
├── actors/
│   ├── OrbitalRing.tsx         单环力学组件（可独立复用）
│   ├── OrbitRings.tsx          轨道系统编排（参考线 + 配置数组 → N 环）
│   ├── OrbitLineMaterial.tsx   导航线显隐、聚焦弱化与球体附近渐隐
│   └── README.md               组件概览
└── r3f/
    └── ScrollRig.ts            阈值常量 + 工具函数（clamped, smoothstep）
```

### 3.1 `types/index.ts` — OrbitalRingConfig

```ts
export interface OrbitalRingConfig {
  radius: number           // 拉伸前的轨道线半径（必填）
  inclination: number      // 黄道面倾角 (rad)
  eccentricity: number     // 偏心率 0–1
  speed: number            // 进动角速度 (rad/s)，speedScale=1 时的值
  phase: number            // 初始升交点经度 (rad)
  color?: string           // 环颜色，默认 '#cbd5e1'
  maxOpacity?: number      // 最大透明度 0–1，默认 0.28
  segments?: number        // 闭合线分段数，默认 256，向下取整且至少为 3
}
```

### 3.2 `OrbitalRing.tsx` — 单环力学组件

**Props:**

| Prop | 类型 | 默认 | 说明 |
|------|------|:---:|------|
| `config` | `OrbitalRingConfig` | 必填 | 轨道参数 |
| `speedScale` | `number` | `1.0` | 全局进动速度缩放；0 = 冻结 |

**内部结构（JSX 层级）：**

```tsx
<group ref={outerGroupRef} position={[0, -1, -16]} rotation={[0, phase, 0]}>
  {/* ↑ 外层：仅 Y 旋转 — 进动 Ω(t) + 初始相位 */}
  <group rotation={[PI/2 - inclination, 0, 0]} scale={[stretchX, 1, 1]}>
    {/* ↑ 内层：X 旋转 — 倾角 i；X 拉伸 — 偏心率 e */}
    <lineLoop renderOrder={2}>
      <bufferGeometry key={`${radius}:${segmentCount}`}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <OrbitLineMaterial color={color} maxOpacity={maxOpacity} appearStart={GRID_SHIFT_START} />
    </lineLoop>
  </group>
</group>
```

`positions` 按圆周角度递增排列，包含 `segmentCount` 个顶点，不重复首点；`LineLoop` 自动连接末点与首点。顶点数组由 `useMemo` 缓存，半径或分段变化时重建几何体，避免保留旧包围体；几何体和材质由 R3F 管理释放。配置中已移除不适用于线条的 `innerRadius`，线宽不再由内外半径差表达。

**useFrame 逻辑：**

```
OrbitalRing: outerGroupRef.rotation.y += delta × speed × speedScale
OrbitLineMaterial: 滚动显隐 × 聚焦弱化；同步球体位置与半径供片元渐隐
```

聚焦时轨道会整体减弱，并在行星表面之外柔和淡出，退出后平滑恢复。仅作用于导航线，实体行星环不受影响。参数、空间公式、资源生命周期与 Three.js 来源统一维护在 [Actors：聚焦时的轨道显示](../src/actors/README.md#聚焦时的轨道显示)。本次同步了材质与显隐相关说明，其他历史理论和扩展示例未全面复核。

### 3.3 `OrbitRings.tsx` — 轨道系统编排

**职责：**

- 渲染 3 条静态轨道参考线（`ORBIT_RADII` 数组）
- 管理 `GYRO_RINGS` 配置数组
- 映射每条配置 → `<OrbitalRing>` 实例
- 透传 `speedScale`

**配置数组（`GYRO_RINGS`）：**

```ts
const GYRO_RINGS: OrbitalRingConfig[] = [
  { radius: 7.8,  inclination: 0.12, eccentricity: 0.15, speed: 0.02, phase: 0 },
  { radius: 9.4,  inclination: 0.22, eccentricity: 0.30, speed: 0.04, phase: Math.PI / 3 },
  { radius: 11.0, inclination: 0.38, eccentricity: 0.50, speed: 0.06, phase: 2 * Math.PI / 3 },
]
```

### 3.4 依赖关系

```
OrbitRings ──→ OrbitalRing ──→ useScrollStore (Zustand)
    │               │
    │               └── ScrollRig (clamped, smoothstep, SCENE_CENTER_Z, GRID_SHIFT_START)
    │
    └── ORBIT_RADII, ORBIT_COUNT (ScrollRig)
```

---

## Voyager 最外环巡航

主页在最外层进动轨道挂载 `Voyager 1 Low Poly`。这是沿已有装饰轨道编排的循环巡航，不进行开普勒引力积分，也不拟合实际探测器星历。轨道仍以恒星为几何中心。

令短半轴 `b = 11`、长半轴 `a = b / √(1 − e²)`、`e = 0.5`、倾角 `i = 0.38`，巡航参数角为 `θ(t) = π/2 − 2πt/90`。在进动父组的局部坐标中：

```text
p(t) = (a cosθ, b sinθ sin i, b sinθ cos i)
p_world(t) = (0, −1, SCENE_CENTER_Z) + R_y(Ω(t)) · p(t)
```

位置严格落在现有椭圆上；参数角匀速，因此沿椭圆的线速度会轻微变化。相对轨道面每 90 秒一周，轨道面同时以原有 `0.06 rad/s` 进动，所以世界空间路径不在 90 秒后原样闭合。`speedScale` 缩放两种运动。模型以天线与主体基座的组合中心为姿态基准，局部 +Y 开口轴朝向恒星；磁力仪悬杆在对星视角中保持向左上伸展。参数见 [useVoyagerOrbit.ts](../src/behaviors/useVoyagerOrbit.ts)。

轨道线的椭圆拉伸由原 Group 实现，探测器将同样的变换直接用于位置采样，自身保持等比尺寸。聚焦行星时消费现有时间轴的外层轨道显隐进度，并在镜头附近额外淡出，避免重新引入近景遮挡。加载、资源与渲染约定见 [Actors 说明](../src/actors/README.md#voyager-外环巡航)。

飞行器最长尺寸为 0.4125 场景单位，即前一版 0.55 的 75%。中心由天线、馈源、中央支架和基座计算，悬杆不参与核心中心计算。点击核心或在主终端执行 `voyager`，会发出聚焦事件并复用现有 GSAP 会话。近景镜头从主体外侧右上方跟随，入焦完成后始终注视恒星，主体处于恒星左下，避免碟面占据中央视野。整体附件半径只用于取景余量，核心网格白名单用于近景射线点击，因此点击悬杆或空白会退出；30 秒超时也发出统一退出事件。相机公式见 [飞行器近景](../src/behaviors/README.md#飞行器近景)，中心与资源约定见 [Voyager 说明](../src/actors/README.md#voyager-外环巡航)。


## 四、配置参考

### 4.1 倾角 `inclination`

- **单位：** 弧度
- **范围：** 0–0.785 rad (0–45°)
- **效果：** 轨道面偏离黄道面的角度。0 = 完全平躺于黄道面，值越大越"翘起"
- **建议：** 类行星 < 0.12 rad (7°)，类 Kuiper 带 < 0.4 rad (23°)

### 4.2 偏心率 `eccentricity`

- **单位：** 无量纲
- **范围：** 0–1（0 = 正圆，→1 = 极端椭圆）
- **效果：** 通过 X 轴拉伸 `1/√(1−e²)` 实现，与 `inclination` 的比例 ē/ī 应保持在 1–2 范围内
- **建议：** 类行星 < 0.25，类 Kuiper 带 < 0.6

### 4.3 进动 `speed`

- **单位：** rad/s（speedScale=1 时）
- **效果：** 环每秒绕 Y 轴旋转的角度
- **参考：** 0.02 rad/s ≈ 5.2 min/周，0.06 rad/s ≈ 1.7 min/周
- **注意：** 进动不影响倾角，仅改变升交点方向

### 4.4 相位 `phase`

- **单位：** 弧度
- **效果：** 初始升交点经度偏移
- **建议：** 多条环时均匀分布避免视觉重叠（如 0、2π/3、4π/3）

### 4.5 颜色 `color`

- **默认：** `'#cbd5e1'`（Slate-300）
- **材质：** `LineBasicMaterial`，始终 `transparent`、`depthWrite=false`

### 4.6 最大透明度 `maxOpacity`

- **默认：** `0.28`
- **全景基础透明度 =** `smoothstep(clamped(scrollProgress, GRID_SHIFT_START, 1)) × maxOpacity`，阈值来自 `src/types/index.ts`；聚焦时再乘整体弱化与局部渐隐系数（见上述 Actors 文档）
- 仅在 Act 3 阶段（sp > 0.85）可见

### 4.7 速度缩放 `speedScale`

- **位置：** `<OrbitRings>` 和 `<OrbitalRing>` 均接受此 prop
- **默认：** `1.0`
- **用途：** 全局调速、冻结（设为 0）、或不同场景使用不同速度

---

## 五、新增轨道

### 5.1 添加到现有系统

在 `OrbitRings.tsx` 的 `GYRO_RINGS` 数组中追加一项：

```ts
const GYRO_RINGS: OrbitalRingConfig[] = [
  // ... 现有 3 条
  { radius: 13.0, inclination: 0.52, eccentricity: 0.62, speed: 0.08, phase: Math.PI },
  //  ↑ 半径            ↑ 倾角 ~30°       ↑ 偏心率            ↑ 进动          ↑ 相位 180°
]
```

**无需修改任何其他代码。** `OrbitRings` 自动映射渲染。

### 5.2 独立使用 `<OrbitalRing>`

在任意 R3F Canvas 子树中直接挂载：

```tsx
import OrbitalRing from '../actors/OrbitalRing'

function MyScene() {
  return (
    <>
      <OrbitalRing config={{
        radius: 20,
        inclination: 0.3,
        eccentricity: 0.4,
        speed: 0.05,
        phase: 0,
        color: '#94a3b8',
        maxOpacity: 0.35,
      }} />
      <OrbitalRing config={{
        radius: 25,
        inclination: 0.5,
        eccentricity: 0.7,
        speed: 0.1,
        phase: Math.PI * 0.7,
      }} speedScale={0.5} />
    </>
  )
}
```

### 5.3 参数调优流程

1. **调倾角** — 设置 `inclination`，观察环面与黄道面的偏离
2. **调偏心率** — 设置 `eccentricity`，确认 ē/ī ∈ [1.0, 2.0]
3. **调进动** — 设置 `speed`，观察旋转速度是否自然
4. **调相位** — 设置 `phase`，避免与其他环重合
5. **调外观** — 设置 `color`、`maxOpacity`、`segments`

---

## 六、调试与排查

### 6.1 环面漂离黄道面

**症状：** 进动过程中倾角发生变化

**原因：** 变换链错误（X 旋转用 π/2 + i 而非 π/2 − i，或进动绕 Z 轴而非 Y 轴）

**验证：** 在 `OrbitalRing.tsx` useFrame 中打印法线：

```ts
const n = new Vector3(0, 0, 1)
  .applyEuler(new Euler(Math.PI / 2 - inclination, 0, 0))
  .applyEuler(new Euler(0, outerGroupRef.current.rotation.y, 0))
console.log('angle with Y:', Math.acos(Math.abs(n.y)) * 180 / Math.PI)
// 应始终等于 inclination × 180/π
```

### 6.2 环不可见

| 可能原因 | 检查 |
|----------|------|
| scrollProgress 未到 0.85 | Console 中检查 `useScrollStore.getState().scrollProgress` |
| `maxOpacity` 过小 | 临时设为 1.0 测试 |
| `renderOrder` 冲突 | 确认 `renderOrder={2}`，未被其他对象遮挡 |
| 环被 `depthTest` 剔除 | 确认 `depthTest={true}`、`depthWrite={false}` |

### 6.3 进动速度异常

- **太快：** 减小 `speed` 或设置 `speedScale={0.5}`
- **太慢/不动：** 检查 `speedScale` 是否为 0；检查 useFrame 是否被调用（`frameloop="demand"` 需 `invalidate()`）
- **抖动：** 检查 `delta` 是否未做 cap（R3F 默认 cap 在 ~0.1s）

### 6.4 椭圆形状不符预期

- **偏心率公式：** `stretchX = 1/√(1−e²)`
- **e = 0.15 → 1.011×** 接近正圆，肉眼难辨
- **e = 0.50 → 1.155×** 明显椭圆
- 如需更显著的椭圆效果，提高 `eccentricity`（e = 0.7 → 1.40×）

### 6.5 性能

每条 `OrbitalRing` 拥有独立 `useFrame`，顶点只在半径或分段数变化时生成。默认 256 段用于减轻大尺寸显示时的折线感。扩展环数量前应测量目标设备的帧耗时，再决定是否降低分段数或合并逐帧更新。

### 6.6 轨道边缘出现锯齿或折返短线

旧实现将 `RingGeometry` 放入 `LineLoop`。`RingGeometry` 的索引用于描述圆环面的三角形，线条渲染却按该索引顺序连接顶点，导致内外圈之间出现径向边、斜边和重复描线。这属于**连线拓扑错误**；仅提高分段数或开启抗锯齿无法消除错误连接。

当前使用非索引 `BufferGeometry`，只保留一圈按角度排序的圆周顶点，再由 `LineLoop` 闭合。保持原有倾角、偏心率、进动、滚动透明度和主题颜色；具体线对象仍设置 `renderOrder=2`，材质仍为 `transparent=true`、`depthWrite=false`、`depthTest=true`。主 Canvas 的 `flat`、`frameloop="demand"` 和原有渲染请求机制保持原样。

拓扑正确后，如果仍看到轮廓的像素台阶，应另行检查像素密度和抗锯齿；如果看到多边形拐角，则检查 `segments`。不要用圆环面的内外半径模拟线宽。

回归测试见 [OrbitalRing.test.tsx](../src/actors/__tests__/OrbitalRing.test.tsx)，覆盖单一半径、相邻顶点连接、首尾闭合、配置更新及原有动画行为；视觉检查在主页面 Act 3 的日夜主题与行星聚焦状态进行。

---

## 参考资料

- Murray & Dermott, *Solar System Dynamics*, §2.8 (orbital elements)
- Ngo & Lissauer (2016), *PNAS* — ē/ī statistical relationship in solar system bodies
- R3F `useFrame` — https://docs.pmnd.rs/react-three-fiber/api/hooks#useframe
- [Three.js LineLoop](https://threejs.org/docs/pages/LineLoop.html)：按连续顶点连线，并自动首尾闭合。
- [Three.js RingGeometry](https://threejs.org/docs/pages/RingGeometry.html)：带内外半径的圆环面几何体，适用于 Mesh；不能直接将其三角形索引作为轨道线的连线顺序。

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [`../src/actors/README.md`](../src/actors/README.md) | OrbitalRing / OrbitRings 组件概览 |
| [`../src/types/README.md`](../src/types/README.md) | `OrbitalRingConfig` 接口定义位置 |
| [`MAINTENANCE.md`](./MAINTENANCE.md) §6.2 | 环不可见排查 |
| [`../README.md`](../README.md) | 渲染管线和 scene graph 层级 |
