/**
 * stream 视图的客户端逻辑。
 *
 * 服务端已经把整个 feed 渲染成静态 HTML（没 JS 也能读），这里做的是：
 * 从页面内的 JSON 载荷建出右侧栏控件，然后按筛选/排序/分组结果
 * 重排 <ol> 的子节点。全程不重新生成卡片，只挪 DOM 和切 hidden。
 */

type Kind = "text" | "list" | "number" | "date" | "bool"

interface PropDesc {
  key: string
  label: string
  kind: Kind
  facet: boolean
  sortable: boolean
}

interface EntryRow {
  i: number
  t: string
  v: Record<string, unknown>
}

interface Payload {
  id: string
  groupBy: string | null
  groupDir: "ASC" | "DESC"
  dateKey: string | null
  props: PropDesc[]
  sort: { key: string; dir: "ASC" | "DESC"; label: string }[]
  entries: EntryRow[]
}

interface State {
  q: string
  facets: Record<string, string[]>
  min: Record<string, string>
  max: Record<string, string>
  sortKey: string
  sortDir: "ASC" | "DESC"
  groupKey: string
}

const FACET_COLLAPSE_AT = 10

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(c)
  return node
}

function asList(v: unknown): string[] {
  if (v === null || v === undefined || v === "") return []
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== "").map(String)
  return [String(v)]
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toTime(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? null : t
}

/** 排序比较：空值一律沉底，与升降序无关 */
function compare(a: unknown, b: unknown, kind: Kind): number {
  const aEmpty = a === null || a === undefined || a === ""
  const bEmpty = b === null || b === undefined || b === ""
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1

  if (kind === "number") {
    const x = toNumber(a),
      y = toNumber(b)
    if (x !== null && y !== null) return x - y
  }
  if (kind === "date") {
    const x = toTime(a),
      y = toTime(b)
    if (x !== null && y !== null) return x - y
  }
  const sa = Array.isArray(a) ? a.join(",") : String(a)
  const sb = Array.isArray(b) ? b.join(",") : String(b)
  return sa.localeCompare(sb, "zh-CN", { numeric: true })
}

// ---------------------------------------------------------------- state ↔ URL

const P = {
  sort: "s",
  dir: "d",
  group: "g",
  q: "q",
}

function readState(payload: Payload, ns: string): State {
  const sp = new URLSearchParams(location.search)
  const defSort = payload.sort[0]
  const state: State = {
    q: sp.get(ns + P.q) ?? "",
    facets: {},
    min: {},
    max: {},
    sortKey: sp.get(ns + P.sort) ?? defSort?.key ?? "",
    sortDir: (sp.get(ns + P.dir) as "ASC" | "DESC") ?? defSort?.dir ?? "ASC",
    groupKey: sp.get(ns + P.group) ?? payload.groupBy ?? "",
  }
  for (const p of payload.props) {
    const f = sp.get(`${ns}f.${p.key}`)
    if (f) state.facets[p.key] = f.split("~").filter(Boolean)
    const lo = sp.get(`${ns}min.${p.key}`)
    if (lo) state.min[p.key] = lo
    const hi = sp.get(`${ns}max.${p.key}`)
    if (hi) state.max[p.key] = hi
  }
  return state
}

function writeState(payload: Payload, state: State, ns: string) {
  const sp = new URLSearchParams(location.search)
  const setOrDrop = (k: string, v: string, isDefault: boolean) => {
    if (v && !isDefault) sp.set(k, v)
    else sp.delete(k)
  }
  const defSort = payload.sort[0]
  setOrDrop(ns + P.q, state.q, false)
  setOrDrop(ns + P.sort, state.sortKey, state.sortKey === (defSort?.key ?? ""))
  setOrDrop(ns + P.dir, state.sortDir, state.sortDir === (defSort?.dir ?? "ASC"))
  setOrDrop(ns + P.group, state.groupKey, state.groupKey === (payload.groupBy ?? ""))
  for (const p of payload.props) {
    setOrDrop(`${ns}f.${p.key}`, (state.facets[p.key] ?? []).join("~"), false)
    setOrDrop(`${ns}min.${p.key}`, state.min[p.key] ?? "", false)
    setOrDrop(`${ns}max.${p.key}`, state.max[p.key] ?? "", false)
  }
  const qs = sp.toString()
  history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname)
}

function isDefaultState(payload: Payload, state: State): boolean {
  const defSort = payload.sort[0]
  return (
    state.q === "" &&
    state.sortKey === (defSort?.key ?? "") &&
    state.sortDir === (defSort?.dir ?? "ASC") &&
    state.groupKey === (payload.groupBy ?? "") &&
    Object.values(state.facets).every((v) => v.length === 0) &&
    Object.values(state.min).every((v) => !v) &&
    Object.values(state.max).every((v) => !v)
  )
}

function activeFilterCount(state: State): number {
  let n = state.q ? 1 : 0
  for (const v of Object.values(state.facets)) if (v.length > 0) n++
  for (const v of Object.values(state.min)) if (v) n++
  for (const v of Object.values(state.max)) if (v) n++
  return n
}

// ------------------------------------------------------------------ matching

/**
 * 搜索的目标文本。卡片正文已经完整渲染在 DOM 里了，直接读 textContent，
 * 不用在 JSON 载荷里再塞一份全文——搜到的就是眼睛看得见的。
 */
function buildHaystack(row: EntryRow, item: HTMLElement | undefined): string {
  const parts = [row.t, item?.textContent ?? ""]
  for (const v of Object.values(row.v)) parts.push(asList(v).join(" "))
  return parts.join(" ").toLowerCase()
}

function matches(row: EntryRow, state: State, props: PropDesc[], haystack: string): boolean {
  if (state.q && !haystack.includes(state.q.toLowerCase())) return false

  for (const p of props) {
    const selected = state.facets[p.key]
    if (selected && selected.length > 0) {
      const vals = asList(row.v[p.key])
      // 同一个 facet 内是「或」，facet 之间是「且」
      if (!selected.some((s) => vals.includes(s))) return false
    }

    const lo = state.min[p.key]
    const hi = state.max[p.key]
    if (!lo && !hi) continue

    if (p.kind === "number") {
      const n = toNumber(row.v[p.key])
      if (n === null) return false
      if (lo && n < Number(lo)) return false
      if (hi && n > Number(hi)) return false
    } else if (p.kind === "date") {
      const t = toTime(row.v[p.key])
      if (t === null) return false
      if (lo && t < Date.parse(lo)) return false
      // 日期上界含当天：2026-08-23 应该匹配当天所有时刻
      if (hi && t > Date.parse(hi) + 86_399_999) return false
    }
  }
  return true
}

// ------------------------------------------------------------------ controls

interface Ctx {
  payload: Payload
  state: State
  items: HTMLElement[]
  haystacks: string[]
  feed: HTMLOListElement
  stream: HTMLElement
  panel: HTMLElement
  /** URL 参数前缀，一个页面上多个 stream 视图各用各的 */
  ns: string
  apply: () => void
}

function facetValues(payload: Payload, key: string): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of payload.entries) {
    for (const v of asList(row.v[key])) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN", { numeric: true }))
}

function buildFacet(ctx: Ctx, p: PropDesc): HTMLElement | null {
  const values = facetValues(ctx.payload, p.key)
  if (values.length === 0) return null

  const section = el("section", { class: "bs-facet", "data-key": p.key })
  const heading = el("h4", { class: "bs-facet-title" }, p.label)
  section.append(heading)

  if (p.kind === "number" || p.kind === "date") {
    const inputType = p.kind === "number" ? "number" : "date"
    const row = el("div", { class: "bs-range" })
    const mk = (bound: "min" | "max", placeholder: string) => {
      const input = el("input", {
        type: inputType,
        class: "bs-range-input",
        placeholder,
        "aria-label": `${p.label} ${bound === "min" ? "下限" : "上限"}`,
      })
      input.value = (bound === "min" ? ctx.state.min : ctx.state.max)[p.key] ?? ""
      input.addEventListener("change", () => {
        const target = bound === "min" ? ctx.state.min : ctx.state.max
        if (input.value) target[p.key] = input.value
        else delete target[p.key]
        ctx.apply()
      })
      return input
    }
    row.append(mk("min", "最小"), el("span", { class: "bs-range-dash" }, "–"), mk("max", "最大"))
    section.append(row)
    return section
  }

  const list = el("div", { class: "bs-facet-values" })
  const selected = new Set(ctx.state.facets[p.key] ?? [])

  values.forEach(({ value, count }, idx) => {
    const label = el("label", { class: "bs-facet-value" })
    if (idx >= FACET_COLLAPSE_AT) label.classList.add("bs-overflow")
    const box = el("input", { type: "checkbox", value })
    if (selected.has(value)) box.checked = true
    box.addEventListener("change", () => {
      const cur = new Set(ctx.state.facets[p.key] ?? [])
      if (box.checked) cur.add(value)
      else cur.delete(value)
      if (cur.size > 0) ctx.state.facets[p.key] = [...cur]
      else delete ctx.state.facets[p.key]
      ctx.apply()
    })
    label.append(
      box,
      el("span", { class: "bs-facet-label" }, value),
      el("span", { class: "bs-facet-count" }, String(count)),
    )
    list.append(label)
  })

  section.append(list)

  if (values.length > FACET_COLLAPSE_AT) {
    const more = el(
      "button",
      { type: "button", class: "bs-more" },
      `展开全部 ${values.length} 项`,
    )
    more.addEventListener("click", () => {
      const expanded = section.classList.toggle("bs-expanded")
      more.textContent = expanded ? "收起" : `展开全部 ${values.length} 项`
    })
    section.append(more)
  }

  return section
}

function buildPanel(ctx: Ctx) {
  const { payload, state, panel } = ctx
  panel.replaceChildren()

  const header = el("div", { class: "bs-panel-header" })
  header.append(el("h3", { class: "bs-panel-title" }, "筛选与排序"))
  const reset = el("button", { type: "button", class: "bs-reset" }, "重置")
  reset.addEventListener("click", () => {
    const fresh = readStateDefaults(payload)
    Object.assign(state, fresh)
    buildPanel(ctx)
    ctx.apply()
  })
  header.append(reset)
  panel.append(header)

  // 搜索
  const search = el("input", {
    type: "search",
    class: "bs-search",
    placeholder: "在结果中搜索…",
    "aria-label": "在结果中搜索",
  })
  search.value = state.q
  let debounce: number | undefined
  search.addEventListener("input", () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => {
      state.q = search.value.trim()
      ctx.apply()
    }, 120)
  })
  panel.append(search)

  // 排序
  const sortable = payload.props.filter((p) => p.sortable)
  if (sortable.length > 0) {
    const row = el("div", { class: "bs-sort" })
    const select = el("select", { class: "bs-sort-key", "aria-label": "排序字段" })
    for (const p of sortable) {
      const opt = el("option", { value: p.key }, p.label)
      if (p.key === state.sortKey) opt.selected = true
      select.append(opt)
    }
    select.addEventListener("change", () => {
      state.sortKey = select.value
      ctx.apply()
    })

    const dir = el("button", {
      type: "button",
      class: "bs-sort-dir",
      "aria-label": "切换升降序",
    })
    const paintDir = () => {
      dir.textContent = state.sortDir === "ASC" ? "↑" : "↓"
      dir.title = state.sortDir === "ASC" ? "升序" : "降序"
    }
    paintDir()
    dir.addEventListener("click", () => {
      state.sortDir = state.sortDir === "ASC" ? "DESC" : "ASC"
      paintDir()
      ctx.apply()
    })

    row.append(el("span", { class: "bs-sort-label" }, "排序"), select, dir)
    panel.append(row)
  }

  // 分组
  const groupable = payload.props.filter((p) => p.kind !== "number" && p.kind !== "date")
  if (groupable.length > 0) {
    const row = el("div", { class: "bs-sort" })
    const select = el("select", { class: "bs-group-key", "aria-label": "分组字段" })
    select.append(el("option", { value: "" }, "不分组"))
    for (const p of groupable) {
      const opt = el("option", { value: p.key }, p.label)
      if (p.key === state.groupKey) opt.selected = true
      select.append(opt)
    }
    select.addEventListener("change", () => {
      state.groupKey = select.value
      ctx.apply()
    })
    row.append(el("span", { class: "bs-sort-label" }, "分组"), select)
    panel.append(row)
  }

  // facet 列表
  for (const p of payload.props) {
    if (!p.facet) continue
    const section = buildFacet(ctx, p)
    if (section) panel.append(section)
  }
}

function readStateDefaults(payload: Payload): State {
  const defSort = payload.sort[0]
  return {
    q: "",
    facets: {},
    min: {},
    max: {},
    sortKey: defSort?.key ?? payload.props.find((p) => p.sortable)?.key ?? "",
    sortDir: defSort?.dir ?? "ASC",
    groupKey: payload.groupBy ?? "",
  }
}

// ------------------------------------------------------------------- rendering

function groupLabel(row: EntryRow, key: string): string {
  const vals = asList(row.v[key])
  return vals.length > 0 ? vals[0] : "未分类"
}

function render(ctx: Ctx) {
  const { payload, state, items, haystacks, feed, stream } = ctx

  const kindOf = new Map(payload.props.map((p) => [p.key, p.kind]))
  const visible = payload.entries.filter((row, i) =>
    matches(row, state, payload.props, haystacks[i]),
  )

  if (state.sortKey || state.groupKey) {
    const kind = kindOf.get(state.sortKey) ?? "text"
    const sign = state.sortDir === "DESC" ? -1 : 1
    const groupSign = payload.groupDir === "DESC" ? -1 : 1
    visible.sort((a, b) => {
      // 分组键必须是第一排序键，否则同一组的条目会被排序打散成好几段
      if (state.groupKey) {
        const g = groupLabel(a, state.groupKey).localeCompare(
          groupLabel(b, state.groupKey),
          "zh-CN",
          { numeric: true },
        )
        if (g !== 0) return g * groupSign
      }
      if (state.sortKey) {
        const c = compare(a.v[state.sortKey], b.v[state.sortKey], kind)
        if (c !== 0) return c * sign
      }
      // 主键相等时用标题兜底，保证排序稳定可预期
      return a.t.localeCompare(b.t, "zh-CN", { numeric: true })
    })
  }

  const visibleSet = new Set(visible.map((r) => r.i))
  for (let i = 0; i < items.length; i++) {
    items[i].hidden = !visibleSet.has(i)
  }

  // 一次性搭好新的子节点顺序再交给 DOM，避免 N 次 reflow
  const frag = document.createDocumentFragment()
  let lastGroup: string | null = null
  for (const row of visible) {
    if (state.groupKey) {
      const g = groupLabel(row, state.groupKey)
      if (g !== lastGroup) {
        lastGroup = g
        frag.append(
          el("li", { class: "bs-group", role: "presentation" }, el("h2", {}, g)),
        )
      }
    }
    frag.append(items[row.i])
  }

  // 被过滤掉的卡片也得留在 DOM 里（下次筛选还要用），塞到末尾并保持 hidden
  for (let i = 0; i < items.length; i++) {
    if (!visibleSet.has(i)) frag.append(items[i])
  }

  feed.replaceChildren(frag)

  const count = stream.querySelector(".bs-count")
  if (count) count.textContent = String(visible.length)
  const empty = stream.querySelector(".bs-empty") as HTMLElement | null
  if (empty) empty.hidden = visible.length > 0

  const n = activeFilterCount(state)
  ctx.panel.dataset.active = n > 0 ? String(n) : ""
  const reset = ctx.panel.querySelector(".bs-reset") as HTMLButtonElement | null
  if (reset) reset.disabled = isDefaultState(payload, state)

  writeState(payload, state, ctx.ns)
}

// ----------------------------------------------------------------------- boot

/**
 * 一个 bases 页上每个视图都渲染进了 HTML，只是非当前 tab 的 display:none。
 * 控件面板只有一个，所以永远绑到「当前可见的那个 stream」上。
 * 页面里也可能有 ```base 代码块产生的、不在 .bases-view 里的 stream。
 */
function visibleStream(): HTMLElement | null {
  const all = [...document.querySelectorAll(".bs-stream")] as HTMLElement[]
  for (const s of all) {
    const view = s.closest(".bases-view")
    if (!view || view.classList.contains("is-active")) return s
  }
  return null
}

/** URL 参数前缀：同一页多个 stream 视图的筛选状态不能互相串 */
function namespaceOf(stream: HTMLElement): string {
  const view = stream.closest(".bases-view") as HTMLElement | null
  const idx = view?.dataset.viewIndex
  return idx ? `v${idx}.` : ""
}

function bind(): boolean {
  const panel = document.querySelector(".bs-controls") as HTMLElement | null
  if (!panel) return false

  const stream = visibleStream()
  if (!stream) {
    panel.replaceChildren()
    panel.hidden = true
    return false
  }

  const script = stream.querySelector(".bs-payload")
  const feed = stream.querySelector(".bs-feed") as HTMLOListElement | null
  if (!script?.textContent || !feed) return false

  let payload: Payload
  try {
    payload = JSON.parse(script.textContent) as Payload
  } catch {
    return false
  }

  const items = [...feed.querySelectorAll(".bs-item")] as HTMLElement[]
  // 数量对不上说明这个 stream 已经被别的脚本改过，别再动它
  if (items.length !== payload.entries.length) return false

  panel.hidden = false

  const ctx: Ctx = {
    payload,
    state: readState(payload, namespaceOf(stream)),
    items,
    haystacks: payload.entries.map((row, i) => buildHaystack(row, items[i])),
    feed,
    stream,
    panel,
    ns: namespaceOf(stream),
    apply: () => render(ctx),
  }

  buildPanel(ctx)
  render(ctx)
  return true
}

function setup() {
  if (!document.querySelector(".bs-stream")) {
    const panel = document.querySelector(".bs-controls") as HTMLElement | null
    if (panel) panel.hidden = true
    return
  }

  bind()

  // 切 tab 后要换绑到新的可见 stream。bases-page 自己的脚本在 click 里同步
  // 改 is-active，但两边的监听器谁先注册不确定，所以推到下一个 tick 再读。
  const cleanups: (() => void)[] = []
  for (const btn of document.querySelectorAll(".bases-view-tabs button")) {
    const onClick = () => setTimeout(bind, 0)
    btn.addEventListener("click", onClick)
    cleanups.push(() => btn.removeEventListener("click", onClick))
  }

  window.addCleanup?.(() => {
    for (const fn of cleanups) fn()
    const panel = document.querySelector(".bs-controls") as HTMLElement | null
    if (panel) {
      panel.replaceChildren()
      panel.hidden = true
    }
  })
}

document.addEventListener("nav", setup)
