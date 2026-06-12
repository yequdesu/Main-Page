# 技术栈评估 v2：以声明式、可维护性、可扩展性为优先

> 前提：不考虑迁移成本，不绑定 Vue，优先声明式构筑。基于此重新评估全部方案。

---

## 一、候选方案概览

| 方案 | 范式 | 生态 | 社区规模 |
|------|------|------|----------|
| **React Three Fiber (R3F)** | 声明式 JSX → Three.js | pmndrs 全家桶 | ~30,500 ★，289 个版本 |
| **TresJS** | 声明式 Vue → Three.js | cientos + nuxt | ~3,600 ★，161 个版本 |
| **Vanilla Three.js + GSAP**（当前） | 命令式 | 无封装 | — |

**规模差距：** R3F 生态 Star 总量约 45,000（含 drei ~9,500、postprocessing、rapier、uikit），TresJS 约 4,000。社区规模约 8–10 倍差距。v10 alpha 已发布，支持 WebGPU。

---

## 二、可维护性对比

### 2.1 组件生命周期 = 3D 对象生命周期

**R3F：**

```jsx
// 组件挂载 = 对象加入场景，卸载 = 自动清理（含 dispose）
function OceanWaves({ scrollProgress }) {
  useFrame((_, delta) => {
    // 波浪动画 — 逐帧执行
  })

  return (
    <group>
      {waveData.map((data, i) => (
        <line key={i} geometry={data.geo} material={data.mat} />
      ))}
    </group>
  )
}

// 使用时：
{activeActs.includes('OceanVoyage') && <OceanWaves scrollProgress={sp} />}
```

组件的挂载/卸载天然对应 Act 的 build/exit——不需要猴子补丁、不需要 `builtActs` Set 跟踪、不需要手动 dispose。React 的 conditional rendering 就是 Act 切换检测。

**TresJS：**

```vue
<template>
  <TresGroup v-if="activeActs.includes('OceanVoyage')">
    <!-- 类似模式 -->
  </TresGroup>
</template>
```

TresJS 同样支持声明式条件渲染，但 `v-if` 的销毁时机不如 React 的 `useEffect` cleanup 确定性高（Vue 的 `onUnmounted` 需要显式绑定）。

**对比当前：** 我们维护了 200+ 行 Act 管理逻辑（`resolveActiveActs`、`builtActs` Set、猴子补丁 animate、手动 `act.exit()`）。R3F/TresJS 将这一切归零——Act 就是组件，挂载就是 build，卸载就是 exit+dispose。

### 2.2 动画循环的组织方式

**R3F `useFrame` 优先级调度：**

```jsx
// 显式声明执行顺序 — 替代当前"靠注释约定顺序"
useFrame((_, delta) => { /* 波浪动画 */ }, { priority: 1 })
useFrame((_, delta) => { /* 网格动画 */ }, { priority: 2 })
useFrame((_, delta) => { /* 粒子动画 */ }, { priority: 3 })
useFrame((_, delta) => { /* 光束动画 */ }, { priority: 4 })
useFrame((_, delta) => { /* 相机更新 */ }, { priority: 5 })
```

TresJS `useLoop` 也支持优先级，但 API 在 v5 中刚刚稳定。

**对比当前：** 我们的动画函数调用顺序完全靠代码行序保证——新增一个需要在"粒子之后、光束之前"执行的更新，需要找到正确的插入位置。R3F 的优先级注册消除了这种脆弱性。

### 2.3 状态管理的清晰边界

R3F 社区的核心原则——**五类出口**（`useMemo` / `useState` / `useEffect` / `useLayoutEffect` / `useFrame`），每种有明确定义：

| 出口 | 当前代码中的对应 | 问题 |
|------|------------------|------|
| `useMemo` | 预分配对象池（模块级变量） | 分散在文件各处，无生命周期绑定 |
| `useState` | Vue `ref`（`isAct3Focused`、`overlayData`） | 与模块级变量混用 |
| `useEffect` | `onMounted` / `onUnmounted` | 但 Three.js 对象创建在 Act build 中而非 mount 时 |
| `useFrame` | 动画循环中的 6 个函数 | 统一的调用模式，但无优先级 |

**对比当前：** 我们的状态分三层（Vue ref 响应式 + 模块级变量 + GSAP tween），每层的更新时机和生命周期不同，但缺乏文档化的边界。R3F 的"五类出口"模式将这种边界标准化、可预测化。

---

## 三、可扩展性对比

### 3.1 新增 Act 的成本

**R3F：**

```jsx
// 新增 Act 4 = 新建一个组件
function Act4Starfield({ scrollProgress }) {
  const starsRef = useRef()

  useFrame((_, delta) => {
    // 星场动画
  })

  return <points ref={starsRef}>...</points>
}

// 在场景中加一行：
<Canvas>
  {activeActs.includes('Starfield') && <Act4Starfield scrollProgress={sp} />}
</Canvas>
```

成本：1 个新组件文件 + 1 行条件渲染。不需要修改任何现有代码。

**当前：**

新增 Act 需要：
1. 在 LighthouseScene.vue 中添加 `act4` 对象
2. 将 `act4` 加入 `acts` 数组
3. 在 `animate()` 函数中确保新的动画函数调用顺序正确
4. 如果有独立动画函数，需要在模块级声明并加入动画循环
5. 在 `onMounted` 的猴子补丁中确保 act 切换检测覆盖新 Act

成本：修改 1 个文件中的 5+ 处位置。

### 3.2 新增粒子行为

**R3F / 可组合模式：**

```jsx
// 每个行为是独立的 hook 或组件
function DustField({ scrollProgress }) {
  const particlesRef = useRef()

  useHoverDetection(particlesRef)        // 行为 1
  usePositionUpdate(particlesRef, sp)    // 行为 2
  useAppearanceUpdate(particlesRef, sp)  // 行为 3
  useOcclusionFade(particlesRef)         // 行为 4

  return <instancedMesh ref={particlesRef} args={[null, null, 135]}>...</instancedMesh>
}
```

行为之间完全解耦，可以独立开发、测试、移除。

**对比当前：** `animateDust()` 139 行单函数，6 个职责耦合在一起。新增一个"聚焦高亮"行为需要在函数中找到正确位置插入代码。

### 3.3 复用效果到其他场景

一旦用 R3F hook 封装了"屏幕空间悬停检测"：

```jsx
function useScreenSpaceHover(meshRef, camera) {
  // 通用逻辑，不绑定到特定对象
}
```

这个 hook 可以被任何需要悬停检测的 3D 对象复用——不仅是行星，未来可能的 UI 元素、装饰物都可用。

**当前：** 悬停检测硬编码在 `animateDust()` 内部，查询 `isMainPlanet` 过滤——即使有其他类型需要悬停，也无法复用。

---

## 四、声明式程度对比

### 4.1 场景构造

| 方法 | 描述场景的方式 |
|------|---------------|
| **R3F** | JSX 模板 —— 嵌套关系直接可见，与 Three.js scene graph 同构 |
| **TresJS** | Vue 模板 —— 同上，但需配置 `templateCompilerOptions` |
| **当前** | `new THREE.Mesh(geo, mat)` 命令式链式调用 —— 难以一眼看出层次结构 |

**R3F 示例：** 灯塔的结构直接反映在 JSX 嵌套中：

```jsx
<Lighthouse position={[0, -2.5, SCENE_CENTER_Z]} scale={0.7}>
  <Foundation />
  <Body />
  <Balcony />
  <Lantern>
    <Glass />
    <Bulb />
  </Lantern>
  <Spire />
</Lighthouse>
```

**当前：** 灯塔的 30 个 Mesh 都是平铺的命令式调用，只能靠 Y 坐标注释理解层次。

### 4.2 动画描述

| 方法 | 描述动画的方式 |
|------|---------------|
| **R3F + useFrame** | `useFrame(() => { ref.current.rotation.y += delta * speed })` — 动画逻辑依附于组件 |
| **R3F + GSAP** | `useGSAP(() => { gsap.to(ref.current.position, {...}) }, [deps])` — 声明式 GSAP 集成，自动 cleanup |
| **当前** | 6 个动画函数平铺在 `animate()` 中，通过模块级变量共享状态 |

### 4.3 过渡定义

**R3F Rig 模式：**

```jsx
// 集中定义所有 scroll 阈值 → 变换的映射
const SCROLL_RIG = {
  whiteOut:     { start: 0.40, end: 0.55, target: WHITE_OUT_TARGET },
  gridFlatten:  { start: 0.45, end: 0.58, target: GRID_TARGET },
  verticalRise: { start: 0.58, end: 0.70, target: VERTICAL_TARGET },
  act3Reveal:   { start: 0.85, end: 1.00, target: ACT3_TARGET },
}
```

**当前：** 阈值分散在 `LighthouseScene.vue`（7 个常量）和 `App.vue`（硬编码 0.70）中。

---

## 五、生态系统直接获益

### 5.1 R3F 生态中可直接使用的包

| 包 | 版本 | 可替代的当前代码 |
|----|------|-----------------|
| `@react-three/drei` | v10.7.7 | `useGLTF`（如果有模型）、`Environment`、`Text`（替代 Canvas 精灵标签）、`Line`（替代手写 LineGeometry） |
| `@react-three/postprocessing` | v3+ | Bloom 效果（恒星辉光）、色调映射 |
| `zustand` | v5+ | 替代模块级变量做全局渲染状态管理 |
| `@gsap/react` | v2+ | `useGSAP` 替代手动 `gsap.to` + cleanup |

### 5.2 TresJS 生态中可直接使用的包

| 包 | 版本 | 说明 |
|----|------|------|
| `@tresjs/cientos` | v5.7.2 | 类似 drei，但规模小很多（~370 ★ vs ~9,500 ★） |
| `@tresjs/post-processing` | — | 后处理支持 |

**结论：** R3F 的生态成熟度意味着"不要重复造轮子"的空间大得多——drie 中的 `Line`/`Text`/`Sparkles` 可以直接替代我们手写的波浪线、Canvas 标签、尘埃粒子。

---

## 六、最终推荐：React Three Fiber

### 6.1 推荐理由

1. **声明式程度最高** —— JSX 本身就是 scene graph，组件树就是层次结构，条件渲染就是 Act 切换。不需要额外抽象层。

2. **生命周期自动化** —— 组件挂载 = build，卸载 = dispose。R3F 自动管理 WebGL 资源回收（v9+ 内置 dispose 追踪）。彻底消除 Act 管理代码、`builtActs` Set、猴子补丁。

3. **`useFrame` 优先级调度** —— v10 引入独立调度器，动画函数的执行顺序从"靠注释约定"变成"显式 priority 参数声明"。新增/调整动画不影响现有代码。

4. **行为可组合** —— 粒子系统的每个行为（悬停、移动、遮挡）可以封装为独立 hook，按需组合。未来新增"聚焦高亮"只需加一个 `useFocusHighlight` 而不触及任何现有代码。

5. **状态管理清晰** —— Zustand 瞬态 API 处理逐帧渲染状态，React state 处理 UI 交互状态——边界明确，不会出现当前"模块级变量 vs Vue ref"的混乱。

6. **生态成熟度碾压** —— 45,000+ Star 的 pmndrs 生态，200+ 个 npm 包，7 年积累的生产案例（Zillow、Vercel、ReadyPlayer.me）。drei 中的 `Line`/`Text`/`Sparkles` 可直接替代手写 Canvas 精灵和手动 LineGeometry。

7. **v10 + WebGPU 前瞻性** —— 刚刚发布的 v10 alpha 已经做好了 WebGPU 准备，未来可以直接利用 GPU 计算粒子物理和着色器。

8. **GSAP 集成** —— `@gsap/react` 提供了 `useGSAP` hook，自动管理 ScrollTrigger 生命周期，与 React 卸载清理完美配合。

### 6.2 为什么不是 TresJS

| 维度 | 评估 |
|------|------|
| 社区规模 | 3,600 ★ vs 30,500 ★ —— 遇到复杂问题时能找到的参考案例少一个数量级 |
| 生态工具 | cientos 370 ★ vs drei 9,500 ★ —— 后者有 100+ 个即用组件 |
| API 稳定性 | v5 刚发布，命名经历了多次变动（`onBeforeRender`→`onBeforeLoop`→`onBeforeRender`） |
| 生产参考 | 缺少像 *The Monolith*、*Galaxy Voyager* 那样的复杂场景生产案例 |
| 声明式程度 | 与 R3F 同级别（Vue 模板），但 Vue 的 `v-if` 销毁时机不如 React 的严格模式 + cleanup 确定性强 |

**公平地说：** 如果项目要求必须用 Vue，TresJS 是正确的选择。但在不限制框架的前提下，R3F 在每个维度上都领先。

### 6.3 为什么不是 Vanilla Three.js

当前代码的问题**不是 Three.js 的问题**，而是我们自己搭建的脚手架（Act 管理、动画调度、状态管理）不够完善。R3F 将这些脚手架标准化、社区化——我们不需要维护框架，只需要写场景逻辑。

### 6.4 迁移路径

目标不是"用 React 重写所有逻辑"，而是"用 R3F 的声明式模型重新组织场景结构"：

```
迁移前（当前）:
  LighthouseScene.vue  ← 1580 行，Act 1/2/3 全部耦合

迁移后（推荐）:
  src/r3f/
  ├── App.jsx                        ← 取代 App.vue — GSAP ScrollTrigger + React
  ├── components/
  │   ├── Canvas.jsx                 ← R3F Canvas 配置
  │   ├── ScrollRig.jsx              ← scrollProgress → 3D 变换映射
  │   └── FocusOverlay.jsx           ← SVG 叠加层
  ├── acts/
  │   ├── Act1OceanVoyage.jsx        ← useFrame + buildOcean/buildLighthouse/buildDust
  │   ├── Act2GridTransition.jsx     ← useFrame + buildVerticalGrid
  │   └── Act3ContentPhase.jsx       ← useFrame + 轨道/恒星/标签/点击检测
  ├── actors/                         ← 3D 实体（取代 build* 函数）
  │   ├── Lighthouse.jsx
  │   ├── LightBeam.jsx
  │   ├── DustField.jsx
  │   ├── OceanWaves.jsx
  │   ├── CentralStar.jsx
  │   └── PlanetLabel.jsx
  ├── behaviors/                      ← 可组合行为 hook
  │   ├── useScreenSpaceHover.js
  │   ├── usePositionUpdate.js
  │   ├── useAppearanceUpdate.js
  │   └── useOcclusionFade.js
  └── shaders/
      └── VolumetricBeamShader.js
```

每个 Act 组件 ≈ 100–200 行（而非当前 727 行），每个 actor 组件 ≈ 50–100 行，每个 behavior hook ≈ 30–50 行。

### 6.5 风险评估

| 风险 | 缓解措施 |
|------|----------|
| React 学习曲线 | 项目的 React 使用局限在 JSX + hooks + R3F，不涉及复杂状态管理 |
| GSAP + R3F 集成 | `@gsap/react` + `useGSAP` 已成熟，自动处理 React 生命周期 |
| R3F v10 仍在 alpha | 使用稳定的 v9.6。v10 仅用于前瞻性评估 |
| 性能 | R3F 的 reconciler 经过 7 年优化，`frameloop: 'demand'` + 直接操作 ref 与命令式 Three.js 性能相同 |

---

## 七、语言选择：TypeScript（`.tsx`）

### 7.1 结论

**使用 TypeScript，所有新文件以 `.tsx` 为扩展名。**

### 7.2 依据

R3F 生态是 TypeScript-first：

| 事实 | 来源 |
|------|------|
| `@react-three/fiber` 自身以 TypeScript 编写，输出 `.d.ts` | package.json |
| `@types/three` 是 peerDependency，R3F 类型系统深度依赖 | npm dependency tree |
| 官方文档有专门 TypeScript 章节（`r3f.docs.pmnd.rs/api/typescript`） | 官方文档 |
| Drei、zustand、postprocessing、rapier 全部 TS | 各包 package.json |
| 社区脚手架默认 TypeScript（如 `r3f-template`） | npm |

### 7.3 对本项目的直接收益

| 收益 | 说明 |
|------|------|
| Three.js API 智能提示 | `MeshStandardMaterial` 构造参数、`uniforms` 字段全部自动补全 |
| R3F JSX 元素校验 | `<mesh>` / `<group>` 等声明式元素自动校验可用属性 |
| 粒子 `userData` 类型安全 | 定义 `ParticleData` interface，所有字段有提示、重构时编译器捕获错误 |
| Act 间接口约束 | Act 模块导出 `ActDefinition` 类型，确保 build/animate/exit/dispose 签名一致 |
| 重构安全 | 改名、改签名时 TypeScript 编译器捕获所有不匹配引用，不需要全局搜索 |

### 7.4 代价

| 代价 | 缓解 |
|------|------|
| Three.js 类型学习曲线 | 主要是 `THREE.Vector3`、`THREE.Mesh`、`ThreeElements` 等基础类型的简单 interface，不涉及高级泛型 |
| 为无类型的现有 JS 代码补 interface | 现有代码只有 ~1580 行，且将被全部重写，无历史包袱 |
| 构建配置 | Vite 原生支持 TypeScript，零配置（仅需 `tsconfig.json`） |

---

## 八、状态管理：Zustand（渲染）+ React（UI）分层

### 8.1 结论

采用分层状态管理——**Zustand 管理渲染状态，React useState/context 管理 UI 状态**。

### 8.2 依据

| 来源 | 模式 |
|------|------|
| R3F 官方文档 "五类出口" | `useFrame` 内用 ref/瞬态读取，`useState` 管理 UI 交互 |
| R3F Best Practices skill | "Never setState in useFrame; use refs or store.getState()" |
| Galaxy Voyager（220+ 星系） | Zustand getState() 逐帧读取 + slice 拆分 |
| HekTek City v4 | Zustand transient API + React state 分层 |
| Codrops 2025 滚动教程 | GSAP 驱动 Zustand，R3F useFrame 消费 |

### 8.3 状态分层

| 层级 | 存放位置 | 读写方式 | 原因 |
|------|----------|----------|------|
| 渲染状态 | Zustand store | `getState()` in useFrame（写），不触发 re-render | 60fps 变更 |
| UI 状态 | React useState/context | 正常 hook 订阅（读写），触发 re-render | 低频交互 |
| GSAP tween | GSAP 内部 + ref | GSAP 自有生命周期 | 独立动画引擎 |

渲染状态包含：`scrollProgress`、`focusedPlanetIdx`、`hoveredIdx`、`overlayData`（屏幕空间坐标）
UI 状态包含：`hintVisible`、`lighthouseImage`、品牌文字动画状态

### 8.4 设计原则

1. **Zustand store 按 slice 拆分**——scrollSlice、focusSlice、hoverSlice 各自独立，在 `create` 中合并。防止 "god store"
2. **同一 store 支持两种读取**——渲染层用 `getState()` 瞬态读，UI 层用 `useStore(selector)` 订阅读。需要 UI 跟随渲染状态时，不引入新机制
3. **可新增独立 store**——未来如需网络/音频状态，新增独立 store 不与现有 store 耦合
4. **渲染状态绝不放在 React state 中**——防止 60fps 的 re-render 级联

---

## 九、Act 可见性控制：`visible` prop 切换

### 9.1 结论

所有 Act 组件始终挂载，通过 `visible` prop 控制显示/隐藏——不使用条件渲染（mount/unmount）。

### 9.2 依据

| 来源 | 建议 |
|------|------|
| R3F 官方文档 · Performance Pitfalls | "Don't mount/unmount dynamically — recompiles materials, geometry, shaders every time. Use visibility instead." |
| R3F GitHub Issue #3549 | `useEffect` 与 `useFrame` 执行顺序随子组件数量变化——卸载再挂载时无法可靠保证初始化顺序 |

### 9.3 设计原则

```tsx
<Act1OceanVoyage visible={needsAct1(sp)} sp={sp} />
<Act2GridTransition visible={needsAct2(sp)} sp={sp} />
<Act3ContentPhase visible={sp >= 0.85} sp={sp} />
```

- Act 1→2 交叉区（0.40–0.45）两组件同时可见，实现交叉淡化
- 组件内部 `useFrame` 在不可见时 early return，避免无效计算
- 首次访问某 Act 时内部延迟初始化（`useRef` + 懒初始化模式）

---

## 十、粒子系统：混合方案

### 10.1 结论

3 颗主行星用独立 R3F `<mesh>` 组件，132 个碎片用 `InstancedMesh` 批量渲染。Draw calls：4。

### 10.2 依据

| 来源 | 模式 |
|------|------|
| R3F 官方示例 | 大批量（1000+）用 InstancedMesh + custom shader |
| Drei `Sparkles` 组件 | 小批量（<200）用独立 Mesh，代码简洁 |
| Galaxy Voyager | 星系粒子 InstancedMesh + per-instance color/luminosity via shader |
| R3F `onClick` | 独立 Mesh 天然支持，InstancedMesh 需额外 Raycaster |

### 10.3 为什么不能统一

主行星与碎片的交互逻辑本质不同：

| 差异 | 主行星（3个） | 碎片（132个） |
|------|-------------|--------------|
| 几何体 | 高面数 Sphere(32×32) | 低面数 Sphere(10×8) |
| 交互 | click → focus → open URL | 无交互 |
| 标签 | 跟随 Sprite（renderOrder=9999） | 无 |
| 遮光逻辑 | 被遮挡方 | 遮挡方（淡出） |
| 悬停 | 屏幕空间检测 + 放大 35% | 无 |
| 类型安全 | 需要完整 PlanetData interface | 仅需 DebrisData |

---

## 十一、测试策略：L1 全覆盖 + L2 关键路径

### 11.1 结论

纯函数层（`behaviors/`）100% 覆盖；R3F 组件仅对关键交互路径（Act 切换、点击聚焦）做场景图结构验证。不做视觉回归测试。

### 11.2 依据

| 来源 | 模式 |
|------|------|
| R3F 官方 Testing 文档 | `@react-three/test-renderer` + `advanceFrames()` 用于确定性逐帧测试 |
| COMPOSABILITY_TESTABILITY.md 分析 | 纯函数业务逻辑测试零依赖，投入产出比最高 |
| Three.js 社区共识 | 视觉回归测试维护成本极高，仅适合 UI 组件库 |

### 11.3 测试分层

| 层级 | 覆盖范围 | 工具 |
|------|----------|------|
| L1 · 纯函数 | `behaviors/*` — 位置/颜色/透明度/遮挡/切线 计算 | vitest |
| L2 · 场景图 | `acts/*` — Act 切换时场景图结构、useFrame 逐帧行为 | @react-three/test-renderer |
| L3 · 视觉 | 不做 | — |

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [`COMPOSABILITY_TESTABILITY.md`](./COMPOSABILITY_TESTABILITY.md) | 可组合性与可测试性深度对比（R3F vs TresJS vs Vanilla） |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)（历史） | Vue 原版源码分析——理解"为什么这样拆分" |
| [`HANDOFF.md`](./HANDOFF.md) | 项目当前状态 + 已完成工作清单 |
| [`../README.md`](../README.md) | 当前架构和渲染管线 |
