# 磁拱环交互图鉴

入口为 [stellar-morphology-explainer.html](../../../docs/actors/stellar-morphology-explainer.html)。运行 `pnpm dev` 后访问 `/docs/actors/stellar-morphology-explainer.html`；`pnpm build:docs` 与 `pnpm preview:docs` 独立构建和预览 PBD、磁拱环两份说明，不改变主应用入口。独立构建不复制模型资源目录。

## 文件与职责

| 文件 | 职责 |
|---|---|
| [main.tsx](main.tsx) | React 入口 |
| [App.tsx](App.tsx) | 六类说明、种子表单、URL、播放控制与 SVG 图鉴 |
| [Preview.tsx](Preview.tsx) | 正交相机、旋转控制、局部日面预览及资源所有权 |
| [model.ts](model.ts) | 种子校验、说明文案、共享模拟路径的 SVG 正投影 |
| [style.css](style.css) | 桌面与移动端布局 |
| [model.test.ts](__tests__/model.test.ts) | URL/种子边界、可复现性和真实路径投影验证 |

## 种子与组成

支持 `?type=nested&seed=0.47`；类型须为共享注册表的六种标识之一，种子为 `[0, 1)` 的十进制数。无效 URL 参数回退到默认值；表单无效值提示错误并保留现有结果。预设、随机与手动输入使用同一生成入口，复制链接包含类型与种子。

图鉴复用 [stellarMorphology.ts](../../behaviors/stellarMorphology.ts) 与 [stellarPlasma.ts](../../behaviors/stellarPlasma.ts)。嵌套拱廊和低矮环簇必须绑定另一种类型；结果中的 `companion` 和 `sourceKind` 用于展示组合及每个环系的归属。两类可以相互伴随，不能用增加同类型数量代替。模型规则、公式与适用边界见[日珥降阶模型](../../../docs/stellar-plasma-model.md)。

SVG 卡片直接投影模拟初态的路径表；三维预览默认暂停于第 4 秒。两者处于不同时间，点击“回到初态”可比较相同时间的轮廓。复制链接重放类型、种子和默认初始视角；不保存拖动后的相机或播放进度。

## 渲染与生命周期

采用 `flat`、`frameloop="demand"` 和正交相机。换种子、时间回退与视角变动请求新帧；播放中由 `useFrame` 推进并调用 `invalidate()`，暂停时停止连续请求。Drei OrbitControls 响应拖动/缩放并请求渲染。页面隐藏或预览离开视口时暂停，返回后需手动播放。没有额外 RAF 或定时器。依据：[R3F 按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance)、[invalidate API](https://r3f.docs.pmnd.rs/api/hooks)。

预览拥有一个 [stellarActivity](../../actors/assets/stellarActivity.ts) 实例，仅开启首个日珥通道。使用工厂的 `layoutLocal()` 在局部切平面绘制，复用现行发光材质、物质团块及共享路径表；其余通道透明度保持为零。常规 `layout()` 可恢复主页日面坐标。种子/类型变化或时间回退只重建 CPU 模拟，保留 GPU 纹理对象；卸载释放该实例的几何体、材质和路径纹理。旋转控制与足点资源由 R3F/Drei 管理。

新增类型时同步更新共享注册表、模型约束与本文案；不要另写一套 SVG 曲线公式。验证覆盖种子、组合、初态回退与资源释放；视觉修改还需检查桌面/窄屏的预览、表单、播放、切换视角、足点与卡片。
