---
title: 管理工具
nav_order: 13
parent: 功能指南
grand_parent: 🇨🇳 中文
---

# 管理工具

## 概述

Starnion 提供 CLI 命令，供服务器管理员直接从终端管理用户账户和数据库迁移。

---

## starnion users -- 用户账户管理

`starnion users` 命令组直接访问 PostgreSQL 来管理用户账户。**无需登录** -- 需要在 `~/.starnion/config.yaml` 中配置有效的数据库连接。

### 用户列表

```bash
starnion users list
```

输出示例：

```
══════════════════════════════════ USERS ═══════════════════════════════════════

  ID        EMAIL                  NAME          ROLE    CREATED
  ──────    ─────────────────────  ────────────  ─────   ──────────
  a1b2c3    admin@example.com      Admin         admin   2024-01-15
  d4e5f6    user@example.com       John Doe      user    2024-02-01

  Total: 2 users
```

### 添加用户

```bash
starnion users add \
  --email user@example.com \
  --password "StrongPassword123!" \
  --name "John Doe"

# 授予管理员权限
starnion users add \
  --email admin@example.com \
  --password "AdminPass!" \
  --name "System Admin" \
  --admin
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--email` | 是 | 邮箱地址（必须唯一） |
| `--password` | 是 | 初始密码 |
| `--name` | 是 | 显示名称 |
| `--admin` | 否 | 授予管理员角色（默认：普通用户） |

### 删除用户

```bash
starnion users remove user@example.com
```

会显示确认提示。输入 `yes` 以执行删除。

> **警告**：与该账户相关的所有数据（对话、备忘录、日记等）将被永久删除。

### 重置密码

```bash
starnion users reset-password user@example.com
```

会显示安全提示以输入新密码（输入不会在终端中显示）。

---

## starnion db -- 数据库迁移

`starnion db` 命令组管理数据库架构版本。使用 `schema_migrations` 表跟踪已应用的迁移。

### 应用迁移

```bash
starnion db migrate
```

按文件名顺序运行 `gateway/internal/cli/migrations/incremental/` 中的所有 `.sql` 文件。已应用的文件将被跳过。

输出示例：

```
  · v1.1.0-add-search-index.sql already applied
  ✓ v1.2.0-add-usage-logs.sql applied

  Migration complete: 1 applied, 1 skipped
```

### 检查迁移状态

```bash
starnion db status
```

输出示例：

```
══════════════════════════ MIGRATION STATUS ════════════════════════════════════

  ✓ v1.0.0 (baseline)          [applied 2024-01-15 10:30:00]
  ✓ v1.1.0-add-search-index    [applied 2024-02-01 14:22:10]
  · v1.2.0-add-usage-logs      [pending]
```

### 添加新迁移文件

1. 在 `gateway/internal/cli/migrations/incremental/` 中创建 `.sql` 文件
2. 使用版本前缀（文件按排序顺序执行）：

   ```
   v1.2.0-add-usage-logs.sql
   v1.2.1-add-audit-table.sql
   ```

3. 使用 `starnion db migrate` 应用
4. 使用 `starnion db status` 验证

---

## 文档处理队列（后台队列）

大文档（500 KB 及以上）的解析和嵌入通过**后台队列**处理，以防止 gRPC 处理程序超时。

### 工作原理

```
parse_document 调用
  ↓
文件大小检查
  ├── < 500 KB → 同步处理 → 返回结果
  └── ≥ 500 KB → 加入队列 → 返回 task_id
                     ↓
               后台工作线程（最多 2 个并发）
                     ↓
               Docling 解析 + 嵌入 + 数据库存储
```

### 检查状态（AI 工具）

上传大文档后，使用返回的 `task_id` 查询进度：

```
check_document_status('<task_id>')
```

状态值：

| 状态 | 含义 |
|------|------|
| `pending` | 等待中（尚未开始） |
| `processing` | 处理中（Docling 解析 + 嵌入） |
| `done` | 完成（N 个分段已存储到向量数据库） |
| `error` | 失败（包含错误信息） |

### 配置

```bash
# 并发工作线程数（默认：2）
DOC_QUEUE_WORKERS=3
```

> Docling 是 CPU 密集型的。设置过多的工作线程可能导致 CPU 竞争，反而降低处理速度。
