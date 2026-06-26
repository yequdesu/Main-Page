# 外层陀螺环锯齿排查：ringGeometry 不能直接喂给 lineLoop

> 日期：2026-06-26  
> 标签：debug, three.js, r3f, lineLoop, ringGeometry, act3

## 现象

Act 3 中有两类环线：

1. 内部行星轨道参考线，贴近中心星体。
2. 外层陀螺仪装饰环，半径更大，有倾角和偏心拉伸。

视觉上内部轨道是连续的，而外层陀螺环出现明显锯齿、折返和不自然的三角状连接。由于两者都使用 WebGL 线材渲染，第一判断容易误以为是抗锯齿或 DPR 问题。

## 排查过程

先对比两类环线的几何来源：

```tsx
// 内部轨道：手写有序圆周点
Array.from({ length: 129 }, (_, i) => {
  const theta = (i / 128) * Math.PI * 2
  return [Math.cos(theta) * r, 0, Math.sin(theta) * r]
})
```

内部轨道的顶点顺序就是圆周顺序，所以 `line` 按点连接后天然连续。

外层陀螺环原实现是：

```tsx
<lineLoop>
  <ringGeometry args={[innerRadius, radius, segments]} />
</lineLoop>
```

`ringGeometry` 是面片几何，用来生成一个有内外半径的环面网格。它的顶点布局服务于三角面，而不是一条单一闭合曲线。把这类 geometry 直接交给 `lineLoop` 后，`lineLoop` 会按 buffer 顶点顺序强行连线，于是会连接到内圈、外圈和三角面相邻点，形成折返和锯齿。

## 根因

外层环的锯齿不是材质抗锯齿问题，而是 geometry 类型不匹配：

| 对象 | 顶点顺序 | 适合 lineLoop |
|------|----------|---------------|
| 手写圆周点 | 单条闭合曲线顺序 | 是 |
| `ringGeometry` | 面片/三角网格顺序 | 否 |

因此内部轨道没有锯齿，外层陀螺环有锯齿。

## 修复

将外层陀螺环也改为有序圆周点：

```tsx
const ringPoints = useMemo(() => {
  const lineRadius = (innerRadius + radius) * 0.5
  return Array.from({ length: segments }, (_, i) => {
    const theta = (i / segments) * Math.PI * 2
    return [Math.cos(theta) * lineRadius, Math.sin(theta) * lineRadius, 0]
  })
}, [innerRadius, radius, segments])

<lineLoop>
  <bufferGeometry>
    <bufferAttribute
      attach="attributes-position"
      args={[new Float32Array(ringPoints.flat()), 3]}
    />
  </bufferGeometry>
</lineLoop>
```

同时把默认分段数从 `96` 提高到 `192`，让大半径、倾斜、偏心拉伸后的曲线更平滑。

## 结果

刷新到 Act 3 后，外层陀螺环不再出现三角状折返。剩余可见边缘属于 WebGL 1px 线条在屏幕像素上的正常采样，不再是 geometry 顶点顺序导致的错误连线。

## 教训

- `lineLoop` 需要输入“一条线”的有序顶点，不适合直接消费面片 geometry。
- 想渲染线框时，不要只看 geometry 名称是否像目标形状，还要确认顶点顺序是否符合线段连接语义。
- 大半径装饰线应优先用显式采样点构建，后续倾斜、偏心、进动都可以作为 group transform 叠加。
