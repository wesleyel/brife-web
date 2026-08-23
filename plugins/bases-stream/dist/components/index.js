// plugins/bases-stream/src/styles.ts
var controlsCss = `
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
`;

// plugins/bases-stream/src/components/index.tsx
import { jsx } from "preact/jsx-runtime";
var BasesControls = () => {
  const Controls = ({ displayClass }) => {
    return /* @__PURE__ */ jsx(
      "div",
      {
        class: ["bs-controls", displayClass].filter(Boolean).join(" "),
        hidden: true,
        "aria-label": "\u7B5B\u9009\u4E0E\u6392\u5E8F"
      }
    );
  };
  Controls.css = controlsCss;
  return Controls;
};
export {
  BasesControls
};
