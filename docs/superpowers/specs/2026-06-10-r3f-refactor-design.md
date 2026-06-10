# R3F 重构设计文档

> 从 Vanilla Three.js + Vue → React Three Fiber + TypeScript 的完整架构设计。
> 所有决策均援引 R3F 社区成熟方案，来源标注于各节。

## 一、技术栈

| 选择 | 版本 | 援引 |
|------|------|------|
| React | 19 | — |
| React Three Fiber | v9.6 | pmndrs 生态 ~30,500 ★，289 versions |
| @react-three/drei | v10.7 | Drei ~9,500 ★，100+ 组件 |
| GSAP + @gsap/react | v3.12+ | Codrops 2025, Builder.io, Ringston 3D |
| Zustand | v5 | R3F 官方推荐瞬态状态管理 |
| TypeScript | — | R3F 自身以 TS 编写，官方 TS 文档完整 |
| Vite | v6 | 原生 TypeScript 支持 |
| Vitest + @react-three/test-renderer | — | R3F 官方测试方案 |

### 设计约束

1. **每个方案决策必须援引 R3F 社区成熟方案并说明来源**——方便后续评估、维护与持续学习
2. **方案修正或项目结构变更时，必须同步更新 README.md**——保持项目文档与实际架构一致

## 二、滚动驱动

GSAP ScrollTrigger 保留为滚动驱动器，R3F 仅负责场景渲染。

**模式：**

```
GSAP ScrollTrigger（命令式 scroll → sp）
  ├── scrollProgress → Zustand store
  │     └── R3F useFrame getState() 消费（60fps，不触发 React re-render）
  ├── GSAP tweens（点击快进、品牌文字淡出）
  └── DOM 事件（滚轮动量、聚焦阻止）
```

**援引：** Codrops 2025 "Cinematic 3D Scroll Experiences with GSAP"，Builder.io "Apple-style 3D Scroll Animations"，Ringston 3D Experience。这些项目均采用 GSAP 作为滚动引擎、R3F 作为渲染层的组合。

**保留逻辑：** FRICTION=0.955、MAX_VELOCITY=0.025、点击快进 2s tween、聚焦时阻止滚轮——数学参数不变，从 Vue 响应式迁移至 Zustand + GSAP。

## 三、状态管理

Zustand 管理渲染状态，React useState/context 管理 UI 状态。

**分层：**

| 层级 | 存放 | 读写方式 | 频率 |
|------|------|----------|------|
| 渲染状态 | Zustand store | `getState()` in useFrame | 60fps |
| UI 状态 | React useState | hook 订阅 | 按需 |

**渲染状态字段：** `scrollProgress`、`focusedPlanetIdx`、`hoveredIdx`、`overlayData`（屏幕空间坐标）
**UI 状态字段：** `hintVisible`、`lighthouseImage`、品牌文字动画状态

**Slice 拆分：** `scrollSlice`、`focusSlice`、`hoverSlice` 各自独立，在 `create` 中合并。

**援引：** R3F 官方文档 "五类出口"，Galaxy Voyager（220+ 星系 Zustand 瞬态读取），HekTek City v4。

## 四、Act 可见性控制

所有 Act 组件始终挂载，通过 `visible` prop 控制。

```tsx
<Act1OceanVoyage visible={needsAct1(sp)} sp={sp} />
<Act2GridTransition visible={needsAct2(sp)} sp={sp} />
<Act3ContentPhase visible={sp >= 0.85} sp={sp} />
```

- 不可见时 `useFrame` early return
- Act 1→2 交叉区（0.40–0.45）两组件同时可见
- 首次访问某 Act 时内部懒初始化

**援引：** R3F 官方文档 Performance Pitfalls："Don't mount/unmount dynamically — use visibility instead"。R3F GitHub Issue #3549（useEffect/useFrame 执行顺序问题）。

## 五、粒子系统

3 颗主行星 = 独立 R3F `<mesh>` 组件，132 个碎片 = `InstancedMesh`。

**拆分理由：** 主行星需要 onClick、标签、高面数几何体、独立遮光逻辑——与碎片交互模型完全不同。Draw calls：4。

**援引：** Drei `Sparkles`（<200 实例用独立 Mesh），Galaxy Voyager（星场粒子 InstancedMesh + per-instance color via shader）。

## 六、测试策略

L1 纯函数全覆盖 + L2 关键路径场景图验证。不做视觉回归。

| 层级 | 范围 | 工具 |
|------|------|------|
| L1 | `behaviors/*` — 位置/颜色/透明度/遮挡计算 | vitest |
| L2 | `acts/*` — Act 切换、点击聚焦 | @react-three/test-renderer |

**援引：** R3F 官方 Testing 文档，@react-three/test-renderer `advanceFrames()`。

## 七、目标目录结构

```
src/
├── main.tsx                        React 入口 + GSAP 注册
├── App.tsx                         滚动物理 + DOM 叠加层
├── App.css                         品牌文字 + 聚焦 SVG + 滚动提示
├── r3f/
│   ├── Canvas.tsx                  R3F Canvas 配置
│   └── ScrollRig.ts                sp 阈值集中定义
├── stores/
│   └── scrollStore.ts             Zustand（scroll/focus/hover slice）
├── acts/
│   ├── Act1OceanVoyage.tsx
│   ├── Act2GridTransition.tsx
│   └── Act3ContentPhase.tsx
├── actors/
│   ├── Lighthouse.tsx
│   ├── LightBeam.tsx
│   ├── OceanWaves.tsx
│   ├── DustField.tsx              3 Planet + InstancedMesh(132)
│   ├── Planet.tsx
│   ├── CentralStar.tsx
│   ├── OrbitRings.tsx
│   ├── GridLines.tsx
│   └── PlanetLabel.tsx
├── behaviors/
│   ├── useScreenSpaceHover.ts
│   ├── useOrbitPosition.ts
│   ├── useAppearanceFade.ts
│   ├── useOcclusionFade.ts
│   ├── useCameraFocus.ts
│   ├── useFrameCache.ts
│   └── __tests__/
├── shaders/
│   └── VolumetricBeamShader.ts
├── utils/
│   ├── smoothstep.ts
│   ├── toward.ts
│   └── shortestDelta.ts
└── AppFooter.tsx
```

## 八、数据流

```
GSAP ScrollTrigger ──sp──→ Zustand scrollStore
                              │
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
   R3F useFrame           React UI              CSS 变量
   (getState, 60fps)      (useStore, ≤30fps)   (--text-offset-y)
        │                     │
   behaviors/*.ts         brandTextVisible
   (纯函数，可单测)        overlayData
        │
   actors/*.tsx ref
   (直接操作 Three.js)
```

## 九、迁移原则

1. **视觉保真优先**——所有数学常量（阈值、速度、颜色）逐字保留，仅改组织方式
2. **每个 Act 独立可运行**——Act 之间零共享模块级变量，通过 Zustand + props 通信
3. **纯函数与 Hook 分离**——`behaviors/` 中的纯函数零 Three.js 依赖，`actors/` 中的 Hook 负责调用 Three.js API
4. **TypeScript 从一开始**——不先写 JS 再迁移，直接 `.tsx`
