---
title: 模型设置
nav_order: 16
parent: 功能指南
grand_parent: 🇨🇳 中文
---

# 模型设置

## 概述

模型设置是 Starnion 中配置 AI 模型和提供商的页面。注册各种 LLM 提供商的 API 密钥，并为对话、图像生成、嵌入等不同用途指定最佳模型。

**主要功能：**
- 支持多种 LLM 提供商：Google Gemini、OpenAI、Anthropic Claude、GLM/Z.AI、Ollama
- API 密钥管理：注册并验证各提供商的 API 密钥
- 按功能分配模型：为聊天、图像生成、嵌入等不同功能指定不同模型
- 高级参数设置：精细调整 temperature、max_tokens 等参数
- 自定义端点：支持 OpenAI 兼容 API（Ollama、vLLM 等）

---

## 支持的提供商

| 提供商 | 主要模型 | 特点 |
|--------|---------|------|
| **Google Gemini** | Gemini 2.5 Pro、Gemini 2.0 Flash | 提供免费套餐，长上下文，多模态 |
| **OpenAI** | GPT-4o、GPT-4o-mini | 通用性强，模型选择多样 |
| **Anthropic** | Claude Sonnet 4.5、Claude Haiku 4.5 | 安全 AI，长上下文 |
| **GLM/Z.AI** | GLM-4-Flash、GLM-4-Plus | 高性能推理，中文优势 |
| **Ollama** | Llama 3、Mistral、Qwen 等 | 本地运行，免费 |
| **自定义** | （用户自定义） | OpenAI 兼容端点 |

---

## 注册 API 密钥

1. 前往 **功能说明 > 模型设置**。
2. 选择要使用的提供商。
3. 输入 **API 密钥**。
4. 点击 **保存**。

保存时后端会自动验证 API 密钥的有效性。

> API 密钥加密存储。界面上只显示前 4 位和后 4 位字符。

### 各提供商 API 密钥获取方法

#### Google Gemini

1. 前往 [Google AI Studio](https://aistudio.google.com/)
2. 点击 **Get API key** → **Create API key**
3. 复制生成的密钥（`AIza...` 格式）

**免费限额：** 每分钟 15 次，每天 1,500 次（截至 2025 年）

#### OpenAI

1. 登录 [OpenAI Platform](https://platform.openai.com/)
2. 右上角头像 → **API keys** → **Create new secret key**
3. 复制密钥（`sk-proj-...` 格式）

#### Anthropic

1. 登录 [Anthropic Console](https://console.anthropic.com/)
2. 左侧菜单 **API Keys** → **Create Key**
3. 复制密钥（`sk-ant-...` 格式）

---

## 模型分配

为不同功能分配不同模型，优化成本和性能。

| 功能 | 推荐模型 |
|------|---------|
| **聊天** | Gemini 2.0 Flash、GPT-4o-mini |
| **报告** | GPT-4o、Claude Sonnet 4.5 |
| **图像生成** | DALL-E 3 |
| **嵌入** | text-embedding-3-small、gemini-embedding-001 |

---

## 高级参数

| 参数 | 说明 | 默认值 |
|------|------|-------|
| **temperature** | 回答的创意性/随机性（0.0-2.0） | 0.7 |
| **max_tokens** | 最大回复 token 数 | 4096 |
| **top_p** | 累积概率采样（0.0-1.0） | 1.0 |

---

## 常见问题

**Q：可以为多个提供商注册 API 密钥吗？**
可以。同时注册多个提供商的密钥，并为不同功能分配不同模型。

**Q：使用 Ollama 可以完全免费吗？**
可以。在本地安装 Ollama 并通过自定义端点连接，无需外部 API 费用。

**Q：更改模型会影响现有对话吗？**
不会。模型更改从新对话开始生效，现有对话历史保持不变。
