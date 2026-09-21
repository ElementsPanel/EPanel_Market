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

网站详情页 `/plugins/:id` 可选择版本查看更新说明与文件大小，并通过 URL 中的
`version` 保留选择。ElementsPanel 的 `/market/plugins/:pluginId` 使用同一接口，
在详情页安装所选版本；安装时的 `/files` 与 `/file` 请求均携带该版本号。
只允许下载已上架插件的已通过版本。
