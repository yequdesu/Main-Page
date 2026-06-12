# 调试与维护手册

## 目录

1. [环境准备](#一环境准备)
2. [启动开发服务器](#二启动开发服务器)
3. [VS Code 调试配置](#三vs-code-调试配置)
4. [日常开发流程](#四日常开发流程)
5. [维护流程](#五维护流程)
6. [常见问题排查](#六常见问题排查)

---

## 一、环境准备

```bash
# 1. 确认 Node.js 版本（>=18）
node --version

# 2. 安装依赖
pnpm install
```

---

## 二、启动开发服务器

```bash
pnpm dev
```

输出：

```
VITE v6.4.2  ready in 158 ms
➜  Local:   http://localhost:5173/
➜  Network: http://172.20.10.2:5173/
```

浏览器打开 `http://localhost:5173` 即可查看。

### 开发服务器特性

| 特性 | 说明 |
|------|------|
| HMR（热模块替换） | 修改 `.tsx`/`.ts`/`.css` 后浏览器自动刷新，无需手动 F5 |
| 局域网访问 | 同一 Wi-Fi 下的手机/平板可通过 Network URL 访问 |
| API 代理 | `/api/*` 自动转发至 `http://127.0.0.1:9999` |

### 验证场景

打开页面后，按以下步骤确认功能正常：

1. **Act 1（0–45%）** — 应看到深色背景、灯塔、旋转光束、波浪线
2. **Act 2（45–85%）** — 背景逐渐变白、波浪展平为网格、垂直网格线升起
3. **Act 3（85–100%）** — 轨道环出现、中央恒星、三颗行星公转
4. **点击快进** — 点击页面任意位置，2 秒内滚动至末尾
5. **行星聚焦** — Act 3 中点击行星，相机靠近、SVG 切线出现；再次点击打开链接

---

## 三、VS Code 调试配置

### 3.1 浏览器调试（已预置，`F5` 即可启动）

`.vscode/launch.json` 已预置三种浏览器配置：

| 配置名称 | 调试器 | 适用场景 |
|----------|--------|----------|
| `Debug — Chrome` | Chrome DevTools Protocol | 默认推荐 |
| `Debug — Edge` | Edge DevTools Protocol | Windows 环境 / Edge 用户 |
| `Debug — Safari` | WebKit remote debug | macOS 原生调试 |

**使用步骤：**

1. 先在终端运行 `pnpm dev`（开发服务器在后台运行）
2. 按 `F5` 或点击 VS Code 左侧 "Run and Debug" → 选择对应浏览器
3. 浏览器自动打开 `http://localhost:5173`，断点命中的位置可在 VS Code 中查看

### 3.2 Safari 调试特殊说明

Safari 需要在 **系统偏好设置** 中提前开启远程调试：

1. Safari → 设置 → 高级 → 勾选「在菜单栏中显示"开发"菜单」
2. 在 Safari 中打开 `http://localhost:5173`
3. VS Code 中按 `F5` 选择 `Debug — Safari`，或手动在 Safari 菜单：开发 → 本地主机 → 选择页面

若 VS Code 的 Safari 适配器不可用，可直接使用 Safari 自带 Web 检查器：
- Safari 菜单 → 开发 → 显示 Web 检查器（`⌥⌘I`）
- 在「来源」标签中可设置断点，路径与 Chrome DevTools 相同

### 3.3 断点调试要点

| 调试目标 | 文件 | 打断点位置 |
|----------|------|-----------|
| 滚动进度值 | `src/App.tsx` | `setScrollProgress(self.progress)` 行 |
| 雾/背景更新 | `src/r3f/ScrollInvalidator.tsx` | `sceneApplyWhiteOut(scene, sp)` 行 |
| 粒子位置计算 | `src/actors/DustField.tsx` | useFrame 中 `mesh.position.set(px, py, pz)` 行 |
| 碎片透明度 | `src/actors/DustField.tsx` | `setOpacityAt(debrisIdx, ...)` 行 |
| 相机聚焦逻辑 | `src/behaviors/useCameraFocus.ts` | `updateCameraFocus` 函数入口 |
| Act 可见性 | `src/App.tsx` | `needsAct1(sp)` / `needsAct2(sp)` / `needsAct3(sp)` |
| 波浪动画 | `src/actors/OceanWaves.tsx` | useFrame 中 `pArr[idx + 1] = ...` 行 |
| 光束动画 | `src/actors/LightBeam.tsx` | useFrame 中 `pivot.rotation.y = targetY` 行 |
| 恒星脉冲 | `src/actors/CentralStar.tsx` | useFrame 中 `pulse` 计算行 |
| Zustand store | `src/stores/scrollStore.ts` | 各 `set` 函数 |
| 行星点击 | `src/r3f/PlanetClickHandler.tsx` | `onClickCanvas` 函数内 NDC 计算 |

### 3.4 浏览器 DevTools 辅助

打开 Chrome DevTools（`F12`）→ **Console** 标签，可以直接检查 Three.js 场景：

```js
// 获取 R3F 内部状态（需要 React DevTools 或通过 Canvas store）
// 查看当前 scrollProgress
// 查看场景中所有对象
```

**React DevTools 扩展（推荐安装）：**
- Chrome Web Store 搜索 "React Developer Tools"
- 安装后可以在 Components 标签中查看 R3F 组件树、props、state
- Zustand store 在组件 props 中可见

---

## 四、日常开发流程

### 4.1 修改 3D 对象

以修改灯塔颜色为例：

```bash
# 1. 打开文件
#    src/actors/Lighthouse.tsx
#
# 2. 找到要修改的材质（例如塔身）：
#    <meshStandardMaterial color="#4d535c" roughness={0.5} metalness={0.1} />
#
# 3. 修改 color 值 → 保存 → 浏览器自动刷新（HMR）

# 4. 如果浏览器未自动刷新：
#    - 检查终端中 Vite 是否有编译错误
#    - 手动刷新浏览器 F5
```

### 4.2 修改动画行为

以修改波浪振幅为例：

```bash
# 1. 打开 src/actors/OceanWaves.tsx
# 2. 找到 buildOcean 中的 amplitude 参数（第 ~20 行）：
#    const amplitude = 0.005 + curveT * 0.45
# 3. 修改数值 → 保存 → 浏览器自动刷新
```

### 4.3 修改滚动行为

以修改摩擦力为例：

```bash
# 1. 打开 src/App.tsx
# 2. 找到 FRICTION 常量（第 ~12 行）：
#    const FRICTION = 0.955
# 3. 增大 = 更滑（惯性更长），减小 = 更涩（更快停止）
```

### 4.4 修改阈值

所有滚动阈值集中定义在 `src/types/index.ts` 的 `SCROLL_RIG` 对象中，由 `src/r3f/ScrollRig.ts` 统一导出：

```typescript
export const SCROLL_RIG = {
  WHITE_OUT_THRESHOLD: 0.40,  // 白化开始
  GRID_START: 0.45,           // 网格展平开始
  GRID_SHIFT_START: 0.85,     // Act 3 出现
  // ...
}
```

修改阈值后，所有引用处自动生效。

### 4.5 运行测试

```bash
# 运行全部测试
pnpm test

# 运行指定测试文件
pnpm vitest run src/utils/__tests__/smoothstep.test.ts

# 监听模式（修改代码后自动重跑）
pnpm vitest --watch

# UI 模式（浏览器查看测试结果）
pnpm test:ui
```

### 4.6 验证 TypeScript 编译

```bash
# 仅检查类型（不产生输出）
pnpm tsc --noEmit

# 构建（含类型检查）
pnpm build
```

### 4.7 提交规范

```bash
# 修改完成后，检查变更
git diff

# 添加并提交（使用语义化提交信息）
git add -A
git commit -m "feat: 描述你的修改"

# 提交信息前缀：
#   feat:     新功能
#   fix:      修复 bug
#   refactor: 重构（不改变行为）
#   chore:    构建/依赖/配置变更
#   docs:     文档变更
```

---

## 五、维护流程

### 5.1 新增 Act

```bash
# 1. 创建新 Act 组件
#    src/acts/Act4NewSection.tsx
#    参考 src/acts/Act1OceanVoyage.tsx 的模式：
#    - interface Act4Props { visible: boolean }
#    - 返回 <group visible={visible}>，始终挂载，不 return null
#    - 组装 actor 组件

# 2. 在 src/types/index.ts 的 SCROLL_RIG 中添加新阈值（如需要）

# 3. 在 src/App.tsx 中注册：
#    import Act4NewSection from './acts/Act4NewSection'
#    <Act4NewSection visible={needsAct4(sp)} />

# 4. 更新 README.md 中的 Act 描述表

# 5. 运行 pnpm build 验证构建
```


### 5.2 新增 3D 对象（Actor）

```bash
# 1. 创建 src/actors/NewObject.tsx
#    参考 src/actors/Lighthouse.tsx 的模式：
#    - export default function NewObject() { return <group>...</group> }

# 2. 在对应 Act 中导入并使用：
#    import NewObject from '../actors/NewObject'
#    <NewObject />

# 3. 如需动画，使用 useFrame：
#    useFrame((state, delta) => { /* 逐帧更新 */ })

# 4. 如需读取滚动进度：
#    const sp = useScrollStore.getState().scrollProgress
```

### 5.3 新增行为 Hook

```bash
# 1. 创建 src/behaviors/useNewBehavior.ts
#    纯计算函数放在文件顶层（可测试）
#    调用 Three.js API 的部分放在 hook 返回的函数中

# 2. 在对应 Actor 的 useFrame 中调用

# 3. 如果行为包含纯计算逻辑，在 src/behaviors/__tests__/ 中添加测试
```

### 5.4 同步更新文档

每次方案修正或项目结构变更后：

```bash
# 1. 更新 README.md 中的架构设计章节
# 2. 如果设计决策有变化，更新 docs/superpowers/specs/ 中的设计文档
# 3. 如果在维护中发现新问题/模式，更新 docs/ARCHITECTURE.md
```

### 5.5 依赖更新

```bash
# 检查过期的依赖
pnpm outdated

# 更新小版本/补丁（安全）
pnpm update

# 更新大版本（需谨慎，可能破坏 API）
pnpm add three@latest @react-three/fiber@latest
# → 运行 pnpm build 和 pnpm test 确认无问题
```

---

## 六、常见问题排查

### 6.1 页面空白 / 无 3D 内容

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| TypeScript 编译错误 | 终端中 Vite 输出 | 修复错误后保存 |
| R3F 运行时错误 | Chrome DevTools Console | 常见：未 `extend()` 注册的 class（`ThreeLine`、`InstancedMesh2`） |
| Canvas 未挂载 | DevTools Elements 标签 | 确认 `<canvas>` 元素存在 |
| scrollProgress 始终为 0 | Zustand DevTools 或在 App.tsx 中 log | 检查 GSAP ScrollTrigger 是否正确注册 |
| 元素不可见但存在 | 检查 `renderOrder` + `depthWrite`/`depthTest` 组合 | 见渲染约束章节 |
| 行星/碎片消失 | 检查场景图层级（是否在 `visible={false}` 的 group 内） | `DustField` 必须在 Canvas 根层级 |

### 6.2 动画不流畅 / 卡顿

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| useFrame 中创建了新对象 | 搜索 useFrame 中的 `new` 关键字 | 改用预分配对象 |
| 过多的 `setState` 调用 | React DevTools Profiler | 确保 UI 状态不在 useFrame 中更新 |
| pixelRatio 过高 | 在 Canvas.tsx 中添加 `dpr={[1, 2]}` | 限制最大像素比 |

### 6.3 Act 切换时闪烁

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| 条件渲染导致 remount | 确认 Act 使用 `<group visible>` 非 `return null` | Act 组件始终挂载 |
| 几何体重新创建 | useMemo 依赖项变化 | 确认依赖数组为 `[]` |
| 透明对象排序异常 | 检查 `depthWrite` + `renderOrder` | 透明对象 `depthWrite=false` |

### 6.4 HMR 不生效

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| 循环依赖 | 终端中 Vite 警告 | 检查 import 路径 |
| 修改的是非组件文件 | — | 手动 F5 刷新 |

### 6.5 测试失败

```bash
# 查看详细输出
pnpm vitest run --reporter=verbose

# 查看具体某个测试
pnpm vitest run src/utils/__tests__/smoothstep.test.ts

# 如果测试涉及 Three.js 对象，确认 @react-three/test-renderer 已安装
pnpm ls @react-three/test-renderer
```

---

## 七、渲染管线

### 7.1 渲染触发机制

项目使用 `frameloop="demand"` 模式，R3F **不会**自动以 60fps 循环渲染。每一帧的渲染由以下事件触发：

```
┌─ 用户交互 ─────────────────────────────────────┐
│ 鼠标滚轮 → App.tsx onWheel → physRef.velocity  │
│ 鼠标拖拽滚动条 → ScrollTrigger onUpdate        │
│ 点击快进 → GSAP tween (2s)                     │
└─┬──────────────────────────────────────────────┘
  │
  ▼
setScrollProgress(sp)  ← 更新 Zustand scrollStore
  │
  ▼
ScrollInvalidator.subscribe  ← 监听 scrollProgress 变化
  │
  ▼
invalidate()  ← 触发 R3F 渲染一帧
  │
  ▼
┌─ R3F 渲染帧 ────────────────────────────────────┐
│ 1. 执行所有 useFrame 回调（按 scene graph 顺序） │
│    ├── ScrollInvalidator: sceneApplyWhiteOut    │
│    ├── DustField: 粒子位置/颜色/透明度          │
│    ├── OceanWaves: 波浪顶点动画                  │
│    ├── LightBeam: 光束旋转 + 强度               │
│    ├── GridLines: 网格线延伸                    │
│    ├── OrbitRings: 轨道旋转 + 透明度             │
│    ├── CentralStar: 光晕脉冲                     │
│    ├── PlanetLabel: 标签跟随 + 透明度            │
│    └── Act3ContentPhase: updateCameraFocus       │
│ 2. Three.js WebGLRenderer 渲染场景               │
└────────────────────────────────────────────────┘
```

### 7.2 渲染层级

Three.js 按 `renderOrder` 值从小到大分组渲染。同组内：不透明对象从前到后（减少 overdraw），透明对象从后到前（正确混合）。

**关键规则：`renderOrder` 不继承。** 父 `<group renderOrder={N}>` 不会传递给子对象的 Mesh/Line/Sprite。必须显式设置每个几何体对象。

| Layer | renderOrder | 包含对象 | depthWrite |
|:---:|:---:|------|:---:|
| 0 | 0 | 海浪线（50 Line）、灯塔（30 Mesh）、光束锥体（3）、射线（2）、辉光（1） | false |
| 1 | 1 | 恒星光晕球、Halo 精灵、主行星（3 Mesh） | 行星=true, 其余=false |
| 2 | 2 | 恒星核心球、轨道环（3 Line）、陀螺仪环（3 LineLoop）、网格线（28 Line）、网格节点（210 Points）、碎片（InstancedMesh2 ×132） | 核心=true, 其余=false |
| 9999 | 9999 | 行星标签（3 Sprite） | false（depthTest=false） |

### 7.3 depthWrite / depthTest 规则

| 属性 | true | false |
|------|------|-------|
| `depthWrite` | 写入深度缓冲，遮挡后续对象 | 不影响深度缓冲 |
| `depthTest` | 被前方对象遮挡 | 忽略深度，始终可见 |

### 7.4 Canvas 配置

```tsx
// src/r3f/Canvas.tsx — 三个必须保留的 prop
<R3FCanvas flat frameloop="demand" ...>
```

- **`flat`** — 禁用 ACES 色调映射，颜色与原版一致
- **`frameloop="demand"`** — 仅在 `invalidate()` 时渲染一帧

### 7.5 scene graph 层级

跨 Act 存在的对象（`DustField`）必须挂载在 Canvas 根层级，不能放在 Act 的 `<group visible={...}>` 内。Act `visible` 会隐藏所有子对象。

### 7.6 颜色校准

所有颜色值（`#fff8e7`、`#f0f8ff` 等）来自原版 Three.js（`NoToneMapping`）。调整颜色时务必确认 `flat` prop 存在，并在实际渲染中验证。

---

## 八、渲染特效

### 8.1 体积聚光照明（Volumetric Spotlight Illumination）

**术语：** Volumetric Spotlight Illumination / Light Cone Projection / Cone-Surface Intersection

**效果：** 灯塔光束锥扫过海洋波面时，波面线条的透明度从 10% 平滑提升至 50%，模拟光锥对表面的照亮。

**涉及文件：**

| 文件 | 角色 |
|------|------|
| `src/actors/LightBeam.tsx` | 每帧发布光束世界空间变换（`_beamWorldOrigin`、`_beamWorldDirection`） |
| `src/actors/OceanWaves.tsx` | 每帧读取光束变换，逐顶点计算锥体交运算，聚合为整线最大 beamFactor |

**数据流：**

```
LightBeam.useFrame
  ├─ pivot.getWorldPosition()  →  _beamWorldOrigin   (模块级共享变量)
  ├─ pivot.getWorldQuaternion() →  提取 +Z 方向       (local +Z = 光束指向)
  └─ _beamWorldDirection        (模块级共享变量)

OceanWaves.useFrame
  ├─ 读取 _beamWorldOrigin / _beamWorldDirection
  ├─ 每条线 × 每个顶点：
  │   ├─ V = vertexPos - beamOrigin
  │   ├─ t = V · beamDirection           (沿光束投影距离)
  │   ├─ d = |V - t·beamDirection|       (距光束轴垂直距离)
  │   ├─ beamRadius = t × 0.14           (硬锥半角 ≈ 8°)
  │   ├─ softEdge = beamRadius × 1.6     (柔光过渡带)
  │   └─ beamFactor: 1.0 (核心) → 0.0 (边缘外)
  ├─ lineMaxBf = max(所有顶点 beamFactor)
  └─ line.opacity = lerp(0.10, 0.50, lineMaxBf)
```

**参数调节：**

| 参数 | 位置 | 默认值 | 效果 |
|------|------|:---:|------|
| 锥角 | `OceanWaves.tsx` — `tBeam * 0.14` | 0.14 (~8°) | 光束硬锥半径。增大 = 更宽的光锥核心 |
| 柔光倍率 | `OceanWaves.tsx` — `beamRadius * 1.6` | 1.6 | 柔光边缘宽度。增大 = 过渡更柔和 |
| 最大射程 | `OceanWaves.tsx` — `tBeam < 42` | 42 | 光束有效距离。超出此距离不计算 |
| 基础透明度 | `OceanWaves.tsx` — `opacity = 0.10` | 0.10 | 未被光束扫过时的线条透明度 |
| 照亮透明度 | `OceanWaves.tsx` — `0.10 + lineMaxBf * 0.40` | 0.50 | 光束扫过时的峰值透明度 |
| 光束颜色 Boost | `OceanWaves.tsx` — 已移除 | — | 先前版本有颜色亮化逻辑，因 LineBasicMaterial 逐顶点颜色不可见而改为透明度调制 |

**调试断点：**

| 目标 | 文件 | 位置 |
|------|------|------|
| 光束世界变换是否正确 | `LightBeam.tsx` | useFrame 末尾 `pivot.getWorldPosition` 后 |
| 波面顶点是否进入光束锥 | `OceanWaves.tsx` | 内层循环 `if (tBeam > 0 && tBeam < 42)` 内 |
| 整线 beamFactor 是否正确聚合 | `OceanWaves.tsx` | 内层循环结束后 `lineMaxBf` |

**已知限制：**

- `LineBasicMaterial.opacity` 作用于整条线，无法逐顶点透明度变化。因此使用 `max(beamFactor)` 聚合——光束扫过线的任何部分都会使整条线变亮。
- 共享变量通过模块级导出，非 React 状态。这避免了跨组件重渲染，但调试时需注意读取时序（LightBeam 的 useFrame 必须在 OceanWaves 之前执行，R3F 按 scene graph 顺序保证）。

---

## 九、参考文档索引

| 主题 | 文件 | 摘要 |
|------|------|------|
| 轨道系统 | `docs/orbital-system.md` | 力学模型、变换链、配置参考、新增轨道 |
| 恒星/行星颜色异常 | `docs/dev-blog/tone-mapping-debug.md` | R3F 默认 ACES 色调映射导致色偏 |
| 碎片首次渲染不可见 | `docs/dev-blog/instanced-mesh-shader-compile.md` | InstancedMesh2 `setColorAt` 后需 `materialsNeedsUpdate()` |
| 碎片完全不可见（NaN 矩阵） | `docs/dev-blog/matrix-compose-quaternion-nan.md` | `_quaternion` 为普通对象非 THREE.Quaternion → Matrix4.compose 产生 NaN |
| 行星在 Act 2/3 中消失 | `docs/dev-blog/scene-graph-visibility.md` | DustField 嵌套在 Act1 group 内 |

---

## 九、浏览器兼容性

### 9.1 支持范围

| 浏览器 | 最低版本 | 调试工具 | VS Code 启动配置 |
|--------|----------|----------|-----------------|
| **Chrome** | 90+ | DevTools（F12） | `Debug — Chrome` |
| **Edge** | 90+ | DevTools（F12） | `Debug — Edge` |
| **Safari** | 15+ | Web 检查器（⌥⌘I） | `Debug — Safari` |

### 9.2 WebGL 兼容性

项目使用 Three.js `^0.170.0`，WebGL 2.0 在主流浏览器中已原生支持：

| 浏览器 | WebGL 2.0 | 说明 |
|--------|:---:|------|
| Chrome 90+ | ✅ | 完全支持 |
| Edge 90+ | ✅ | 与 Chrome 相同内核 |
| Safari 15+ | ✅ | macOS Monterey 起默认启用 |

若 Safari 中页面空白：Safari → 设置 → 功能 → 确保未关闭 WebGL。

### 9.3 多浏览器测试流程

```bash
# 1. 启动开发服务器
pnpm dev

# 2. 在 Chrome、Edge、Safari 中分别打开 http://localhost:5173

# 3. 验证三幕动画、点击快进、行星聚焦

# 4. Chrome/Edge: DevTools → Performance 录制
#    Safari: 开发 → 显示 JavaScript 时间线
```

### 9.4 已知差异

| 差异 | Chrome / Edge | Safari |
|------|:---:|:---:|
| devicePixelRatio | 无限制 | Retina 屏幕上限为 2 |
| Canvas 2D 最大尺寸 | 与显存相关 | ~4096×4096 |
| 字体渲染 | 标准 | Georgia 可能稍细 |
