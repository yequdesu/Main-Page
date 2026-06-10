# utils/ — 工具函数

## 职责

通用数学函数，无任何业务逻辑耦合。被 `r3f/`、`behaviors/`、`actors/` 广泛引用。

## 文件

| 文件 | 导出 | 公式 |
|------|------|------|
| `smoothstep.ts` | `smoothstep(t)` | `t * t * (3 - 2 * t)` |
| `toward.ts` | `toward(from, to, step)` | 向目标值步进 |
| `shortestDelta.ts` | `shortestDelta(from, to)` | 角度最短路径差 |
| `__tests__/smoothstep.test.ts` | 6 个 L1 测试 | 覆盖边界值 |
| `__tests__/toward.test.ts` | L1 测试 | 覆盖正负方向 |

## 维护要点

- **纯函数**——无副作用，无外部依赖
- **每个函数必须有对应 L1 测试**
- 函数签名保持简单：入参 → 出参

## 新增工具函数步骤

1. 创建 `src/utils/newFunction.ts`
2. 在 `__tests__/` 中添加测试
3. 在需要的地方 import 使用

## 依赖方向

```
utils/ → 无依赖（纯 JavaScript/TypeScript）
```
