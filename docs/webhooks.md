# 接入 Webhook 与 Alertmanager

[返回项目首页](../README.md)

## 事件驱动的后续处理

Webhook 是 Codex 任务的外部触发入口，可连接系统监控、部署通知或其他业务事件。例如：监控产生告警，Codex 接收告警并排查原因，随后修复代码、测试、部署并验证服务恢复。

当前自动流程是“接收事件 → 持久化与去重 → 分组汇总 → 进入指定会话或创建新会话 → 只读风险评估 → 符合条件时修复、测试、部署及验证”。风险评估与执行使用同一 Codex 会话。

## 无人值守执行策略

分支、测试、部署与回滚约定维护在工作目录 `AGENTS.md` 的 `codex-plus:webhook-policy` 托管区段中。启用工作区初始化时，普通用户任务及可写的自动 Webhook 任务会同步该区段，保留其他内容；自动 Webhook 首次到达且文件缺失时，由桥接服务创建包含执行约定的文件。仅分析、只读或计划模式的 Webhook 不写入文件。Codex 读取项目约定并判断具体操作，服务端仍保留只读评估、执行授权及禁止等待用户输入的限制。请求中的授权说明和 Git 基础约束也会保留，避免旧规则扩大权限；这不是对 Git 或部署命令的逐条拦截。

默认 `WEBHOOK_EXECUTION_MODE=auto`。评估阶段强制只读，额外权限请求自动拒绝；模型返回结构化的决策、风险、理由、方案、可验证性、恢复能力及是否缺少信息。只有决策为执行、风险为低或中、可以验证和恢复、不需要补充信息且方案非空时，才允许合并和部署。无法自动上线但仍有明确修复方案、无需补充信息时，会进入仅分支修复阶段；忽略事件或缺少必要信息时只给建议。评估内容不符合格式时任务失败，不会默认为允许执行。

修复及部署阶段还要求 `CODEX_SANDBOX=workspace-write`，且目标会话不是计划模式。命令、文件及权限审批按这条事件执行策略自动处理，不依赖“本会话自动审批”开关。只处理当前工作目录以及从项目配置和上下文可以确认的目标；不从事件正文直接执行命令或切换目标。风险过高或未知、信息不足、测试失败或无法验证恢复时，不上线，只给出原因与建议。

Git 项目先检查仓库、工作区和本地 `master`。工作区干净且没有未完成合并时，从 `master` 创建唯一 `codex/webhook-*` 分支，在分支中修改、测试并提交本事件文件。满足自动上线条件后，通过 `git merge --ff-only` 合并到 `master`，验证后使用已有部署流程上线；不会自动推送远端。无法自动上线时，完成有依据且可安全隔离的分支修复与测试，保留分支，在会话中报告分支、提交、测试结果及上线建议，禁止合并、部署或操作生产数据。工作区有用户改动、缺少 `master`、合并冲突等情况停止并报告，不自动 stash、清理或改用 `main`。没有 Git 的项目仍按原自动修复上线流程执行；仅分支修复阶段则只给建议。Git 操作和结果由 Codex 执行及报告，并非服务端独立的 Git 事务控制器。

数据库结构变更、数据删除和认证权限修改不按类别强制拒绝，而是结合必要性、影响、测试、备份和恢复方案评估。执行途中发现新风险或超出评估范围时应停止；部署验证失败时，应在恢复方式明确且安全的条件下回滚并验证，否则报告阻塞。

全过程不等待用户回答。模型若调用提问工具，桥接服务补齐取消响应并中止任务，记录阻塞建议，网页不会出现提问卡片。评估阶段不展示原始风险 JSON，而在历史中记录评估摘要。风险判断、测试命令和部署结果仍依赖模型及项目已有工具；本策略不是独立的静态风险证明或通用部署验证系统。

可设置 `WEBHOOK_EXECUTION_MODE=analyze` 退回只读评估与建议。评估阶段使用 `CODEX_TIMEOUT_MS`，执行阶段使用 `WEBHOOK_TIMEOUT_MS`（默认 15 分钟）。为了避免共享工作目录中的并发修改，Webhook 任务与其他任务互斥执行；普通用户任务之间仍按原并发配置处理。目标模式会话中的事件不启动目标自动续轮。

## 将事件发送到已有会话

选择网页中的对话，顶部会显示“会话 ID”，可点击“复制”。把 ID 加到 Webhook 路径末尾：

```text
POST /webhooks/<source>/<sessionId>
```

例如，Alertmanager 的通知地址可配置为 `http://bridge:3080/webhooks/alertmanager/你的会话ID`，继续使用 `WEBHOOK_TOKEN` 鉴权。事件会追加到这个会话，复用原有 Codex thread 和对话上下文，不另建会话。

不同会话的事件分别分组和去重；同一会话的新任务按顺序排队，不会中断正在执行或等待用户回应的任务。目标会话不存在时返回 404，正在修改时可能返回 409；接收后若目标会话被删除，尚未分组的事件标记失败，不会改投其他会话。

原有 `POST /webhooks/<source>` 继续可用，会自动创建事件会话。绑定接口返回 202 时包含 `session_id`；当前绑定仅关联对话，工作目录仍取自服务端 `CODEX_WORKDIR`，尚未增加每会话独立工作目录或部署配置。

## 接入 Alertmanager

合并以下 receiver 到现有配置，并通过现有 route 指向它，保留原有其他通知渠道：

```yaml
receivers:
  - name: codex-analysis
    webhook_configs:
      - url: http://bridge:3080/webhooks/alertmanager
        send_resolved: true
        http_config:
          authorization:
            type: Bearer
            credentials_file: /etc/alertmanager/codex-webhook-token
```

令牌文件内容为 WEBHOOK_TOKEN。跨机器访问需要设置 HOST=0.0.0.0 并配置网络或反向代理，默认仅监听本机。

其他服务同样可以 POST JSON 对象到 `/webhooks/<source>`，source 支持字母、数字、下划线、短横线，最长 64 字符。

```bash
curl -X POST http://127.0.0.1:3080/webhooks/deploy \
  -H 'Authorization: Bearer YOUR_WEBHOOK_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: deployment-123' \
  -d '{"title":"部署完成","service":"payments","version":"1.2.0"}'
```

Webhook 保存到 JSON 文件后返回 202，每 5 秒按来源、目标会话及 groupKey（或 alertname）分组；绑定会话时追加到指定会话，否则生成独立分析会话。每周期最多 100 条、180 KB 数据，每请求最多 64 KiB。相同来源和 Idempotency-Key 永久去重；没有 key 时相同规范化 JSON 在 5 分钟内去重，之后允许再次分析。恢复事件内容不同，会独立接收。
