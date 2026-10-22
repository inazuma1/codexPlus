# Codex Plus

[简体中文](Readme.zh.md) | English

Use Codex through a web interface and Webhooks to develop projects, deploy applications, and handle ongoing operations. Describe what you need in the browser and let Codex create projects, edit code, run tests, and deploy. Connect alerts and other events so Codex can investigate and respond using project context.

Codex Plus covers the workflow from development to deployment and incident response. The web interface provides task submission and interaction, while Codex runs code operations and commands on the server.

Built with Node.js and JSON file storage, it requires no database setup or npm dependency installation. It is intended for personal use and single-user self-hosting.

## What you can do

- **Develop and deploy projects**: Describe a requirement and let Codex create a project, implement features, or update existing code. After testing, it can build, deploy, and verify the application. Available operations depend on the configured working directory, sandbox, and system permissions.
- **Respond to events**: Alertmanager integration is complete. Alerts can trigger investigation, code fixes, regression tests, and deployment with recovery verification when automatic deployment conditions are met. Webhooks can also receive bug reports, release notifications, and other events. See [Connecting external events](#connecting-external-events) for execution rules.
- **Control execution**: Start with a plan or set an ongoing goal, answer follow-up questions, choose individual approvals or automatic approval for a chat, and retain execution history.

For example, ask “Create a library management system, test it, and deploy it to this server,” or respond to an alert with “Find the cause, fix the code, and redeploy.” The execution environment needs the required runtime, scripts, and permissions, or Codex can prepare them with your authorization.

## Quick start

You need **Node.js 24+** and a **Codex CLI** version that supports app-server. Configure the model and authentication under the system account that will run the service, and verify that Codex works from the command line. Integration has been tested with Codex CLI 0.163.0.

### 1. Get the project

```bash
git clone https://github.com/inazuma1/codexPlus.git
cd codexPlus
cp .env.example .env
```

In Windows PowerShell, replace the last command with `Copy-Item .env.example .env`.

### 2. Configure access tokens

Edit `.env` and replace these placeholders with two different long, random strings:

```dotenv
ADMIN_TOKEN=replace-with-a-long-random-admin-token
WEBHOOK_TOKEN=replace-with-a-different-long-random-webhook-token
```

`ADMIN_TOKEN` is used to sign in to the web interface. `WEBHOOK_TOKEN` authenticates external services. To work on another project, set `CODEX_WORKDIR` to its directory. Execution is read-only by default; set `CODEX_SANDBOX=workspace-write` to allow file changes.

### 3. Start the service and open the web interface

```bash
npm start
```

Without npm, run `node --env-file-if-exists=.env src/server.js` directly.

Open [http://127.0.0.1:3080](http://127.0.0.1:3080), enter `ADMIN_TOKEN`, and create a chat. The browser remembers the token across page refreshes. Signing out clears it.

Before the first user task, Codex Plus checks for `AGENTS.md` in the working directory. If it is missing, Codex generates integration instructions. The bridge maintains separate token and Webhook policy sections while preserving other project rules. The policy covers branches, tests, deployment, and rollback, and is synchronized before subsequent applicable tasks. The server still determines whether a task may only analyze, prepare a fix on a branch, or deploy. Administrators can view and copy the Webhook token from the inbox on the right. See [workspace initialization](docs/configuration.md#工作区初始化).

To explore the interface without calling a model, set `MOCK_CODEX=true` in `.env`.

## Connecting external events

External services send JSON to `POST /webhooks/<source>` with `Authorization: Bearer <WEBHOOK_TOKEN>`. Codex Plus receives events, batches related messages, and starts a Codex task. You can review the result, add instructions, and continue in the resulting chat.

To reuse existing project context, copy the chat ID shown at the top of the web interface and send events to `POST /webhooks/<source>/<sessionId>`.

For a Git-managed project, the workflow is: **Receive event → Read-only investigation and risk assessment → Create a fix branch from master → Edit and test → Merge into master → Deploy and verify**. With `WEBHOOK_EXECUTION_MODE=auto`, a writable workspace, and a target chat outside plan mode, tasks proceed without asking the user questions:

- **Automatic deployment is allowed**: Fix, test, and commit on a separate `codex/webhook-*` branch. Once checks pass, fast-forward merge into `master`, then deploy and verify using the project's existing workflow.
- **Automatic deployment is not allowed**: If there is a clear fix that can be safely isolated, make changes, test, and commit on a new branch. Keep the branch without merging or deploying. Report the branch, commit, test results, reasons for withholding deployment, and recommended next steps in the chat. If information is insufficient or a safe fix is not possible, provide findings and recommendations only.

If the working tree has uncommitted changes, local `master` is missing, or merging fails, stop and report the issue. Existing changes are preserved, and Codex does not automatically substitute `main` or push to a remote repository. Codex performs Git operations according to the execution policy. Projects without Git use the existing fix, test, deploy, and verify workflow.

High risk, insufficient verification, or a missing recovery plan prevents automatic deployment. Database schema changes, data deletion, and authentication or permission changes are assessed based on actual impact, tests, and recovery options rather than blocked categorically. Set `WEBHOOK_EXECUTION_MODE=analyze`, or use read-only or plan mode, for analysis and recommendations only.

[View Alertmanager configuration and Webhook examples →](docs/webhooks.md)

## Roadmap

The following capabilities are planned and are not all implemented yet:

- **Integrate GitLab, Jira, ZenTao, and similar tools**: Connect requirements, tasks, issues, and repositories; turn management events into Codex tasks; and write back progress and results.
- **Automate feature development**: Gather context from requirements or tasks, prepare a plan, edit code, run tests, commit changes, and create merge requests linked to the original task and acceptance results.
- **Automatically track and fix bugs**: Record alerts, failed tasks, and user feedback as issues, attach logs and reproduction details, drive investigation and regression testing, and update issue status.

The goal is a continuous workflow connecting requirements, code, deployment, and production feedback. Further automation will support project and operation scope configuration, approvals, failure handling, and execution tracking.

## Further documentation

The detailed guides below are currently in Chinese.

| Topic | Guide |
| --- | --- |
| Models, working directory, and environment variables | [Configuration](docs/configuration.md) |
| Follow-up questions, approvals, plan mode, and goal mode | [Web interface](docs/usage.md) |
| Alerts and other external services | [Webhooks and Alertmanager](docs/webhooks.md) |
| Management API | [HTTP API](docs/api.md) |
| Backups, recovery, deployment, and tests | [Data and operations](docs/operations.md) |
| Model behavior during password resets | [Prompt instructions](docs/password-prompts.md) |

Chat data is stored in `data/store.json` by default. This is a single-user service. Use HTTPS and protect access tokens when exposing it to the internet. See [operations](docs/operations.md) for backup and permission details.
