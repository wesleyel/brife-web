#!/usr/bin/env node
/**
 * 把 .base 里的中文属性名改写成 note["…"] 形式。
 *
 * 为什么必须做：bases-page 的表达式词法分析器只认 ASCII 标识符
 * （chunk-Y4KGLVLV.js 的 isIdentifierStart：只有 A-Za-z_$），
 * 所以 `复习 == 0` 不会报错，而是静默求值为 undefined —— 整个视图变空。
 * 本仓库的 frontmatter 全是中文键，不改写的话 vault 里现成的
 * exercises/错题.base 有一半视图在站点上是空的。
 *
 * 只改 filters 和 formulas 里的「表达式」；order / sort / groupBy 里存的是
 * 属性路径，走的是 resolvePropertyValue，中文本来就没问题，碰了反而会坏。
 *
 * 作用于 content/（构建输入），不动 vault。
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** ASCII 标识符字符：词法分析器认得的那些 */
function isAsciiIdent(ch) {
  return /[A-Za-z0-9_$]/.test(ch)
}

/** 非 ASCII 的「字母」——中文、日文假名、带音标的拉丁字母等 */
function isForeignIdent(ch) {
  return ch.charCodeAt(0) > 127 && /\p{L}|\p{N}/u.test(ch)
}

/**
 * 扫一遍表达式，把裸的非 ASCII 标识符包成 note["…"]。
 * 字符串字面量里的内容原样跳过——note["复习"] 重复跑也不会被包两层。
 */
export function normalizeExpression(expr) {
  let out = ""
  let i = 0
  let quote = null

  while (i < expr.length) {
    const ch = expr[i]

    if (quote) {
      out += ch
      if (ch === "\\" && i + 1 < expr.length) {
        out += expr[i + 1]
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i++
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      i++
      continue
    }

    if (isForeignIdent(ch)) {
      let j = i
      while (j < expr.length && (isForeignIdent(expr[j]) || isAsciiIdent(expr[j]))) j++
      const name = expr.slice(i, j)
      // 紧跟 ( 的是方法名（理论上不会是中文，保险起见不动）
      const next = expr.slice(j).match(/^\s*\(/)
      out += next ? name : `note[${JSON.stringify(name)}]`
      i = j
      continue
    }

    // ASCII 标识符整段抄过去，免得 `note` 里的字母被上面的分支拆开
    if (isAsciiIdent(ch)) {
      let j = i
      while (j < expr.length && (isAsciiIdent(expr[j]) || isForeignIdent(expr[j]))) j++
      out += expr.slice(i, j)
      i = j
      continue
    }

    out += ch
    i++
  }

  return out
}

/** filters 是 string | {and|or|not: FilterNode[]} 的递归结构 */
function normalizeFilterNode(node) {
  if (typeof node === "string") return normalizeExpression(node)
  if (Array.isArray(node)) return node.map(normalizeFilterNode)
  if (node && typeof node === "object") {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = normalizeFilterNode(v)
    return out
  }
  return node
}

function normalizeBase(doc) {
  let changed = false
  const mark = (before, after) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) changed = true
    return after
  }

  if (doc.filters !== undefined) {
    doc.filters = mark(doc.filters, normalizeFilterNode(doc.filters))
  }
  if (doc.formulas && typeof doc.formulas === "object") {
    for (const [k, v] of Object.entries(doc.formulas)) {
      if (typeof v === "string") doc.formulas[k] = mark(v, normalizeExpression(v))
    }
  }
  for (const view of doc.views ?? []) {
    if (view?.filters !== undefined) {
      view.filters = mark(view.filters, normalizeFilterNode(view.filters))
    }
  }
  return changed
}

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith(".base")) yield p
  }
}

export async function normalizeAll(contentDir = path.join(root, "content")) {
  let touched = 0
  let total = 0

  for await (const file of walk(contentDir)) {
    total++
    const raw = await fs.readFile(file, "utf-8")
    let doc
    try {
      doc = YAML.parse(raw)
    } catch (err) {
      console.error(`✗ ${path.relative(root, file)}: YAML 解析失败 — ${err.message}`)
      process.exitCode = 1
      continue
    }
    if (!doc || typeof doc !== "object") continue

    if (normalizeBase(doc)) {
      await fs.writeFile(file, YAML.stringify(doc), "utf-8")
      touched++
      console.log(`  改写 ${path.relative(root, file)}`)
    }
  }

  console.log(`.base 归一化：${total} 个文件，改写 ${touched} 个`)
  return touched
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await normalizeAll()
}
