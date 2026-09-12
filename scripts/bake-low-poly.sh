#!/usr/bin/env bash
# ============================================================
# bake-low-poly.sh — GLB 低模烘焙管线
#
# 用法:
#   bash scripts/bake-low-poly.sh <输入.glb> <输出.glb> [面数比例] [纹理尺寸]
#
#   面数比例: 0.0–1.0，默认 0.3（保留 30% 顶点）
#   纹理尺寸: 默认 512
#
# 示例:
#   bash scripts/bake-low-poly.sh public/models/voyager-1.glb public/models/voyager-1-low.glb
#   bash scripts/bake-low-poly.sh public/models/voyager-1.glb public/models/voyager-1-low.glb 0.5 1024
#
# 依赖:
#   @gltf-transform/cli（npx 按需安装）
#
# 管线步骤:
#   1. weld      — 合并硬边顶点（simplify 必要前置）
#   2. simplify  — meshopt 边折叠减面
#   3. resize    — 纹理缩放到目标尺寸
#   4. meshopt   — 几何量化 + 压缩（drei useGLTF 自动解码）
#
# 援引:
#   glTF Transform — https://gltf-transform.dev/cli
#   meshoptimizer — https://github.com/zeux/meshoptimizer
# ============================================================
set -euo pipefail

INPUT="${1:?缺少输入文件}"
OUTPUT="${2:?缺少输出文件}"
RATIO="${3:-0.3}"
TEX_SIZE="${4:-512}"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

WELDED="$TMPDIR/welded.glb"
SIMPLIFIED="$TMPDIR/simplified.glb"

echo ""
echo "═══════════════════════════════════════════"
echo " 低模烘焙管线"
echo "═══════════════════════════════════════════"
echo " 输入:       $INPUT"
echo " 输出:       $OUTPUT"
echo " 面数比例:    $RATIO"
echo " 纹理尺寸:    ${TEX_SIZE}²"
echo ""

# 1. Weld
echo "[1/4] 焊接顶点..."
npx @gltf-transform/cli weld "$INPUT" "$WELDED"

# 2. Simplify
echo "[2/4] 简化网格 (ratio=$RATIO)..."
npx @gltf-transform/cli simplify "$WELDED" "$SIMPLIFIED" --ratio "$RATIO" --error 0.02

# 3. Resize textures
echo "[3/4] 缩放纹理 (${TEX_SIZE}²)..."
npx @gltf-transform/cli resize "$SIMPLIFIED" "$OUTPUT" --width "$TEX_SIZE" --height "$TEX_SIZE"

# 4. Meshopt compress
echo "[4/4] Meshopt 压缩..."
npx @gltf-transform/cli meshopt "$OUTPUT" "$OUTPUT"

# Stats
echo ""
echo "═══════════════════════════════════════════"
echo " 完成 — 文件对比"
echo "═══════════════════════════════════════════"
ORIG_SIZE=$(ls -lh "$INPUT" | awk '{print $5}')
FINAL_SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo " 原始: $ORIG_SIZE → 低模: $FINAL_SIZE"
echo ""
echo " 模型统计:"
npx @gltf-transform/cli inspect "$OUTPUT" 2>&1 | grep -E "glPrimitives|renderVertexCount|uploadVertexCount" | head -1
echo ""
