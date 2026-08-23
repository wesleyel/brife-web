import type { ViewRenderer } from "@quartz-community/bases-page/types";
export interface StreamOptions {
    /** 正文 hast 树挂在 frontmatter 的哪个键上 */
    bodyProperty: string;
}
export declare function createStreamRenderer(opts: StreamOptions): ViewRenderer;
