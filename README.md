# Stars Manager

> 用一个页面整理 GitHub Star。

[English README](README_en.md) · [Cloudflare 部署说明](CLOUDFLARE.md)

Stars Manager 是一个运行在 Cloudflare 上的 GitHub Star 管理台。React 页面、认证 API、GitHub 代理、AI 配置、D1 和 Vectorize 都由同一个 Worker 提供。登录后可以在浏览器中管理 Star、Gist、Release 和 Fork。

界面默认使用中文，登录页可以切换 English。生产版本只运行在 Cloudflare Worker 上，不依赖 Electron、Express、Docker、本地后端或浏览器直连服务。

## 功能总览

| 模块 | 能力 |
| --- | --- |
| **Stars 仓库** | 同步 Star；按关键词、语言、标签、平台、星标数和分析状态筛选；支持自定义分类、批量操作、README 预览、AI 摘要和相似仓库搜索 |
| **Gist** | 查看、搜索、创建、编辑和删除 Gist；支持收藏、取消收藏和 AI 摘要 |
| **Releases** | 订阅 Release；按未读状态、平台、架构和文件类型筛选；复制下载链接 |
| **Trending / Discover** | 浏览趋势、热门发布、热门仓库、主题和搜索结果；支持时间、平台、语言、主题、排序和订阅 |
| **Forks** | 查看 Fork 和上游状态；搜索、分页、标记已读、同步上游和运行 GitHub Actions |
| **AI 与向量搜索** | 配置 OpenAI、Anthropic、Ollama 或兼容接口；批量分析仓库，并使用 Cloudflare Vectorize 做相似度搜索 |
| **数据与集成** | 导出或导入脱敏数据快照；查看配置历史；通过只读 MCP（`POST /mcp`）读取数据 |

## 分类逻辑

仓库分类直接使用 [ecosyste-ms/oss-taxonomy](https://github.com/ecosyste-ms/oss-taxonomy)，按其原生的 Domain、Role、Technology、Audience、Layer 和 Function 六个 facets 组织。项目内置完整的版本化 JSON 快照；AI 分析优先返回其中的规范化英文术语，GitHub Topics、仓库描述和 README 用作匹配证据。

侧栏只展示当前有仓库命中的术语，并按 facet 分组；完整词表仍可用于筛选和手动分类。用户手动锁定的分类与显式无分类状态不会被后续 AI 分析覆盖。快照版本、上游提交和更新方式见 [docs/oss-taxonomy.md](docs/oss-taxonomy.md)。

## 产品边界

当前版本的运行范围：

- 一个 Worker 同时托管 SPA、`/api/*` 和 `/mcp`。
- D1 保存仓库、Gist、Release、Fork、分类和配置；敏感配置在写入 D1 前使用 AES-GCM 加密。
- 浏览器只访问同源 Worker；GitHub、AI 和翻译请求由 Worker 代理，并限制为明确配置的公网 HTTPS 上游。
- `workers_dev` 已关闭，生产访问应使用 Cloudflare 自定义域名。
- 不包含 Electron、Express、Docker、aria2、SSE MCP、网络隧道或纯前端备用后端；当前部署只支持本节所述的 Worker 运行方式。

## 架构

```text
浏览器
  └─ Cloudflare Worker
       ├─ Static Assets（React + Vite）
       ├─ /api/auth/*    工作区登录与 GitHub Token 配置
       ├─ /api/*         仓库、Gist、Release、Fork、AI、数据 API
       ├─ /mcp           只读 Streamable HTTP MCP
       ├─ D1             持久数据与加密设置
       └─ Vectorize      语义向量索引
```

## 登录与数据安全

1. 访问自定义域名后，先使用 `ADMIN_USER` / `ADMIN_PASSWORD` 登录工作区。
2. Worker 返回 `HttpOnly`、`Secure`、`SameSite=Strict` 会话 Cookie；登录接口启用失败次数限制。
3. 登录成功后再提交 GitHub Personal Access Token。Worker 会先调用 GitHub 校验 Token，再使用 `ENCRYPTION_KEY`（未设置时回退到 `ADMIN_PASSWORD`）加密写入 D1。
4. GitHub Token、AI Key、Embedding Key 和 MCP Token 不会写入前端构建产物；页面也不直接访问这些上游服务。
5. 生产静态资源使用严格 CSP，脚本只允许同源资源；所有状态变更 API 还会校验同源请求。

## 快速开始

### 前置条件

- Node.js 20.19 或更新版本
- 一个已登录 Wrangler 的 Cloudflare 账号
- Workers、D1、Vectorize 和一个自定义域名
- 一个 GitHub Personal Access Token；按要使用的功能授予 `repo`、`user`、`gist` 等所需权限

### 首次准备资源

```bash
npm install
npx wrangler login
npx wrangler d1 list
npx wrangler vectorize create stars-manager --dimensions=1536 --metric=cosine
```

从 D1 列表中选择目标数据库，并将其绑定信息写入 `wrangler.jsonc`。Vectorize 的维度必须与实际 Embedding 模型一致，`1536` 只是常见示例。

### 配置 Cloudflare Variables & Secrets

在 Worker 的 Settings → Variables & Secrets 中配置：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `ADMIN_USER` | Variable | 工作区登录用户名 |
| `ADMIN_PASSWORD` | Secret | 工作区登录密码，也是未配置独立加密密钥时的回退密钥 |
| `ADMIN_SESSION_SECRET` | Secret | HMAC 会话签名密钥，建议使用独立高熵随机值 |
| `ENCRYPTION_KEY` | Secret | 可选；D1 敏感数据的 AES-256-GCM 密钥 |

也可以使用 Wrangler：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ENCRYPTION_KEY
```

`ENCRYPTION_KEY` 一旦用于写入数据就必须长期保存。更换或丢失它会导致已有 GitHub、AI、Embedding 和 MCP 密钥无法解密。

### 本地开发

```bash
cp .dev.vars.example .dev.vars
# 在 .dev.vars 中填写 ADMIN_USER、ADMIN_PASSWORD、ADMIN_SESSION_SECRET
npm run cf:dev
```

`cf:dev` 会构建前端、应用本地 D1 migration 并启动同源 Worker。不要提交 `.dev.vars`。

### 生产部署

```bash
npm run cf:check
npm run cf:migrate:remote
npm run cf:deploy
```

发布时先确认变量和 Secret，再应用远程 migration，最后部署并检查自定义域名上的登录、健康检查和静态资源。`wrangler.jsonc` 中的 `workers_dev: false` 表示生产入口不是 `*.workers.dev` 地址。

## 常用命令

```bash
npm run lint       # ESLint
npm run test:run   # Vitest
npm run build      # Vite 生产构建
npm run cf:check   # Worker 类型、构建与 Wrangler dry-run
npm run cf:deploy  # 构建并部署到 Cloudflare
```

## MCP

在设置中启用 MCP 并生成独立 Token 后，将客户端指向：

```text
https://YOUR_DOMAIN/mcp
```

当前只接受无状态 `POST /mcp` Streamable HTTP 请求，使用 `Authorization: Bearer <MCP_TOKEN>`。不提供 SSE、Electron 或本地进程端点。

## 排错提示

- **页面空白**：确认部署产物来自最新构建，并检查响应中的 `Content-Security-Policy`。生产 CSP 不允许 `data:` 脚本，Vite 已关闭 legacy chunk 生成。
- **登录失败**：确认 `ADMIN_USER`、`ADMIN_PASSWORD` 已配置，并等待 Cloudflare Secret 更新生效。
- **Token 无法保存**：确认 `ENCRYPTION_KEY` 或 `ADMIN_PASSWORD` 非空；若更换过加密密钥，旧数据需要使用原密钥解密。
- **向量检索报错**：确认 Vectorize 索引存在，且索引维度与 Embedding 模型一致。
- **AI 请求失败**：确认上游是公网 HTTPS 地址；Worker 不访问 localhost、回环或私网地址。

## 许可证

[MIT](LICENSE)
