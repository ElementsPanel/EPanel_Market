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

网站详情页 `/plugins/:id` 恒定展示最新已通过版本，分为概览、版本、更新三个页签：
概览是插件说明，版本按版本列出更新时间/大小/文件数并**各自带一个下载按钮**，更新按
版本列出各自的更新内容。点击版本行不会再切换页面，网页也不读写 URL 的 `version`
——那个参数留给接口用。ElementsPanel 的 `/market/plugins/:pluginId` 仍用它安装指定
版本；安装时的 `/files` 与 `/file` 请求均携带该版本号。只允许下载已上架插件的已通过
版本。

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
