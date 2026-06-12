# 场景图嵌套导致行星不可见

> 日期：2026-06-11  
> 标签：debug, scene-graph, visible, act, nesting, rendering

## 现象

迁移至 R3F 后，行星（dust/planet）在滚动后完全不可见。轨道环正常运行（同 renderOrder），材质参数、颜色、透明度逻辑与原版逐字一致，但行星不渲染。

## 排查过程

1. **排除颜色** — 与原版参数一致 → 非颜色
2. **排除色调映射** — 已修复 ACES → 非此原因
3. **排除 shader 编译** — InstancedMesh2 时序已修复 → 非此原因
4. **排除位置/数量** — 生成逻辑完全相同 → 非数据
5. **定位场景图** — 对比原版 `scene.add()` 与 R3F 组件树

## 根因

原版将 135 个粒子直接加在 `scene` 根层级：

```js
// 原版 — flat scene graph
scene.add(p)  // 每个粒子直接挂在 scene 下
```

R3F 将 `DustField` 嵌套在 Act1 的 group 内：

```tsx
// R3F — nested component tree
<Act1OceanVoyage visible={sp < 0.46}>
  <DustField />  {/* sp > 0.46 时随 Act1 隐藏！ */}
</Act1OceanVoyage>
```

`needsAct1(sp) = sp < GRID_START + 0.01 = sp < 0.46`。`sp > 0.46` 时 Act1 `visible=false`，`DustField`（包括 3 颗主行星 + 132 碎片）全部不可见。

| sp | Act1 visible | 行星 |
|:---:|:---:|:---:|
| < 0.46 | true | 可见（但 opacity ~5-15%，很淡） |
| \> 0.46 | **false** | **完全消失** |
| \> 0.85 | false | **不可见**（本应最亮） |

行星 opacity 随 sp 增长（Act 1: ~5% → Act 2: 40% → Act 3: 55-100%），但在 sp > 0.46 时被父容器隐藏——正好是它们应该开始显著可见的区间。

## 修复

将 `DustField` 从 `Act1OceanVoyage` 提升至 `Canvas` 根层级，匹配原版 flat scene graph：

```tsx
// src/r3f/Canvas.tsx
<SceneLights />
<DustField />        // ← 从 Act1 移至此
{children}
```

## 教训

- 迁移嵌套组件树到 flat Three.js scene graph 时，必须检查每个对象的父层级是否受可见性控制
- 原版中跨 Act 存在的对象（如粒子）不应放入任何 Act 的可见性 group 内
- Three.js `Object3D.visible` 会级联影响所有子对象（包括光源、粒子、Mesh）

---

## 相关记录

| 记录 | 关联 |
|------|------|
| [`tone-mapping-debug.md`](./tone-mapping-debug.md) | 同一排查时期的色调映射问题 |
| [`instanced-mesh-shader-compile.md`](./instanced-mesh-shader-compile.md) | DustField 的另一排查——shader 编译时序 |
| [`../MAINTENANCE.md`](../MAINTENANCE.md) §7.5 | scene graph 层级规则 |
| [`../../../src/actors/README.md`](../../../src/actors/README.md) | DustField 必须在 Canvas 根层级 |
