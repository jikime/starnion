---
title: 浏览器控制
nav_order: 18
parent: 功能
grand_parent: 🇨🇳 中文
---

# 浏览器控制

## 概述

Starnion 的浏览器控制功能让 AI 能够自动操作真实的 Chrome 浏览器。只需一条自然语言指令，即可完成 URL 导航、按钮点击、文本输入、表单自动填充、页面截图等操作。

基于 Chrome DevTools MCP 运行，**只需安装 Chrome，无需额外安装其他工具**，即可立即使用。Agent 会自动启动并管理 Chrome。

截图会自动上传到云存储（MinIO），作为图片附加到聊天中，同时**自动保存到图片菜单**。在 Telegram 和网页聊天中均可立即查看。

---

## 激活方法

浏览器功能默认已启用。在安装了 Chrome 浏览器的环境中会自动启动。

**`~/.starnion/starnion.yaml` 配置：**

```yaml
browser:
  enabled: true              # 开启/关闭浏览器功能
  headless: false            # false: 显示浏览器窗口（默认），true: 后台运行
  control_port: 18793        # 浏览器控制服务器端口（默认值）
  # url: http://127.0.0.1:9222  # 仅在连接已运行的 Chrome 时配置
```

**环境变量：**

```bash
BROWSER_ENABLED=false          # 禁用浏览器功能
BROWSER_HEADLESS=true          # 强制 headless 模式
BROWSER_CONTROL_PORT=18793     # 修改端口
BROWSER_URL=http://127.0.0.1:9222  # 连接已有的远程 Chrome 实例
```

---

## Headless / Headed 模式

| 模式 | 说明 | 使用场景 |
|------|------|----------|
| **Headed**（默认） | 浏览器窗口显示在屏幕上 | 桌面环境、本地开发 |
| **Headless** | 无窗口，在后台运行 | 服务器环境、Docker、CI |

```bash
# 强制 headless（环境变量优先）
BROWSER_HEADLESS=true

# 在 starnion.yaml 中配置
browser:
  headless: true
```

---

## 使用示例

### 截图

```
你：帮我在百度上搜索今天北京的天气
机器人：[正在控制浏览器...]
       ![截图](http://localhost:8080/api/files/browser/screenshots/uuid.png)
       这是北京当前天气的截图。

你：帮我截取 https://maps.google.com
机器人：[正在控制浏览器...]
       ![截图](http://localhost:8080/api/files/browser/screenshots/uuid.png)
       这是 Google 地图的截图。
```

> 截图会自动保存到**图片菜单**。

### 路线搜索与截图

```
你：在高德地图上搜索从北京到上海的路线并截图
机器人：我来打开高德地图并搜索路线！
       [点击路线规划 → 输入出发地/目的地 → 选择自动补全...]
       ![路线截图](http://localhost:8080/api/files/browser/screenshots/uuid.png)
       这是北京 → 上海的路线搜索结果，预计约 12 小时 30 分钟，1213 公里。
```

### 网页导航与点击

```
你：在谷歌搜索框中输入"天气"并搜索
机器人：已打开谷歌，在搜索框中输入"天气"并按下了 Enter。
       ![搜索结果](http://localhost:8080/api/files/browser/screenshots/uuid.png)
```

### 表单输入

```
你：在登录页面的邮箱输入框中输入 test@example.com
机器人：已找到邮箱输入框并输入了 test@example.com。
```

---

## 工作原理

```
用户请求
    ↓
Agent（Claude）执行 starnion-browser.py 命令
    ↓
浏览器控制服务器（127.0.0.1:18793）→ Chrome DevTools MCP
    ↓
实际操作 Chrome 浏览器（点击、输入、截图等）
    ↓
截图：上传到 MinIO → 生成 URL
    ↓
Agent 以 Markdown 图片格式回复：![alt](url)
    ↓
网关：发送图片到 Telegram + 保存到图片菜单
```

---

## 支持的命令

AI 会自动选择，但在提出具体请求时可供参考。

| 命令 | 说明 | 示例请求 |
|------|------|----------|
| `snapshot` | 页面 AI 快照（识别可点击元素） | "告诉我当前页面结构" |
| `navigate` | 跳转到 URL | "打开谷歌" |
| `screenshot` | 当前页面截图 | "截取当前屏幕" |
| `click` | 点击元素 | "点击确认按钮" |
| `fill` | 在输入框中输入文本 | "在搜索框中输入天气" |
| `fill_form` | 一次填写多个输入框 | "输入我的邮箱和密码" |
| `press` | 按下按键 | "按 Enter 键" |
| `hover` | 将鼠标悬停在元素上 | "将鼠标移到菜单上" |
| `wait` | 等待特定文本出现 | （自动使用） |
| `tabs` | 列出已打开的标签页 | "显示已打开的标签页" |
| `open` | 打开新标签页 | "在新标签页中打开百度" |

---

## 搜索 URL 格式

使用直接搜索 URL 比在首页点击搜索框更快速、更稳定。

| 搜索引擎 | URL 格式 |
|----------|----------|
| 百度 | `https://www.baidu.com/s?wd=关键词` |
| 谷歌 | `https://www.google.com/search?q=关键词` |
| Bing | `https://www.bing.com/search?q=关键词` |
| YouTube | `https://www.youtube.com/results?search_query=关键词` |

---

## 自动补全处理

对于搜索框、地址输入等带有自动补全的输入框，必须按以下顺序处理：

```
1. 使用 fill 输入文本
   ↓
2. 使用 snapshot 查看自动补全列表
   ↓
3. 找到自动补全项的 ref，使用 click 选择
   ↓
4. 继续下一步
```

> **注意：** 自动补全项必须通过**点击**选择，不能用 Enter 键。

---

## 图片保存

截图会自动处理。

```
截图
    ↓
PNG 上传到 MinIO（browser/screenshots/）
    ↓
生成 URL：/api/files/browser/screenshots/uuid.png
    ↓
Agent 响应中包含 Markdown 图片：![截图](url)
    ↓
自动保存到图片菜单（source: browser, type: screenshot）
```

---

## 配置参考

```yaml
# ~/.starnion/starnion.yaml
browser:
  enabled: true
  control_port: 18793        # 浏览器控制服务器端口
  headless: false            # true: 后台运行，false: 显示窗口
  evaluate_enabled: false    # 允许执行 JavaScript（出于安全考虑默认 false）
  # url: http://127.0.0.1:9222  # 直接连接已运行的 Chrome
```

---

## 常见问题

**Q. Chrome 会自动启动吗？**
是的。Agent 通过 Chrome DevTools MCP 自动启动和管理 Chrome。无需额外安装或配置，只需有 Chrome 即可。

**Q. 可以使用已经打开的 Chrome 窗口吗？**
可以。使用 `--remote-debugging-port=9222` 选项启动 Chrome 后，在 `starnion.yaml` 中设置 `browser.url: http://127.0.0.1:9222` 即可连接。

**Q. 截图没有出现在图片菜单中怎么办？**
Agent 必须在响应中以 `![截图](url)` 格式包含 URL 才会被保存。如果未保存，请尝试要求："请在回复中以 Markdown 图片格式包含截图链接。"

**Q. 需要登录的网站也能控制吗？**
可以。您可以说"在邮箱输入框中输入 user@example.com"、"在密码框中输入密码"等。注意密码会保留在聊天记录中，请谨慎操作。

**Q. 地图截图显示空白怎么办？**
这是地图瓦片还未加载完成就截图导致的。请尝试说"等待 5 秒后再截图"。

**Q. 遇到反爬虫拦截怎么办？**
部分网站会拦截自动化访问。此时可以使用 `snapshot` 提取页面文本并进行摘要。

**Q. 如何在 Docker 环境中使用 headed 模式？**
在 Docker 容器内使用 headed 模式需要虚拟显示器（Xvfb）。建议在 Docker 环境中默认使用 headless 模式。
