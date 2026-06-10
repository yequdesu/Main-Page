#!/bin/bash
# mirror — 监控项目后台进程，避免空载或废弃进程残留
# 用法: bash scripts/mirror.sh         查看状态
#       bash scripts/mirror.sh --kill   终止所有项目后台进程

set -e

PORTS=(5173 9999)
NAMES=("Vite Dev Server" "Stats Server (Python)")
KILL_MODE=false

[[ "$1" == "--kill" ]] && KILL_MODE=true

echo "════════════════════════════════════════"
echo "  Mirror · 项目后台进程监控"
echo "════════════════════════════════════════"
echo ""

FOUND=0

for i in "${!PORTS[@]}"; do
  PORT="${PORTS[$i]}"
  NAME="${NAMES[$i]}"

  PID=$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)

  if [[ -n "$PID" ]]; then
    # Take only the first PID if multiple
    FIRST_PID=$(echo "$PID" | head -1)
    FOUND=$((FOUND + 1))
    CMD=$(ps -p "$FIRST_PID" -o comm= 2>/dev/null || echo "unknown")
    ELAPSED=$(ps -p "$FIRST_PID" -o etime= 2>/dev/null | xargs || echo "?")

    printf "  %-24s  port %-5s  pid %-6s  up %-8s  %s\n" \
      "$NAME" ":$PORT" "$FIRST_PID" "$ELAPSED" "$CMD"

    if $KILL_MODE; then
      kill "$FIRST_PID" 2>/dev/null && printf "    → killed\n" || printf "    → failed to kill\n"
    fi
  else
    printf "  %-24s  port %-5s  —\n" "$NAME" ":$PORT"
  fi
done

echo ""

if $KILL_MODE; then
  echo "  已尝试终止所有项目后台进程。"
elif [[ $FOUND -eq 0 ]]; then
  echo "  没有发现项目后台进程。"
else
  echo "  发现 $FOUND 个后台进程。运行 \`npm run mirror -- --kill\` 终止。"
fi

echo ""
