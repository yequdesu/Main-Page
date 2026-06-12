# 轨道系统操作手册

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
| 陀螺仪装饰环 | `OrbitalRing.tsx` × N | 3（可扩展） | `lineLoop` — RingGeometry | 倾角 + 偏心率 + 进动 |

**数据流：**

```
OrbitalRingConfig[]          <OrbitalRing config={…} />
─────────────────          ─────────────────────────────
GYRO_RINGS 数组  ─────────→  外层 Group: Y 旋转（进动 Ω）
                             内层 Group: X 旋转（倾角 i）+ X 拉伸（偏心率 e）
                               └─ lineLoop + RingGeometry
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

RingGeometry 创建于 X-Y 平面（法线沿 Z）。通过以下变换链映射至目标轨道面：

```
R_y(Ω) · S_x( stretch ) · R_x( π/2 − i )
 ─────   ──────────────   ───────────────
 外层     内层 scale        内层 rotation
 进动     偏心率→椭圆       倾角
```

**推导验证：** RingGeometry 法线 n₀ = (0, 0, 1)

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

正圆 RingGeometry 通过内层 group 的 `scale.x = 1/√(1−e²)` 拉伸为椭圆。与 ē/ī 比例遵循 Ngo & Lissauer (2016) 统计关系：

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
│   └── README.md               组件概览
└── r3f/
    └── ScrollRig.ts            阈值常量 + 工具函数（clamped, smoothstep）
```

### 3.1 `types/index.ts` — OrbitalRingConfig

```ts
export interface OrbitalRingConfig {
  radius: number           // 轨道外半径（必填）
  innerRadius?: number     // 轨道内半径，默认 radius - 0.04
  inclination: number      // 黄道面倾角 (rad)
  eccentricity: number     // 偏心率 0–1
  speed: number            // 进动角速度 (rad/s)，speedScale=1 时的值
  phase: number            // 初始升交点经度 (rad)
  color?: string           // 环颜色，默认 '#cbd5e1'
  maxOpacity?: number      // 最大透明度 0–1，默认 0.28
  segments?: number        // 环分段数，默认 96
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
      <ringGeometry args={[innerRadius, radius, segments]} />
      <lineBasicMaterial ref={matRef} ... />
    </lineLoop>
  </group>
</group>
```

**useFrame 逻辑：**

```
1. 读 scrollProgress → 计算 smooth3
2. matRef.opacity = smooth3 × maxOpacity   （scroll 驱动）
3. outerGroupRef.rotation.y += delta × speed × speedScale  （时间驱动）
```

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
- **实际透明度 =** `smoothstep(scrollProgress) × maxOpacity`
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

每条 `OrbitalRing` 拥有独立 `useFrame`。10 条环以下无性能影响。如需大量环（>20），建议：
- 降低 `segments`（默认 96 → 48）
- 合并 useFrame 到父级统一管理

---

## 参考资料

- Murray & Dermott, *Solar System Dynamics*, §2.8 (orbital elements)
- Ngo & Lissauer (2016), *PNAS* — ē/ī statistical relationship in solar system bodies
- R3F `useFrame` — https://docs.pmnd.rs/react-three-fiber/api/hooks#useframe
