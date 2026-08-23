import type {
  ViewRenderer,
  ViewRendererProps,
  BasesEntry,
  BasesView,
} from "@quartz-community/bases-page/types"
import { transformLink } from "@quartz-community/utils"
import type { FullSlug, TransformOptions } from "@quartz-community/utils"
import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import type { Components, Jsx } from "hast-util-to-jsx-runtime"
import { Fragment, jsx, jsxs } from "preact/jsx-runtime"
import type { Root } from "hast"
import { buildDescriptors, readProp, serializeValue, propLabel } from "./props"
import type { PropDescriptor } from "./props"

export interface StreamOptions {
  /** 正文 hast 树挂在 frontmatter 的哪个键上 */
  bodyProperty: string
}

let streamSeq = 0

function fmtDate(v: unknown, locale: string): string | null {
  if (v === null || v === undefined || v === "") return null
  const d = v instanceof Date ? v : new Date(String(v))
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" })
}

function asList(v: unknown): string[] {
  if (v === null || v === undefined || v === "") return []
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== "").map(String)
  return [String(v)]
}

/**
 * 卡片上以 chip 形式展示哪些属性。
 * .base 里可以写 `chips: [卷子, 错因]` 显式指定；不写就用可筛选的非日期属性。
 */
function chipProps(descriptors: PropDescriptor[], view: BasesView): PropDescriptor[] {
  if (Array.isArray(view.chips)) {
    const wanted = view.chips as string[]
    return wanted
      .map((k) => descriptors.find((d) => d.key === k))
      .filter((d): d is PropDescriptor => Boolean(d))
  }
  return descriptors.filter((d) => d.kind !== "date" && d.facet)
}

/** "exercises/math/x" + "../attachments/y.png" → "exercises/attachments/y.png" */
function resolveAgainstSlug(slug: string, url: string): string {
  if (url.startsWith("/")) return url.slice(1)
  const base = slug.split("/").slice(0, -1)
  for (const seg of url.split("/")) {
    if (seg === "." || seg === "") continue
    if (seg === "..") base.pop()
    else base.push(seg)
  }
  return base.join("/")
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * 正文里的链接是 crawl-links 按「笔记自己那一页」算出来的相对路径，
 * 原样搬到 bases 页上层级就错了。这里先还原成 full slug，再按当前页重算。
 *
 * transformLink 永远返回相对路径（见 @quartz-community/utils 的实现），
 * 所以「相对 → full slug → 相对」这条往返是可逆的。
 */
function reresolve(
  url: string | undefined,
  entrySlug: string,
  pageSlug: string,
  opts: TransformOptions,
): string | undefined {
  if (!url) return url
  if (ABSOLUTE.test(url)) return url

  const noteHref = () => String(transformLink(pageSlug as FullSlug, entrySlug, opts))

  // 纯锚点指的是笔记自己内部的标题，在 feed 里应该跳到那篇笔记去
  if (url.startsWith("#")) return noteHref() + url

  const hashAt = url.indexOf("#")
  const path = hashAt >= 0 ? url.slice(0, hashAt) : url
  const hash = hashAt >= 0 ? url.slice(hashAt) : ""

  const full = resolveAgainstSlug(entrySlug, path)
  if (full === "") return noteHref() + hash
  return String(transformLink(pageSlug as FullSlug, full, opts)) + hash
}

function bodyComponents(
  entrySlug: string,
  pageSlug: string,
  opts: TransformOptions,
): Components {
  const fix = (url: string | undefined) => reresolve(url, entrySlug, pageSlug, opts)
  // 一页里有几十张卡片，标题 id 会撞车，直接去掉——feed 里也没人按 id 跳转
  const heading =
    (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    ({ id: _id, ...props }: Record<string, unknown>) =>
      jsx(Tag, props, undefined) as never

  return {
    a: ({ href, ...props }) => jsx("a", { ...props, href: fix(href as string) }, undefined) as never,
    img: ({ src, ...props }) =>
      jsx(
        "img",
        { ...props, src: fix(src as string), loading: "lazy", decoding: "async" },
        undefined,
      ) as never,
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
  } as Components
}

function StreamCard({
  entry,
  index,
  chips,
  href,
  body,
  locale,
  dateKey,
}: {
  entry: BasesEntry
  index: number
  chips: PropDescriptor[]
  href: string
  body: unknown
  locale: string
  dateKey: string | null
}) {
  const date = dateKey ? fmtDate(readProp(entry, dateKey), locale) : null

  return (
    <li class="bs-item" data-i={index}>
      <header class="bs-head">
        <h3 class="bs-title">
          <a href={href} class="internal" data-slug={entry.slug}>
            {entry.title}
          </a>
        </h3>
        <div class="bs-meta">
          {date && <time class="bs-date">{date}</time>}
          {chips.map((d) => {
            const vals = asList(readProp(entry, d.key))
            if (vals.length === 0) return null
            // 数值/布尔单看一个「4」「0」没法读，补上属性名
            const needsLabel = d.kind === "number" || d.kind === "bool"
            return vals.map((v) => (
              <span class="bs-chip" data-k={d.key} data-v={v} title={`${d.label}：${v}`}>
                {needsLabel && <span class="bs-chip-label">{d.label}</span>}
                {v}
              </span>
            ))
          })}
        </div>
      </header>
      {body ? <div class="bs-content">{body}</div> : null}
    </li>
  )
}

export function createStreamRenderer(opts: StreamOptions): ViewRenderer {
  return function StreamView(props: ViewRendererProps) {
    const { entries, view, basesData, total, locale, slug, allSlugs, linkResolution } = props
    const id = `bs-${streamSeq++}`

    const descriptors = buildDescriptors(entries, view, basesData.properties ?? {})
    const chips = chipProps(descriptors, view)

    // 日期显示优先用 view 里指定的字段，否则退回文件修改时间
    const dateKey =
      (typeof view.date === "string" && view.date) ||
      (typeof view.dateField === "string" && view.dateField) ||
      (typeof view.dateProperty === "string" && view.dateProperty) ||
      (descriptors.some((d) => d.key === "file.mtime") ? "file.mtime" : null)

    const transformOpts: TransformOptions = {
      strategy: linkResolution,
      allSlugs: allSlugs as FullSlug[],
    }

    /** 把笔记正文的 hast 树转成 JSX，链接按当前 bases 页重新解析 */
    const renderBody = (entry: BasesEntry) => {
      const tree = entry.properties[opts.bodyProperty] as Root | undefined
      if (!tree || typeof tree !== "object") return null
      try {
        return toJsxRuntime(tree, {
          Fragment,
          jsx: jsx as Jsx,
          jsxs: jsxs as Jsx,
          elementAttributeNameCase: "html",
          components: bodyComponents(entry.slug, slug, transformOpts),
        })
      } catch {
        // 单篇渲染失败不该带塌整个 feed
        return null
      }
    }

    // 客户端筛选/排序所需的数据。全文已经在 DOM 里了，搜索直接读 textContent，
    // 所以这里只带属性值，不重复塞一份正文。
    const payload = {
      id,
      groupBy: view.groupBy?.property ?? null,
      groupDir: view.groupBy?.direction ?? "ASC",
      dateKey,
      props: descriptors.map((d) => ({
        key: d.key,
        label: d.label,
        kind: d.kind,
        facet: d.facet,
        sortable: d.sortable,
      })),
      sort: (view.sort ?? []).map((s) => ({
        key: s.property,
        dir: s.direction ?? "ASC",
        label: propLabel(s.property, basesData.properties?.[s.property]?.displayName),
      })),
      entries: entries.map((e, i) => ({
        i,
        t: e.title,
        v: Object.fromEntries(descriptors.map((d) => [d.key, serializeValue(readProp(e, d.key))])),
      })),
    }

    return (
      <div class="bs-stream" id={id} data-total={total}>
        <script
          type="application/json"
          class="bs-payload"
          // JSON 里的 </script> 会提前闭合标签，必须转义
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(payload).replace(/</g, "\\u003c"),
          }}
        />
        <div class="bs-status" role="status" aria-live="polite">
          <span class="bs-count">{entries.length}</span>
          <span class="bs-count-total"> / {total}</span>
        </div>
        <ol class="bs-feed">
          {entries.map((entry, i) => (
            <StreamCard
              entry={entry}
              index={i}
              chips={chips}
              href={String(transformLink(slug as FullSlug, entry.slug, transformOpts))}
              body={renderBody(entry)}
              locale={locale}
              dateKey={dateKey}
            />
          ))}
        </ol>
        <p class="bs-empty" hidden>
          没有符合条件的条目。
        </p>
      </div>
    )
  }
}
