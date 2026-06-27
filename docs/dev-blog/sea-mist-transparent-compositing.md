# 海雾与水幕透明层混合问题：Additive 会把接触面硬边界显影

> 日期：2026-06-27  
> 标签：debug, three.js, r3f, transparency, blending, fog, sea-mist, act1

## 现象

Act 1 加入远处海雾后，雾本身的空间位置、破碎边缘和缓慢流动效果基本符合预期，但在接近海面的位置出现了不自然的硬边界。

从画面上看，海雾和半透明海浪水幕叠加后，会在海面附近形成几条亮度突变的横向带。它不像真实海雾贴着海面缓慢扩散，而像是某个透明平面或渐变层被水幕边缘裁出来了。

这个问题最初容易被误判为：

- 雾效距离太近。
- 噪声不够破碎。
- 雾团形状太规则。
- 海浪水幕本身有硬边。

这些因素会影响观感，但不是这次硬边界的核心根因。

## 排查过程

项目中 Act 1 远海相关元素主要有三类：

| 对象 | 渲染方式 | 透明/深度特征 |
| --- | --- | --- |
| 海浪线 | `LineBasicMaterial` | 线条层，参与深度 |
| 水幕 | `MeshBasicMaterial` 半透明面片 | `opacity: 0.90`，用于遮挡/压暗海面以下区域 |
| 海雾 | `ShaderMaterial` 多片雾团 | 半透明，最初使用 `AdditiveBlending` |

海雾最初的 shader 让雾在贴近海面时密度最高：

```glsl
float seaHug = exp(-pow(vUv.y * 3.15, 1.42));
float body = max(seaHug, liftMist) * belowEdge;
gl_FragColor = vec4(color, density * uOpacity);
```

同时材质使用了 additive：

```ts
new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
})
```

这个组合在单独看雾时是合理的：底部浓、上缘破碎、整体发亮。但它叠到半透明水幕上后，问题会被放大。

Additive blending 的语义是把源颜色加到目标颜色上。目标层如果本来就有水幕的透明边界、亮度梯度或重叠面片，海雾会把这些差异进一步增亮。于是水幕的结构被“显影”，形成了看起来像雾效硬边的横线。

## 根因

根因不是单个 shader 的噪声不够，而是透明层合成语义不匹配：

| 问题点 | 结果 |
| --- | --- |
| 海雾使用 `AdditiveBlending` | 会增亮下方水幕和光束结构 |
| 海雾底部 alpha 最高 | 接触海面处正好是最容易显影的位置 |
| 水幕本身是半透明面片 | 面片边界/重叠区域会被雾层放大 |
| 雾层关闭 depthTest 后覆盖更完整 | 避免被裁切，但也更需要正确的接触面过渡 |

真实海雾不是一层光效贴图。它更接近半透明介质：应该柔和遮盖、漂浮、散射，而不是把下面已有亮度继续相加。

因此：

- **光束、辉光、星体 bloom** 可以使用 additive。
- **雾、烟、水汽、薄云** 默认不应使用 additive 作为主体混合。
- 如果雾需要被光照亮，应在雾 shader 内部局部提高颜色或 alpha，而不是把整个雾层作为 additive 叠加。

## 修复

本次修复分两步。

第一步，把海雾主体从 additive 改为普通 alpha 混合：

```ts
new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: false,
  side: DoubleSide,
})
```

并同步更新 layer 语义：

```ts
'webgl.oceanMist': {
  contract: {
    kind: 'webgl',
    renderOrder: 0,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: 'normal',
  },
}
```

第二步，给雾与海面的接触区域增加 feather。雾不再从最底部开始就是最高密度，而是先从 0 柔和爬升，密度峰值略高于海面：

```glsl
float contactFeather = smoothstep(0.00, 0.20, vUv.y);
float seaHug = exp(-pow(abs(vUv.y - 0.12) * 3.35, 1.36));

float density = horizontal * body * breakup * frayMask;
density += horizontal * upperWisps * 0.24;
density += horizontal * beamLift * (0.10 + torn * 0.08);
density *= contactFeather;
```

这样接近水幕边缘时不会立刻满 alpha，也就不会把水幕的透明边界显影出来。

## 当前取舍

海雾现在仍然使用独立透明雾团，而不是和海浪水幕合并成同一个 shader。这是一个务实取舍：

- 独立雾团方便调远近、形状和生命周期。
- 普通 alpha + contact feather 已经能解决最明显的硬边界。
- 如果后续还需要更真实的水汽，应考虑把远海水幕和雾统一到一个“海气层”shader 中，让水幕遮挡、雾密度、光束散射在同一个材质里完成。

## 后续准则

项目后续还会继续出现体积光、雾、辉光、行星大气层、粒子和 HUD 等多层透明对象。处理这类问题时先判断对象语义：

| 效果类型 | 推荐混合 | 接触面处理 |
| --- | --- | --- |
| 灯塔光束核心 | additive 可用 | 用衰减控制边缘 |
| 星体/行星辉光 | additive 可用，但要避免遮挡错位 | 依赖同源位置数据 |
| 海雾/烟/水汽 | normal alpha 优先 | 必须 feather |
| 贴地/贴海面的雾 | normal alpha | 底部不要满密度，峰值略离开接触面 |
| 半透明遮挡层 | normal alpha | 谨慎和 additive 层叠加 |
| Debug/HUD 覆盖 | normal alpha | 避免影响 WebGL 亮度判断 |

判断一个透明效果是否适合 additive，可以问一个问题：

> 这个效果是在“发光”，还是在“作为介质遮盖/散射”？

如果是发光，additive 通常合理。如果是介质，additive 往往会把下面的几何边界和透明层结构放大出来。

## 教训

- 透明层问题不能只看单个 shader，必须看它和下面所有透明/半透明层的合成关系。
- Additive blending 很容易让隐藏的边界显形，尤其是水幕、雾、体积光这类大面积半透明面片叠加时。
- 接触面要避免 alpha 突变。贴海面、贴地面、贴行星边缘的效果都应该有 feather 或 shell-aware clearance。
- 如果一个效果“单独看对，叠起来不对”，优先检查 blending、depthTest、depthWrite、renderOrder，而不是继续堆噪声。
- 雾效的受光部分应该在 shader 内部局部调制，不应该把整个雾主体作为 additive 光效处理。
