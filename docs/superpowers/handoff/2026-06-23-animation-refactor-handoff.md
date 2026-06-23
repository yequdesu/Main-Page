# 动画架构重构 — 交接文档

**日期**: 2026-06-23
**源分支**: `feat/integrated-scene-refactor`
**讨论基础**: CyDlen `2026-06-22-timeline-system-handoff.md`

---

## 一、建模：三类驱动

```
sp 驱动（可逆）              信号驱动（不可逆）           time（本地，不动）
══════════════              ══════════════            ══════════════
输入: f(sp) 纯函数           输入: signal('name')      输入: state.clock
正反滚动对称                  状态机单向推进             仅帧循环消费
timeline.ts 集中             sequenceStore.ts          useFrame 内自行处理

海浪层叠/水幕/拉平           Typewriter 完成            光束 idle 扫描
光束淡出/强度                 PBD 物理稳定              波浪 sin 振荡
灯塔可见性                    标签序列 reveal            行星公转
迷雾/环境光                   终端三态机                 辉光脉冲
网格延伸/回收                 Day/Night 切换            物理惯性
风铃下落/回收                 行星点击                   相机跟随
行星/恒星出现/归位/辉光       跨组件门控
轨道环淡入
Act 可见性
```

数据流动：

```
useFrame(time) ──写入──→ animState ←──读取── registerSp(sp)
                              ↕
                      sequenceStore ←── 组件 signal()
```

---

## 二、文件结构

```
src/animation/
├── timeline.ts          ← sp 注册系统 (T阈值 + P进度 + registerSp + tickSp)
├── sequenceStore.ts     ← 信号状态机 (CyDlen 设计: defineSequence/usePhase/useSignal)
├── animState.ts         ← 唯一共享数据源（取代所有组件间 import）
└── registers/           ← 各组件 sp 注册（从 useFrame 提取的 sp 部分）
    ├── lightBeam.ts
    ├── oceanWaves.ts
    ├── lighthouse.ts
    ├── gridLines.ts
    ├── windChime.ts
    ├── fogAndAmbient.ts
    ├── centralStar.ts
    ├── planets.ts
    └── actVisibility.ts
```

---

## 三、各组件的拆分方式

| 组件 | time 部分（留 useFrame） | sp 部分（移 registerSp） |
|------|------------------------|------------------------|
| **Lighthouse** | 无 | 全部：`visible = sp < 0.55` |
| **ScrollRig** | 无 | 全部：fogDensity, scene.background |
| **ScrollInvalidator** | 无 | 全部：ambientLight intensity |
| **WindChimeLines** | 无 | 全部：线位置, opacity |
| **GridLines** | 无 | 全部：延伸/回收, 顶点位置, opacity |
| **OceanWaves** | sin 振荡计算, 波顶更新 | 层叠下落, 水幕可见性, 颜色/透明度 |
| **LightBeam** | idle roaming 旋转, 导出世界变换 | beamFade, cone opacity, ptLight intensity |
| **CentralStar** | glow pulse (sin 呼吸) | Y 下落, 可见性, Z 偏移 |
| **Planets** | 轨道计算, orbitAngle 更新, glow pulse | Y 下落, Z 偏移, 可见性, 辉光延迟 |
| **App.tsx** | GSAP 物理惯性, 滚轮处理 | Act 可见性 (needsAct1/2/3) |

> **原则**: time 部分不动（零重构），sp 部分移走（集中管理），互不干扰。

---

## 四、animState：唯一共享数据源

```ts
// 重构前：组件互相 import
OceanWaves.tsx:  import { _beamDir } from './LightBeam'
WindChime.tsx:   import { _planetPos } from './Planets'
ScrollInvalid:   import { _ambient } from './SceneLights'

// 重构后：全部通过 animState
OceanWaves 读:   animState.beam.direction
WindChime 读:    animState.planet.worldPositions
ScrollInvalid 读: animState.ambient.intensity
```

**收益**: 组件解耦，依赖显式化，调试时一处 `console.log(animState)` 看全貌。

---

## 五、实施计划

### 阶段 1: 基础设施

- [ ] 创建 `src/animation/timeline.ts`（T 阈值 + P 进度 + registerSp + tickSp）
- [ ] 创建 `src/animation/animState.ts`（共享数据对象）
- [ ] 修改 `ScrollInvalidator` 调用 `tickSp(sp)`
- [ ] 验证：原有效果全部不变

### 阶段 2: 逐组件迁移（每步可验证）

1. Lighthouse（纯 sp，最简单）→ 验证 0.55 灯塔消失
2. ScrollRig（雾 + 背景）→ 验证白化过渡
3. ScrollInvalidator（环境光）→ 验证光增强
4. GridLines（延伸/回收）→ 验证 60-85 延伸 + 85-95 回收
5. WindChimeLines（下落/回收）→ 验证风铃线
6. OceanWaves（层叠/水幕/光束）→ 验证海浪
7. LightBeam（淡出/强度）→ 验证光锥
8. CentralStar（下落/可见性）→ 验证恒星
9. Planets（下落/可见性/辉光延迟）→ 验证行星
10. App.tsx（Act 可见性）→ 验证 Act 切换

> **每步验证方法**: `http://yequdesu.top:8877`（重构版）vs `http://yequdesu.top:8899`（Vue 原版）对比。

### 阶段 3: 清理

- [ ] 删除 `useWindChime.ts` → 归入 timeline
- [ ] 删除组件间直接 import → 全部通过 animState
- [ ] 迁移 CyDlen 的 `sequenceStore` 规划到此目录结构

---

## 六、与 CyDlen SequenceStore 的关系

CyDlen 的 `sequenceStore`（信号状态机）处理的是**事件驱动**场景（Typewriter 完成、PBD 稳定、标签序列）。本重构的 `timeline`（sp 注册系统）处理的是**滚动驱动**场景。

两者在同一个 `src/animation/` 目录下，共享 `animState`，各管各的驱动方式。sequenceStore 由 CyDlen 来实施。

---

## 七、性能说明

- `tickSp(sp)` 仅在 sp 变化时执行（`frameloop="demand"` 不变）
- `P` 进度值每帧计算一次，原来各组件重复计算 `clamped(sp, a, b)` 的 CPU 周期回收
- 函数调用开销：10 注册 × 60fps = 600 次/秒，可忽略
- **实测不会有可感知的帧率变化**

---

## 八、设计原则总结

1. **time 不动**——useFrame 中的 time 依赖逻辑保持原样
2. **sp 集中**——所有 `f(sp)` 逻辑注册到 timeline
3. **信号独立**——事件驱动走 sequenceStore
4. **单向数据流**——time 写 animState，sp 读 animState
5. **渐进迁移**——每步独立可验证，不破坏现有功能
