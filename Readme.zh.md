# Codex Plus

简体中文 | [English](README.md)

通过网页和 Webhook 驱动 Codex，完成项目开发、部署与后续运维。你可以在网页中提出需求，让 Codex 创建项目、修改代码、执行测试和部署；也可以接入系统告警等事件，让 Codex 根据现场信息继续处理问题。

项目面向从开发到上线、再到事件响应的完整流程。网页提供任务入口和执行过程中的交互，代码操作与命令执行由服务端 Codex 完成。

项目采用 Node.js 与 JSON 文件存储，无需配置数据库或安装 npm 依赖，适合个人使用和单用户自托管。

## 可以做什么

- **开发并部署项目**：描述需求，让 Codex 创建项目、实现功能或修改已有代码，完成测试后自动执行构建和部署，并验证服务运行情况；执行范围取决于配置的目录、沙箱及系统权限。
- **响应事件**：已完成 Alertmanager 对接，可由告警驱动 Codex 排查问题、修复代码、执行回归测试，并在满足自动上线条件时部署及验证恢复；也支持通过 Webhook 接收 Bug 报告、发布通知等事件。具体执行范围见下方[接入外部事件](#接入外部事件)。
- **控制执行过程**：先制定计划或设定持续推进的目标，回答追问，选择逐次审批或会话自动审批，并保留执行记录。

例如，你可以要求“创建一个图书管理系统，测试后部署到这台服务器”，也可以在收到系统报警后要求“定位问题、修复代码并重新上线”。部署所需的运行环境、脚本和权限需要在执行环境中具备，或由 Codex 在你的授权下准备。

## 快速开始

需要 **Node.js 24+** 和支持 app-server 的 **Codex CLI**。先在运行服务的系统账号下配置好 Codex 的模型与认证，确认命令行可以正常使用。已按 Codex CLI 0.163.0 联调。

### 1. 获取项目

```bash
git clone https://github.com/inazuma1/codexPlus.git
cd codexPlus
cp .env.example .env
```

Windows PowerShell 用 `Copy-Item .env.example .env` 代替最后一行。

### 2. 设置访问令牌

编辑 `.env`，把以下占位值替换成两个不同的随机长字符串：

```dotenv
ADMIN_TOKEN=replace-with-a-long-random-admin-token
WEBHOOK_TOKEN=replace-with-a-different-long-random-webhook-token
```

`ADMIN_TOKEN` 用于网页登录，`WEBHOOK_TOKEN` 用于外部服务接入。若要让 Codex 操作其他项目，把 `CODEX_WORKDIR` 改成该项目目录；默认只读，需要写文件时设置 `CODEX_SANDBOX=workspace-write`。

### 3. 启动并打开网页

```bash
npm start
```

没有 npm 时，可直接运行 `node --env-file-if-exists=.env src/server.js`。

打开 [http://127.0.0.1:3080](http://127.0.0.1:3080)，输入 `ADMIN_TOKEN`，新建对话即可使用。登录后会记住令牌，刷新无需重新输入；点击“退出”可清除。

首次用户任务会检查工作目录的 `AGENTS.md`，缺失时先由 Codex 生成接入说明；桥接服务维护独立的令牌和 Webhook 执行约定区段，保留其他项目规则。执行约定包含分支、测试、部署和回滚流程，后续任务会同步更新；服务端仍决定本次允许分析、分支修复还是上线。管理员可在右侧收件箱查看、复制 Webhook 令牌。详见[工作区初始化](docs/configuration.md#工作区初始化)。

想先看看界面，可在 `.env` 中设置 `MOCK_CODEX=true`，体验不调用模型的模拟流程。

## 接入外部事件

外部服务向 `POST /webhooks/<来源名称>` 发送 JSON，并携带 `Authorization: Bearer <WEBHOOK_TOKEN>`。Codex Plus 接收事件、合并同组消息，并触发 Codex 处理；你可以在生成的会话中查看结果、补充指令并继续执行。

要沿用已有项目上下文，可复制网页顶部的会话 ID，发送到 `POST /webhooks/<来源名称>/<会话ID>`，事件将进入指定会话。

以 Git 管理的项目为例，处理流程是：**接收事件 → 只读排查与风险评估 → 从 master 新建修复分支 → 修改代码并测试 → 合并至 master → 部署并验证**。`WEBHOOK_EXECUTION_MODE=auto` 且允许工作目录写入、目标会话不是计划模式时，按以下方式处理，全程不向用户提问：

- **可以自动上线**：在独立的 `codex/webhook-*` 分支中修复、测试并提交，通过检查后以快进方式合并至 `master`，再按项目已有流程部署、验证。
- **不能自动上线**：有明确方案且能安全隔离修复时，仍在新分支中修改、测试并提交，保留分支，不合并、不部署；在会话中给出分支、提交、测试结果、未上线原因和后续建议。信息不足或无法安全修复时，只报告原因与建议。

工作区有未提交改动、缺少本地 `master` 或合并失败时，停止并报告，不覆盖现有改动或自动改用 `main`；不会自动推送远端仓库。Git 操作由 Codex 按执行策略完成。没有 Git 管理的项目沿用修复、测试、部署和验证流程。

高风险、无法验证或缺少恢复方案时不自动上线。数据库结构变更、数据删除和认证权限修改不按类别强制拦截，而是结合实际影响、测试及恢复能力评估。设置 `WEBHOOK_EXECUTION_MODE=analyze` 或使用只读、计划模式时，仅分析并给出建议。

[查看 Alertmanager 配置和 Webhook 示例 →](docs/webhooks.md)

## 后续目标

以下为计划建设的能力，尚未全部实现：

- **接入 GitLab、Jira、禅道等工具**：同步需求、任务、缺陷与代码仓库，将管理工具中的事件转为 Codex 执行任务，并回写进度和处理结果。
- **自动完成功能开发**：从需求或任务单获取上下文，制定方案、修改代码、执行测试、提交代码并创建合并请求，关联原始任务与验收结果。
- **自动记录并修复 Bug**：将告警、失败任务或用户反馈自动记录为缺陷，关联日志和复现信息，驱动定位、修复及回归测试，并更新缺陷状态。

最终让需求、代码、部署和线上反馈形成持续处理流程。自动执行将支持项目与操作范围配置，以及审批、失败处理和过程追踪。

## 更多文档

| 你想了解 | 文档 |
| --- | --- |
| 模型、工作目录与环境变量 | [配置说明](docs/configuration.md) |
| 反问、审批、计划与目标模式 | [网页使用](docs/usage.md) |
| 告警和其他服务接入 | [Webhook 与 Alertmanager](docs/webhooks.md) |
| 调用管理接口 | [HTTP API](docs/api.md) |
| 备份、恢复、部署与测试 | [数据与运维](docs/operations.md) |
| 密码重置相关的模型行为 | [提示词说明](docs/password-prompts.md) |

会话数据默认保存在 `data/store.json`。这是单用户服务，公网部署请使用 HTTPS 并保护访问令牌；备份及权限细节见[运维文档](docs/operations.md)。
