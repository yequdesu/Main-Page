# InstancedMesh 碎片不可见 — Matrix4.compose 四元数类型错误

> 日期：2026-06-12  
> 标签：debug, InstancedMesh, Matrix4, Quaternion, NaN, compose

## 现象

`DustField` 中 132 粒碎片（`InstancedMesh`）在任意 scrollProgress 下全部不可见。3 颗主行星（独立 `Mesh`）正常渲染，轨道环、恒星等其他 Act 3 元素均正常。

## 排查过程

### 第一阶段：怀疑 InstancedMesh2

原实现使用 `@three.ez/instanced-mesh`（InstancedMesh2）。检查其渲染管线后发现两个潜在问题：

1. **`_renderer` 未传入** — `InstancedMesh2` 构造函数需要 `renderer` 来初始化 `instanceIndex`，否则 `initIndexAttribute()` 静默返回
2. **`_instancesArrayCount = 0`** — `setMatrixAt` 不会自动递增此值，需显式调用 `addInstances(n)`

修复这两项后，碎片依旧不可见。查阅社区资料（[greenrobot blog](https://blog.greenrobot.com/2025/07/21/why-we-switched-from-instancedmesh2-to-regular-three-instancedmesh/)、[GitHub #149](https://github.com/agargaro/instanced-mesh/issues/149)），发现 InstancedMesh2 的 `count` 属性存在已知同步问题。

### 第二阶段：隔离变量 — 切换为标准 InstancedMesh

用标准 `THREE.InstancedMesh` 替换 InstancedMesh2，排除第三方库因素。

**诊断 A — 静态硬编码位置（5 个大红球，固定矩阵）：**

```ts
const mesh = new InstancedMesh(new SphereGeometry(0.3, 16, 12), new MeshBasicMaterial({ color: 'red' }), 5)
mesh.renderOrder = 999
_m.setPosition(0, 0, 0); mesh.setMatrixAt(0, _m)
// ... 4 个更多位置
```

→ **5 个球体全部可见。** InstancedMesh + R3F 集成正常。

**诊断 B — 使用 useFrame 中 calcOrbitPosition 计算的位置：**

```ts
// useFrame 中：
_matrix.compose(
  _position.set(px, py, pz),
  _quaternion,                    // ← 疑似问题
  _scale.set(1, 1, 1),           // 强制 scale=1，大球 0.15
)
debrisRef.current.setMatrixAt(debrisIdx, _matrix)
```

→ **全部不可见。** 数据源头有问题。

**Console 输出确认：** 前 3 个碎片位置在视锥体内（`(0.89, 0.09, -4.11)` 等），材质、renderOrder 均正常。

### 第三阶段：检查矩阵原始数据

在 Console 中展开 `debrisMesh.instanceMatrix.array`：

```js
Float32Array(2112) [
  NaN, NaN, NaN, 0,       // ← 实例 0 的旋转分量全是 NaN
  NaN, NaN, NaN, 0,
  NaN, NaN, NaN, 0,
  3.109, -1, -11.575, 1,  // ← 位移分量正常
  ...
]
```

每个实例矩阵的前 12 个元素（3×4 旋转+缩放分量）全是 **NaN**，只有位移（元素 12–14）正确。

### 第四阶段：定位 NaN 来源

`Matrix4.compose(position, quaternion, scale)` 内部使用四元数计算旋转矩阵。查看 Three.js 源码：

```js
// Matrix4.compose() 内部：
const x = quaternion._x, y = quaternion._y, z = quaternion._z, w = quaternion._w;
const x2 = x + x, y2 = y + y, z2 = z + z;
const xx = x * x2, xy = x * y2, xz = x * z2;
// ...
te[0] = (1 - (yy + zz)) * sx;
```

`_x`、`_y`、`_z`、`_w` 是 `THREE.Quaternion` 类的**私有字段**（下划线前缀），由构造函数初始化。

但我们的代码中：

```ts
// src/actors/DustField.tsx — 原实现
const _quaternion = useRef({ x: 0, y: 0, z: 0, w: 1 } as any).current
//                         ↑ 普通 JavaScript 对象，不是 THREE.Quaternion 实例
```

普通对象 `{x:0, y:0, z:0, w:1}` 不具备 `_x` / `_y` / `_z` / `_w` 字段。`Matrix4.compose()` 读取到 `undefined` → 所有旋转分量计算为 `NaN`。

`setPosition` 不受影响（仅访问 `position.x/y/z`），因此静态诊断正常工作。

## 根因

```ts
// 错误：普通对象 → Matrix4.compose() 读取 _x/_y/_z/_w → undefined → NaN
const _quaternion = useRef({ x: 0, y: 0, z: 0, w: 1 } as any).current

// 正确：THREE.Quaternion 实例 → 构造函数设置 _x=0, _y=0, _z=0, _w=1
const _quaternion = useRef(new Quaternion()).current
```

`InstancedMesh` 的 WebGL 渲染器遇到包含 NaN 的变换矩阵时，会跳过该实例或产生未定义行为（不可见）。

## 修复

```diff
- import { ..., Vector3, type PerspectiveCamera } from 'three'
+ import { ..., Quaternion, Vector3, type PerspectiveCamera } from 'three'

- const _quaternion = useRef({ x: 0, y: 0, z: 0, w: 1 } as any).current
+ const _quaternion = useRef(new Quaternion()).current
```

## 教训

1. **Three.js 类实例不能替换为普通对象。** `THREE.Quaternion` 的 `_x/_y/_z/_w` 私有字段会被 `Matrix4.compose()` 直接访问。TypeScript 的 `as any` 类型断言绕过了编译检查，但无法改变运行时的字段缺失。

2. **NaN 在渲染中表现为"不可见"而非报错。** WebGL 对 NaN 矩阵无明确异常，静默跳过导致调试困难。用 Console 直接检查 `instanceMatrix.array` 原始数据是最快的定位手段。

3. **分步隔离是关键。** 先排除第三方库（InstancedMesh2 → InstancedMesh），再排除数据源（静态 → useFrame），最后检查原始缓冲区——每一步排除一个变量。

4. **`as any` 是危险信号。** `as any` 类型断言隐藏了类型不匹配，使得 `{x:0, y:0, z:0, w:1}` 能赋值给期望 `Quaternion` 的参数。宁可多写 `new Quaternion()` 也不要靠断言绕开类型系统。

---

## 相关记录

| 记录 | 关联 |
|------|------|
| [`instanced-mesh-shader-compile.md`](./instanced-mesh-shader-compile.md) | 同一组件（DustField）的排查——InstancedMesh2 `addInstances` + `materialsNeedsUpdate` |
| [`scene-graph-visibility.md`](./scene-graph-visibility.md) | 同一排查时期的场景图层级问题 |
