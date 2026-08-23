import path from "path"
import { FilePath } from "./path"
import { globby } from "globby"

export function toPosixPath(fp: string): string {
  return fp.split(path.sep).join("/")
}

export async function glob(
  pattern: string,
  cwd: string,
  ignorePatterns: string[],
): Promise<FilePath[]> {
  const fps = (
    await globby(pattern, {
      cwd,
      ignore: ignorePatterns,
      // 相对上游改动：上游是 true。本仓库的 content/ 是构建产物、写在 .gitignore 里，
      // 开着的话 globby 会把整个 content/ 当成被忽略的文件，一篇都扫不到。
      // 内容本身是 scripts/sync-content.sh 用白名单 rsync 出来的，不需要再靠 gitignore 过滤；
      // 要排除什么就写进 quartz.config.yaml 的 ignorePatterns。
      gitignore: false,
    })
  ).map(toPosixPath)
  return fps as FilePath[]
}
