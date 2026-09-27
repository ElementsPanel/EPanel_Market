# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## 插件详情与面板安装

公开详情接口 `GET /api/plugins/:id?version=1.0.0` 返回插件说明、已通过审核的
版本历史、最新版本 `latestVersion` 与选中版本 `selectedVersion`。省略 `version`
时选择最新版本；插件已下架、版本不存在或未通过审核时返回 404。

「最新版本」按**版本号**取，不按提交时间：规则同 semver（主体逐段按数字比较，缺的段当 0；
带预发布标记的低于对应正式版；构建元数据不参与），版本号相同时后提交的在前。版本历史、
不带 `version` 的下载与 `/files` 都用这个顺序（`compareVersions`，`server/services/plugins.ts`），
所以给旧版本线补发一个修复版，不会让面板的「安装最新版」降级。

首页列表 `GET /api/plugins` 分页返回（默认每页 12 条，`pageSize` 最多 48），带 `total`。
ElementsPanel 的插件市场页在浏览器里搜索、筛选，所以它的后端按 `total` 把每一页都取回来。

网站详情页 `/plugins/:id` 恒定展示最新已通过版本，分为自述、版本、更新三个页签：
自述是插件包里的 README.md（下节），版本按版本列出更新时间/大小/文件数并**各自带一个
下载按钮**，更新按版本列出各自的更新内容。点击版本行不会再切换页面，网页也不读写 URL
的 `version` —— 那个参数留给接口用。ElementsPanel 的 `/market/plugins/:pluginId` 仍用它
安装指定版本；安装时的 `/files` 与 `/file` 请求均携带该版本号。只允许下载已上架插件的
已通过版本。

## 插件包的两端与清单来源

发布方的开发工作区 `external/<name>/` 是两个彼此独立的半边：`panel/` 与 `daemon/` 各自带一份
`plugin.json`，各自描述自己那份插件。没有「工作区根目录的 plugin.json」这一步，编译也不会把
一份清单拆成两半——它读的是 `<side>/plugin.json`，逐端产出。产物包里首段路径就是端
（`panel/...`、`daemon/...`），下面各节写的 `<side>/` 指的就是它。

市场把一个包**当成一个插件**上架，所以清单、自述与图标都按同一个顺序解析：先看 `panel/`，
没有再看 `daemon/`（清单见 `server/utils/package-rules.ts` 的 `checkPluginPackage`，自述见
`readArtifactReadme`，图标见 `findArtifactIcon`）。两端各写各的清单，市场只取描述整包的那一份：
有 panel 端时以它为准，daemon-only 工作区则用 daemon 端那份。

## 上传包的内容规则

审核通过的包必须是面板和 daemon 装得上的包，所以上传时（`checkPluginPackage`）就按它们安装时
的检查把整个包查一遍，而不是等到安装时才报「非法路径」「空包」：

- 每个文件都在 `panel/` 或 `daemon/` 之下；出现的每一端都带自己的 `<side>/plugin.json`，且是
  JSON 对象。
- 清单里声明的入口（`backend`、`frontend`、`main`、`entry`、`panel`、`daemon`、`ui`）必须是这一端
  包里的文件，用 `/` 分隔的相对路径，不能跳出这一端。
- `elements`（兼容性声明，见下节）如果写了，`api` 与 `sdk` 必须是正整数。
- 路径段不能为空、不能是 `.`/`..`、不能含控制字符或 `:<>"|?*\`、不能以点或空格结尾、不能是
  Windows 设备名（`con`、`aux`、`com1`……）；包里不能自带 `.market-install.json`；只差大小写的
  两个路径算重复。
- 扩展名白名单与 ElementsPanel 的 `PLUGIN_PACKAGE_EXTENSIONS`（`common/src/plugin_package.ts`，
  daemon 安装时强制执行）一致，发布脚本里也有一份，三处要一起改。PNG 只能是某一端根目录的
  `icon.png`，并且确实是 PNG、不超过 1 MiB。

早先规则允许过的 `.ts`、`.vue` 与其它 PNG 仍然可以从已上架的旧包里读取，只是新包不再收。

## 插件自述与插件信息

**自述**取自包里某一端根目录的 `README.md`（文件名大小写不敏感；先 panel 端，再看 daemon 端，
与 plugin.json 的取用顺序一致；更深处的 readme.md 不算）。公开详情接口多返回两个字段：`readme`
是原文，`readmeHtml` 是渲染并净化后的 HTML —— 渲染放在服务端，页面直接用，不必把 markdown
渲染器搬进浏览器。自述是可选的，包里没有就是空串。渲染用 `marked` + `sanitize-html`，标签
白名单与面板的 `markdownToHTML` 完全一致（`server/utils/markdown.ts`，含列表项 `li` 与表头
`thead`），两边要一起改。

**插件信息**取自包里的 `<side>/plugin.json`，不再要求发布方额外提交一份 manifest：
包本来就是自描述的（`id` 是发布用的 slug，`displayName`/`summary`/`category`/`changelog`
是市场页面展示的字段）。取值顺序与原发布脚本一致：`name ← id`、
`displayName ← displayName ?? name ?? id`、`summary ← summary ?? description`。缺少
`panel/plugin.json` 与 `daemon/plugin.json` 的上传会被拒绝。

插件标识（`id`）须为 2-64 位小写字母、数字、下划线或连字符，以字母开头，不能是 Windows 设备名。
它同时是面板与 daemon 上的安装目录名，两个作者的同名插件没法装在同一台机器上，所以上传时会
拒绝别人已经用了的标识（409）。这道检查在上传这一步生效，数据库里的唯一索引仍是
`(author_id, name)`：本项目没有迁移机制，加一条全局唯一索引会让已经存在重名的库启动即失败。
所以两个作者同时首次上传同一个标识，理论上仍可能都写进去；库里原有的重名也不会被追认，
双方都能继续发布各自那个。

名称、简介、说明与分类是公开展示的内容，**只在审核通过时生效**：上传新版本不会改动已上架插件
的这些信息与「更新时间」；版本通过审核后，插件信息换成最新已通过版本包里的那一份；驳回不改变
任何公开内容。还没有任何版本通过审核的插件不公开，上传时照常更新。控制台的审核队列会列出
这个版本通过后会改变哪些信息。

## 插件图标

**图标**取自包里 `<side>/icon.png`（先 panel 端，再看 daemon 端，与 plugin.json、README.md
的取用顺序一致）。发布方在工作区根目录放一份 `icon.png`，编译时会放进包内优先读取的那一端。
公开接口 `GET /api/plugins/:id/icon?version=` 返回图片字节：只对上架、已通过审核的版本提供，
按文件头确认确实是 PNG 后才以 `image/png` + `nosniff` 返回，否则 404。

`PluginSummary.hasIcon` 表示最新已通过版本的包里有没有图标，列表卡片据此决定加载图片还是
回退到默认拼图图标；缺图标不是错误，页面只是显示默认图标。图标与端、自述一样从产物目录
推导，不存数据库字段。

## 插件端与按端下载
产物包用首段路径区分端（`panel/plugin.json`、`daemon/plugin.json`），两端都有就是
双端插件。端是从产物目录推导出来的，没有单独存字段——这个项目没有迁移机制，加列会
让已有的库静默缺列。

`PluginSummary.sides` 取最新已通过版本的端，供列表卡片展示；`PluginVersionSummary.sides`
是每个版本自己的端，版本行据此决定下载按钮要不要问端。两端齐了显示「双端插件」，
否则是「Panel插件」或「Daemon插件」。卡片与详情页都据此显示标识。

详情页的下载走 `GET /api/plugins/:id/download?version=&side=panel|daemon`（页头下最新
版，版本行下各自那一版）：
- 单端插件不用传 `side`，省略即取那唯一的一端；
- 双端插件必须传，否则返回 400——页头和版本行在这种情况下都会先弹出下拉让用户选端；
- 该版本不含请求的那一端时返回 404。

返回的 zip 只含这一端的文件，并且**去掉了首段的端前缀**（`panel/plugin.json` →
`plugin.json`），解压出来可以直接放进对应端的插件目录；文件名是
`<name>-<version>-<side>.zip`。打包用 `server/utils/zip.ts` 里自写的 STORE 模式
写入器，不压缩、不引第三方依赖。20 MiB 的上传上限决定了整包放进内存是安全的。

这与面板安装用的 `/files` + `/file` 是两条路：那条给面板逐文件拉取、自己写盘，这条
是给人从浏览器下载的，两者并存。

## 兼容性与完整性校验

编译脚本会在每一端的 `plugin.json` 里写上 `elements`：带前端的一端是 `{ "api": 1, "sdk": 1 }`，
只有后端的一端是 `{ "api": 1 }`；没有这个字段的是旧包。市场从产物读取它（不存数据库字段），
按端放进每个版本摘要的 `compatibility`，面板据此在安装前提示「需要其他版本的宿主」。

面板安装前取文件清单 `GET /api/plugins/:id/files?version=&pluginApi=1&pluginSdk=1`：

- 声明了兼容性的包只交给版本一致的客户端：`api` 必须等于 `pluginApi`，写了 `sdk` 的端还要
  等于 `pluginSdk`，否则返回 409。客户端给的版本号必须是正整数，不带这两个参数的旧客户端
  只能取没有声明的旧包。
- 返回里带 `compatibility`，`files` 的每一项带 `size` 与 `sha256`。面板把下载到的每个文件
  和它们比对，对不上就在写盘、分发到节点之前拒绝。摘要只能发现传坏、被截断的字节，并不能
  证明市场本身可信。

一个版本的产物写一次就不再改（上传写进新建的 versionId 目录，之后只会被整个删掉），所以从
产物推导出来的东西——端、图标、兼容性、文件摘要——都按产物目录缓存在内存里，`/files` 不会
每个请求都把整个包重新读一遍、哈希一遍。

## 发布令牌

ElementsPanel 的发布脚本（`npm run publish-plugin`）第一次上传时打开 `/connect?state=…`，
用户在市场登录并点「授权」后，脚本轮询 `GET /api/oauth/token` 换出一个 `epm_` 开头的长期令牌，
按市场地址分别存在本机。重复授权同一个 state（刷新后再点）什么也不改；别人已绑定或已过期的
state 返回 409。

令牌只能调用发布脚本需要的接口：上传（`POST /api/plugins/upload`）、查看自己的提交
（`GET /api/publisher/plugins`）、确认连接（`GET /api/oauth/me`）和吊销它自己
（`DELETE /api/oauth/token`，即脚本的 `--disconnect`）。控制台只认浏览器会话，管理员的令牌也
不能做管理操作。账号本人可以在「编辑资料」页查看、吊销名下的令牌
（`GET /api/account/tokens`、`DELETE /api/account/tokens/:id`）；被吊销的令牌再上传时返回 401，
脚本会重新走一遍授权。
