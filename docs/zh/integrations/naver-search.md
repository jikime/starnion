---
title: Naver 搜索集成
nav_order: 5
parent: 集成
grand_parent: 🇨🇳 中文
---

# Naver 搜索集成

将 Starnion 连接到 Naver 搜索 API，让 AI 智能体能够执行专门针对韩语内容的搜索。使用自然语言访问 Naver 的博客、新闻、咖啡（社区论坛）、购物和知识iN（问答）搜索服务。

---

## 概述

使用 Naver 搜索集成您可以：

- **博客搜索**: 搜索 Naver 博客帖子
- **新闻搜索**: 搜索韩语新闻文章
- **咖啡搜索**: 搜索 Naver 咖啡（社区论坛）帖子
- **购物搜索**: 搜索商品信息
- **知识iN搜索**: 搜索问题和答案

> **可选功能：** Naver 搜索集成默认处于禁用状态。您需要在 Naver 开发者中心创建应用并注册 API 密钥，然后启用技能。

---

## 支持的搜索类型

| 搜索类型 | 说明 |
|----------|------|
| 博客 | Naver 博客帖子搜索 |
| 新闻 | 韩语新闻文章搜索 |
| 咖啡 | Naver 咖啡社区帖子搜索 |
| 购物 | 商品名称、价格等购物信息搜索 |
| 知识iN | 问题和答案搜索 |

---

## 前置准备：在 Naver 开发者中心创建应用

### 步骤 1：注册应用

1. 访问 [Naver 开发者中心](https://developers.naver.com/)。
2. 点击 **Application** → **应用注册**。
3. 输入 **应用名称**（例如：`Starnion`）。
4. 在 **使用 API** 中选择 **搜索**。
5. 添加适当的环境。
6. 点击 **注册**。

### 步骤 2：获取认证信息

1. 注册完成后，在 **我的应用** 列表中点击创建的应用。
2. 复制 **Client ID** 和 **Client Secret**。

> **免费使用：** Naver 搜索 API 每天免费提供 25,000 次调用。

---

## 设置方法

### 在 Web UI 中注册 API 密钥

1. 登录 Starnion Web UI。
2. 左侧菜单 → **Settings** → **Integrations** 标签页。
3. 在 **Naver 搜索** 区域输入以下字段：
   - **Client ID**: Naver 开发者中心的 Client ID
   - **Client Secret**: Naver 开发者中心的 Client Secret
4. 点击 **保存** 按钮。
5. 开启 **Naver 搜索技能启用** 开关。

---

## 使用方法

Naver 搜索集成设置完成后，使用自然语言向 AI 提问。

### 新闻搜索

```
我：用 Naver 搜索今天的经济新闻
机器人：（Naver 新闻搜索）
       最近的经济新闻：
       1.「KOSPI 突破 2,650，半导体股强势」— 韩国经济新闻
       2.「汇率在 1,300 韩元区间保持稳定」— 每日经济
       ...
```

### 博客搜索

```
我：在 Naver 博客搜索 MacBook Pro 评测
机器人：（Naver 博客搜索）
       MacBook Pro 相关博客文章：
       1.「[评测] M4 MacBook Pro 使用一个月感受」— 科技博客
       2.「MacBook Pro vs MacBook Air 对比总结」— IT评测人
       ...
```

### 购物搜索

```
我：在 Naver 购物搜索无线耳机价格
机器人：（Naver 购物搜索）
       无线耳机搜索结果：
       1. AirPods Pro 2 — ₩299,000（最低价）
       2. 三星 Galaxy Buds3 Pro — ₩259,000
       3. 索尼 WF-1000XM5 — ₩279,000
```

---

## 为什么专门针对韩语内容

Naver 搜索 API 针对韩语内容进行了优化：

- **韩语形态素分析**: 准确理解韩语搜索词
- **国内内容**: 专门针对韩国网站、博客和新闻
- **本地信息**: 韩国购物、本地信息和国内社区搜索
- **咖啡/知识iN**: 全球搜索引擎难以找到的韩国社区信息

> **提示：** 韩语内容搜索使用 Naver 搜索，全球搜索使用 Tavily，可以获得更全面的结果。

---

## 断开连接

1. Settings → Integrations → Naver 搜索区域。
2. 点击 **断开连接** 按钮。
3. 存储的 Client ID 和 Client Secret 将立即删除。

---

## 故障排除

### "Naver 搜索集成未配置"

请在 Settings → Integrations → Naver 搜索中确认是否已注册 Client ID 和 Client Secret。

### "Naver API 认证失败"（401 错误）

- 确认 Client ID 和 Client Secret 是否正确。
- 在 [Naver 开发者中心](https://developers.naver.com/) 确认应用是否处于活跃状态。

### "每日调用次数已超过限制"（429 错误）

- 每日 API 调用限制（25,000 次）已超过。
- 次日将自动重置。

---

## 常见问题

**Q：可以同时使用 Naver 搜索和 Tavily 搜索吗？**
A：是的，两者可以同时启用。Ninon 会根据搜索内容自动选择合适的服务。

**Q：可以用 Naver 搜索英语内容吗？**
A：可以，但建议使用 Tavily 搜索英语内容。Naver 针对韩语内容进行了优化。

**Q：Naver 搜索 API 是免费的吗？**
A：每天 25,000 次调用免费，对于一般个人使用来说足够了。
