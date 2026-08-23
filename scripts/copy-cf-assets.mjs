#!/usr/bin/env node
/**
 * 把 cf/ 下的 Cloudflare Pages 配置文件（_headers / _redirects）拷进 public/ 根目录。
 *
 * Quartz 的 Static emitter 只把 quartz/static/ 拷到 public/static/，
 * 而 _headers 必须在输出根目录 CF 才认，所以单独走这一步（build 的 postbuild 钩子）。
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const src = path.join(root, "cf")
const dest = path.join(root, "public")

try {
  await fs.access(dest)
} catch {
  console.error("public/ 不存在，先跑 npm run build")
  process.exit(1)
}

let copied = 0
for (const name of ["_headers", "_redirects"]) {
  const from = path.join(src, name)
  try {
    await fs.copyFile(from, path.join(dest, name))
    copied++
  } catch (err) {
    if (err.code !== "ENOENT") throw err
  }
}

console.log(copied > 0 ? `已拷贝 ${copied} 个 CF Pages 配置到 public/` : "cf/ 下没有要拷的文件")
