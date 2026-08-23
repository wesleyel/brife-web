#!/usr/bin/env node
/**
 * 把 brife vault 同步进 content/。
 *
 * content/ 是构建产物，不提交进仓库，每次构建重新生成。来源就是一个目录：
 *
 *   本地开发   默认的 iCloud Obsidian 目录
 *   CI         brife 仓库的 checkout 目录（由那边的 build.sh 传 VAULT 进来）
 *
 *   node scripts/sync-content.mjs
 *   VAULT=/path/to/vault node scripts/sync-content.mjs
 *
 * 原来这里是 rsync，但 Cloudflare 的构建容器里没有 rsync（只有 node 和 git），
 * 所以改成用 fs.cp。反正内容就一百多篇，全量重拷比增量省心。
 */
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { normalizeAll } from "./normalize-bases.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * 按「文件名」排除，和 rsync 不带斜杠的 exclude 规则一致——任意层级下同名的都挡掉。
 *
 * 前两组是 vault 自己的东西；第三组是 brife 仓库根目录上的部署脚手架
 * （build.sh 会把 brife-web clone 进 .site/），不挡的话那个 clone 连同它的
 * node_modules 会被一起拷进 content/。
 */
const EXCLUDED_NAMES = new Set([
  ".git",
  ".github",
  ".obsidian",
  ".trash",
  ".gitignore",
  ".DS_Store",
  "__pycache__",

  "AGENTS.md",
  "study-organizer.md",

  "README.md",
  "build.sh",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml",
  ".node-version",
  ".site",
  "node_modules",
  "public",
])

function isExcluded(name) {
  return EXCLUDED_NAMES.has(name) || name.endsWith(".pyc")
}

/** fs.cp 的 filter：返回 false 时整棵子树都不拷 */
function makeFilter(src) {
  return (from) => {
    if (from === src) return true
    return !isExcluded(path.basename(from))
  }
}

async function countMarkdown(dir) {
  let n = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) n++
  }
  return n
}

async function main() {
  const vault =
    process.env.VAULT ||
    path.join(os.homedir(), "Library/Mobile Documents/iCloud~md~obsidian/Documents/brife")
  const dest = path.join(root, "content")
  const overlay = path.join(root, "overlay")

  const stat = await fs.stat(vault).catch(() => null)
  if (!stat?.isDirectory()) {
    console.error(`找不到 vault: ${vault}`)
    console.error("用 VAULT=... 指定；CI 上应该指向 brife 仓库的 checkout 目录")
    process.exit(1)
  }

  console.log(`内容来源：${vault}`)

  // 全量重来，省掉 rsync --delete 那套差异计算
  await fs.rm(dest, { recursive: true, force: true })
  // preserveTimestamps：content/ 不是 git 仓库，created-modified-date 插件
  // 取不到 git 时间会退回文件系统时间，mtime 丢了日期就全变成构建时刻
  await fs.cp(vault, dest, {
    recursive: true,
    preserveTimestamps: true,
    filter: makeFilter(path.resolve(vault)),
  })

  // overlay/ 里是只属于站点、不属于 vault 的文件（首页、站点专用 .base 视图等），
  // 覆盖在同步结果之上
  if (await fs.stat(overlay).catch(() => null)) {
    await fs.cp(overlay, dest, { recursive: true, preserveTimestamps: true, force: true })
  }

  // .base 里的中文属性名必须改写成 note["…"]，否则 bases 的表达式引擎静默失效
  await normalizeAll(dest)

  console.log(`已同步 ${await countMarkdown(dest)} 篇 markdown → content/`)
}

await main()
