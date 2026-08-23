import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import { controlsCss } from "../styles"

/**
 * 右侧栏的筛选/排序面板。
 *
 * 这里只渲染一个空壳：控件由 stream 视图的客户端脚本按页面上实际的
 * 数据填充。这样服务端不需要知道当前页是不是 bases 页、有没有 stream 视图——
 * 没有 stream 的页面上壳子保持 hidden，不占位也不出现在无障碍树里。
 */
export const BasesControls: QuartzComponentConstructor = () => {
  const Controls: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
    return (
      <div
        class={["bs-controls", displayClass].filter(Boolean).join(" ")}
        hidden
        aria-label="筛选与排序"
      />
    )
  }

  Controls.css = controlsCss
  return Controls
}
