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
npm install
```

---

## 二、启动开发服务器

```bash
npm run dev
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

### 3.1 浏览器调试（推荐）

在项目根目录创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome — localhost:5173",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/src",
      "sourceMapPathOverrides": {
        "webpack:///./src/*": "${webRoot}/*"
      }
    }
  ]
}
```

**使用步骤：**

1. 先在终端运行 `npm run dev`（开发服务器在后台运行）
2. 按 `F5` 或点击 VS Code 左侧 "Run and Debug" → 选择 "Launch Chrome"
3. 浏览器自动打开 `http://localhost:5173`，断点命中的位置可在 VS Code 中查看

### 3.2 断点调试要点

| 调试目标 | 文件 | 打断点位置 |
|----------|------|-----------|
| 滚动进度值 | `src/App.tsx` | `setScrollProgress(self.progress)` 行 |
| 粒子位置计算 | `src/actors/DustField.tsx` | useFrame 中 `mesh.position.set(px, py, pz)` 行 |
| 相机聚焦逻辑 | `src/behaviors/useCameraFocus.ts` | `updateCameraFocus` 函数入口 |
| Act 可见性 | `src/App.tsx` | `needsAct1(sp)` / `needsAct2(sp)` / `needsAct3(sp)` |
| 波浪动画 | `src/actors/OceanWaves.tsx` | useFrame 中 `pArr[idx + 1] = ...` 行 |
| Zustand store 状态 | `src/stores/scrollStore.ts` | 各 `set` 函数 |

### 3.3 浏览器 DevTools 辅助

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

所有滚动阈值集中定义在 `src/types/index.ts` 的 `SCROLL_RIG` 对象中：

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
npm test

# 运行指定测试文件
npx vitest run src/utils/__tests__/smoothstep.test.ts

# 监听模式（修改代码后自动重跑）
npx vitest --watch

# UI 模式（浏览器查看测试结果）
npm run test:ui
```

### 4.6 验证 TypeScript 编译

```bash
# 仅检查类型（不产生输出）
npx tsc --noEmit

# 构建（含类型检查）
npm run build
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
#    - useFrame 中 early return if !visible
#    - 组装 actor 组件

# 2. 在 src/types/index.ts 的 SCROLL_RIG 中添加新阈值（如需要）

# 3. 在 src/App.tsx 中注册：
#    import Act4NewSection from './acts/Act4NewSection'
#    添加 {needsAct4(sp) && <Act4NewSection visible={needsAct4(sp)} />}

# 4. 更新 src/README.md 中的 Act 描述表

# 5. 运行 npm run build 验证构建
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
npm outdated

# 更新小版本/补丁（安全）
npm update

# 更新大版本（需谨慎，可能破坏 API）
npm install three@latest @react-three/fiber@latest
# → 运行 npm run build 和 npm test 确认无问题
```

---

## 六、常见问题排查

### 6.1 页面空白 / 无 3D 内容

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| TypeScript 编译错误 | 终端中 Vite 输出 | 修复错误后保存 |
| React 渲染错误 | Chrome DevTools Console | 查看红色报错信息 |
| Canvas 未挂载 | DevTools Elements 标签 | 确认 `<canvas>` 元素存在 |
| scrollProgress 始终为 0 | 在 App.tsx 的 `useFrame` 中加 `console.log(sp)` | 检查 GSAP 是否正确注册 |

### 6.2 动画不流畅 / 卡顿

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| useFrame 中创建了新对象 | 搜索 useFrame 中的 `new` 关键字 | 改用预分配对象 |
| 过多的 `setState` 调用 | React DevTools Profiler | 确保 UI 状态不在 useFrame 中更新 |
| pixelRatio 过高 | 在 Canvas.tsx 中添加 `dpr={[1, 2]}` | 限制最大像素比 |

### 6.3 Act 切换时闪烁

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| 条件渲染导致 remount | 确认 Act 使用 `visible` prop 而非条件渲染 | 检查 App.tsx 中 Act 的挂载方式 |
| 几何体重新创建 | useMemo 依赖项变化 | 确认依赖数组正确 |

### 6.4 HMR 不生效

| 可能原因 | 检查方法 | 解决 |
|----------|----------|------|
| 循环依赖 | 终端中 Vite 警告 | 检查 import 路径 |
| 修改的是非组件文件 | — | 手动 F5 刷新 |

### 6.5 测试失败

```bash
# 查看详细输出
npx vitest run --reporter=verbose

# 查看具体某个测试
npx vitest run src/utils/__tests__/smoothstep.test.ts

# 如果测试涉及 Three.js 对象，确认 @react-three/test-renderer 已安装
npm ls @react-three/test-renderer
```
