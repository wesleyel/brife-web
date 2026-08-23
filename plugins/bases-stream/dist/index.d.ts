import { viewRegistry } from "@quartz-community/bases-page";
import type { QuartzTransformerPlugin } from "@quartz-community/types";
export interface BasesStreamOptions {
    /** 正文 hast 树挂在 frontmatter 的哪个键上 */
    bodyProperty: string;
}
/**
 * 把每篇笔记渲染好的正文（hast 树）挂到 frontmatter 上，供 stream 视图整篇渲染。
 *
 * Bases 的 entry 只暴露 frontmatter，正文进不来，所以只能走这条路。
 * 树是引用，不做拷贝也不做修改——链接的重解析在渲染时按当前页做（见 stream-view）。
 *
 * order 必须排在最后：这时候 obsidian-flavored-markdown(30)、crawl-links(60)、
 * latex(80) 都已经处理完，树里是最终形态的 <img>、相对链接和渲染好的 KaTeX。
 */
declare const BasesStream: QuartzTransformerPlugin<Partial<BasesStreamOptions>>;
export default BasesStream;
export { viewRegistry };
