---
title: GitHub 集成
nav_order: 3
parent: 集成
grand_parent: 🇨🇳 中文
---

# GitHub 集成

将 Starnion 连接到 GitHub，让 AI 智能体能够使用自然语言查询仓库信息、Issue 和 Pull Request。以对话方式管理您的开发工作流程。

---

## 概述

使用 GitHub 集成您可以：

- **仓库**: 查看仓库列表、最近提交记录
- **Issue**: 创建、查看、检查 Issue 状态
- **Pull Request**: 查看 PR 列表、检查审查状态、获取摘要
- **代码搜索**: 在仓库中搜索代码

> **可选功能：** GitHub 集成默认处于禁用状态。您需要设置 Personal Access Token 并启用技能才能使用。

---

## 支持的功能

| 功能 | 说明 |
|------|------|
| 仓库列表查看 | 查看用户的仓库列表 |
| Issue 创建 | 创建新 Issue |
| Issue 查看 | 查看 Issue 列表和详细信息 |
| PR 状态检查 | 查看 Pull Request 列表和审查状态 |
| 代码搜索 | 在仓库内搜索关键词 |

---

## 前置准备：生成 GitHub Personal Access Token

### 步骤 1：创建 Token

1. 访问 [GitHub Settings](https://github.com/settings/tokens)。
2. 点击 **Generate new token** → **Generate new token (classic)**。
3. 在 **Note** 字段输入 Token 名称（例如：`Starnion`）。
4. 在 **Expiration** 中选择过期时间。
5. 选择以下权限范围：

   | 范围 | 用途 |
   |------|------|
   | `repo` | 仓库读写（包括私有仓库） |
   | `read:org` | 读取组织信息 |

6. 点击 **Generate token** 并复制 Token（`ghp_...` 格式）。

> **安全提示：** Token 只在创建后立即可见。请立即复制。

---

## 设置方法

### 在 Web UI 中注册 Token

1. 登录 Starnion Web UI。
2. 左侧菜单 → **Settings** → **Integrations** 标签页。
3. 找到 **GitHub** 区域的 **Personal Access Token** 输入字段。
4. 粘贴复制的 Token（`ghp_...`）。
5. 点击 **保存** 按钮。
6. 开启 **GitHub 技能启用** 开关。

---

## 使用方法

GitHub 集成设置完成后，使用自然语言向 AI 提问。

### 仓库查看

```
我：显示我的 GitHub 仓库列表
机器人：GitHub 仓库列表：
       - starnion/starnion (Private) ⭐ 12
       - starnion/docs (Public) ⭐ 5
       - starnion/agent (Private) ⭐ 3
```

### Issue 管理

```
我：显示 starnion 仓库的开放 Issue
机器人：starnion/starnion 开放 Issue（3个）：
       - #42: 需要修复登录错误 (bug)
       - #38: 添加多语言支持 (enhancement)
       - #35: 更新 API 文档 (documentation)

我：在 starnion 仓库创建"改进搜索功能"的 Issue
机器人：Issue 已创建。
       #43: 改进搜索功能
       URL: https://github.com/starnion/starnion/issues/43
```

### Pull Request 查看

```
我：显示 starnion 仓库最近的 PR 状态
机器人：starnion/starnion PR 列表：
       - #41: feat: 添加搜索过滤器 (Open, 等待审查)
       - #39: fix: 解决内存泄漏 (Merged)
```

---

## 所需权限（Scopes）

| 范围 | 用途 |
|------|------|
| `repo` | 仓库读写（包括私有仓库） |
| `read:org` | 读取组织信息 |

---

## 断开连接

1. Settings → Integrations → GitHub 区域。
2. 点击 **断开连接** 按钮。
3. 存储的 Personal Access Token 将立即删除。

---

## 故障排除

### "GitHub 集成未配置"

请在 Settings → Integrations → GitHub 中确认是否已注册 Personal Access Token。

### "GitHub API 认证失败"（401 错误）

- Token 可能已过期。请在 GitHub 上生成新 Token 并更新。
- 请确认 Token 的权限范围是否足够。

### "找不到仓库"（404 错误）

- 确认 Token 是否具有 `repo` 权限范围。
- 私有仓库必须具有 `repo` 权限范围。

---

## 常见问题

**Q：可以访问组织（Organization）仓库吗？**
A：是的，如果 Token 具有 `repo` 和 `read:org` 权限范围，则可以访问组织仓库。

**Q：支持 GitHub Enterprise 吗？**
A：目前仅支持 github.com。GitHub Enterprise 支持计划在未来版本中添加。

**Q：Token 过期后会怎样？**
A：API 请求将返回认证错误。请在 GitHub 上生成新 Token 并在 Settings 中更新。
