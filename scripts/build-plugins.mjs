#!/usr/bin/env node
/**
 * 编译 plugins/ 下的本地 Quartz 插件，产物写进各插件的 dist/ 并提交进仓库。
 *
 * 为什么要自己编：
 *   Quartz 的 loader 对「本地插件」只做软链接，不跑 npm install / npm run build
 *   （见 quartz/plugins/loader/gitLoader.ts 的 installPlugin）。所以插件不能有
 *   自己的 node_modules 和构建步骤——这里直接借用顶层已经装好的 esbuild，
 *   插件目录下一个依赖都不用装。
 *
 * 客户端脚本单独打一遍：Quartz 的 afterDOMLoaded 收的是「一段 JS 源码字符串」，
 * 所以先把 src/client/*.ts 打成 IIFE，再以字符串形式嵌进插件主包。
 */
import esbuild from "esbuild"
import fs from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pluginsDir = path.join(root, "plugins")

/** 由 Quartz 或宿主提供的单例，插件里必须保持 external，不能各打一份 */
const external = [
  "preact",
  "preact/*",
  "preact-render-to-string",
  "@quartz-community/*",
  "@quartz-themes/*",
  "unified",
  "unist-util-visit",
  "hast-util-to-jsx-runtime",
  "vfile",
  "hast",
  "mdast",
]

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  jsx: "automatic",
  jsxImportSource: "preact",
  logLevel: "warning",
  external,
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** src/client/<name>.ts → src/generated/<name>-code.ts（default export 一段 JS 源码） */
async function buildClientScripts(pluginDir) {
  const clientDir = path.join(pluginDir, "src", "client")
  if (!(await exists(clientDir))) return 0

  const files = (await fs.readdir(clientDir)).filter((f) => f.endsWith(".ts"))
  if (files.length === 0) return 0

  const outDir = path.join(pluginDir, "src", "generated")
  await fs.mkdir(outDir, { recursive: true })

  for (const file of files) {
    const result = await esbuild.build({
      entryPoints: [path.join(clientDir, file)],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2020",
      write: false,
      logLevel: "warning",
    })
    const code = result.outputFiles[0].text
    const name = path.basename(file, ".ts")
    await fs.writeFile(
      path.join(outDir, `${name}-code.ts`),
      `// 由 scripts/build-plugins.mjs 生成，别手改。源码在 ../client/${file}\n` +
        `export default ${JSON.stringify(code)}\n`,
      "utf-8",
    )
  }
  return files.length
}

async function firstExisting(...candidates) {
  for (const c of candidates) {
    if (await exists(c)) return c
  }
  return null
}

async function buildPlugin(name) {
  const dir = path.join(pluginsDir, name)
  const pkgPath = path.join(dir, "package.json")
  if (!(await exists(pkgPath))) return null

  const nClient = await buildClientScripts(dir)

  const entry = await firstExisting(
    path.join(dir, "src", "index.tsx"),
    path.join(dir, "src", "index.ts"),
  )
  if (!entry) {
    throw new Error(`${name}: 找不到 src/index.tsx 或 src/index.ts`)
  }

  const entryPoints = [{ in: entry, out: "index" }]

  const componentsEntry = await firstExisting(
    path.join(dir, "src", "components", "index.tsx"),
    path.join(dir, "src", "components", "index.ts"),
  )
  if (componentsEntry) {
    entryPoints.push({ in: componentsEntry, out: "components/index" })
  }

  await fs.rm(path.join(dir, "dist"), { recursive: true, force: true })
  await esbuild.build({
    ...shared,
    entryPoints,
    outdir: path.join(dir, "dist"),
    outExtension: { ".js": ".js" },
    sourcemap: false,
  })

  // esbuild 不产类型声明，但 Quartz 的 regeneratePluginIndex 要读 dist/index.d.ts，
  // 读不到就跳过这个插件（"no dist/index.d.ts found"）。顺带把插件也类型检查一遍。
  // 必须在 esbuild 之后跑：上面那句 rm 会把 dist/ 整个删掉。
  const tsconfig = path.join(dir, "tsconfig.json")
  const typechecked = await exists(tsconfig)
  if (typechecked) {
    execFileSync(path.join(root, "node_modules", ".bin", "tsc"), ["-p", tsconfig], {
      cwd: dir,
      stdio: "inherit",
    })
  }

  return { name, nClient, hasComponents: Boolean(componentsEntry), typechecked }
}

const only = process.argv[2]
const names = only
  ? [only]
  : (await fs.readdir(pluginsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

let built = 0
for (const name of names) {
  const result = await buildPlugin(name)
  if (!result) continue
  built++
  const bits = [`${result.nClient} 个客户端脚本`]
  if (result.hasComponents) bits.push("components")
  bits.push(result.typechecked ? "已类型检查" : "无 tsconfig，跳过类型检查")
  console.log(`✓ ${result.name}  (${bits.join(", ")})`)
}

if (built === 0) {
  console.log("plugins/ 下没有可编译的插件")
} else {
  console.log(`\n编译完成：${built} 个插件。dist/ 要一起提交，CI 上不会重新编译。`)
}
