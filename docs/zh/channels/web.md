---
title: 网页聊天
nav_order: 2
parent: 频道
grand_parent: 🇨🇳 中文
---

# 网页聊天

Starnion 网页界面提供基于 WebSocket 的实时聊天接口。无需安装任何额外应用，您可以直接在浏览器中与 AI 智能体对话，支持图片、音频和文档文件传输以及流式响应。

---

## 概述

通过网页聊天频道，您可以：

- **实时流式传输**：AI 响应在生成时即时显示，无需等待完整答案
- **文件传输**：在聊天窗口中附加并发送图片、音频文件和文档
- **工具调用可见性**：实时查看 AI 访问外部服务时使用了哪些工具
- **对话管理**：创建多个对话（线程）并查看历史对话记录
- **多频道**：与 Telegram 连接到同一 AI 智能体，共享对话历史

---

## 主要功能

### 实时流式响应

通过 WebSocket 连接，AI 响应以逐词实时传输的方式呈现。即使是长篇回答，由于您从一开始就能看到生成过程，体验会更加流畅。

### 工具执行显示

当 AI 使用天气查询、网络搜索或 Google 日历等工具时，聊天窗口会显示执行了哪个工具。

```
[工具调用：weather] 正在查询首尔当前天气...
[工具结果：weather] 首尔：晴，22°C
```

### 文件附件与分析

您可以在聊天窗口中附加并发送图片、音频、PDF 和文档文件。AI 将分析文件内容并作出相应回复。

| 文件类型 | 支持格式 | 功能 |
|----------|----------|------|
| 图片 | JPG、PNG、GIF、WebP | 图像分析、描述、文字提取 |
| 音频 | MP3、WAV、OGG | 语音转文字、内容分析 |
| 文档 | PDF、DOCX、TXT | 内容摘要、问答 |

### 生成文件画廊

AI 生成的图片或音频文件将自动保存到画廊。您可以随时在 设置 → 画廊 中查看。

---

## 设置

安装 Starnion 后，网页聊天无需任何额外配置即可立即使用。只需确认以下内容。

### 服务器访问

1. 打开浏览器，导航到 Starnion 服务器地址。
   ```
   http://localhost:3000
   ```
   （在生产环境中使用您的实际域名。）
2. 创建账户或登录。
3. 您可以立即在网页界面左侧的聊天区域开始对话。

### WebSocket 连接检查

网页界面在页面加载时自动连接 WebSocket 服务器。您可以在浏览器开发者工具（F12）→ 网络标签页 → WS 过滤器中验证连接状态。

```
连接 URL：ws://yourdomain.com/ws
认证：Bearer token（Authorization 请求头或 ?token 查询参数）
```

### 反向代理配置（WebSocket）

如果您使用 Nginx 或 Caddy 等反向代理，必须配置 WebSocket 升级请求头。

**Nginx 示例：**

```nginx
location /ws {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 180s;
}
```

**Caddy 示例：**

```
reverse_proxy /ws localhost:8080 {
    transport http {
        versions 1.1
    }
}
```

---

## 使用方法

### 开始新对话

1. 点击左侧边栏中的 **+ 新对话** 按钮。
2. 在聊天输入框中输入消息，按 Enter 键或点击发送按钮。
3. AI 的响应将实时流式显示。

### 发送文件

1. 点击聊天输入框旁边的**附件**图标，或将文件拖入聊天窗口。
2. 文件上传完成后，连同消息一起发送。
3. AI 将分析文件内容并作出回复。

### 选择 AI 模型

您可以在聊天窗口顶部选择对话使用的 AI 模型。只有已在设置中注册了 API 密钥的模型才会显示。

### 查看历史对话

在左侧边栏查看历史对话列表，点击任意条目即可导航到该对话。

---

## 示例对话

### 普通对话

```
我：Python 中怎么创建异步函数？
机器人：在 Python 中，异步函数使用 `async def` 关键字。

    ```python
    import asyncio

    async def fetch_data(url: str) -> str:
        await asyncio.sleep(1)  # 模拟异步操作
        return f"Data from {url}"

    async def main():
        result = await fetch_data("https://example.com")
        print(result)

    asyncio.run(main())
    ```

    `await` 等待协程完成，在此期间事件循环可以处理其他任务。
```

### 发送和分析图片

```
（附加收据图片）
我：帮我整理这张收据

机器人：以下是收据分析结果。
    - 商店：OO Mart
    - 日期：2026-03-08
    - 总计：35,600韩元

    商品：
    - 牛奶（2,800韩元）
    - 面包（4,200韩元）
    - 鸡蛋（6,000韩元）
    - 鸡胸肉（12,800韩元）
    - 零食（9,800韩元）

    是否将此记录到您的消费追踪器中？
```

### 带工具调用的对话

```
我：告诉我首尔当前的天气

[工具调用：weather] 正在查询首尔天气...
[工具结果：weather] 完成

机器人：以下是首尔当前天气。
    - 天气状况：晴
    - 气温：18°C（体感温度16°C）
    - 湿度：45%
    - 下午云量略增，但不会下雨。
```

### 网页界面与 Telegram 整合

```
[在网页界面]
我：下周阅读目标：读完《代码整洁之道》第1-5章

[稍后在Telegram中]
我：我的阅读目标是什么？
机器人：下周阅读目标：读完《代码整洁之道》第1-5章。
    如果有进度更新，请告诉我！
```

---

## WebSocket 协议（开发者参考）

网页聊天使用 Gateway 的 WebSocket 端点（`GET /ws`）。客户端与服务器之间的通信格式如下。

### 连接

```
GET /ws
Authorization: Bearer <jwt-token>
```

或通过查询参数认证：

```
GET /ws?token=<jwt-token>
```

### 客户端 → 服务器（InFrame）

```json
{
  "id": "req-001",
  "method": "chat",
  "params": {
    "message": "你好",
    "model": "gemini-2.0-flash",
    "thread_id": "uuid-of-conversation"
  }
}
```

| 字段 | 说明 |
|------|------|
| `id` | 请求标识符（在响应中原样返回） |
| `method` | 目前只支持 `chat` |
| `params.message` | 用户消息（必填） |
| `params.model` | 使用的 AI 模型（可选） |
| `params.thread_id` | 对话线程 UUID（可选；省略则开始新对话） |

### 服务器 → 客户端（OutFrame）

AI 响应以多个事件帧的形式流式传输。

**文本流式传输：**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "text",
  "payload": { "text": "你好！" }
}
```

**工具执行：**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "tool_call",
  "payload": { "tool": "weather", "text": "正在查询首尔天气..." }
}
```

**文件响应（图片/音频）：**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "file",
  "payload": {
    "name": "generated_image.png",
    "mime": "image/png",
    "url": "https://storage.example.com/...",
    "size": 102400
  }
}
```

**完成：**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "done"
}
```

**事件类型汇总：**

| 事件 | 说明 |
|------|------|
| `text` | AI 响应文本块 |
| `tool_call` | 工具调用已启动 |
| `tool_result` | 工具执行结果 |
| `file` | 生成的文件（图片、音频等） |
| `error` | 发生错误 |
| `done` | 响应完成 |

---

## 注意事项

### 并发连接

如果同一账户同时从多个浏览器标签页或设备连接，最近的连接将成为活跃连接，之前的连接将自动关闭。

### 消息大小限制

WebSocket 最大消息大小为 **64 KB**。文件上传通过 REST API（`/api/v1/upload`）处理，不受此限制约束。

### 保持连接（Ping/Pong）

服务器每 50 秒发送一次 WebSocket Ping 消息。如果 60 秒内没有响应，连接将终止。浏览器会自动回复 Pong，无需额外处理。

### 推荐使用 HTTPS/WSS

在生产环境中，请务必使用 HTTPS 和 WSS（WebSocket 安全）。HTTP/WS 可能在网络上暴露 JWT 令牌。

---

## 故障排除

### 聊天中没有响应

1. 检查浏览器控制台（F12）是否有 WebSocket 连接错误。
2. 验证服务器地址和端口是否正确。
3. 如果使用反向代理，确认 WebSocket 升级请求头已配置。

### 连接频繁断开

- 尝试将反向代理的 `proxy_read_timeout` 或超时设置增加到 180 秒或更长。
- 检查您的网络防火墙是否阻止了 WebSocket 连接。

### "agent service unavailable" 错误

当 Agent 服务（Python）未运行或 Gateway 的 gRPC 连接丢失时会出现此错误。

```bash
# 在 Docker Compose 环境中检查服务状态
docker compose ps

# 检查 Agent 服务日志
docker compose logs agent
```

### 上传的文件不显示图片

如果未配置 MinIO 对象存储，文件存储将被禁用。请检查 Docker Compose 配置中 MinIO 服务是否正在运行。

---

## 常见问题

**Q：我可以在 Telegram 中查看网页界面的对话吗？**
A：可以，网页界面和 Telegram 连接到同一个 AI 智能体。在任一频道中记录的内容都可以从另一个频道中检索。

**Q：多人可以使用同一个服务器吗？**
A：可以，Starnion 支持多用户。每个用户创建账户并维护独立的对话和设置。

**Q：对话历史在服务器上存储多久？**
A：对话历史存储在 PostgreSQL 数据库中。没有单独的删除策略时，将永久存储。您可以在设置中删除单个对话。

**Q：没有网络连接可以使用吗？**
A：如果 Starnion 服务器在本地运行，并且您使用 Ollama 等本地 LLM，则可以在没有网络连接的情况下使用。但是，使用外部 API 的功能——如天气查询、网络搜索和 Google 集成——需要网络访问。

**Q：可以在移动浏览器上使用吗？**
A：可以，Starnion 网页界面采用响应式设计，在移动浏览器中可以正常使用。但是，为了在智能手机上更便捷地使用，推荐使用 Telegram 频道。
