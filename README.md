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

## 注册与邮件设置

新用户注册后会收到一封验证邮件，链接 24 小时内有效，只能使用一次；完成验证后才能登录。
未收到邮件时，在登录弹窗填写注册时的邮箱与密码并点击登录，再使用「重新发送验证邮件」。
同一邮箱每分钟最多发送一次、每小时最多五次。注册、验证、重发及设置操作的结果都通过 toast 提示。

首次初始化时填写站点对外地址与邮件配置；已初始化的网站由管理员进入「控制台 → 邮件设置」配置：

- **SMTP**：支持 SSL/TLS、STARTTLS 和不加密连接，填写主机、端口、用户名、密码及发件人。
- **邮件 API**：内置 Resend 预设；自定义接口需接受 Resend 格式的 JSON（`from`、`to` 数组、
  `subject`、`html`、`text`），使用 `Authorization: Bearer <密钥>` 认证。
- **测试邮件**：按当前表单内容发送到当前管理员邮箱，测试不会保存设置；确认后点击「保存设置」。

站点对外地址用于生成验证链接。配置存放在原有的 `data/` 配置文件内；接口不会返回已保存的
密码和密钥，连接参数不变时留空即可保留。Resend 需使用已验证域名的发件地址。

升级会自动为 SQLite / PostgreSQL 增加邮箱验证字段与令牌表，已有账号和初始化管理员继续可用。
邮件尚未配置时新注册会给出提示，管理员仍可登录后配置。更换个人邮箱也需要验证新邮箱，
确认前保留原绑定，确认后须重新登录。新增的 SMTP 依赖 `nodemailer` 已写入依赖清单与 `bun.lock`。

## npm 插件索引与安装

市场从 npm registry 搜索 `epanel-plugin-*`（包括 scoped 包），缓存插件信息和版本历史。
使用 `EPANEL_MARKET_NPM_REGISTRY` 指定 registry，`EPANEL_MARKET_NPM_SYNC_INTERVAL` 指定同步间隔
（毫秒，默认 30 分钟，最短 1 分钟）。插件包通过 `npm publish` 发布，市场同步后展示。

公开列表接口为 `GET /api/plugins`，详情接口为 `GET /api/plugins/:id?version=1.0.0`。
详情包含简介、README、版本历史、`latestVersion` 与 `selectedVersion`；网页展示最新版，
面板可通过接口选择安装版本。README 来自 npm packument，由服务端渲染并净化后返回
`readmeHtml`。市场展示 npm 链接，面板将包安装到项目依赖中；市场不托管插件文件。

## 元数据统一放在 package.json

插件的简介、展示名称、作者、分类等信息只写在插件根目录的 `package.json`。
npm registry 的版本文档就是该版本发布的 `package.json`；市场优先使用 `dist-tags.latest`
指向版本的字段，缺少的字段回退到 registry 的包级信息。各端 `plugin.json` 仅用于执行入口。

```json
{
  "name": "epanel-plugin-example",
  "version": "0.1.0",
  "displayName": "Example Plugin",
  "description": "插件简介，列表摘要取前 200 个字符。",
  "author": "Example Author",
  "license": "Apache-2.0",
  "homepage": "https://example.com",
  "repository": { "type": "git", "url": "https://github.com/example/plugin" },
  "keywords": ["epanel", "tools"],
  "changelog": "该版本的更新说明。",
  "elementspanel": {
    "id": "example",
    "category": "tools",
    "panel": {
      "directory": "panel",
      "folder": "example",
      "priority": 100,
      "frontendInject": ["console", "i18n"],
      "styles": ["frontend/assets/style.css"]
    },
    "daemon": { "directory": "daemon", "folder": "example", "priority": 100 }
  }
}
```

- `name` 是 npm 包名，须匹配 `epanel-plugin-*` 或 `@scope/epanel-plugin-*`。
- `elementspanel.id` 是插件标识，未写时从包名去掉 scope 与前缀推导；须为 2–64 位，
  以小写字母开头，后接小写字母、数字、下划线或连字符。
- 展示名称取 `displayName`，未写时使用插件标识。`description` 是唯一的插件简介。
- 作者取 `author`，缺少时使用 npm maintainer / publisher；分类取 `elementspanel.category`，
  未写时从 `keywords` 中选择第一个非通用标签。
- 每个版本的更新说明取该版本的 `changelog`，也兼容 `elementspanel.changelog`。
- `elementspanel.panel` / `elementspanel.daemon` 声明支持的端、端目录与资源目录名。
  `priority`、`frontendInject`、`frontendImmediate`、`frontendRequired`、兼容性 `elements`、
  默认配置和生成的 CSS 路径都属于 package.json 中的端专属元数据。

两端都有声明时展示“双端插件”，只有一端时展示对应端标识。版本历史分别读取各版本的端声明。
市场统一使用默认插件图标。

## plugin.json 只保留标识和执行入口

双端插件的 `panel/plugin.json` 示例：

```json
{
  "id": "example",
  "version": "0.1.0",
  "dual": true,
  "backend": "backend/index.cjs",
  "frontend": "frontend/index.js"
}
```

`daemon/plugin.json` 使用相同的 `id`、`version` 和 `dual`，只声明后端入口；
单端插件可以省略 `dual`。简介、名称、作者、加载顺序、前端依赖、CSS 路径及兼容性声明
都不写入 plugin.json。插件根目录的版本号与各端清单的版本号须保持一致。

## 第三方插件工作区

通过 ElementsPanel 的 npm 初始化器安装项目后：

```sh
npm run setup -- example --both
npm run build -- example
npm run pub -- example
```

工作区位于 `external/example/`，根 `package.json` 存放整包元数据与各端声明，
`panel/plugin.json` 和 `daemon/plugin.json` 存放标识及执行入口。构建时同步清单版本号与入口，
生成的样式路径写入 `package.json.elementspanel.panel.styles`。单端插件使用 `--panel` 或
`--daemon`，默认是 panel 端。

运行包通过 npm dependencies 安装内置插件。面板的插件市场和插件管理都通过 npm 安装、更新和卸载插件依赖，插件管理也支持直接输入 npm 包名及版本号或 tag，并选择面板或守护节点。
页面中新装插件会自动启用，更新保留原有开关；外部 `npm install` 新增的插件依赖也会被自动发现。已有显式映射的工作区插件沿用原有默认状态，构建完成后在插件管理中启用。
非核心插件的后端与浏览器资源随依赖变化动态更新；核心服务更新后仍需重启。卸载保留用户配置，用户启用状态和配置保存在各运行目录的 `data/plugin-overrides.json`。
发布者在 npm 管理包版本及权限，更新元数据后须发布新版本，等待市场下次同步。
