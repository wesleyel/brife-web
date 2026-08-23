import { viewRegistry } from "@quartz-community/bases-page"
import type { QuartzTransformerPlugin } from "@quartz-community/types"
import type { Root } from "hast"
import { createStreamRenderer } from "./stream-view"
import { streamCss } from "./styles"
import streamClient from "./generated/stream-code"

export interface BasesStreamOptions {
  /** 正文 hast 树挂在 frontmatter 的哪个键上 */
  bodyProperty: string
}

const defaultOptions: BasesStreamOptions = {
  bodyProperty: "_bsBody",
}

function registerStreamView(opts: BasesStreamOptions) {
  viewRegistry.register({
    id: "stream",
    name: "信息流",
    icon: "rss",
    render: createStreamRenderer({ bodyProperty: opts.bodyProperty }),
    css: streamCss,
    afterDOMLoaded: streamClient,
  })
}

// 模块被 import 的那一刻就注册，保证 bases 页渲染时视图一定在。
// 之后 factory 拿到 YAML 里的 options 会再注册一次覆盖掉（register 是按 id 替换的）。
registerStreamView(defaultOptions)

/**
 * 把每篇笔记渲染好的正文（hast 树）挂到 frontmatter 上，供 stream 视图整篇渲染。
 *
 * Bases 的 entry 只暴露 frontmatter，正文进不来，所以只能走这条路。
 * 树是引用，不做拷贝也不做修改——链接的重解析在渲染时按当前页做（见 stream-view）。
 *
 * order 必须排在最后：这时候 obsidian-flavored-markdown(30)、crawl-links(60)、
 * latex(80) 都已经处理完，树里是最终形态的 <img>、相对链接和渲染好的 KaTeX。
 */
const BasesStream: QuartzTransformerPlugin<Partial<BasesStreamOptions>> = (userOpts) => {
  const opts: BasesStreamOptions = { ...defaultOptions, ...userOpts }
  registerStreamView(opts)

  return {
    name: "BasesStream",
    htmlPlugins() {
      return [
        () => (tree: Root, file: { data: Record<string, unknown> }) => {
          const fm = file.data.frontmatter as Record<string, unknown> | undefined
          if (!fm) return
          fm[opts.bodyProperty] = tree
        },
      ]
    },
  }
}

export default BasesStream
export { viewRegistry }
