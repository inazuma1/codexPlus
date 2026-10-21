# Codex Plus

单用户、自托管的 Codex 网页聊天与 Webhook 桥接服务。需要 Node.js 24+ 和 Codex CLI，无第三方运行依赖，使用 JSON 文件保存数据，无需安装或配置数据库。

## 启动

复制 `.env.example` 为 `.env`，把 ADMIN_TOKEN 和 WEBHOOK_TOKEN 改成不同的随机长字符串，然后启动：

```powershell
Copy-Item .env.example .env
# 编辑 .env 后
npm start
```

如果机器只有 Node.js、没有 npm，也可以直接执行 `node --env-file-if-exists=.env src/server.js`，测试使用 `node --test test/*.test.js`。

访问 http://127.0.0.1:3080 ，输入 ADMIN_TOKEN。登录验证成功后，令牌保存在当前站点的浏览器 localStorage 中，刷新或重新打开同一地址会自动连接；点击“退出”清除令牌，服务端返回 401 时也会清除并要求重新登录。浏览器禁用存储时退回仅本次登录，并显示提示；临时网络故障不会删除已保存的令牌。首次联调可设 `MOCK_CODEX=true`，不发起模型请求。正式运行设置为 false，并在实际运行服务的系统账号下完成 Codex 认证。

## 模型与会话

网页是本项目自建聊天界面，通过 `codex app-server` 的 stdio JSON-RPC 与服务端 Codex 双向通信，并非嵌入官方桌面 UI。保存 thread ID，通过 thread/resume 续接会话。默认最多同时运行 2 个不同会话，同一会话仍按顺序执行，等待用户时其他会话和 Webhook 可继续处理。

网页使用需要管理令牌的 SSE 实时显示增量回复、待回答问题和审批请求，并每 2 秒校正状态。需要澄清时 Codex 可以调用网页提供的 bridge_ask_user 工具；也支持原生 requestUserInput 请求。网页提供选项和自由文本输入，提交后在当前执行轮次中继续。对命令、文件修改和权限审批可选择允许本次、拒绝或取消，也可开启本会话自动审批。默认需手动允许；开启自动审批后由桥接服务自动回复。当前 MCP elicitation 请求自动拒绝，不渲染外部表单。

审批卡片和历史审批记录使用简洁说明，展示申请原因、文件变更数量及权限类别，不展示执行命令、目录路径、文件差异或原始 JSON 请求，也不提供展开原始请求的入口。这只是网页展示调整，审批提交和原始记录保存方式保持不变；模型在申请原因或普通回复中自行提到的命令、路径不会自动脱敏。

CODEX_TIMEOUT_MS 为执行时限（默认 3 分钟），等待回答或审批时暂停计时，回答后重新计时。CODEX_INPUT_TIMEOUT_MS 为等待用户时限（默认 30 分钟）。任务支持停止；问题已回答或失效时再次提交会返回 409。提问和回答记录写入 JSON，保密问题的答案只转发，不写入网页历史。

反问工具与原生提问协议属于 app-server 实验接口，已按 Codex 0.163.0 联调。新创建的会话会注册提问工具，重启后续接仍可使用。升级前的旧会话可以继续阅读和续聊，若需完整的提问卡片体验，请新建对话；旧会话未注册网页工具时仍可用普通消息问答。

模型 provider 沿用服务账号的 Codex config.toml，可使用此前配置的 DeepSeek。CODEX_MODEL 仅覆盖模型名，不会切换 provider。模型密钥需注入服务进程环境；服务不会修改 Codex 配置。切换 provider 后请创建新的网页会话。

CODEX_BIN 必须是可直接执行的二进制或无 shell 启动程序。Windows 优先使用 codex.exe 的绝对路径，不能直接使用 npm 的 codex.cmd。CODEX_WORKDIR 指向 Codex 的工作目录。CODEX_SANDBOX 默认为 read-only，可设为 workspace-write 允许用户聊天在工作目录内读写；Webhook 分析始终从只读模式开始。审批策略为 on-request，审批请求转发到网页。

## 应用账户密码重置的提示词

此前远程 Codex 在收到图书管理系统 admin 密码重置请求时，因“不要读取或泄露凭据”和“不要用 shell stdin 交互”两条笼统指令，主动要求用户到宿主机终端自行执行脚本。这类文字拒绝与操作系统报出的权限错误不同：前者可能来自模型对提示词的理解，后者仍需检查运行账号、sudo、文件权限和沙箱。

相关修改位于 [src/codex.js](src/codex.js) 的 `runCodex()`，通过 `developerInstructions` 在创建或恢复 Codex 会话时传入。保留中文回复、网页提问工具及外部事件不可信等规则，并调整以下两处。

原有交互限制：

```text
不要用 shell stdin 交互。
```

改为区分“向用户提问”和“给程序传入已有输入”：

```text
不要用 shell stdin 向用户提问；用户已提供的输入可通过程序标准输入传递。
```

原有凭据限制：

```text
不要读取或泄露凭据。
```

替换为以下具体规则，允许明确授权的应用账户密码重置，同时保留凭据保护要求：

```text
不要擅自读取、回显或泄露凭据。用户明确授权重置其管理的应用账户密码时，可以执行必要的密码重置并清理旧会话；不要仅因操作涉及密码而拒绝或要求用户自行执行。优先采用程序标准输入或受保护的临时文件传递新密码，关闭命令回显，避免将密码放入命令行参数、回复和额外日志。不得声称工具调用、模型上下文或会话历史绝不会保存密码。受沙箱限制时申请必要审批，不绕过权限控制。
```

这项修改允许模型执行用户明确授权的应用账户维护，并非给模型授予 root 权限，也不自动修改 Linux 系统账号密码。`CODEX_SANDBOX`、运行账号的系统权限和网页审批机制仍独立生效。模型能否完成操作，还取决于密码重置脚本提供的输入方式及其所需权限。

不要把“关闭命令回显”理解为密码不会留存：用户直接在聊天中输入的密码会作为普通消息保存到本项目 JSON 中，传入模型的输入或工具调用也可能保存在原生会话历史中。上述提示词只能约束模型行为，不提供自动脱敏或秘密传输通道；本节不记录真实密码、管理令牌或 API 密钥。

修改此代码后，需要重启 Codex Plus 服务，让后续任务在创建或恢复会话时使用新的提示词；无需修改已有会话数据。远程部署使用的服务名为 `codex-plus`，可执行 `sudo systemctl restart codex-plus`，重启前应确认没有正在运行或等待用户回应的任务。

## 计划、目标与会话删除

选中会话后点击顶部“重命名”，输入1–100字符标题。左侧列表和聊天顶部会同步更新，并保存到 JSON；已存在的 Codex 原生会话也会同步名称。空白标题会被拒绝，标题首尾空白会自动去除。运行或排队任务结束/停止后可重命名。

聊天顶部可切换执行、计划、目标三种模式。计划模式使用 Codex 原生 collaborationMode=plan，并强制只读沙箱、禁止写入审批。计划文本实时显示，点击“按计划执行”才会切回执行模式并发送执行请求。

目标模式使用原生 thread/goal/set、get、clear。填写目标、Token预算（1000–1000000）和最多推进轮数（1–100），点击“设置并启动”。每轮结束后，如果目标仍 active，会在同一会话中自动继续；完成、阻塞、预算限制或到达用户设置的轮数时停止。轮数上限会暂停目标，可点击“继续”重置本次轮数并继续原目标，保留原生用量记录。原生 Token 统计依赖模型提供商回报；部分提供商可能返回 0，轮数上限仍独立生效。

可暂停或清除目标；这会停止该目标当前的任务并取消其排队后续轮次。执行失败或中断后目标在网页中暂停，需要手动继续。服务重启不自动重新启动状态不确定的目标。切换到其他模式前，先暂停或清除活动目标。

选择历史会话后点击“删除会话”，确认后会删除本应用中的会话、消息、任务及对应的 Codex 原生会话（含其原生子会话）。正在执行或排队的会话需先停止；原始 Webhook 事件保留，但不再关联被删除会话。数据备份可能仍保留历史快照，删除不是备份介质的安全擦除，也不会删除工作目录中的文件。

## Alertmanager

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

Webhook 保存到 JSON 文件后返回 202，每 5 秒按来源和 groupKey（或 alertname）分组生成独立分析会话。每周期最多 100 条、180 KB 数据，每请求最多 64 KiB。相同来源和 Idempotency-Key 永久去重；没有 key 时相同规范化 JSON 在 5 分钟内去重，之后允许再次分析。恢复事件内容不同，会独立接收。

## API

管理接口使用 `Authorization: Bearer <ADMIN_TOKEN>`，Webhook 使用独立的 WEBHOOK_TOKEN。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /healthz | 无认证存活检查 |
| GET | /api/state | 最近 100 个会话、事件与任务 |
| POST | /api/sessions | 创建会话，JSON 包含 title |
| PATCH | /api/sessions/:id | 设置 title（1–100字符）或 mode（default、plan、goal） |
| PATCH | /api/sessions/:id/approval | 设置本会话自动审批，JSON 为 `{"autoApprove":true}` 或 `false` |
| DELETE | /api/sessions/:id | 删除空闲会话及其原生历史 |
| POST | /api/sessions/:id/goal | 目标 start、pause、resume、clear |
| GET | /api/sessions/:id/messages | 查询消息 |
| POST | /api/sessions/:id/messages | 发送 JSON content，返回 jobId |
| POST | /api/jobs/:id/retry | 重试失败任务 |
| POST | /api/jobs/:id/cancel | 停止运行中或排队任务 |
| GET | /api/events | 管理令牌鉴权的 SSE 实时事件 |
| POST | /api/interactions/:id/respond | 提交答案 answers 或审批 decision |
| POST | /webhooks/:source | 接收 JSON 外部事件 |

重启后排队任务继续处理，运行中或等待回答的任务标记失败，供管理员重试。待回答请求不跨服务重启保留，旧请求不能在重启后批准；不会自动重新调用状态不确定的任务。重试可能在原 Codex 会话中追加重复输入。网页刷新不会中断服务器上等待回答的任务，重新登录并打开对应会话后可继续回答。

## JSON 数据保存

聊天消息和实时回复支持 Markdown，包括标题、列表、表格、引用、代码块和链接。浏览器使用本地打包的 Marked 与 DOMPurify 渲染和清理内容，不执行原始 HTML；图片显示为可点击链接，不自动加载外部资源。无需 CDN 或额外安装依赖。

会话顶部提供“本会话自动审批”开关，默认关闭。开启后自动同意该会话的命令、文件修改和权限审批，也会立即同意当前等待中的操作审批。审批卡片上也可点击“同意并开启本会话自动审批”。普通提问仍需手动回答，其他会话不受影响，计划模式下暂停自动审批。开关设置保存在 JSON 中，刷新网页或重启服务后保留，直到手动关闭或删除会话。每次自动审批均记录到会话历史。关闭只停止后续自动审批，不撤销已批准的操作或权限；现有沙箱与系统权限限制仍然生效。

默认自动创建 `data/store.json`，统一保存会话、消息、Webhook 和任务。`DATA_DIR` 可选，仅用于修改保存目录。

每次修改在单进程中串行写入，完整写入临时文件并刷新到磁盘后替换主文件，同时将上一版保存到 `store.json.bak`。写入失败不会提交新的内存状态；重启会重新加载 JSON。文件格式损坏时会停止启动并提示检查备份，不会静默清空或回退数据。

需要恢复备份时先停止服务，保留损坏主文件，再把 `store.json.bak` 复制为 `store.json`。备份只是上一版快照，可能缺少最后一次修改。不要在服务运行时手动编辑文件。

适合单进程、低频事件使用；同一数据目录只运行一个服务实例。每次提交会重写整个 JSON 文件，历史记录较多时会增加延迟，当前不自动清理历史。

## 部署边界

- 用专用低权限账号或容器运行。只读沙箱不等于秘密隔离，仍需限制账号可读文件和模型可访问的工具。不要授予生产写权限或挂载无关凭据。
- 这是单用户版本，管理员能访问全部会话，尚无多租户或公网限流。公网使用带 TLS 和限流的反向代理，不要把管理员令牌提供给 Webhook 发送方。
- 网页管理令牌保存在当前站点的浏览器 localStorage 中，同一浏览器配置和站点下的脚本可读取；共用设备使用后应点击“退出”。聊天使用经过清理的 Markdown 渲染，告警及原始审批数据使用纯文本显示。提示词将告警作为不可信数据，但提示词本身不能替代权限隔离。
- data/store.json 及备份保存告警、消息和回复，需备份并保护访问。CLI 诊断可能出现在失败记录中，仅向可信管理员开放。
- 尚未集成 Prometheus、Loki 或 Kubernetes 查询，可为 Codex 另外配置受限只读工具。分析结果显示在网页，当前不会自动转发到飞书或邮件。

## 验证

运行 `npm test`。测试使用独立临时数据目录和模拟 app-server，覆盖握手、续聊、增量事件、提问等待和答复、审批拒绝、鉴权、SSE、并行会话、取消、超时，以及原有 Webhook 和 JSON 持久化功能。真实模型需部署环境认证后另行联调。
