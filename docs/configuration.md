# 配置说明

[返回项目首页](../README.md)

配置文件从项目根目录的 `.env` 读取，完整示例见 [.env.example](../.env.example)。首次启动只需设置两个不同的令牌，并确认服务账号可运行 Codex。

## 常用配置

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| HOST | 127.0.0.1 | 监听地址；跨机器访问可设为 0.0.0.0 |
| PORT | 3080 | 网页与 Webhook 端口 |
| ADMIN_TOKEN | 必填 | 网页及管理 API 令牌 |
| WEBHOOK_TOKEN | 必填 | 外部服务接入令牌，必须与 ADMIN_TOKEN 不同 |
| DATA_DIR | ./data | JSON 数据目录 |
| CODEX_BIN | codex | Codex 可执行文件路径 |
| CODEX_WORKDIR | 项目根目录 | Codex 工作目录；示例配置为当前目录 |
| CODEX_INIT_AGENTS | true | 首次用户任务前检查并由 Codex 创建缺失的 AGENTS.md |
| CODEX_BRIDGE_ENV_FILE | 自动选择 | AGENTS.md 中记录的配置路径，优先 /etc/codex-plus.env，否则项目 .env |
| CODEX_SANDBOX | read-only | 聊天权限，可设为 workspace-write |
| CODEX_MODEL | 沿用 Codex 配置 | 可选的模型名称覆盖 |
| CODEX_TIMEOUT_MS | 180000 | 执行超时，单位毫秒 |
| CODEX_INPUT_TIMEOUT_MS | 1800000 | 等待用户回答或审批的超时 |
| CODEX_CONCURRENCY | 2 | 同时执行的不同会话数 |
| WEBHOOK_BATCH_MS | 5000 | 外部事件汇总间隔，单位毫秒 |
| WEBHOOK_EXECUTION_MODE | auto | auto 风险评估后自动执行；analyze 仅评估建议 |
| WEBHOOK_TIMEOUT_MS | 900000 | Webhook 修复执行阶段的超时，单位毫秒 |
| MOCK_CODEX | false | 设为 true 可在不调用模型时体验流程 |

## 模型与执行权限

模型 provider 沿用服务账号的 Codex config.toml，可使用已在 Codex 中配置的 DeepSeek。CODEX_MODEL 仅覆盖模型名，不会切换 provider。模型密钥需注入服务进程环境；服务不会修改 Codex 配置。切换 provider 后请创建新的网页会话。

CODEX_BIN 必须是可直接执行的二进制或无 shell 启动程序。Windows 优先使用 codex.exe 的绝对路径，不能直接使用 npm 的 codex.cmd。CODEX_WORKDIR 指向 Codex 的工作目录。CODEX_SANDBOX 默认为 read-only，可设为 workspace-write 允许用户聊天及通过风险评估的 Webhook 任务写入。普通用户任务的审批转发到网页；Webhook 任务由无人值守策略自动处理审批，评估阶段只读。

无论网页审批如何设置，进程运行账号的操作系统权限和 Codex 沙箱限制仍然独立生效。计划模式强制只读。

## 工作区初始化

首次用户任务执行前，服务检查 `CODEX_WORKDIR/AGENTS.md`。已有非空普通文件不重新生成；文件缺失时，先把接入规则模板交给 Codex，单独以 `workspace-write` 权限创建文件，确认生成成功并由桥接服务更新令牌区段后，再按原任务的沙箱和模式执行用户请求。这个准备步骤不执行用户的业务任务，也不改变后续任务权限；即使原任务是只读或计划模式，初始化仍可能创建或更新这一个文档文件。

初始化模板记录 Webhook 路径、Alertmanager 的 `credentials_file` 接法、配置文件位置和凭据使用规则，不包含真实令牌。生成完成后，由桥接服务直接在 `AGENTS.md` 中维护标记区段，写入当前 `WEBHOOK_TOKEN`；桥接服务还会维护独立的 `codex-plus:webhook-policy` 执行约定区段，包含 Git 分支、测试、部署及回滚流程；已有文件只追加或更新托管区段，其他内容保留。每次非 Webhook 的真实用户任务前都会同步令牌，因此服务配置变更并重启后，下一次用户任务会更新该区段。当前会话 ID 随任务提供，不固定在共享文件中。

管理员登录后，右侧 Webhook 收件箱直接显示真实 `WEBHOOK_TOKEN`，支持复制。它仅由管理令牌鉴权的 `/api/state` 返回，不写入静态页面，也不通过 Webhook 令牌开放查询；鉴权失效时清空页面中的令牌。

`AGENTS.md` 保存的是明文令牌，Codex 读取后也可能把它带入模型上下文或原生会话历史。文件以 Unix `0600` 权限原子写入；Windows 文件访问仍由系统 ACL 决定。Git 仓库内会把文件及写入临时文件加入本地 `.git/info/exclude`；非 Git 目录则补充 `.gitignore` 排除规则。如果 `AGENTS.md` 已被 Git 跟踪、排除规则不能生效或管理区段损坏，停止写入并让任务失败，避免误提交或损坏已有内容。Git 排除规则不能阻止人为强制添加文件。

初始化失败时不发送原始用户请求，任务标记失败，可重试。可写且为自动执行模式的 Webhook 任务会在评估前同步执行约定；文件缺失时由桥接服务直接创建只含执行约定的 `AGENTS.md`，不调用模型初始化，也不在此时同步令牌。仅分析、只读或计划模式的 Webhook，以及 `MOCK_CODEX=true` 模拟模式，不触发文件同步；空会话刚创建时不调用模型，待首次用户任务才初始化。已有会话在升级后首次用户任务也会执行检查。可用 `CODEX_INIT_AGENTS=false` 关闭初始化、令牌和执行约定同步；服务端授权限制仍然生效。

## 记住访问令牌

登录成功后，网页会把管理令牌保存在当前站点的浏览器 localStorage 中。刷新或重新打开同一地址会自动登录，点击“退出”或收到 401 响应时清除保存值。浏览器禁止存储时仅保留本次登录；临时网络故障不会删除已保存的令牌。
