# 动画架构重构 V2 — 完全分离 time 与 sp

## 核心结构变化

**每个组件的 useFrame 拆成两层：**

```
之前（单体 useFrame）:
  useFrame((state) => {
    // time 逻辑: 计算光束旋转、波浪振荡
    // sp 逻辑:  应用淡出、层叠下落
    // 两者混在一起
  })

之后（分离）:
  // 层 1: time 生产者（留在 useFrame）
  useFrame((state) => {
    const t = state.clock.elapsedTime
    animState.beam.rotation = computeRotation(t)   // 写入共享状态
    animState.beam.intensity = computeIntensity(t)
  })

  // 层 2: sp 消费者（注册到 timeline）
  registerSp({
    name: 'beamFade',
    range: [0, 0.55],
    update(sp) {
      // 读取 animState.beam.rotation（time 计算好的）
      // 应用 sp 驱动的淡出
      applyBeamFade(sp, animState.beam)
    }
  })
```

## 新文件结构

```
src/animation/
├── timeline.ts          ← sp 注册 + 阈值 + 每帧 tickSp()
├── sequenceStore.ts     ← 信号状态机（CyDlen 设计）
├── animState.ts         ← 唯一共享数据源
└── registers/           ← 各组件的 sp 注册（取代内联 useFrame sp 部分）
    ├── lightBeam.ts
    ├── oceanWaves.ts
    ├── lighthouse.ts
    ├── gridLines.ts
    ├── windChime.ts
    ├── fogAndAmbient.ts
    └── actVisibility.ts
```

## animState 完整定义

```ts
// src/animation/animState.ts

import { Vector3, Color } from 'three'
import type { Mesh, Line, Group, InstancedMesh2 } from 'three'

export const animState = {
  // ── 时间驱动（生产者写入） ──
  beam: {
    pivot:         null as Group | null,        // LightBeam ref
    rotationY:     0,
    rotationX:     0,
    worldOrigin:   new Vector3(0, -0.428, -16),
    worldDirection: new Vector3(0, 0, 1),
    intensity:     3.0,
  },
  waves: {
    lines:         [] as Line[],               // OceanWaves refs
    data:          [] as any[],                // waveData
    baseColors:    [] as any[],                // waveBaseColors
    curtains:      [] as Mesh[],               // curtain meshes
    targetColor:   new Color('#94a3b8'),
  },
  planet: {
    worldPositions: [null, null, null] as (Vector3 | null)[],   // 所有系统可读
    rawOrbitY:      [0, 0, 0],
    meshes:         [] as Mesh[],
    innerGlows:     [] as Mesh[],
    atmosShells:    [] as Mesh[],
    haloSprites:    [] as any[],
  },
  star: {
    group:         null as Group | null,
    glowMesh:      null as Mesh | null,
    spriteMat1:    null as any,
    spriteMat2:    null as any,
  },
  lighthouse: {
    group:         null as Group | null,
  },
  grid: {
    lines:         [] as any[],                // GridLineData[]
    points:        null as any,
  },

  // ── 信号驱动（sequenceStore 写入） ──
  label: {
    gateOpen:      false,
    pbdStable:     false,
  },
}
```

## 组件拆分示例

### LightBeam: 1 个 useFrame → 1 个 useFrame + 1 个 registerSp

```ts
// ===== time 层（留在组件 useFrame） =====
useFrame((state) => {
  const t = state.clock.elapsedTime

  // 计算 idle roaming（纯 time）
  let targetY = 0, targetX = 0.08
  if (!isScrolling) {
    const slow = t * 0.20; const s1 = Math.sin(t * 0.12) * 2.2; const s2 = Math.cos(t * 0.41) * 0.5
    targetY = slow + s1 + s2
    targetX = 0.06 + Math.sin(t * 0.3) * 0.03 + Math.cos(t * 0.67) * 0.015
  }

  // 写入 animState
  const pivot = animState.beam.pivot!
  pivot.rotation.y = targetY
  pivot.rotation.x = targetX
  pivot.getWorldPosition(animState.beam.worldOrigin)
  pivot.getWorldQuaternion(_beamQuat)
  _beamFwd.set(0, 0, 1).applyQuaternion(_beamQuat)
  animState.beam.worldDirection.copy(_beamFwd)
})

// ===== sp 层（注册到 timeline） =====
import { registerSp } from '@/animation/timeline'

registerSp({
  name: 'beamFade',
  range: [0, 1.0],
  update(sp) {
    const wof = clamped(sp, 0.40, 0.55)
    const beamFade = Math.max(0, 1.0 - wof)
    const beamBoost = Math.pow(sp, 1.5) * 0.4

    animState.beam.intensity = (3.0 + Math.pow(sp, 1.5) * 12 + wof * 50) * beamFade

    // 锥体材质 opacity 更新
    for (let i = 0; i < 3; i++) {
      const base = [0.85, 0.45, 0.15][i]
      animState.beam.coneOpcacities![i] = (base + beamBoost * (i === 2 ? 1.8 : 1.2) + wof * 1.5) * beamFade
    }
  }
})
```

### OceanWaves: 1 个 useFrame → 1 个 useFrame + 1 个 registerSp

```ts
// ===== time 层 =====
useFrame((state) => {
  const t = state.clock.elapsedTime

  // 更新波浪顶点位置（纯 time 振荡）
  for (const line of animState.waves.lines) {
    // ... sin/cos 波浪计算 ...
    // 写入 animState.waves.positions
  }
})

// ===== sp 层 =====
registerSp({
  name: 'oceanCascade',
  range: [0.24, 0.72],
  update(sp) {
    // 读取 animState.waves.positions（time 算好的位置）
    // 应用层叠下落、拉平、颜色
    for (const line of animState.waves.lines) {
      // curtian 显示/隐藏
      // opacity 调整
    }
  }
})
```

### Lighthouse: 纯 sp → 仅 registerSp

```ts
// ===== 无 useFrame =====

registerSp({
  name: 'lighthouseVisible',
  range: [0, 1.0],
  update(sp) {
    animState.lighthouse.group!.visible = sp < 0.55
  }
})
```

## ScrollInvalidator 变化

```ts
// 之前
useFrame(() => {
  const sp = getState().scrollProgress
  sceneApplyWhiteOut(scene, sp)
  if (_ambientLight) _ambientLight.intensity = 1.4 + wof * 3.5
})

// 之后
useFrame(() => {
  const sp = getState().scrollProgress
  computeProgress(sp)     // 预计算所有进度值
  tickSp(sp)              // 调用所有 registerSp 回调
  tickSignals(sp)         // 检查 sequenceStore 中待触发的 sp 阈值信号
})
```

## 实施路径

### 阶段 1: 基础设施（不出效果变化）
1. 创建 `src/animation/animState.ts` — 所有共享数据
2. 创建 `src/animation/timeline.ts` — T 阈值 + P 进度 + registerSp + tickSp
3. 修改 ScrollInvalidator 调用 computeProgress + tickSp
4. 枚举所有 sp 驱动效果，列出 registerSp 条目

### 阶段 2: 逐组件迁移（每步可验证）
1. Lighthouse → 纯 sp，最简单
2. ScrollRig (sceneApplyWhiteOut) → registerSp
3. GridLines → 分开 time（无）和 sp（全部）
4. WindChimeLines → 纯 sp
5. OceanWaves → 拆 time（波浪振荡）+ sp（层叠/水幕/光束）
6. LightBeam → 拆 time（idle roaming）+ sp（淡出/强度）
7. Planets → 拆 time（轨道计算/辉光脉冲）+ sp（下落/可见性）
8. CentralStar → 拆 time（辉光脉冲）+ sp（下落/可见性）

### 阶段 3: 清理
1. 删除 `useWindChime.ts` → 归入 timeline
2. 删除组件间的直接 import → 全部通过 animState
3. 统一阈值到 T 对象

### 关键风险控制

| 风险 | 控制 |
|------|------|
| time/sp 拆错导致视觉变化 | 每个组件迁移后立即对比:8877 和 :8899 |
| animState 竞态（写入顺序） | registerSp 回调按注册顺序执行；useFrame 在之后运行 |
| 性能退化 | tickSp 是 for 循环调用函数指针，与原来 useFrame 中的 for 循环等价 |
