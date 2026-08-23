// plugins/bases-stream/src/index.tsx
import { viewRegistry } from "@quartz-community/bases-page";

// plugins/bases-stream/src/stream-view.tsx
import { transformLink } from "@quartz-community/utils";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "preact/jsx-runtime";

// plugins/bases-stream/src/props.ts
import { resolvePropertyValue } from "@quartz-community/bases-page/compiler";
function entryContext(entry) {
  return {
    note: entry.properties,
    file: { ...entry.fileProperties, properties: entry.properties },
    formula: entry.formulaValues
  };
}
function readProp(entry, key) {
  try {
    return resolvePropertyValue(key, entryContext(entry));
  } catch {
    return void 0;
  }
}
var BUILTIN_LABELS = {
  "file.name": "\u6587\u4EF6\u540D",
  "file.basename": "\u6587\u4EF6\u540D",
  "file.path": "\u8DEF\u5F84",
  "file.folder": "\u76EE\u5F55",
  "file.ext": "\u6269\u5C55\u540D",
  "file.tags": "\u6807\u7B7E",
  "file.links": "\u94FE\u63A5",
  "file.ctime": "\u521B\u5EFA\u65F6\u95F4",
  "file.mtime": "\u4FEE\u6539\u65F6\u95F4",
  "file.created": "\u521B\u5EFA\u65F6\u95F4",
  "file.modified": "\u4FEE\u6539\u65F6\u95F4",
  "file.size": "\u5927\u5C0F"
};
function propLabel(key, configured) {
  if (configured) return configured;
  if (BUILTIN_LABELS[key]) return BUILTIN_LABELS[key];
  return key.replace(/^(note|formula)\./, "");
}
var ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;
function kindOfValue(v) {
  if (v === null || v === void 0 || v === "") return null;
  if (Array.isArray(v)) return v.length === 0 ? null : "list";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return "number";
  if (v instanceof Date) return "date";
  if (typeof v === "string") return ISO_DATE.test(v) ? "date" : "text";
  return "text";
}
function inferKind(entries, key) {
  const tally = {};
  let sawList = false;
  for (const e of entries) {
    const k = kindOfValue(readProp(e, key));
    if (!k) continue;
    if (k === "list") sawList = true;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  if (sawList) return "list";
  let best = "text";
  let bestN = -1;
  for (const [k, n] of Object.entries(tally)) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}
function distinctCount(entries, key) {
  const seen = /* @__PURE__ */ new Set();
  for (const e of entries) {
    const v = readProp(e, key);
    if (Array.isArray(v)) v.forEach((x) => seen.add(String(x)));
    else if (v !== void 0 && v !== null && v !== "") seen.add(String(v));
  }
  return seen.size;
}
var SKIP_KEYS = /* @__PURE__ */ new Set(["file.name", "file.basename", "file.path", "title"]);
function buildDescriptors(entries, view, propertyLabels = {}) {
  const explicit = Array.isArray(view.facets) ? view.facets : null;
  const candidates = explicit ?? (view.order ?? []).filter((k) => !SKIP_KEYS.has(k));
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = inferKind(entries, key);
    const n = distinctCount(entries, key);
    if (n === 0) continue;
    const facet = explicit ? true : kind === "number" || kind === "date" || n > 1 && n <= 40;
    out.push({
      key,
      label: propLabel(key, propertyLabels[key]?.displayName),
      kind,
      facet,
      sortable: true
    });
  }
  const referenced = [
    ...(view.sort ?? []).map((s) => s.property),
    typeof view.date === "string" ? view.date : null,
    typeof view.dateField === "string" ? view.dateField : null,
    typeof view.dateProperty === "string" ? view.dateProperty : null
  ].filter((k) => Boolean(k));
  for (const key of [...referenced, "file.mtime", "file.ctime"]) {
    if (seen.has(key)) continue;
    if (distinctCount(entries, key) === 0) continue;
    seen.add(key);
    out.push({
      key,
      label: propLabel(key, propertyLabels[key]?.displayName),
      kind: inferKind(entries, key),
      facet: false,
      sortable: true
    });
  }
  return out;
}
function serializeValue(v) {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v === void 0) return null;
  if (typeof v === "object" && v !== null) return String(v);
  return v;
}

// plugins/bases-stream/src/stream-view.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "preact/jsx-runtime";
var streamSeq = 0;
function fmtDate(v, locale) {
  if (v === null || v === void 0 || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
}
function asList(v) {
  if (v === null || v === void 0 || v === "") return [];
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== "").map(String);
  return [String(v)];
}
function chipProps(descriptors, view) {
  if (Array.isArray(view.chips)) {
    const wanted = view.chips;
    return wanted.map((k) => descriptors.find((d) => d.key === k)).filter((d) => Boolean(d));
  }
  return descriptors.filter((d) => d.kind !== "date" && d.facet);
}
function resolveAgainstSlug(slug, url) {
  if (url.startsWith("/")) return url.slice(1);
  const base = slug.split("/").slice(0, -1);
  for (const seg of url.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") base.pop();
    else base.push(seg);
  }
  return base.join("/");
}
var ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
function reresolve(url, entrySlug, pageSlug, opts) {
  if (!url) return url;
  if (ABSOLUTE.test(url)) return url;
  const noteHref = () => String(transformLink(pageSlug, entrySlug, opts));
  if (url.startsWith("#")) return noteHref() + url;
  const hashAt = url.indexOf("#");
  const path = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const full = resolveAgainstSlug(entrySlug, path);
  if (full === "") return noteHref() + hash;
  return String(transformLink(pageSlug, full, opts)) + hash;
}
function bodyComponents(entrySlug, pageSlug, opts) {
  const fix = (url) => reresolve(url, entrySlug, pageSlug, opts);
  const heading = (Tag) => ({ id: _id, ...props }) => jsx(Tag, props, void 0);
  return {
    a: ({ href, ...props }) => jsx("a", { ...props, href: fix(href) }, void 0),
    img: ({ src, ...props }) => jsx(
      "img",
      { ...props, src: fix(src), loading: "lazy", decoding: "async" },
      void 0
    ),
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6")
  };
}
function StreamCard({
  entry,
  index,
  chips,
  href,
  body,
  locale,
  dateKey
}) {
  const date = dateKey ? fmtDate(readProp(entry, dateKey), locale) : null;
  return /* @__PURE__ */ jsxs2("li", { class: "bs-item", "data-i": index, children: [
    /* @__PURE__ */ jsxs2("header", { class: "bs-head", children: [
      /* @__PURE__ */ jsx2("h3", { class: "bs-title", children: /* @__PURE__ */ jsx2("a", { href, class: "internal", "data-slug": entry.slug, children: entry.title }) }),
      /* @__PURE__ */ jsxs2("div", { class: "bs-meta", children: [
        date && /* @__PURE__ */ jsx2("time", { class: "bs-date", children: date }),
        chips.map((d) => {
          const vals = asList(readProp(entry, d.key));
          if (vals.length === 0) return null;
          const needsLabel = d.kind === "number" || d.kind === "bool";
          return vals.map((v) => /* @__PURE__ */ jsxs2("span", { class: "bs-chip", "data-k": d.key, "data-v": v, title: `${d.label}\uFF1A${v}`, children: [
            needsLabel && /* @__PURE__ */ jsx2("span", { class: "bs-chip-label", children: d.label }),
            v
          ] }));
        })
      ] })
    ] }),
    body ? /* @__PURE__ */ jsx2("div", { class: "bs-content", children: body }) : null
  ] });
}
function createStreamRenderer(opts) {
  return function StreamView(props) {
    const { entries, view, basesData, total, locale, slug, allSlugs, linkResolution } = props;
    const id = `bs-${streamSeq++}`;
    const descriptors = buildDescriptors(entries, view, basesData.properties ?? {});
    const chips = chipProps(descriptors, view);
    const dateKey = typeof view.date === "string" && view.date || typeof view.dateField === "string" && view.dateField || typeof view.dateProperty === "string" && view.dateProperty || (descriptors.some((d) => d.key === "file.mtime") ? "file.mtime" : null);
    const transformOpts = {
      strategy: linkResolution,
      allSlugs
    };
    const renderBody = (entry) => {
      const tree = entry.properties[opts.bodyProperty];
      if (!tree || typeof tree !== "object") return null;
      try {
        return toJsxRuntime(tree, {
          Fragment,
          jsx,
          jsxs,
          elementAttributeNameCase: "html",
          components: bodyComponents(entry.slug, slug, transformOpts)
        });
      } catch {
        return null;
      }
    };
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
        sortable: d.sortable
      })),
      sort: (view.sort ?? []).map((s) => ({
        key: s.property,
        dir: s.direction ?? "ASC",
        label: propLabel(s.property, basesData.properties?.[s.property]?.displayName)
      })),
      entries: entries.map((e, i) => ({
        i,
        t: e.title,
        v: Object.fromEntries(descriptors.map((d) => [d.key, serializeValue(readProp(e, d.key))]))
      }))
    };
    return /* @__PURE__ */ jsxs2("div", { class: "bs-stream", id, "data-total": total, children: [
      /* @__PURE__ */ jsx2(
        "script",
        {
          type: "application/json",
          class: "bs-payload",
          dangerouslySetInnerHTML: {
            __html: JSON.stringify(payload).replace(/</g, "\\u003c")
          }
        }
      ),
      /* @__PURE__ */ jsxs2("div", { class: "bs-status", role: "status", "aria-live": "polite", children: [
        /* @__PURE__ */ jsx2("span", { class: "bs-count", children: entries.length }),
        /* @__PURE__ */ jsxs2("span", { class: "bs-count-total", children: [
          " / ",
          total
        ] })
      ] }),
      /* @__PURE__ */ jsx2("ol", { class: "bs-feed", children: entries.map((entry, i) => /* @__PURE__ */ jsx2(
        StreamCard,
        {
          entry,
          index: i,
          chips,
          href: String(transformLink(slug, entry.slug, transformOpts)),
          body: renderBody(entry),
          locale,
          dateKey
        }
      )) }),
      /* @__PURE__ */ jsx2("p", { class: "bs-empty", hidden: true, children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6761\u76EE\u3002" })
    ] });
  };
}

// plugins/bases-stream/src/styles.ts
var streamCss = `
.bs-stream .bs-status {
  font-size: 0.85rem;
  color: var(--gray);
  margin: 0 0 0.75rem;
}
.bs-stream .bs-count {
  font-weight: 600;
  color: var(--darkgray);
}
.bs-feed {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.bs-feed > .bs-item[hidden] { display: none; }

.bs-group {
  margin: 1rem 0 0;
  padding: 0;
}
.bs-group:first-child { margin-top: 0; }
.bs-group h2 {
  margin: 0;
  padding-bottom: 0.3rem;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--secondary);
  border-bottom: 1px solid var(--lightgray);
}

.bs-item {
  padding: 1rem 1.15rem 1.15rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background: var(--light);
  transition: border-color 0.15s ease;
  /* \u5361\u7247\u662F\u7B14\u8BB0\u5168\u6587\uFF0C\u4E00\u9875\u4E0A\u767E\u5F20\u7684\u8BDD DOM \u5F88\u91CD\uFF08KaTeX \u5C24\u5176\u5570\u55E6\uFF09\u3002
     \u8BA9\u6D4F\u89C8\u5668\u8DF3\u8FC7\u89C6\u53E3\u5916\u5361\u7247\u7684\u6E32\u67D3\uFF0C\u6EDA\u5230\u4E86\u518D\u7B97\uFF1BCtrl+F \u548C textContent \u4E0D\u53D7\u5F71\u54CD\u3002 */
  content-visibility: auto;
  contain-intrinsic-size: auto 420px;
}
.bs-item:hover { border-color: var(--gray); }

.bs-head {
  padding-bottom: 0.6rem;
  margin-bottom: 0.8rem;
  border-bottom: 1px solid var(--lightgray);
}

.bs-title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  line-height: 1.35;
}
.bs-title a { background-color: transparent; }

.bs-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.bs-date {
  font-size: 0.78rem;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
  margin-right: 0.15rem;
}
.bs-chip {
  font-size: 0.72rem;
  line-height: 1.6;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: var(--highlight);
  color: var(--darkgray);
  white-space: nowrap;
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bs-chip-label {
  color: var(--gray);
  margin-right: 0.25rem;
}

/* \u5361\u7247\u6B63\u6587\u5C31\u662F\u7B14\u8BB0\u5168\u6587\uFF0C\u6837\u5F0F\u8DDF\u7740\u7AD9\u70B9\u4E3B\u6837\u5F0F\u8D70\uFF0C\u53EA\u538B\u4E00\u70B9\u5B57\u53F7\u548C\u7559\u767D */
.bs-content {
  font-size: 0.92rem;
  overflow-wrap: break-word;
}
.bs-content > :first-child { margin-top: 0; }
.bs-content > :last-child { margin-bottom: 0; }
.bs-content p { margin: 0.7em 0; line-height: 1.7; }

.bs-content h1,
.bs-content h2,
.bs-content h3,
.bs-content h4,
.bs-content h5,
.bs-content h6 {
  /* \u7B14\u8BB0\u91CC\u7684\u6807\u9898\u5C42\u7EA7\u5728 feed \u91CC\u6CA1\u6709\u610F\u4E49\uFF0C\u538B\u5E73\u6210\u5C0F\u6807\u9898\u514D\u5F97\u76D6\u8FC7\u5361\u7247\u6807\u9898 */
  font-size: 0.95rem;
  font-weight: 600;
  margin: 1.1em 0 0.4em;
  color: var(--dark);
}

.bs-content img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.8em 0;
  border-radius: 5px;
}

.bs-content pre,
.bs-content .table-container,
.bs-content table {
  max-width: 100%;
  overflow-x: auto;
}

/* \u884C\u95F4\u516C\u5F0F\u592A\u957F\u65F6\u8BA9\u5B83\u81EA\u5DF1\u6A2A\u5411\u6EDA\uFF0C\u522B\u628A\u6574\u9875\u6491\u5BBD */
.bs-content .katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}

.bs-content blockquote {
  margin: 0.8em 0;
  font-size: 0.95em;
}
.bs-content ul,
.bs-content ol { margin: 0.6em 0; }

.bs-empty {
  color: var(--gray);
  font-size: 0.9rem;
  padding: 2rem 0;
  text-align: center;
}

@media all and (max-width: 600px) {
  .bs-item { padding: 0.85rem 0.9rem 1rem; }
  .bs-content { font-size: 0.88rem; }
}
`;

// plugins/bases-stream/src/generated/stream-code.ts
var stream_code_default = '"use strict";\n(() => {\n  // plugins/bases-stream/src/client/stream.ts\n  var FACET_COLLAPSE_AT = 10;\n  function el(tag, attrs = {}, ...children) {\n    const node = document.createElement(tag);\n    for (const [k, v] of Object.entries(attrs)) {\n      if (k === "class") node.className = v;\n      else node.setAttribute(k, v);\n    }\n    for (const c of children) node.append(c);\n    return node;\n  }\n  function asList(v) {\n    if (v === null || v === void 0 || v === "") return [];\n    if (Array.isArray(v)) return v.filter((x) => x !== null && x !== "").map(String);\n    return [String(v)];\n  }\n  function toNumber(v) {\n    if (v === null || v === void 0 || v === "") return null;\n    if (typeof v === "number") return Number.isFinite(v) ? v : null;\n    const n = Number(v);\n    return Number.isFinite(n) ? n : null;\n  }\n  function toTime(v) {\n    if (v === null || v === void 0 || v === "") return null;\n    const t = Date.parse(String(v));\n    return Number.isNaN(t) ? null : t;\n  }\n  function compare(a, b, kind) {\n    const aEmpty = a === null || a === void 0 || a === "";\n    const bEmpty = b === null || b === void 0 || b === "";\n    if (aEmpty && bEmpty) return 0;\n    if (aEmpty) return 1;\n    if (bEmpty) return -1;\n    if (kind === "number") {\n      const x = toNumber(a), y = toNumber(b);\n      if (x !== null && y !== null) return x - y;\n    }\n    if (kind === "date") {\n      const x = toTime(a), y = toTime(b);\n      if (x !== null && y !== null) return x - y;\n    }\n    const sa = Array.isArray(a) ? a.join(",") : String(a);\n    const sb = Array.isArray(b) ? b.join(",") : String(b);\n    return sa.localeCompare(sb, "zh-CN", { numeric: true });\n  }\n  var P = {\n    sort: "s",\n    dir: "d",\n    group: "g",\n    q: "q"\n  };\n  function readState(payload, ns) {\n    const sp = new URLSearchParams(location.search);\n    const defSort = payload.sort[0];\n    const state = {\n      q: sp.get(ns + P.q) ?? "",\n      facets: {},\n      min: {},\n      max: {},\n      sortKey: sp.get(ns + P.sort) ?? defSort?.key ?? "",\n      sortDir: sp.get(ns + P.dir) ?? defSort?.dir ?? "ASC",\n      groupKey: sp.get(ns + P.group) ?? payload.groupBy ?? ""\n    };\n    for (const p of payload.props) {\n      const f = sp.get(`${ns}f.${p.key}`);\n      if (f) state.facets[p.key] = f.split("~").filter(Boolean);\n      const lo = sp.get(`${ns}min.${p.key}`);\n      if (lo) state.min[p.key] = lo;\n      const hi = sp.get(`${ns}max.${p.key}`);\n      if (hi) state.max[p.key] = hi;\n    }\n    return state;\n  }\n  function writeState(payload, state, ns) {\n    const sp = new URLSearchParams(location.search);\n    const setOrDrop = (k, v, isDefault) => {\n      if (v && !isDefault) sp.set(k, v);\n      else sp.delete(k);\n    };\n    const defSort = payload.sort[0];\n    setOrDrop(ns + P.q, state.q, false);\n    setOrDrop(ns + P.sort, state.sortKey, state.sortKey === (defSort?.key ?? ""));\n    setOrDrop(ns + P.dir, state.sortDir, state.sortDir === (defSort?.dir ?? "ASC"));\n    setOrDrop(ns + P.group, state.groupKey, state.groupKey === (payload.groupBy ?? ""));\n    for (const p of payload.props) {\n      setOrDrop(`${ns}f.${p.key}`, (state.facets[p.key] ?? []).join("~"), false);\n      setOrDrop(`${ns}min.${p.key}`, state.min[p.key] ?? "", false);\n      setOrDrop(`${ns}max.${p.key}`, state.max[p.key] ?? "", false);\n    }\n    const qs = sp.toString();\n    history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname);\n  }\n  function isDefaultState(payload, state) {\n    const defSort = payload.sort[0];\n    return state.q === "" && state.sortKey === (defSort?.key ?? "") && state.sortDir === (defSort?.dir ?? "ASC") && state.groupKey === (payload.groupBy ?? "") && Object.values(state.facets).every((v) => v.length === 0) && Object.values(state.min).every((v) => !v) && Object.values(state.max).every((v) => !v);\n  }\n  function activeFilterCount(state) {\n    let n = state.q ? 1 : 0;\n    for (const v of Object.values(state.facets)) if (v.length > 0) n++;\n    for (const v of Object.values(state.min)) if (v) n++;\n    for (const v of Object.values(state.max)) if (v) n++;\n    return n;\n  }\n  function buildHaystack(row, item) {\n    const parts = [row.t, item?.textContent ?? ""];\n    for (const v of Object.values(row.v)) parts.push(asList(v).join(" "));\n    return parts.join(" ").toLowerCase();\n  }\n  function matches(row, state, props, haystack) {\n    if (state.q && !haystack.includes(state.q.toLowerCase())) return false;\n    for (const p of props) {\n      const selected = state.facets[p.key];\n      if (selected && selected.length > 0) {\n        const vals = asList(row.v[p.key]);\n        if (!selected.some((s) => vals.includes(s))) return false;\n      }\n      const lo = state.min[p.key];\n      const hi = state.max[p.key];\n      if (!lo && !hi) continue;\n      if (p.kind === "number") {\n        const n = toNumber(row.v[p.key]);\n        if (n === null) return false;\n        if (lo && n < Number(lo)) return false;\n        if (hi && n > Number(hi)) return false;\n      } else if (p.kind === "date") {\n        const t = toTime(row.v[p.key]);\n        if (t === null) return false;\n        if (lo && t < Date.parse(lo)) return false;\n        if (hi && t > Date.parse(hi) + 86399999) return false;\n      }\n    }\n    return true;\n  }\n  function facetValues(payload, key) {\n    const counts = /* @__PURE__ */ new Map();\n    for (const row of payload.entries) {\n      for (const v of asList(row.v[key])) counts.set(v, (counts.get(v) ?? 0) + 1);\n    }\n    return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN", { numeric: true }));\n  }\n  function buildFacet(ctx, p) {\n    const values = facetValues(ctx.payload, p.key);\n    if (values.length === 0) return null;\n    const section = el("section", { class: "bs-facet", "data-key": p.key });\n    const heading = el("h4", { class: "bs-facet-title" }, p.label);\n    section.append(heading);\n    if (p.kind === "number" || p.kind === "date") {\n      const inputType = p.kind === "number" ? "number" : "date";\n      const row = el("div", { class: "bs-range" });\n      const mk = (bound, placeholder) => {\n        const input = el("input", {\n          type: inputType,\n          class: "bs-range-input",\n          placeholder,\n          "aria-label": `${p.label} ${bound === "min" ? "\\u4E0B\\u9650" : "\\u4E0A\\u9650"}`\n        });\n        input.value = (bound === "min" ? ctx.state.min : ctx.state.max)[p.key] ?? "";\n        input.addEventListener("change", () => {\n          const target = bound === "min" ? ctx.state.min : ctx.state.max;\n          if (input.value) target[p.key] = input.value;\n          else delete target[p.key];\n          ctx.apply();\n        });\n        return input;\n      };\n      row.append(mk("min", "\\u6700\\u5C0F"), el("span", { class: "bs-range-dash" }, "\\u2013"), mk("max", "\\u6700\\u5927"));\n      section.append(row);\n      return section;\n    }\n    const list = el("div", { class: "bs-facet-values" });\n    const selected = new Set(ctx.state.facets[p.key] ?? []);\n    values.forEach(({ value, count }, idx) => {\n      const label = el("label", { class: "bs-facet-value" });\n      if (idx >= FACET_COLLAPSE_AT) label.classList.add("bs-overflow");\n      const box = el("input", { type: "checkbox", value });\n      if (selected.has(value)) box.checked = true;\n      box.addEventListener("change", () => {\n        const cur = new Set(ctx.state.facets[p.key] ?? []);\n        if (box.checked) cur.add(value);\n        else cur.delete(value);\n        if (cur.size > 0) ctx.state.facets[p.key] = [...cur];\n        else delete ctx.state.facets[p.key];\n        ctx.apply();\n      });\n      label.append(\n        box,\n        el("span", { class: "bs-facet-label" }, value),\n        el("span", { class: "bs-facet-count" }, String(count))\n      );\n      list.append(label);\n    });\n    section.append(list);\n    if (values.length > FACET_COLLAPSE_AT) {\n      const more = el(\n        "button",\n        { type: "button", class: "bs-more" },\n        `\\u5C55\\u5F00\\u5168\\u90E8 ${values.length} \\u9879`\n      );\n      more.addEventListener("click", () => {\n        const expanded = section.classList.toggle("bs-expanded");\n        more.textContent = expanded ? "\\u6536\\u8D77" : `\\u5C55\\u5F00\\u5168\\u90E8 ${values.length} \\u9879`;\n      });\n      section.append(more);\n    }\n    return section;\n  }\n  function buildPanel(ctx) {\n    const { payload, state, panel } = ctx;\n    panel.replaceChildren();\n    const header = el("div", { class: "bs-panel-header" });\n    header.append(el("h3", { class: "bs-panel-title" }, "\\u7B5B\\u9009\\u4E0E\\u6392\\u5E8F"));\n    const reset = el("button", { type: "button", class: "bs-reset" }, "\\u91CD\\u7F6E");\n    reset.addEventListener("click", () => {\n      const fresh = readStateDefaults(payload);\n      Object.assign(state, fresh);\n      buildPanel(ctx);\n      ctx.apply();\n    });\n    header.append(reset);\n    panel.append(header);\n    const search = el("input", {\n      type: "search",\n      class: "bs-search",\n      placeholder: "\\u5728\\u7ED3\\u679C\\u4E2D\\u641C\\u7D22\\u2026",\n      "aria-label": "\\u5728\\u7ED3\\u679C\\u4E2D\\u641C\\u7D22"\n    });\n    search.value = state.q;\n    let debounce;\n    search.addEventListener("input", () => {\n      window.clearTimeout(debounce);\n      debounce = window.setTimeout(() => {\n        state.q = search.value.trim();\n        ctx.apply();\n      }, 120);\n    });\n    panel.append(search);\n    const sortable = payload.props.filter((p) => p.sortable);\n    if (sortable.length > 0) {\n      const row = el("div", { class: "bs-sort" });\n      const select = el("select", { class: "bs-sort-key", "aria-label": "\\u6392\\u5E8F\\u5B57\\u6BB5" });\n      for (const p of sortable) {\n        const opt = el("option", { value: p.key }, p.label);\n        if (p.key === state.sortKey) opt.selected = true;\n        select.append(opt);\n      }\n      select.addEventListener("change", () => {\n        state.sortKey = select.value;\n        ctx.apply();\n      });\n      const dir = el("button", {\n        type: "button",\n        class: "bs-sort-dir",\n        "aria-label": "\\u5207\\u6362\\u5347\\u964D\\u5E8F"\n      });\n      const paintDir = () => {\n        dir.textContent = state.sortDir === "ASC" ? "\\u2191" : "\\u2193";\n        dir.title = state.sortDir === "ASC" ? "\\u5347\\u5E8F" : "\\u964D\\u5E8F";\n      };\n      paintDir();\n      dir.addEventListener("click", () => {\n        state.sortDir = state.sortDir === "ASC" ? "DESC" : "ASC";\n        paintDir();\n        ctx.apply();\n      });\n      row.append(el("span", { class: "bs-sort-label" }, "\\u6392\\u5E8F"), select, dir);\n      panel.append(row);\n    }\n    const groupable = payload.props.filter((p) => p.kind !== "number" && p.kind !== "date");\n    if (groupable.length > 0) {\n      const row = el("div", { class: "bs-sort" });\n      const select = el("select", { class: "bs-group-key", "aria-label": "\\u5206\\u7EC4\\u5B57\\u6BB5" });\n      select.append(el("option", { value: "" }, "\\u4E0D\\u5206\\u7EC4"));\n      for (const p of groupable) {\n        const opt = el("option", { value: p.key }, p.label);\n        if (p.key === state.groupKey) opt.selected = true;\n        select.append(opt);\n      }\n      select.addEventListener("change", () => {\n        state.groupKey = select.value;\n        ctx.apply();\n      });\n      row.append(el("span", { class: "bs-sort-label" }, "\\u5206\\u7EC4"), select);\n      panel.append(row);\n    }\n    for (const p of payload.props) {\n      if (!p.facet) continue;\n      const section = buildFacet(ctx, p);\n      if (section) panel.append(section);\n    }\n  }\n  function readStateDefaults(payload) {\n    const defSort = payload.sort[0];\n    return {\n      q: "",\n      facets: {},\n      min: {},\n      max: {},\n      sortKey: defSort?.key ?? payload.props.find((p) => p.sortable)?.key ?? "",\n      sortDir: defSort?.dir ?? "ASC",\n      groupKey: payload.groupBy ?? ""\n    };\n  }\n  function groupLabel(row, key) {\n    const vals = asList(row.v[key]);\n    return vals.length > 0 ? vals[0] : "\\u672A\\u5206\\u7C7B";\n  }\n  function render(ctx) {\n    const { payload, state, items, haystacks, feed, stream } = ctx;\n    const kindOf = new Map(payload.props.map((p) => [p.key, p.kind]));\n    const visible = payload.entries.filter(\n      (row, i) => matches(row, state, payload.props, haystacks[i])\n    );\n    if (state.sortKey || state.groupKey) {\n      const kind = kindOf.get(state.sortKey) ?? "text";\n      const sign = state.sortDir === "DESC" ? -1 : 1;\n      const groupSign = payload.groupDir === "DESC" ? -1 : 1;\n      visible.sort((a, b) => {\n        if (state.groupKey) {\n          const g = groupLabel(a, state.groupKey).localeCompare(\n            groupLabel(b, state.groupKey),\n            "zh-CN",\n            { numeric: true }\n          );\n          if (g !== 0) return g * groupSign;\n        }\n        if (state.sortKey) {\n          const c = compare(a.v[state.sortKey], b.v[state.sortKey], kind);\n          if (c !== 0) return c * sign;\n        }\n        return a.t.localeCompare(b.t, "zh-CN", { numeric: true });\n      });\n    }\n    const visibleSet = new Set(visible.map((r) => r.i));\n    for (let i = 0; i < items.length; i++) {\n      items[i].hidden = !visibleSet.has(i);\n    }\n    const frag = document.createDocumentFragment();\n    let lastGroup = null;\n    for (const row of visible) {\n      if (state.groupKey) {\n        const g = groupLabel(row, state.groupKey);\n        if (g !== lastGroup) {\n          lastGroup = g;\n          frag.append(\n            el("li", { class: "bs-group", role: "presentation" }, el("h2", {}, g))\n          );\n        }\n      }\n      frag.append(items[row.i]);\n    }\n    for (let i = 0; i < items.length; i++) {\n      if (!visibleSet.has(i)) frag.append(items[i]);\n    }\n    feed.replaceChildren(frag);\n    const count = stream.querySelector(".bs-count");\n    if (count) count.textContent = String(visible.length);\n    const empty = stream.querySelector(".bs-empty");\n    if (empty) empty.hidden = visible.length > 0;\n    const n = activeFilterCount(state);\n    ctx.panel.dataset.active = n > 0 ? String(n) : "";\n    const reset = ctx.panel.querySelector(".bs-reset");\n    if (reset) reset.disabled = isDefaultState(payload, state);\n    writeState(payload, state, ctx.ns);\n  }\n  function visibleStream() {\n    const all = [...document.querySelectorAll(".bs-stream")];\n    for (const s of all) {\n      const view = s.closest(".bases-view");\n      if (!view || view.classList.contains("is-active")) return s;\n    }\n    return null;\n  }\n  function namespaceOf(stream) {\n    const view = stream.closest(".bases-view");\n    const idx = view?.dataset.viewIndex;\n    return idx ? `v${idx}.` : "";\n  }\n  function bind() {\n    const panel = document.querySelector(".bs-controls");\n    if (!panel) return false;\n    const stream = visibleStream();\n    if (!stream) {\n      panel.replaceChildren();\n      panel.hidden = true;\n      return false;\n    }\n    const script = stream.querySelector(".bs-payload");\n    const feed = stream.querySelector(".bs-feed");\n    if (!script?.textContent || !feed) return false;\n    let payload;\n    try {\n      payload = JSON.parse(script.textContent);\n    } catch {\n      return false;\n    }\n    const items = [...feed.querySelectorAll(".bs-item")];\n    if (items.length !== payload.entries.length) return false;\n    panel.hidden = false;\n    const ctx = {\n      payload,\n      state: readState(payload, namespaceOf(stream)),\n      items,\n      haystacks: payload.entries.map((row, i) => buildHaystack(row, items[i])),\n      feed,\n      stream,\n      panel,\n      ns: namespaceOf(stream),\n      apply: () => render(ctx)\n    };\n    buildPanel(ctx);\n    render(ctx);\n    return true;\n  }\n  function setup() {\n    if (!document.querySelector(".bs-stream")) {\n      const panel = document.querySelector(".bs-controls");\n      if (panel) panel.hidden = true;\n      return;\n    }\n    bind();\n    const cleanups = [];\n    for (const btn of document.querySelectorAll(".bases-view-tabs button")) {\n      const onClick = () => setTimeout(bind, 0);\n      btn.addEventListener("click", onClick);\n      cleanups.push(() => btn.removeEventListener("click", onClick));\n    }\n    window.addCleanup?.(() => {\n      for (const fn of cleanups) fn();\n      const panel = document.querySelector(".bs-controls");\n      if (panel) {\n        panel.replaceChildren();\n        panel.hidden = true;\n      }\n    });\n  }\n  document.addEventListener("nav", setup);\n})();\n';

// plugins/bases-stream/src/index.tsx
var defaultOptions = {
  bodyProperty: "_bsBody"
};
function registerStreamView(opts) {
  viewRegistry.register({
    id: "stream",
    name: "\u4FE1\u606F\u6D41",
    icon: "rss",
    render: createStreamRenderer({ bodyProperty: opts.bodyProperty }),
    css: streamCss,
    afterDOMLoaded: stream_code_default
  });
}
registerStreamView(defaultOptions);
var BasesStream = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts };
  registerStreamView(opts);
  return {
    name: "BasesStream",
    htmlPlugins() {
      return [
        () => (tree, file) => {
          const fm = file.data.frontmatter;
          if (!fm) return;
          fm[opts.bodyProperty] = tree;
        }
      ];
    }
  };
};
var src_default = BasesStream;
export {
  src_default as default,
  viewRegistry
};
