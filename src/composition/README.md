# composition/

`composition/` is the runtime contract layer for scroll-driven scene animation. It does not replace `actors/`, `acts/`, or `behaviors/`; it defines how they are scheduled, observed, connected, and cleaned up.

The goal is to make future animation work declarative first:

1. Declare when the animation exists.
2. Declare which actor owns the visual.
3. Declare which layer it belongs to.
4. Declare which data it consumes and produces.
5. Implement the visual with `actors/` and reusable math in `behaviors/`.

This lets the project grow toward a visual timeline editor without requiring the editor to reverse-engineer every React component.

## Responsibilities

| File | Responsibility |
| --- | --- |
| `timeline.ts` | Scroll progress ranges for reversible animation phases. |
| `coreSequences.ts` / `sequenceStore.ts` | Event-driven sequence phases for non-reversible flows. |
| `coreActors.ts` / `actorRegistry.ts` | Actor identity, domain, layer, dependencies, and outputs. |
| `coreAnchors.ts` / `anchorStore.ts` | Cross-actor and cross-layer data contracts. |
| `layerRegistry.ts` | WebGL, DOM, and SVG layer policies. |
| `effectScope.ts` | Lifecycle management for tweens, timers, rAF callbacks, listeners, and cleanup functions. |
| `actorRuntime.ts` | Runtime mount/frame/active status used by the debug panel. |
| `debug/CompositionPanel.tsx` | Runtime inspection UI. |
| `frameScheduler.ts` / `invariants.ts` | Hooks for stronger phase ordering and runtime checks. |

## How It Fits

```text
scrollStore / r3f frame
        |
        v
composition timeline / sequence / actor / anchor / layer contracts
        |
        v
actors / acts / behaviors
        |
        v
WebGL / DOM / SVG visual result
```

`composition` decides when something is active, who owns it, where it renders, what data it needs, what data it publishes, and how side effects are cleaned up.

`actors` still draw the scene.

`acts` still group page phases.

`behaviors` still hold reusable math, layout, projection, and interaction logic.

## Reversible Versus Event-Driven Animation

Most scene animation in this project must be reversible because the page is controlled by scroll progress. For these effects, use `timeline.ts`.

```ts
const p = smoothProgress('windChimeDrop', scrollProgress)
mesh.position.y = startY + (endY - startY) * p
material.opacity = p
```

Rules for reversible animation:

- The same `scrollProgress` must recreate the same visual state.
- Do not depend on "played once" state.
- Keep math deterministic.
- Prefer pure helpers in `behaviors/` when the calculation is shared.

Use `coreSequences.ts` only for event-driven or completion-driven flows that are not purely reversible. Examples include terminal typing, label reveal order, delayed shrink, or completion signals.

```text
timeline = reversible scroll state
sequence = non-reversible event flow
```

## Adding A New Animation

### 1. Add a timeline range

For scroll-reversible animation, add a named range in `timeline.ts`.

```ts
newEffectIntro: defineRange('newEffectIntro', 0.32, 0.48, 'New effect reveal')
```

This makes the range visible to the debug panel and future timeline editor.

### 2. Add or reuse a layer

If the visual needs a new render policy, add it in `layerRegistry.ts`.

Use the registry instead of hardcoding `z-index`, `renderOrder`, depth policy, or pointer behavior inside the actor.

### 3. Declare the actor

Add the actor contract in `coreActors.ts`.

```ts
{
  id: 'newEffect',
  domain: 'webgl',
  layer: 'webgl.planetEffects',
  consumes: ['anchor.planet.primary.screen'],
  produces: ['anchor.newEffect.bounds'],
}
```

The actor declaration is what lets debug tooling and future editors understand the scene without scanning component internals.

### 4. Use anchors for shared data

If another actor needs this animation's position, bounds, screen projection, opacity, or interaction state, define an anchor in `coreAnchors.ts` and publish it through `anchorStore.ts`.

Do not import mutable state from another actor module.

### 5. Implement the visual

Put renderable scene code under `actors/`. Put reusable math or layout in `behaviors/`.

The actor can use R3F, Three.js, GSAP, CSS transitions, DOM, SVG, or canvas as needed, but its runtime identity and shared data should still be visible through `composition`.

### 6. Register runtime status

Use `useActorRuntime` or `touchActorFrame` so the debug panel can show whether the actor is mounted, active, and updating.

### 7. Scope side effects

Any long-lived tween, timer, rAF, event listener, or manual cleanup should be owned by an `EffectScope`.

This reduces stale callbacks after debug toggles, page refreshes, StrictMode remounts, or actor unmounts.

## Debug Expectations

When an animation is wired correctly, debug mode should answer:

- Which timeline range is active?
- Which actor owns the visual?
- Which layer is it on?
- Which anchors does it read or publish?
- Is it mounted and updating?
- Which sequence phase is active, if any?
- Which effect scope owns its side effects?

If debug mode cannot answer these questions, the animation is probably still too implicit.

## Practical Rules

- Add timeline ranges before adding scroll animation code.
- Add actor specs before wiring cross-actor behavior.
- Use anchors instead of importing another actor's mutable variables.
- Keep reversible scroll animation derived from `scrollProgress`.
- Use sequences for event flow, not for every scroll range.
- Use layers for render policy, not scattered CSS or material constants.
- Use effect scopes for side-effect cleanup.
- Keep `composition/` declarative; keep heavy visual implementation in `actors/` and math helpers in `behaviors/`.


## 与四幕场景和实验资产共存

主应用的滚动坐标以 `PAGE_FLOW` 为准；`TIMELINE` 继续描述原三幕的 `scrollProgress`，Act 4 使用独立的 `structureProgress`。App 的快进 tween 由 `EffectScope` 管理，普通点击目标固定为 Act 3。

三类行星由共享工厂构建，`Planets` 用既有 `-20` 优先级发布世界坐标、核心半径与粒子索引锚点。点击、镜头和轨道渐隐读取这些锚点；聚焦转场由 `useFocusTimeline` 的 GSAP 时间轴统一控制，runtime 记录相机状态，不再使用旧的 `updateCameraFocus` 或 `focusOverlay`。进入 Act 4 时重置标签入场序列，返回后重新触发。

Voyager 的网格命中数据暂由专用 `voyagerState` 管理，Act 4 恒星活动使用自己的事件通道；本次合并保留这些已有边界，运行面板尚不逐项列出它们。独立 Studio 与说明页继续使用视觉工厂和独立预览时钟。

`useEffectScope` 在 React 提交后的 effect 中注册本地实例并通知运行面板；渲染期间只构造实例。卸载和 owner 切换清理对应实例，StrictMode 重挂载会重新注册，避免渲染期触发订阅组件更新。非 React 调用方仍可使用 `getEffectScope`。
