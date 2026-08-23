#!/usr/bin/env bash
# 把 brife vault 同步进 content/。
#
# content/ 是构建产物，不提交进仓库，每次构建重新生成。来源就是一个目录：
#
#   本地开发   默认的 iCloud Obsidian 目录
#   CI         brife 仓库的 checkout 目录（工作流跑在 brife 里，见 ci/brife-deploy.yml）
#
#   ./scripts/sync-content.sh
#   VAULT=/path/to/vault ./scripts/sync-content.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="${VAULT:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/brife}"
DEST="$REPO_ROOT/content"

if [[ ! -d "$VAULT" ]]; then
  echo "找不到 vault: $VAULT" >&2
  echo "用 VAULT=... 指定；CI 上应该指向 brife 仓库的 checkout 目录" >&2
  exit 1
fi

mkdir -p "$DEST"
echo "内容来源：$VAULT"

# -t 保留 mtime：content/ 不是 git 仓库，created-modified-date 插件会退回文件系统时间
rsync -a --delete --delete-excluded -t \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude '.gitignore' \
  --exclude '.obsidian/' \
  --exclude '.trash/' \
  --exclude '.DS_Store' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude 'AGENTS.md' \
  --exclude 'study-organizer.md' \
  "$VAULT/" "$DEST/"

# overlay/ 里是只属于站点、不属于 vault 的文件（首页、站点专用 .base 视图等），
# 覆盖在同步结果之上。放在 --delete 之后，rsync 才不会把它们删掉。
if [[ -d "$REPO_ROOT/overlay" ]]; then
  rsync -a "$REPO_ROOT/overlay/" "$DEST/"
fi

# .base 里的中文属性名必须改写成 note["…"]，否则 bases 的表达式引擎静默失效
node "$REPO_ROOT/scripts/normalize-bases.mjs"

echo "已同步 $(find "$DEST" -name '*.md' | wc -l | tr -d ' ') 篇 markdown → content/"
