/**
 * 样式以字符串形式挂在视图注册和组件上（Quartz 会去重后注入一次）。
 * 颜色一律走 Quartz 主题变量，跟着 darkmode 走。
 */

export const streamCss = `
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
  /* 卡片是笔记全文，一页上百张的话 DOM 很重（KaTeX 尤其啰嗦）。
     让浏览器跳过视口外卡片的渲染，滚到了再算；Ctrl+F 和 textContent 不受影响。 */
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

/* 卡片正文就是笔记全文，样式跟着站点主样式走，只压一点字号和留白 */
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
  /* 笔记里的标题层级在 feed 里没有意义，压平成小标题免得盖过卡片标题 */
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

/* 行间公式太长时让它自己横向滚，别把整页撑宽 */
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
`

export const controlsCss = `
.bs-controls[hidden] { display: none; }
.bs-controls {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  font-size: 0.85rem;
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bs-panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.bs-panel-title {
  margin: 0;
  font-size: 1rem;
}
.bs-reset {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.78rem;
  color: var(--secondary);
  cursor: pointer;
  font-family: inherit;
}
.bs-reset:disabled { color: var(--gray); cursor: default; }

.bs-search,
.bs-sort select,
.bs-range-input {
  font-family: inherit;
  font-size: 0.82rem;
  color: var(--darkgray);
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 5px;
  padding: 0.3rem 0.45rem;
  min-width: 0;
}
.bs-search { width: 100%; }
.bs-search:focus-visible,
.bs-sort select:focus-visible,
.bs-range-input:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -1px;
}

.bs-sort {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.bs-sort-label {
  flex: 0 0 2.2rem;
  color: var(--gray);
  font-size: 0.78rem;
}
.bs-sort select { flex: 1 1 auto; }
.bs-sort-dir {
  flex: 0 0 auto;
  width: 1.9rem;
  height: 1.75rem;
  border: 1px solid var(--lightgray);
  border-radius: 5px;
  background: var(--light);
  color: var(--darkgray);
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
}
.bs-sort-dir:hover { border-color: var(--gray); }

.bs-facet {
  border-top: 1px solid var(--lightgray);
  padding-top: 0.7rem;
}
.bs-facet-title {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--secondary);
}
.bs-facet-values {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.bs-facet-value {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  padding: 0.1rem 0;
  line-height: 1.4;
}
.bs-facet-value input { margin: 0; flex: 0 0 auto; accent-color: var(--secondary); }
.bs-facet-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
}
.bs-facet-count {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: var(--gray);
  font-variant-numeric: tabular-nums;
}

.bs-facet .bs-overflow { display: none; }
.bs-facet.bs-expanded .bs-overflow { display: flex; }
.bs-more {
  margin-top: 0.3rem;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 0.75rem;
  color: var(--secondary);
  cursor: pointer;
}

.bs-range {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.bs-range-input { flex: 1 1 0; width: 100%; }
.bs-range-dash { color: var(--gray); flex: 0 0 auto; }
`
