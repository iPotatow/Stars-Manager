# Stars Manager

> 把 GitHub Star 变成一个可搜索、可整理、可持续同步的个人资料库。

[English README](README_en.md) · [Cloudflare 部署说明](CLOUDFLARE.md)

Stars Manager 是一个运行在 Cloudflare 上的 GitHub Star 管理台。它把收藏的仓库、Gist、Release 和 Fork 放进同一个工作区，提供分类、筛选、批量编辑、AI 摘要和相似仓库搜索。

项目面向希望长期维护自己 GitHub 收藏的人：浏览器只访问同源 Worker，数据保存在 D1，GitHub、AI 和翻译请求由 Worker 代理，敏感配置不会进入前端构建产物。

## 能解决什么问题

GitHub Star 很容易变成一个不断增长、难以回看的列表。Stars Manager 将收藏整理成几个可操作的工作流：

- 用关键词、语言、Topic、平台、星标数和分析状态快速定位仓库。
- 用固定分类、自定义标签和批量操作维护个人知识结构。
- 查看 README、Release、Fork 上游状态和 GitHub Actions，不必在多个页面之间切换。
- 让 AI 生成仓库摘要、标签和平台信息，并用 Vectorize 查找相似项目。
- 通过同一套 Worker 运行时管理登录、数据同步、AI 配置和 MCP 读取接口。

## 功能

| 模块 | 能力 |
| --- | --- |
| **Stars 仓库** | 同步 GitHub Star；搜索、筛选、排序、分类、批量编辑、README 预览、AI 摘要和相似仓库搜索 |
| **Gist** | 查看、搜索、创建、编辑、删除、收藏和取消收藏 Gist；支持 AI 摘要 |
| **Releases** | 订阅 Star 仓库的 Release；按未读状态、平台、架构和文件类型筛选；复制下载链接 |
| **Trending / Discover** | 浏览趋势、热门发布、热门仓库、主题和仓库搜索结果；支持时间、语言、平台和订阅筛选 |
| **Forks** | 查看 Fork、上游状态和未读变化；同步上游并运行 GitHub Actions |
| **AI 与向量搜索** | 支持 OpenAI、Anthropic、Gemini、DeepSeek、Ollama 和 OpenAI-compatible 接口；使用 Cloudflare Vectorize 进行相似度搜索 |
| **数据与集成** | 导入或导出脱敏数据快照、查看配置历史，并通过只读 MCP 读取工作区数据 |

## 分类模型

侧栏默认使用八个应用类型分类：

| 分类 | 适合收纳 |
| --- | --- |
| 🤖 人工智能 | LLM、Agent、RAG、MCP 和 AI 应用 |
| 💻 开发技术 | 前后端、框架、库、SDK 和数据库 |
| 🛠️ 工具软件 | CLI、开发工具、效率软件和自动化 |
| 🖥️ 运维部署 | Docker、服务器、云服务和自托管项目 |
| 🔐 网络安全 | 网络、代理、安全和隐私项目 |
| 🎨 设计资源 | UI、组件、图标和设计资源 |
| 📚 学习资源 | 教程、Awesome 列表、书籍和知识库 |
| 💡 创意收藏 | Demo、实验、原型、游戏和灵感项目 |

AI 分析会参考仓库描述、Topics 和 README 生成标签；语言、平台和主题仍然可以单独筛选。用户手动锁定的分类不会被后续分析覆盖。

## 架构

```text
浏览器
  └─ Cloudflare Worker
       ├─ Static Assets（Vue 3 + Vite + TSX）
       ├─ /api/auth/*    工作区登录与 GitHub Token 配置
       ├─ /api/*         仓库、Gist、Release、Fork、AI 和数据 API
       ├─ /mcp           只读 Streamable HTTP MCP
       ├─ D1             持久数据与加密设置
       └─ Vectorize      语义向量索引
```

运行时边界是刻意收敛的：生产环境只支持 Cloudflare Worker，不包含 Electron、Express、Docker、本地后端、浏览器直连 GitHub、SSE MCP 或网络隧道。`workers_dev` 已关闭，生产入口应使用 Cloudflare 自定义域名。

## 登录与数据安全

1. 使用 Cloudflare Variables & Secrets 中的 `ADMIN_USER` 和 `ADMIN_PASSWORD` 登录工作区。
2. Worker 返回 `HttpOnly`、`Secure`、`SameSite=Strict` 会话 Cookie；登录接口使用 D1 持久化失败次数限制。
3. 登录后提交 GitHub Personal Access Token。Worker 会先向 GitHub 验证 Token，再使用 `ENCRYPTION_KEY`（未设置时回退到 `ADMIN_PASSWORD`）以 AES-GCM 加密写入 D1。
4. GitHub Token、AI Key、Embedding Key 和 MCP Token 不会写入前端构建产物；页面也不直接请求这些上游服务。
5. 状态变更 API 会校验同源请求，生产静态资源使用严格 CSP。

## 快速开始

### 前置条件

- Node.js 20.19 或更新版本
- 已登录 Wrangler 的 Cloudflare 账号
- 一个 D1 数据库、一个 Vectorize 索引和一个自定义域名
- 一个具备所需 GitHub 权限的 Personal Access Token

### 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
```

在 `.dev.vars` 中填写本地登录配置：

```dotenv
ADMIN_USER=your-user
ADMIN_PASSWORD=your-password
ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
ENCRYPTION_KEY=optional-encryption-secret
```

启动同源 Worker：

```bash
npm run cf:dev
```

该命令会构建前端、应用本地 D1 migrations，并启动 Wrangler 开发服务器。`.dev.vars` 只用于本地开发，不要提交到仓库。

### Cloudflare 资源与生产部署

先创建或绑定 D1 和 Vectorize：

```bash
npx wrangler login
npx wrangler d1 list
npx wrangler vectorize create stars-manager --dimensions=1536 --metric=cosine
```

将目标 D1 的绑定信息写入 [`wrangler.jsonc`](wrangler.jsonc)。Vectorize 的维度必须与实际 Embedding 模型一致，`1536` 只是常见示例。

在 Cloudflare Worker 的 Variables & Secrets 中配置：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `ADMIN_USER` | Variable | 工作区登录用户名 |
| `ADMIN_PASSWORD` | Secret | 工作区登录密码；未设置独立加密密钥时也是加密回退密钥 |
| `ADMIN_SESSION_SECRET` | Secret | HMAC 会话签名密钥，建议使用独立高熵随机值 |
| `ENCRYPTION_KEY` | Secret，可选 | D1 敏感数据的 AES-256-GCM 加密密钥 |

也可以使用 Wrangler 设置 Secret：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ENCRYPTION_KEY
```

发布前执行：

```bash
npm run cf:check
npm run cf:migrate:remote
npm run cf:deploy
```

`ENCRYPTION_KEY` 一旦用于写入数据就必须长期保存。更换或丢失它会导致已有 GitHub、AI、Embedding 和 MCP 密钥无法解密。

## 常用命令

```bash
npm run dev          # 仅启动 Vite 前端开发服务器
npm run cf:dev       # 构建并启动同源 Cloudflare Worker
npm run test:run     # 运行 Vitest 测试
npm run lint         # ESLint
npm run typecheck    # 前端 TypeScript 检查
npm run build        # Vite 生产构建
npm run cf:check     # Worker 类型、构建与 Wrangler dry-run
npm run cf:deploy    # 构建并部署到 Cloudflare
```

## MCP

在设置中启用 MCP 并生成独立 Token 后，将客户端指向：

```text
https://YOUR_DOMAIN/mcp
```

接口只接受无状态 `POST /mcp` Streamable HTTP 请求，并使用：

```http
Authorization: Bearer <MCP_TOKEN>
```

MCP 是只读集成，不提供 SSE、Electron 或本地进程端点。

## 项目结构

```text
src/
  App.tsx                 应用视图与主导航
  components/             页面与交互组件
  services/                GitHub、Worker、AI、同步和向量搜索服务
  store/                   Vue 原生状态与 IndexedDB 持久化
  constants/               默认分类与筛选配置
worker/src/
  index.ts                 Worker 入口、认证边界与路由分发
  auth.ts                  登录、会话和 GitHub Token 配置
  api.ts                   D1 数据 API
  proxy.ts                 GitHub、AI 与翻译代理
  vector.ts                Vectorize 操作
migrations/                D1 schema migrations
```

## 排错提示

- **页面空白**：确认部署产物来自最新构建，并检查响应中的 `Content-Security-Policy`。
- **登录失败**：确认 `ADMIN_USER`、`ADMIN_PASSWORD` 和会话密钥已配置，并等待 Secret 生效。
- **Token 无法保存**：确认 `ENCRYPTION_KEY` 或 `ADMIN_PASSWORD` 非空；更换加密密钥后旧数据需要使用原密钥解密。
- **向量检索报错**：确认 Vectorize 索引存在，且索引维度与 Embedding 模型一致。
- **AI 请求失败**：确认上游是公网 HTTPS 地址；Worker 不访问 localhost、回环或私网地址。

## 许可证

[MIT](LICENSE)
