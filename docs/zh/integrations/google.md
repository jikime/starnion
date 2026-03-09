---
title: Google 集成
nav_order: 1
parent: 集成
grand_parent: 🇨🇳 中文
---

# Google 集成

将 Starnion 连接到您的 Google 账户，让 AI 智能体能够使用自然语言控制 Google 日历、Gmail、Google Drive、Google Docs 和 Google Tasks。连接后，您可以通过 Telegram 和网页界面使用所有这些功能。

---

## 概述

通过 Google 集成，您可以：

- **日历**：使用自然语言创建、查看和删除事件，例如"明天上午10点安排一个团队会议"
- **Gmail**：搜索收到的邮件，发送新邮件
- **Drive**：查看文件列表，将文件上传到 Drive
- **Docs**：创建新的 Google 文档，读取现有文档的内容
- **Tasks**：添加待办事项，查看列表，标记完成

> **可选功能：** Google 集成默认禁用。管理员必须配置 OAuth 应用，每个用户必须在设置中完成连接后才能使用。

---

## 支持的功能

| 服务 | 支持的功能 |
|------|-----------|
| 日历 | 创建事件、查看即将到来的事件、删除事件 |
| Gmail | 查看收件箱列表、发送邮件 |
| Drive | 查看文件列表、上传文件 |
| Docs | 创建文档、读取文档内容 |
| Tasks | 添加待办事项、查看列表、标记完成、删除 |

---

## 前提条件：创建 Google Cloud Console OAuth 应用

要使用 Google 集成，服务器管理员必须在 Google Cloud Console 中创建 OAuth 2.0 凭据并在 Starnion 中进行配置。

> **普通用户：** 此步骤由服务器管理员执行。请联系您的管理员进行配置，或者只有在您自己运行 Docker 时才按照以下流程操作。

### 第一步：创建 Google Cloud 项目

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 点击顶部的项目选择下拉菜单 → **新建项目**。
3. 输入项目名称，点击**创建**。

### 第二步：启用 API

1. 在左侧菜单中，点击 **API 和服务** → **库**。
2. 搜索并启用以下每个 API：
   - `Google Calendar API`
   - `Gmail API`
   - `Google Drive API`
   - `Google Docs API`
   - `Tasks API`

### 第三步：配置 OAuth 同意屏幕

1. 点击 **API 和服务** → **OAuth 同意屏幕**。
2. 用户类型：选择**外部**，然后点击**创建**。
3. 输入应用名称、用户支持电子邮件和开发者联系电子邮件。
4. 点击**保存并继续**。
5. 在**添加或删除范围**下，添加以下范围：
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/documents
   https://www.googleapis.com/auth/tasks
   ```
6. 在测试用户步骤中，添加您自己的 Google 账户。

### 第四步：创建 OAuth 凭据

1. 点击 **API 和服务** → **凭据**。
2. 点击**创建凭据** → 选择 **OAuth 客户端 ID**。
3. 应用类型：选择 **Web 应用**。
4. 在**已授权的重定向 URI** 下，添加 Starnion 回调 URI：
   ```
   http://localhost:8080/auth/google/callback
   ```
   > 在生产环境中，请将其替换为您的实际域名（例如：`https://yourdomain.com/auth/google/callback`）。
5. 点击**创建**，然后复制**客户端 ID** 和**客户端密钥**。

---

## 环境变量配置

在 Starnion 的 `.env` 文件中设置您获取的凭据。

```dotenv
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
GATEWAY_PUBLIC_URL=http://localhost:8080
```

`GATEWAY_PUBLIC_URL` 是 OAuth 回调 URI 的基础地址。Gateway 将此值与 `/auth/google/callback` 组合来构建重定向 URI。

更改后，重启 Gateway 服务。

```bash
docker compose restart gateway
```

---

## 设置：连接您的 Google 账户

### 通过网页界面连接

1. 登录 Starnion 网页界面。
2. 点击左侧菜单中的**设置** → **集成**标签页。
3. 在 **Google** 部分点击**连接**。
4. 在 Google 账户选择界面上选择要关联的账户。
5. 在权限界面点击**允许**。
6. 连接成功后，将显示**已连接**状态。

### 通过 Telegram 连接

您也可以从 Telegram 机器人发起 Google 集成。

1. 向机器人发送"连接 Google"或"关联 Google"等消息。
2. 机器人发送认证 URL。
3. 点击 URL 完成相同的 OAuth 流程。

```
我：关联 Google
机器人：请点击以下链接连接您的 Google 账户：
    http://yourdomain.com/auth/google/telegram?uid=...
```

---

## 使用方法

连接 Google 账户后，以自然语言向 AI 发出请求。

### Google 日历

```
我：明天我有什么日程？
机器人：明天的已排定事件：
    - 10:00：每周团队会议
    - 14:00：客户报告

我：下周三下午2点添加一个1小时的项目会议
机器人：已创建事件"项目会议"。
    - 日期/时间：2026-03-11 14:00 – 15:00

我：取消明天下午2点的会议
机器人：已删除事件"客户报告"。
```

### Gmail

```
我：显示我的未读邮件
机器人：未读邮件（最新10封）：
    - [重要] 合同审查请求（来自：partner@example.com）
    - 每周通讯（来自：news@example.com）

我：向 partner@example.com 发送主题为"合同审查完成"的邮件
机器人：发送前请确认。
    收件人：partner@example.com
    主题：合同审查完成
    是否发送？

我：是的，发送
机器人：邮件已发送。
```

> **注意：** AI 在发送邮件前会向您确认内容。只有在您确认"是的，发送"后才会发送。

### Google Drive

```
我：在 Drive 中找到报告文件
机器人：Drive 文件列表（搜索："报告"）：
    - 2026年第一季度销售报告.xlsx
    - 项目最终报告.docx

我：将今天的会议记录文件上传到 Drive
机器人：（已将附加文件上传到 Drive。）
    已将"meeting_notes_20260308.pdf"上传到 Drive。
```

### Google Docs

```
我：创建一个标题为"2026年第二季度计划"的 Google 文档
机器人：已创建文档"2026年第二季度计划"。
    https://docs.google.com/document/d/abc123...

我：读取 Drive 文档 abc123 的内容
机器人：文档：2026年第二季度计划
    ...
```

### Google Tasks

```
我：添加一个"起草提案"的待办事项，截止明天
机器人：已添加待办事项"起草提案"。

我：显示我的待办事项列表
机器人：待办事项列表：
    ⬜ 起草提案
    ⬜ 收集团队反馈
    ⬜ 撰写每周报告

我：将"起草提案"标记为完成
机器人：已将待办事项"起草提案"标记为完成。
```

---

## 权限范围

Starnion 请求的 Google 权限范围如下。

| 范围 | 用途 |
|------|------|
| `calendar` | 读取和写入事件 |
| `gmail.send` | 发送邮件 |
| `gmail.readonly` | 查看邮件列表 |
| `drive` | 查看文件列表、上传 |
| `documents` | 创建和读取文档 |
| `tasks` | 管理待办事项 |

---

## 如何断开连接

1. 设置 → 集成 → Google 部分。
2. 点击**断开连接**。
3. 断开连接后，已存储的 OAuth 令牌将立即删除。

您也可以询问 AI："断开 Google 连接。"

---

## 注意事项

### 安全性

- OAuth 令牌（访问令牌 + 刷新令牌）存储在数据库中。
- 访问令牌过期时，会自动使用刷新令牌续期。
- 刷新令牌过期时需要重新连接（通常在6个月后）。

### 启用 Google 技能

Google 技能默认禁用。管理员必须在使用前启用该技能。

- 在 设置 → 技能 下开启 **Google** 技能启用开关。
- 如果 Google OAuth 应用设置（`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`）未配置，启用技能也不会生效。

---

## 故障排除

### "Google 集成未配置"

服务器上未设置 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 环境变量。检查 `.env` 文件并重启 Gateway。

### "请先连接您的 Google 账户"

您尚未连接 Google 账户。请在网页界面的 设置 → 集成 → Google 中完成连接。

### OAuth 同意屏幕上的"此应用未经验证"警告

这在开发过程中是正常的。点击**高级** → **转到 [应用名称]** 继续。对于生产部署，请向 Google 申请应用验证，或者如果只针对您组织内的用户，请将用户类型设置为**内部**。

### "Notion API 密钥无效"（或 401 错误）

OAuth 令牌可能已过期或被吊销。请断开连接后重新连接。

---

## 常见问题

**Q：我可以连接多个 Google 账户吗？**
A：目前每个用户只能连接一个 Google 账户。

**Q：通过 Telegram 连接的 Google 账户与通过网页界面连接的相同吗？**
A：是的。通过同一个 Starnion 账户连接时，无论使用哪个频道连接，都共享相同的 Google 令牌。

**Q：我可以同时使用 Google Tasks 和日历吗？**
A：可以，连接 Google 后，您可以用自然语言使用这两项服务。

**Q：AI 能通过 Gmail 随意发送邮件吗？**
A：不能。在发送邮件前，AI 会向您确认收件人、主题和正文，只有在您确认后才会发送。
