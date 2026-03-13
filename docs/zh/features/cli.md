---
title: CLI 聊天与认证
nav_order: 12
parent: 功能指南
grand_parent: 🇨🇳 中文
---

# CLI 聊天与认证

## 概述

除了 Web UI 和 Telegram，Starnion 还允许您直接从**终端（CLI）**与 AI 聊天。当您通过 SSH 连接到服务器，或者想快速查询 AI 而无需打开浏览器时，这尤其有用。

CLI 中的对话存储在与 Web UI 和 Telegram 聊天**相同的数据库**中。这意味着您可以在 Web UI 中查看从终端开始的对话。

---

## 验证安装

CLI 功能内置于 `starnion` 二进制文件中。使用以下命令检查是否已安装。

```bash
starnion --version
```

如果未安装，请参阅[安装指南](/docs/zh/getting-started/introduction)。

---

## 认证

### 登录

使用 `starnion login` 通过邮箱和密码登录。登录成功后，认证令牌将保存到 `~/.starnion/user.yaml`。

```bash
starnion login
```

```
Email:    user@example.com
Password: ••••••••
Login successful! Welcome, Jane Doe.
Token valid until: April 9, 2025 (30 days)
```

**令牌存储位置：** `~/.starnion/user.yaml`

```yaml
# ~/.starnion/user.yaml
token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
expires_at: "2025-04-09T00:00:00Z"
email: user@example.com
name: Jane Doe
```

> **令牌有效期为 30 天。** 在到期前 7 天开始，每次运行 CLI 命令时都会显示续期提醒。

---

### 登出

`starnion logout` 删除本地存储的令牌。不会影响服务器端会话。使用 CLI 前需要重新登录。

```bash
starnion logout
```

```
Logged out. Local credentials have been removed.
```

---

### 查看当前登录

使用 `starnion whoami` 显示当前认证账户的信息。

```bash
starnion whoami
```

```
Name:    Jane Doe
Email:   user@example.com
Token expires: April 9, 2025 (in 23 days)
```

如果未登录：

```
Not logged in. Run 'starnion login' to authenticate.
```

---

## CLI 聊天

### 启动交互式 REPL 模式

运行 `starnion chat` 进入交互式 REPL（Read-Eval-Print Loop）模式。在提示符处输入消息，AI 将实时响应。

```bash
starnion chat
```

```
Starnion CLI Chat Mode
Starting a new conversation. Type 'exit' or press Ctrl+C to quit.

> Hello! What's the weather like today?
AI: Let me check the current weather for you.
    Running weather...
    Current weather in Seoul: Clear, 18 C.
    Air quality is moderate.

> Summarize my spending this month.
AI: Running finance_summary...
    March spending (1st-10th):
    - Food:        $31.50
    - Cafe:        $13.30
    - Transport:   $11.40
    - Total:       $56.20

> exit
Exiting. Your conversation has been saved.
```

### 结束会话

要退出 REPL 模式，使用以下任一方式：

- 输入 `exit` 或 `quit`
- 按 `Ctrl+C`

退出时当前对话会自动保存。

---

## 与 Web UI 的集成

在 CLI 中开始的对话**在 Web UI 侧边栏中可见**。CLI 对话以 `platform='cli'` 存储，并显示在侧边栏的 **CLI** 部分，与 Web 和 Telegram 对话分开显示。

```
侧边栏对话列表：
  Telegram
    └─ 询问今天的天气
  CLI
    └─ 3月10日支出汇总  <-- 从 CLI 开始
  Web
    └─ 合同分析请求
```

> 在 Web UI 中选择 CLI 对话可以恢复该会话的完整消息上下文。

---

## 令牌过期警告

认证令牌有效期为 **30 天**。在**到期前 7 天**开始，每次运行 CLI 命令时都会显示提醒。

```bash
starnion chat
```

```
Your token expires in 5 days. Run 'starnion login' to renew it.

Starnion CLI Chat Mode
> ...
```

令牌过期后，所有 CLI 命令都会提示重新登录。

```bash
starnion whoami
```

```
Your token has expired. Run 'starnion login' to sign in again.
```

---

## 多用户支持

CLI 支持**每个操作系统用户独立认证**。每个 OS 用户的主目录中都会创建独立的 `~/.starnion/user.yaml` 文件，因此同一服务器上的多个用户可以各自使用自己的 Starnion 账户。

| OS 用户 | 令牌文件路径 |
|---------|------------|
| alice | `/home/alice/.starnion/user.yaml` |
| bob | `/home/bob/.starnion/user.yaml` |
| root | `/root/.starnion/user.yaml` |

每个用户使用自己的令牌，只能访问自己的对话历史。

---

## 命令参考

| 命令 | 说明 |
|------|------|
| `starnion login` | 使用邮箱/密码登录并将令牌保存到 `~/.starnion/user.yaml` |
| `starnion logout` | 删除本地令牌 |
| `starnion whoami` | 显示当前账户和令牌过期日期 |
| `starnion chat` | 启动交互式 REPL 聊天模式 |

---

## 常见问题

**Q. 可以手动编辑令牌文件（`~/.starnion/user.yaml`）吗？**

A. 不建议。令牌是服务器签名的 JWT。手动修改会导致认证失败。令牌过期时，使用 `starnion login` 获取新令牌。

**Q. CLI 对话没有出现在 Web UI 侧边栏中。**

A. 查找侧边栏中的 **CLI** 部分。如果 Web UI 已经打开，请刷新页面以重新加载对话列表。

**Q. 可以在 CLI 中切换多个 Starnion 账户吗？**

A. 可以 -- 运行 `starnion logout`，然后用不同账户运行 `starnion login`。令牌文件将被新账户的凭据覆盖。

**Q. 我想在 CI/CD 管道中使用 CLI。**

A. 目前 CLI 仅支持交互式登录。自动化环境的 API 密钥认证已计划在未来版本中推出。

**Q. CLI 在不稳定的网络连接下能工作吗？**

A. CLI 对每条消息发起 API 调用。如果网络断开，请求将失败并显示错误消息，不会重试。建议在稳定的网络连接下使用 CLI。

---

## starnion ask -- 单次提问

`starnion chat` 是交互式会话，而 `starnion ask` **发送单个问题并立即返回答案**。这对于在脚本和管道中集成 AI 输出非常理想。

### 基本用法

```bash
# 直接提问
starnion ask "给我一个 Python 列表推导式的例子"

# 通过管道传递内容
cat error.log | starnion ask "这个错误的原因是什么？"
cat report.md | starnion ask "用3行总结一下"
```

### 功能

| 功能 | 详情 |
|------|------|
| 需要登录 | 是（需先运行 `starnion login`） |
| 对话历史 | 保存到 Web UI |
| 流式传输 | 支持实时输出 |
| 管道支持 | `cat file \| starnion ask "..."` |

### 管道示例

```bash
# 分析日志文件
tail -100 /var/log/app.log | starnion ask "分析最近的错误模式"

# 代码审查
git diff HEAD~1 | starnion ask "审查这些更改"

# 总结文档
curl -s https://example.com/readme.md | starnion ask "总结要点"
```
