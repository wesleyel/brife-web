import { resolvePropertyValue } from "@quartz-community/bases-page/compiler"
import type { BasesEntry, BasesView } from "@quartz-community/bases-page/types"

/** 客户端筛选控件的类型。服务端推断一次，写进 JSON 载荷。 */
export type PropKind = "text" | "list" | "number" | "date" | "bool"

export interface PropDescriptor {
  /** Bases 属性路径，如 "卷子" / "file.mtime" / "formula.x" */
  key: string
  label: string
  kind: PropKind
  /** 是否在右侧栏出现为筛选控件 */
  facet: boolean
  /** 是否可作为排序键 */
  sortable: boolean
}

/** bases-page 内部用 EvalContext 取值，这里从 entry 还原一个出来。 */
export function entryContext(entry: BasesEntry) {
  return {
    note: entry.properties,
    file: { ...entry.fileProperties, properties: entry.properties },
    formula: entry.formulaValues,
  }
}

export function readProp(entry: BasesEntry, key: string): unknown {
  try {
    return resolvePropertyValue(key, entryContext(entry) as never)
  } catch {
    return undefined
  }
}

/** 属性路径 → 展示用短标签：file.mtime → 修改时间，note.卷子 → 卷子 */
const BUILTIN_LABELS: Record<string, string> = {
  "file.name": "文件名",
  "file.basename": "文件名",
  "file.path": "路径",
  "file.folder": "目录",
  "file.ext": "扩展名",
  "file.tags": "标签",
  "file.links": "链接",
  "file.ctime": "创建时间",
  "file.mtime": "修改时间",
  "file.created": "创建时间",
  "file.modified": "修改时间",
  "file.size": "大小",
}

export function propLabel(key: string, configured?: string): string {
  if (configured) return configured
  if (BUILTIN_LABELS[key]) return BUILTIN_LABELS[key]
  return key.replace(/^(note|formula)\./, "")
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/

function kindOfValue(v: unknown): PropKind | null {
  if (v === null || v === undefined || v === "") return null
  if (Array.isArray(v)) return v.length === 0 ? null : "list"
  if (typeof v === "boolean") return "bool"
  if (typeof v === "number") return "number"
  if (v instanceof Date) return "date"
  if (typeof v === "string") return ISO_DATE.test(v) ? "date" : "text"
  return "text"
}

/**
 * 从实际数据推断属性类型，而不是信 frontmatter 的声明——
 * vault 里同一个字段在不同题里可能一会儿是字符串一会儿是数组。
 * 取众数，list 优先（只要出现过数组就当多值处理）。
 */
export function inferKind(entries: BasesEntry[], key: string): PropKind {
  const tally: Partial<Record<PropKind, number>> = {}
  let sawList = false
  for (const e of entries) {
    const k = kindOfValue(readProp(e, key))
    if (!k) continue
    if (k === "list") sawList = true
    tally[k] = (tally[k] ?? 0) + 1
  }
  if (sawList) return "list"
  let best: PropKind = "text"
  let bestN = -1
  for (const [k, n] of Object.entries(tally)) {
    if (n! > bestN) {
      best = k as PropKind
      bestN = n!
    }
  }
  return best
}

/** 唯一值个数——用来判断一个属性适不适合做 facet（枚举太多就没意义） */
export function distinctCount(entries: BasesEntry[], key: string): number {
  const seen = new Set<string>()
  for (const e of entries) {
    const v = readProp(e, key)
    if (Array.isArray(v)) v.forEach((x) => seen.add(String(x)))
    else if (v !== undefined && v !== null && v !== "") seen.add(String(v))
  }
  return seen.size
}

/** 这些列在 feed 卡片里已经单独渲染了，不用再进 facet/chip */
const SKIP_KEYS = new Set(["file.name", "file.basename", "file.path", "title"])

/**
 * 决定右侧栏出现哪些控件。
 * 优先用 .base 里显式写的 `facets:`；没写就从 view.order 里挑：
 * 数值/日期一律可筛，文本/多值要求唯一值 ≤ 40（再多就是自由文本，筛不动）。
 */
export function buildDescriptors(
  entries: BasesEntry[],
  view: BasesView,
  propertyLabels: Record<string, { displayName?: string }> = {},
): PropDescriptor[] {
  const explicit = Array.isArray(view.facets) ? (view.facets as string[]) : null
  const candidates = explicit ?? (view.order ?? []).filter((k) => !SKIP_KEYS.has(k))

  const out: PropDescriptor[] = []
  const seen = new Set<string>()
  for (const key of candidates) {
    if (seen.has(key)) continue
    seen.add(key)
    const kind = inferKind(entries, key)
    const n = distinctCount(entries, key)
    if (n === 0) continue
    const facet = explicit ? true : kind === "number" || kind === "date" || (n > 1 && n <= 40)
    out.push({
      key,
      label: propLabel(key, propertyLabels[key]?.displayName),
      kind,
      facet,
      sortable: true,
    })
  }

  // .base 的 sort / date 指到的属性必须在列表里，否则右侧栏的排序下拉
  // 显示的是第一项，而实际排序键是别的东西，两边对不上
  const referenced = [
    ...(view.sort ?? []).map((s) => s.property),
    typeof view.date === "string" ? view.date : null,
    typeof view.dateField === "string" ? view.dateField : null,
    typeof view.dateProperty === "string" ? view.dateProperty : null,
  ].filter((k): k is string => Boolean(k))

  // 时间永远可排序，即使 .base 里没列它
  for (const key of [...referenced, "file.mtime", "file.ctime"]) {
    if (seen.has(key)) continue
    if (distinctCount(entries, key) === 0) continue
    seen.add(key)
    out.push({
      key,
      label: propLabel(key, propertyLabels[key]?.displayName),
      kind: inferKind(entries, key),
      facet: false,
      sortable: true,
    })
  }

  return out
}

/** 序列化成客户端能直接比较的值：Date → ISO，其余原样 */
export function serializeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(serializeValue)
  if (v === undefined) return null
  if (typeof v === "object" && v !== null) return String(v)
  return v
}
