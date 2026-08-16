# Cloudflare 单一部署

本项目使用 Cloudflare Worker、Static Assets、D1 和 Vectorize。`wrangler.jsonc` 是唯一部署配置。

## 资源准备

需要 Node.js 20.19 或更新版本，以及已登录的 Wrangler。

```bash
npm install
npx wrangler login
npx wrangler d1 list
npx wrangler vectorize create stars-manager --dimensions=1536 --metric=cosine
```

将 D1 创建命令返回的 `database_id` 写入 `wrangler.jsonc` 的 `d1_databases[0]`。Vectorize 的维度必须与所选 Embedding 模型一致；上面的 1536 只是 OpenAI 兼容模型的常见示例。

AI 与 Embedding 上游必须是公网可访问的 HTTPS 地址；Cloudflare Worker 不访问 localhost、回环或私网地址。README 翻译同样通过 Worker 的 `/api/proxy/translate` 路由发出。

### Cloudflare Variables & Secrets

在 Worker 的 Settings → Variables & Secrets 中配置以下值。`wrangler.jsonc` 已启用 `keep_vars`，后续从仓库部署时会保留控制台中配置的变量。

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `ADMIN_USER` | Variable | Stars Manager 登录用户名 |
| `ADMIN_PASSWORD` | Secret | Stars Manager 登录密码 |
| `ADMIN_SESSION_SECRET` | Secret | HMAC 会话签名密钥，建议使用独立高熵值；未配置时回退使用 `ADMIN_PASSWORD` |
| `ENCRYPTION_KEY` | Secret，可选 | D1 敏感数据的 AES-256-GCM 加密密钥；未配置时使用 `ADMIN_PASSWORD` |

也可以用 Wrangler 设置 Secret：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ENCRYPTION_KEY
```

`ENCRYPTION_KEY` 如果配置，必须长期保存，丢失后无法解密 D1 中已有的 GitHub、AI、Embedding 与 MCP 密钥。未配置时 Worker 使用 `ADMIN_PASSWORD` 作为加密密钥；如果之后再设置或更改 `ENCRYPTION_KEY`，原有数据将无法用新密钥解密。登录成功后，页面才会提交 GitHub Personal Access Token；Worker 会先向 GitHub 验证它，再加密写入 D1，浏览器不会持久化 GitHub Token。

## 本地开发

```bash
cp .dev.vars.example .dev.vars
```

在 `.dev.vars` 中填写 `ADMIN_USER`、`ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET`；`ENCRYPTION_KEY` 可选，然后运行：

```bash
npm run cf:dev
```

首次本地运行会应用 D1 migration 并启动同源 Worker。Vectorize 本地行为由 Wrangler 模拟；生产索引仍需预先创建。

## 检查与发布

```bash
npm run cf:check
npm run cf:migrate:remote
npm run cf:deploy
```

数据库变更应先迁移再发布应用。健康检查与其他 `/api/*` 接口一样需要登录会话。登录页面使用 `ADMIN_USER` / `ADMIN_PASSWORD`，无需再输入 Cloudflare Workspace Access Key。

部署步骤是：创建或绑定 D1 与 Vectorize，应用远程 migration，在 Cloudflare Variables & Secrets 中配置上表变量，然后运行 `npm run cf:deploy`。不需要修改前端代码，也不要把账号、密码或 GitHub Token 写入仓库。

## MCP

在设置中启用后，MCP 客户端连接：

```text
https://YOUR_DOMAIN/mcp
```

只支持无状态 `POST /mcp` Streamable HTTP，并使用独立的 MCP Bearer Token。项目不提供 SSE、Electron 或本地进程端点。
