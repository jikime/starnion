---
title: 浏览器控制
nav_order: 18
parent: 功能
grand_parent: 🇨🇳 中文
---

# 浏览器控制

## 概述

Starnion 的浏览器控制功能让 AI 能够自动操作真实的 Chromium 浏览器。只需一条自然语言指令，即可完成 URL 导航、按钮点击、文本输入、页面截图等操作。

截图会自动作为图片附加到聊天中，在 Telegram 和网页聊天中均可立即查看。

---

## 激活方法

浏览器技能默认处于禁用状态。使用前需要在服务器上安装 Playwright。

```bash
# 安装 Playwright（在 agent 容器内部或原生环境中）
playwright install chromium
playwright install-deps chromium
```

安装完成后，在 **设置 > 技能** 中启用 `browser` 技能。

---

## Headless / Headed 模式

控制浏览器是否显示可见窗口（headed）或在后台不可见地运行（headless）。

### 自动检测（默认）

无需手动配置，系统会分析运行环境并自动决定模式。

| 环境 | 模式 | 检测依据 |
|------|------|----------|
| Docker 容器 | Headless | 检测到 `/.dockerenv` 文件 |
| CI 环境（GitHub Actions 等） | Headless | 检测到 `CI` 环境变量 |
| Linux（无显示服务器） | Headless | 未设置 `DISPLAY` / `WAYLAND_DISPLAY` |
| macOS / Windows | Headed | 桌面环境 |
| Linux（有显示服务器） | Headed | 已设置 `DISPLAY` |

### 手动设置

可通过环境变量或配置文件覆盖自动检测结果。

**环境变量（最高优先级）：**

```bash
BROWSER_HEADLESS=false   # 强制 headed（显示浏览器窗口）
BROWSER_HEADLESS=true    # 强制 headless
```

**`~/.starnion/starnion.yaml`：**

```yaml
browser:
  headless: false   # 强制 headed
```

优先级：`BROWSER_HEADLESS` 环境变量 > `starnion.yaml` > 自动检测

---

## 使用示例

### 截图

最常见的使用方式。打开 URL 并将截图作为图片发送到聊天中。

```
你：帮我在百度上搜索今天北京的天气
机器人：[正在控制浏览器...]
       [截图图片附件]
       这是北京当前天气的截图。

你：帮我截取 https://www.google.com/maps
机器人：[正在控制浏览器...]
       [地图截图图片附件]
       这是 Google 地图的截图。
```

### 网页导航与点击

```
你：打开百度登录页面
机器人：已打开百度登录页面。标题：百度

你：点击登录按钮
机器人：已点击"登录"按钮。
```

### 输入文本

```
你：在搜索框中输入"机器学习入门"
机器人：已在搜索框中输入文本。

你：按 Enter 键
机器人：已按下 Enter 键。
```

---

## 截图工作原理

为提高截图质量，系统采用多阶段加载检测策略。

```
1. DOM 加载（domcontentloaded）
      ↓
2. 等待网络空闲（最多 15 秒）
   — 等待 AJAX / API 调用完成
      ↓
3. DOM 稳定性检测（MutationObserver）
   — 800ms 内无 DOM 变化则判定为"加载完成"
   — 最大等待时间：12 秒
   — 精确检测 SPA 页面"加载动画 → 结果显示"的切换
      ↓
4. 额外等待（可选，wait_ms 参数）
   — 对地图、图表等特殊页面可手动指定额外等待时间
      ↓
5. 检测到 Canvas → 自动额外等待 4 秒
   — 等待地图（Google Maps、百度地图等）的瓦片渲染
      ↓
6. 截图并发送图片
```

> **提示：** 对于地图截图，Canvas 自动检测会确保瓦片充分加载后再截图。如果结果仍不完整，可以指定 `wait_ms=3000` 来增加额外等待时间。

---

## 可用工具

AI 会自动选择工具，但在指定特定操作时可供参考。

| 工具 | 说明 | 示例请求 |
|------|------|----------|
| `browser_open_screenshot` | 打开 URL + 截图（一步完成） | "截取这个 URL 的截图" |
| `browser_navigate` | URL 导航 | "打开谷歌" |
| `browser_screenshot` | 当前页面截图 | "截取当前屏幕" |
| `browser_click` | 点击元素 | "点击确认按钮" |
| `browser_type` | 输入文本 | "在搜索框中输入天气" |
| `browser_press` | 按键 | "按 Enter 键" |
| `browser_hover` | 悬停在元素上 | "将鼠标移到菜单上" |
| `browser_scroll` | 滚动页面 | "向下滚动" |
| `browser_snapshot` | 获取无障碍树 | "告诉我页面结构" |
| `browser_wait_for` | 等待特定元素出现 | （自动使用） |
| `browser_wait_ms` | 等待指定时间 | （自动使用） |
| `browser_get_text` | 提取页面全部文本 | "获取这个页面的文字" |
| `browser_evaluate` | 执行 JavaScript | （高级用法） |
| `browser_close` | 关闭浏览器 | "关闭浏览器" |

---

## 搜索 URL 格式

使用直接搜索 URL 比在首页点击搜索框更快速、更稳定。

| 搜索引擎 | URL 格式 |
|----------|----------|
| 百度 | `https://www.baidu.com/s?wd=关键词` |
| 谷歌 | `https://www.google.com/search?q=关键词` |
| Bing | `https://www.bing.com/search?q=关键词` |

---

## 会话管理

- 浏览器会话按用户维护。
- 最后一次操作后 **5 分钟** 无活动，会话自动关闭。
- 完成任务后说"关闭浏览器"可立即释放服务器资源。
- 截图后会话仍保持活跃，可继续进行点击、输入等交互操作。

---

## 常见问题

**Q. 需要登录的网站也能控制吗？**
可以。您可以说"在用户名输入框中输入 user@example.com"、"在密码框中输入密码"等。注意密码会保留在聊天记录中，请谨慎操作。

**Q. 截图显示的是加载中的画面怎么办？**
DOM 稳定性检测会自动处理大多数情况。对于特殊页面，可以说"再等 3 秒后截图"，AI 会使用 `wait_ms=3000` 参数。

**Q. 地图截图显示白屏怎么办？**
Canvas 自动等待（4 秒）可以处理大多数情况，但在网速较慢时可能不够。请尝试说"等待 5 秒后截取地图"。

**Q. 遇到反爬虫拦截怎么办？**
部分网站会拦截自动化访问。此时可以使用 `browser_get_text()` 仅提取文本内容并进行摘要。

**Q. 如何在 Docker 环境中使用 headed 模式？**
在 Docker 容器内使用 headed 模式需要虚拟显示器（Xvfb）。建议在 Docker 环境中默认使用 headless 模式。
