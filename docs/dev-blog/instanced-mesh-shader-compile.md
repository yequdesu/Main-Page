# InstancedMesh2 着色器编译时序

> 日期：2026-06-11  
> 标签：debug, InstancedMesh2, shader, onBeforeCompile, useEffect, rendering

## 现象

迁移至 `@three.ez/instanced-mesh` (InstancedMesh2) 后，碎片粒子（132 实例）在首次渲染时完全不可见。行星轨道正常运行（相同 renderOrder），但碎片呈透明状。用户滚动后碎片才逐渐出现。

## 排查过程

1. **排除颜色** — 颜色值、`setColorAt` 调用与原版一致 → 非颜色问题
2. **排除透明度** — `setOpacityAt` 在 useFrame 中每帧调用，透明度值与原版一致 → 非数据问题
3. **检查着色器** — 定位 InstancedMesh2 源码 `InstancedMesh2.js:178-195`：

```js
this._onBeforeCompile = (shader, renderer) => {
    // ...
    if (this.colorsTexture && shader.fragmentShader.includes(...)) {
        shader.defines['USE_INSTANCING_COLOR_INDIRECT'] = '';
        shader.defines['USE_COLOR_ALPHA'] = '';
        // 颜色/透明度才能生效
    }
};
```

4. **定位时序** — `initColorsTexture()` (InstancedMesh2.js:317) 不调用 `materialsNeedsUpdate()`。

## 根因

```
1. useMemo:   new InstancedMesh2() → onBeforeCompile hook 设置
2. useEffect: setColorAt() × 132 → colorsTexture 创建（ textures  OK）
              → materialsNeedsUpdate 未调用（shader 未被告知 *NOT* OK）
3. 首次 render:   shader 编译 → colorsTexture 存在但 defines 未注入
              → 碎片无颜色/透明度控制 → 不可见
4. useFrame:  setOpacityAt() → _useOpacity 变更 → materialsNeedsUpdate()
              → shader 重编译 → defines 注入 → 碎片逐渐可见
```

`initColorsTexture` 创建纹理但不触发重编译。`setColorAt` 依赖此方法，不会触发 `materialsNeedsUpdate`。`setOpacityAt` 在 `_useOpacity` 变更时才调用 `materialsNeedsUpdate`，但此时已是 useFrame 阶段（首次用户交互后）。

## 修复

```ts
// src/actors/DustField.tsx — useEffect 末尾
useEffect(() => {
  // ... setColorAt loop ...
  ;(mesh as any).materialsNeedsUpdate?.()  // 强制 shader 重编译
}, [debrisGrayHexes])
```

## 教训

- InstancedMesh2 的 `onBeforeCompile` 只在 shader 编译时执行一次。任何在此之后创建的纹理/缓冲区需要通过 `materialsNeedsUpdate()` 触发重编译
- `frameloop: 'demand'` 模式下，`useEffect` 中的初始化必须在首次渲染前完成并触发必要的管线更新
- 第三方库的 API 调用链可能有隐含的时序依赖（`setColorAt` → `initColorsTexture` → 不触发重编译）
