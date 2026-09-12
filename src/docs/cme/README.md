# CME 粒子化逸散说明页

入口：[cme-dissolution-explainer.html](../../../docs/actors/cme-dissolution-explainer.html)。开发服务路径 `/docs/actors/cme-dissolution-explainer.html`；独立构建与预览沿用 `pnpm build:docs`、`pnpm preview:docs`，不改变主页生产入口。

## 文件

| 文件 | 职责 |
|---|---|
| [App.tsx](App.tsx) | 阶段说明、时间/种子/对照/薄雾控制与公式 |
| [Preview.tsx](Preview.tsx) | 共享 CME 工厂的局部正交预览、视角与播放时钟 |
| [model.ts](model.ts) | 与原求解器同源的闭合时刻标记与 URL 解析 |
| [main.tsx](main.tsx)、[style.css](style.css) | 页面入口、响应式布局，复用磁拱环说明基础样式 |
| [model.test.ts](__tests__/model.test.ts) | 阶段时刻与实际模型对照，URL 重放边界 |

## 行为与维护

默认种子 `0.47`，暂停在首次闭合前 0.3 秒，播放速度 0.35×。阶段按钮以首次闭合为参考，外流/消退按钮切换全景；每条流线仍在自身阈值独立触发。支持 `?seed=0.79&t=8.123`，复制链接保存种子与时间；视角按时间阶段自动选择特写、全景或扩散远景，对照和雾强度使用默认值。种子无效值保留原结果，URL 无效值回退。

仅打开共享资产的 CME 通道，调用 `layoutLocal()` 与 `setEjectionAppearance()`；原始/艺术化切换不重建模拟。颗粒按弧长与磁丝相位错位采样，出生底部按高度平滑减量，取舍随种子固定；释放后短暂的邻域舒展同时作用于雾与颗粒。多数颗粒释放后约 0.7 秒内错峰淡出，尾迹按原背景面积预算翻倍至每批 4–16 个，并保持分散，释放后存活 300 秒；说明页包含出生概率、舒展、快速稀释与长寿命解析漂移公式；颗粒沿用磁拱环色源；薄雾跟随原粒子位置，按邻点间距扩大重叠覆盖，沿局部速度拉伸，密集区域降低贡献；共享噪声仅用于衔接纹理，不再向共同中心收拢。页面在事件前 13 秒将整体透明度固定为 1，此后仅显示尾迹；主页原来的瞬态淡出继续生效，尾迹跨事件续存。时间条在前 13 秒保留精细范围，进入晚期后扩展至 313 秒；30 / 120 / 240 秒与寿命结束按钮用于跳转，10× / 30× 用于快放。寿命从各自释放时刻计，最后 60 秒渐隐；离开 Act 4 后暂停场景时间。动力学、阶段包络、画面所有权及局限见[模型专题](../../../docs/stellar-plasma-model.md#cme-粒子化逸散艺术化实验)。

沿用 `flat` 与 `frameloop="demand"`。播放由 `useFrame` 推进并请求下一帧；暂停仅在控件/相机更新时渲染。页面隐藏或预览离开视口时暂停；恢复需手动播放。瞬态粒子和雾共用原求解器固定步；长寿命尾迹从固定步交接快照按同一播放时间解析求值，跳到 300 秒不需积分 300 秒的磁结构，没有新的 RAF/定时器。[R3F 按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance)说明了外部变化与 `invalidate()` 的关系。

预览独占工厂资源，卸载释放；时间回退/换种子重建 CPU 模型并复用 GPU 缓冲。核心行为测试见 [stellarEjection.test.ts](../../behaviors/__tests__/stellarEjection.test.ts)，资源与回退见 [stellarActivityPreview.test.ts](../../actors/__tests__/stellarActivityPreview.test.ts)。修改后需检查主页 Act 4、四阶段、长寿命尾迹与消退、原始对照、种子重放、暂停与窄屏。
