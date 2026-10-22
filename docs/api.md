# HTTP API

[返回项目首页](../README.md)

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
| POST | /webhooks/:source/:sessionId | 接收事件并追加到指定会话，返回 session_id；无此会话返回 404 |

重启后排队任务继续处理，运行中或等待回答的任务标记失败，供管理员重试。待回答请求不跨服务重启保留，旧请求不能在重启后批准；不会自动重新调用状态不确定的任务。重试可能在原 Codex 会话中追加重复输入。网页刷新不会中断服务器上等待回答的任务，重新登录并打开对应会话后可继续回答。
