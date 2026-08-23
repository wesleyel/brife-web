# brife-web

把 [brife](https://github.com/wesleyel/brife) 这个 Obsidian vault 发成静态站点。基于 Quartz 5，部署在 Cloudflare Pages。

在原版 Quartz 之上做了三件事：

1. **vault → content/ 的同步**，vault 本身不动一个字节；`content/` 是构建产物，不提交
2. **插件编译产物提交进仓库**，CI 上不 clone、不 build 插件
3. **给 Obsidian Bases 加了 `stream` 视图**：中间栏是全文信息流，右侧栏是筛选/排序控件

部署链路跑在 **brife 仓库**里：笔记一提交就触发 workflow，它 clone 本仓库当构建工具，编译完直接上传 CF Pages。所以本仓库里没有任何笔记内容，CF 也不需要访问私有的 brife。

---

## 快速开始

```bash
npm ci                  # 安装依赖（用 npmjs 官方源，见下方「镜像源」）
npm run build           # 同步 vault + 构建 → public/
npm run dev             # 本地起服务，http://localhost:8080
```

`build` / `dev` 的 pre 钩子会自动跑 `install-plugins` 和 `sync`，所以平时一条命令就够。改了 `plugins/` 下的代码才需要额外跑一次编译：

| 命令 | 做什么 |
| --- | --- |
| `npm run sync` | vault → `content/`，然后归一化 `.base` 表达式 |
| `npm run plugins:build` | 编译 `plugins/` 下的本地插件到各自 `dist/`（含类型检查） |
| `npm run build` | 同步 + Quartz 构建 → `public/` |
| `npm run refresh` | 重编插件再构建（改了插件代码之后用这个） |
| `npm run test:site` | 跑 `scripts/` 下的单元测试 |

vault 路径默认是 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/brife`，用环境变量覆盖：

```bash
VAULT=/path/to/vault npm run build
```

---

## 目录

```
content/          从 vault 同步来的构建输入（不提交，每次构建重新生成）
overlay/          只属于站点、不属于 vault 的文件，覆盖在同步结果之上
plugins/          本地 Quartz 插件源码 + 编译产物 dist/
scripts/          同步、插件编译、.base 归一化、CF 资产拷贝
ci/               给 brife 仓库用的 workflow 模板
cf/               Cloudflare Pages 的 _headers
.quartz/          插件索引与软链接（提交进仓库，见下）
quartz/           Quartz 5 上游源码（upstream remote 保留着，可以 merge 更新）
```

`overlay/` 里现在有两个文件：站点首页 `index.md`，和站点专用的 `错题流.base`。vault 里那份 `exercises/错题.base` 由 Obsidian 手工维护，这边不碰。

---

## 一、内容同步

`scripts/sync-content.sh` 用 rsync 把 vault 拷进 `content/`，然后把 `overlay/` 盖上去。来源就是一个目录：本地是 iCloud 里的 Obsidian 目录，CI 上是 brife 仓库的 checkout 目录（`VAULT=$GITHUB_WORKSPACE/vault`）。

rsync 带 `-t` 保留 mtime：`content/` 不是 git 仓库，`created-modified-date` 插件取不到 git 时间，会退回文件系统时间。

### 改过上游一行：`quartz/util/glob.ts`

`content/` 写进 `.gitignore` 之后，Quartz 会**一篇文件都扫不到**——它的文件发现用的是 `globby({ gitignore: true })`，会把整个 `content/` 当成被忽略的东西跳过。所以那里改成了 `gitignore: false`。

这不会漏过滤：`content/` 是 `sync-content.sh` 用白名单 rsync 出来的，要排除什么写进 `quartz.config.yaml` 的 `ignorePatterns` 即可。merge 上游时注意这一处冲突。

### `.base` 表达式归一化（重要）

同步的最后一步会跑 `scripts/normalize-bases.mjs`，把 `.base` 里的**中文属性名改写成 `note["…"]` 形式**：

```yaml
# vault 里写的
filters: { and: [复习 == 0] }
# content/ 里变成
filters: { and: ['note["复习"] == 0'] }
```

为什么必须做：bases-page 的表达式词法分析器只认 ASCII 标识符（`isIdentifierStart` 里只有 `A-Za-z_$`），`复习 == 0` **不会报错**，而是静默求值为 `undefined`，整个视图变空。本仓库的 frontmatter 全是中文键，不改写的话 `exercises/错题.base` 里「没复习过 / 知识空白 / 方法缺失」三个视图在站点上全是空的。

只改 `filters` 和 `formulas` 里的表达式；`order` / `sort` / `groupBy` 存的是属性路径，走另一套解析，中文本来就正常，碰了反而会坏。改写是幂等的，反复跑不会套两层。单测在 `scripts/normalize-bases.test.mjs`。

---

## 二、为什么 `.quartz/` 要提交

Quartz 5 的插件装在 `.quartz/plugins/` 下，上游把这个目录 gitignore 了。它的 `installPlugin`（`quartz/plugins/loader/gitLoader.ts`）对三种来源的行为不一样：

| 来源 | 行为 | 是否触网 |
| --- | --- | --- |
| npm 包（`@quartz-community/*`） | 直接用 `node_modules/`，只重新生成索引 | 否，`npm ci` 已装好 |
| `github:user/repo` | `git clone` + `npm install` + `npm run build` | **是** |
| 本地路径（`./plugins/x`） | 只建一个软链接，不装不编 | 否 |

所以本仓库的做法是：

- 所有第三方插件走 **npm 包**，不用 `github:` 来源
- 自己的插件走 **本地路径**，编译产物 `plugins/*/dist/` 提交进仓库
- `.quartz/` 整个提交，其中 `bases-stream` 是一条**相对**软链接（`../../plugins/bases-stream`），换台机器 checkout 出来照样指得对

结果是 CI 上的 `npm run build` 里一个 `git clone` 都没有：`install-plugins` 只是重建软链接、重新生成 `.quartz/plugins/index.ts`，全程离线，秒级完成。

以后如果真的加了 `github:` 来源的插件，把它 clone+build 出来的 `.quartz/plugins/<name>/` 一起提交即可 —— `installPlugin` 看到目录已存在就直接返回，不会重新 clone。

### 本地插件为什么要自己写编译脚本

因为 loader 对本地插件**只做软链接，不跑 `npm run build`**，插件目录里不能有自己的 `node_modules` 和构建步骤。`scripts/build-plugins.mjs` 直接借用顶层已经装好的 esbuild + tsc：

1. `src/client/*.ts` → 打成 IIFE → 写进 `src/generated/*-code.ts`（Quartz 的 `afterDOMLoaded` 收的是一段 JS 源码字符串）
2. `src/index.tsx` 和 `src/components/index.tsx` → esbuild 打包到 `dist/`，preact、`@quartz-community/*`、`hast-util-to-jsx-runtime` 保持 external（必须和宿主共用同一个实例）
3. `tsc -p` 出 `.d.ts` 并做类型检查 —— `regeneratePluginIndex` 要读 `dist/index.d.ts`，读不到会跳过这个插件

---

## 三、bases-stream 插件

`plugins/bases-stream/`，在 `@quartz-community/bases-page` 之上加了：

- 一个 **`stream` 视图**：注册进 bases-page 的 `viewRegistry`，中间栏把每条笔记**整篇**渲染成卡片（题图、公式、表格都在）
- 一个 **右侧栏组件 `BasesControls`**：搜索框、排序、分组、facet 多选、数值/日期区间
- 一个 **transformer**：把每篇笔记渲染好的 hast 树挂到 frontmatter 上，供视图取用

### 全文是怎么进到卡片里的

Bases 的 entry 只暴露 frontmatter，正文进不来。所以 transformer 在所有其它插件之后（order 85）把整棵 hast 树挂到 `frontmatter._bsBody` 上 —— 这时 wiki-link、题图、KaTeX 都已经处理完了。

视图渲染时用 `hast-util-to-jsx-runtime` 把树转成 JSX。**树本身不做任何修改**：正文里的链接是 crawl-links 按「笔记自己那一页」算出的相对路径，直接搬到 bases 页上层级就错了，所以 `a` / `img` 走自定义组件，在渲染时按当前页重新解析一遍（相对 → full slug → 相对，这条往返是可逆的，因为 `transformLink` 永远返回相对路径）。笔记内部的标题 `id` 会去掉，一页上百张卡片否则会撞 id。

### 数据是怎么流的

服务端把整个 feed 渲染成静态 HTML（**没有 JS 也能正常阅读**），同时在页面里塞一个 `<script type="application/json">` 载荷，里面只有属性值——正文已经在 DOM 里了，搜索直接读 `textContent`，不重复塞一份。

右侧栏组件服务端只渲染一个 `hidden` 的空壳；客户端脚本读载荷、建控件、填进空壳，然后按筛选结果重排 `<ol>` 的子节点。这样服务端完全不需要判断「当前页是不是 bases 页、有没有 stream 视图」—— 没有 stream 的页面上壳子保持 hidden，既不占位也不进无障碍树。

筛选状态同步进 URL query（`?v0.f.错因=知识空白`），可以直接分享一个筛过的信息流。参数按视图序号加前缀，同一页多个 stream 视图互不干扰。

### 页面重量

全文卡片的 DOM 很大（KaTeX 尤其啰嗦）：90 条错题的信息流原始 HTML 约 3MB，但 brotli 之后只有 ~50KB，传输不是问题。真正的成本是 DOM 渲染，所以卡片上加了 `content-visibility: auto`，视口外的卡片浏览器直接跳过。图片一律 `loading="lazy"`。

条目再多的话，在 `.base` 的视图里加 `limit: 50` 截断。

### 在 `.base` 里用

```yaml
views:
  - type: stream
    name: 信息流
    date: 录入          # 卡片上显示哪个日期字段
    chips: [卷子, 错因]  # 卡片头部出哪些 chip（不写就用 facets 里的非日期项）
    facets: [卷子, 知识点, 错因, 评分]   # 右侧栏出哪些筛选控件
    groupBy: { property: 卷子, direction: DESC }
    sort:
      - { property: 录入, direction: DESC }
```

`chips` / `facets` 是本插件加的扩展字段，Obsidian 会忽略它们，不影响 vault 里正常用。

`facets` 不写时会从 `order` 里自动推断：数值/日期一律可筛，文本/多值要求唯一值 ≤ 40（再多就是自由文本，筛不动）。

---

## 四、部署

CI 跑在 **brife 仓库**里，不是这里。理由：笔记一提交就该重新部署，而工作流跑在 brife 里的话内容天然就在工作区，不用为了拿私有仓库的内容再配一套凭据。

```
brife (push)
  └─ .github/workflows/deploy.yml
       ├─ checkout brife          → vault/
       ├─ checkout brife-web      → site/
       ├─ npm ci && npm run build （VAULT=…/vault）
       └─ wrangler pages deploy site/public
```

### 步骤

1. **把本仓库推到 GitHub。** 里面没有任何笔记内容，设成公开仓库最省事（省掉下面的 `BRIFE_WEB_TOKEN`）。

2. **建 CF Pages 项目**（一次性，直接上传模式，不接 Git）：

   ```bash
   npx wrangler pages project create brife --production-branch=main
   ```

3. **把 `ci/brife-deploy.yml` 复制到 brife 仓库**的 `.github/workflows/deploy.yml`。

4. **在 brife 仓库配 secrets：**

   | Secret | 说明 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 权限选 “Cloudflare Pages: Edit” |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 控制台右下角 |
   | `BRIFE_WEB_TOKEN` | 只有 brife-web 是私有仓库时才需要（有 repo 读权限的 PAT） |

5. push 一次笔记，或者在 Actions 里手动 `workflow_dispatch` 触发。

改站点本身（样式、插件、配置）只要往 brife-web 推就行，但**那不会自动触发部署**——部署由 brife 的 push 触发。想立刻生效就去 brife 的 Actions 里手动跑一次。

`cf/_headers` 会由 `postbuild` 钩子拷进 `public/`：给带内容哈希的 css/js 设永久缓存，题图设一天。

站点域名定了之后记得改 `quartz.config.yaml` 里的 `baseUrl`（现在是占位的 `brife.pages.dev`）。

---

## 镜像源

`.npmrc` 里把 registry 指到了 npmjs 官方源。npmmirror 缺 `@quartz-community/*` 的部分包（`roam` 等的 tarball 是 404），走镜像装不上。

---

## 踩过的坑

- **`.base` 里的中文属性名**：见上面「表达式归一化」。这是最坑的一个，因为它静默失败。
- **`content/` 一进 `.gitignore`，Quartz 就扫不到文件**：`globby({ gitignore: true })`。已经改掉上游那一行，见上。同样是静默失败——只会说 “Found 0 input files”。
- **`layout.byPageType.*.exclude` 要写完整包名**：它匹配的是 `extractPluginName(source)`，对 npm 插件来说就是 `@quartz-community/graph` 这样的完整字符串，写短名 `graph` 不生效（上游默认配置里的 `exclude: [reader-mode]` 同样是失效的）。
- **`byPageType.*.positions` 只能清空，不能添加**：非空数组会被忽略。想让组件只在某类页面出现，得靠组件自己判断然后返回 `null`，或者像本插件这样交给客户端决定。
- **`file.inFolder("exercises/math")` 会连 `exercises/math.md` 一起匹配**：路径前缀匹配。用 `file.hasProperty("卷子")` 之类的条件把索引文件挡掉。
- **dev server 不 watch 插件**：`quartz build --serve` 只监听 `content/`，改了 `plugins/` 下的代码要重跑 `npm run plugins:build` 并重启 dev server。

---

## 更新 Quartz

上游 remote 保留着：

```bash
git fetch upstream
git merge upstream/v5
npm install
npm run plugins:build   # 插件依赖 bases-page 的 API，上游大改后重编一次
```

本仓库对上游源码只有一处改动：`quartz/util/glob.ts` 里的 `gitignore: false`（原因见上）。merge 时留意。
