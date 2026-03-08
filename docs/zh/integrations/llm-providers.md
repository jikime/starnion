---
title: LLM 提供商
nav_order: 1
parent: 集成
---

# LLM 提供商

## 概述

Starnion 不局限于单一 AI 模型。它支持多种 LLM 提供商——Gemini、OpenAI、Anthropic Claude、Z.AI 等——并允许用户配置首选模型和 API 密钥。可以按对话选择模型，也可以将其关联到角色（Persona）以自动应用。

---

## 支持的提供商

| 提供商 | 标识符 | 主要模型 | 备注 |
|--------|--------|---------|------|
| Google Gemini | `gemini` | gemini-2.0-flash、gemini-1.5-pro | 默认提供商，提供免费套餐 |
| OpenAI | `openai` | gpt-4o、gpt-4o-mini、gpt-4-turbo | 生态系统广泛，代码能力强 |
| Anthropic | `anthropic` | claude-opus-4-5、claude-sonnet-4-5、claude-haiku-3-5 | 长上下文，精细推理 |
| Z.AI | `zai` | z1-preview、z1-mini | 高性能推理模型 |
| 自定义 | `custom` | （用户自定义） | 兼容 OpenAI 的端点 |

> **默认设置：** 新注册用户默认使用 Gemini 作为提供商。

---

## 如何设置 API 密钥

1. 在网页界面导航到**设置**。
2. 选择**模型**标签页。
3. 选择所需的提供商，并在 **API 密钥**字段中输入您的密钥。
4. 勾选您想使用的模型（可多选）。
5. 点击**保存**。

保存后，后端会立即自动验证 API 密钥（参见下方 [API 密钥验证](#api-密钥验证)）。

---

## Gemini 设置（免费起步）

Gemini API 提供免费套餐，是很好的入门选择。

1. 前往 [Google AI Studio](https://aistudio.google.com/)。
2. 登录并点击**获取 API 密钥**。
3. 点击**创建 API 密钥** → 选择项目或创建新项目。
4. 复制生成的密钥（格式：`AIza...`）。
5. 粘贴到 Starnion 设置 > 模型 > Gemini 并保存。

**免费套餐限制：** 每分钟 15 次请求，每天 1,500 次请求（截至 2025 年）。

---

## OpenAI 设置

1. 登录 [OpenAI Platform](https://platform.openai.com/)。
2. 点击右上角的个人图标 → **API 密钥**。
3. 点击**创建新密钥**。
4. 输入密钥名称并创建（格式：`sk-proj-...`）。
5. 密钥仅在创建后立即完整可见——请立即复制。
6. 粘贴到 Starnion 设置 > 模型 > OpenAI 并保存。

> OpenAI API 是付费服务。使用前，请在[账单](https://platform.openai.com/billing)中注册支付方式。

---

## Anthropic Claude 设置

1. 登录 [Anthropic Console](https://console.anthropic.com/)。
2. 点击左侧菜单中的 **API 密钥**。
3. 点击**创建密钥**并输入密钥名称。
4. 复制生成的密钥（格式：`sk-ant-...`）。
5. 粘贴到 Starnion 设置 > 模型 > Anthropic 并保存。

Claude 在长文档分析和复杂推理任务方面特别出色。

---

## 自定义端点设置

您可以连接任何与 OpenAI API 兼容的服务器（Ollama、LM Studio、vLLM 等）。

1. 选择 设置 > 模型 > 自定义。
2. 在 **Base URL** 字段中输入服务器地址（例如：`http://localhost:11434/v1`）。
3. 对于 **API 密钥**，本地服务器可以输入任意值。
4. 直接输入模型名称。

---

## 提供商选择指南

如果您不确定何时使用哪个模型，请参考下表。

| 场景 | 推荐模型 |
|------|---------|
| 日常对话、简单问题 | Gemini 2.0 Flash（快速、实惠） |
| 代码编写和调试 | GPT-4o 或 Claude Sonnet |
| 长文档分析（100K+ tokens） | Claude Opus 或 Gemini 1.5 Pro |
| 最小化成本 | Gemini 免费套餐或 GPT-4o-mini |
| 复杂数学/推理 | Claude Opus 或 GPT-4o |

---

## API 密钥验证

保存密钥时，Gateway 会向每个提供商的 API 发送轻量级请求以验证其有效性。

- **Gemini**：通过 `GET /v1beta/models?key=<api_key>` 检查响应
- **OpenAI**：通过 `GET /v1/models`（Bearer 认证）检查 200 响应
- **Anthropic**：通过 `POST /v1/messages` 发送最小请求，检查是否无 401/403 响应
- **Z.AI**：通过 `GET /api/paas/v4/models`（Bearer 认证）检查响应

验证结果立即在界面中显示。如果验证失败，密钥不会被保存。

> 在界面中显示时，API 密钥会被遮蔽，只显示前4个和后4个字符（例如：`AIza...zXYZ`）。完整密钥仅在服务器端使用。

---

## 费用监控

LLM API 根据 token 使用量收费。Starnion 记录所有 API 调用的 token 使用情况。

- 前往**设置 > 使用量**查看每日及每模型的 token 使用情况。
- 输入 token 和输出 token 分别显示。
- 根据每个模型的单价计算预估费用。

有关更多详情，请参阅[分析与使用量](../features/analytics.md)文档。

---

## 常见问题

**Q：我可以设置多个 API 密钥吗？**
A：可以，每个提供商可以设置一个密钥。例如，您可以同时注册 Gemini 和 OpenAI 密钥，并按对话选择使用哪个。

**Q：我可以在不更改 API 密钥的情况下更改活跃模型吗？**
A：可以。保存时如果将 API 密钥字段留空，将保留现有密钥，只更新选定的模型列表。

**Q：超过 Gemini 免费套餐限制会发生什么？**
A：API 将返回 429 错误，对话会暂时中断。切换到其他提供商，或稍等片刻后重试。

**Q：我可以为每个角色使用不同的模型吗？**
A：可以，您可以为每个角色分配特定的提供商和模型。在 设置 > 角色 中进行配置。
