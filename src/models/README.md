# models/ — 3D 模型资产与组件

## 目录

```
src/models/
  index.ts       — MODEL_REGISTRY 注册表（添加新模型只需在此加一项）
  Voyager1.tsx    — gltfjsx 生成的 Voyager 1 组件

public/models/
  Voyager1.glb    — GLB 二进制文件（Vite 静态服务，URL: /models/Voyager1.glb）
```

## 添加新 GLB 模型

1. 将 `.glb` 文件放入 `public/models/`
2. 运行 `npx @react-three/gltfjsx public/models/新模型.glb --transform --types --output src/models/新模型.tsx`
3. 检查生成的代码（import 路径、类型），必要时手动润色
4. 在 `src/models/index.ts` 的 `MODEL_REGISTRY` 中添加 entry
5. 重启 `pnpm debug`，在 Leva 下拉菜单中验证

## 模型来源与许可证

| 模型 | 作者 | 来源 | 许可证 | 三角面 | 文件大小 |
|------|------|------|--------|:---:|:---:|
| Voyager 1 | illidroid | [Sketchfab](https://sketchfab.com/3d-models/voyager-1-39bececb8b5d48a3ad0070e720586759) | CC BY 4.0 | 20.4K | 1.69 MB |
| Voyager 1 Low Poly | illidroid | `scripts/bake-low-poly.sh` 烘焙 | CC BY 4.0 | 10.5K | 401 KB |
| Lighthouse | YeQuDeSu | 程序化生成 | 项目自有 | ~6K | — |

## 低模烘焙管线

```
scripts/bake-low-poly.sh — GLB 低模烘焙脚本
```

**管线步骤：**

```
weld(合并顶点) → simplify(边折叠减面) → resize(纹理缩放) → meshopt(量化压缩)
```

**用法：**
```bash
bash scripts/bake-low-poly.sh <输入.glb> <输出.glb> [面数比例] [纹理尺寸]

# 示例
bash scripts/bake-low-poly.sh public/models/voyager-1.glb public/models/voyager-1-low.glb
bash scripts/bake-low-poly.sh public/models/model.glb public/models/model-low.glb 0.5 1024
```

**依赖：** `@gltf-transform/cli`（npx 按需安装）

## gltfjsx 使用提示

- `--transform` 应用 Draco 压缩 + WebP 纹理，通常减少 70-90% 体积
- `--types` 生成 TypeScript 类型定义
- `--instance` 对重复几何体启用自动实例化
- 生成的组件使用 drei 的 `useGLTF`，自动从 `public/` 加载

**援引：** [gltf.pmnd.rs](https://gltf.pmnd.rs) — pmndrs 官方 GLB→JSX 转换工具
