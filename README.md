# Pi Agent Web

[pi 编程智能体](https://github.com/badlogic/pi-mono) 的 Web 管理界面。支持多用户、角色权限、文件管理、Office 预览。

## 快速开始

```bash
npx @agegr/pi-web@latest
```

或全局安装：

```bash
npm install -g @agegr/pi-web
pi-web
```

启动后打开 [http://localhost:30141](http://localhost:30141)。

**启动参数：**

```bash
pi-web --port 8080            # 自定义端口
pi-web -p 8080 -H 127.0.0.1  # 仅本机
PORT=8080 pi-web              # 环境变量
```

## 功能概览

### 用户与权限

- **多用户系统** — 首次访问引导创建管理员账号，支持多用户注册
- **角色权限配置** — 6 项可配置权限：Models 管理、Skills 管理、全局 Skills、用户管理、完整工具集、文件删除
- **角色管理 UI** — 管理员可创建/编辑角色，灵活勾选权限
- **权限驱动菜单** — 侧边栏菜单项根据用户权限动态显示

### 会话与对话

- **会话管理** — 按工作目录分组，支持重命名、删除、分叉
- **实时对话** — SSE 流式输出，支持模型切换、思考等级、工具预设
- **工作空间隔离** — 每个用户独立的 `~/pi-cwd/<username>` 工作目录，不可切换
- **文件上传** — 支持图片和文件上传，自动保存到 `.pi-uploads/` 目录并告知 AI 路径
- **Steer / Follow-up** — 中断或追加消息

### 文件管理

- **文件浏览器** — 侧边栏树形文件列表，支持文件删除（含二次确认）
- **文件预览** — 语法高亮（60+ 语言）、Markdown/HTML 预览、Diff 对比、Live watch
- **图片预览** — 支持 png/jpg/gif/webp/svg 等，实时刷新
- **音频播放** — 支持 mp3/wav/ogg/flac 等格式
- **PDF 预览** — 浏览器原生渲染
- **Office 预览** — Word/Excel/PPT 文本提取（mammoth.js），深色模式适配

### 自定义

- **应用名称** — 管理员可在 Settings 中自定义应用名称，登录页/侧边栏/聊天页同步更新
- **模型配置** — Models 面板管理 providers、API Keys、模型列表
- **Skills 管理** — 搜索、安装、启用/禁用 Skills，支持项目级和全局级

## 权限说明

| 权限 | 控制范围 |
|------|---------|
| `models:write` | Model 配置管理、应用 Settings |
| `skills:write` | Skills 安装/启用/禁用 |
| `skills:global` | 全局 Skills 管理 |
| `users:manage` | 用户管理和角色权限配置 |
| `agent:full_tools` | 使用全部 7 个 Agent 工具 |
| `files:delete` | 删除工作空间文件 |

默认角色：
- **Administrator** — 全部 6 项权限
- **User** — 仅 `skills:write`（项目级）

## 环境变量

| 变量 | 说明 |
|------|------|
| `PI_CODING_AGENT_DIR` | Agent 数据目录，默认 `~/.pi/agent` |
| `PI_WEB_ADMIN_PASSWORD` | 首次启动自动创建 admin 用户 |

## 开发

```bash
npm install
npm run dev       # 端口 30141
npm run build     # 生产构建 (webpack)
npm run start     # 生产启动
```

**类型检查:** `npx tsc --noEmit`

## 项目结构

```
app/
  api/
    admin/         # 用户/角色/权限/设置 CRUD
    agent/         # Agent 会话、SSE 事件流
    auth/          # OAuth/API Key 认证
    files/         # 文件列表/读取/上传/删除
    models/        # 模型列表与配置
    sessions/      # 会话文件读写
    skills/        # Skills 搜索/安装/切换
  login/           # 登录/注册页面
components/        # React UI 组件
hooks/             # useAgentSession, useTheme 等
lib/
  db.ts            # JSON 数据库（用户/角色/会话）
  user-auth.ts     # 认证与权限检查
  rpc-manager.ts   # AgentSession 生命周期
  session-reader.ts # .jsonl 会话解析
  types.ts
```

## 数据存储

| 文件 | 内容 |
|------|------|
| `~/.pi/agent/users_db.json` | 用户账号 |
| `~/.pi/agent/roles.json` | 角色与权限配置 |
| `~/.pi/agent/sessions.json` | 登录会话 |
| `~/.pi/agent/app-settings.json` | 应用设置 |
| `~/.pi/agent/models.json` | 模型配置 |
| `~/.pi/agent/sessions/` | 对话记录 (.jsonl) |
| `~/pi-cwd/<user>/` | 用户工作空间 |

## License

MIT
