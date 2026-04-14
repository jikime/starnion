---
title: 人脉管理
nav_order: 20
parent: 功能指南
grand_parent: 🇨🇳 中文
---

# 人脉管理 (Connect)

## 概述

Starnion 的 **人脉管理 (Connect)** 不是普通的通讯录，而是一个**维系关系的助手**。名片扫描、活动记录、Gmail/日历自动采集、联系周期提醒、疏远检测、Google 通讯录批量导入，全部集中在一个界面 —— 目标是**不再把关心的人忘记**。

与传统 CRM 最大的区别是**自动化**。你不需要每次手动记录见面或邮件 —— Starnion 在后台从 Gmail + Google 日历中拉取活动，每晚重新计算关系评分，并在你常联系的人许久未联系时主动提醒。

---

## 核心能力

| 能力 | 作用 |
|---|---|
| **PersonaCard** | 一屏展示：头像、姓名、职位、公司、分类、联系方式、社交资料、标签、上下文备注、名片、活动时间轴 |
| **名片 OCR** | 上传名片图片 → Gemini Vision 提取字段 → 自动创建新人脉 |
| **上下文备注** | 关于此人的静态事实（"素食、两个孩子、喜欢 Next.js"），最多 4,096 字符 |
| **活动时间轴** | "何时做了什么"的事件日志 —— 手动记录 + Gmail 和日历的自动采集 |
| **Nion 建议** | 结合疏远状态、近期活动数、最近一次互动的数据驱动行动提示 |
| **连接评分** | `0.45 × 时近性 + 0.35 × 频率 + 0.20 × 重要性`，每天 03:00 重算 |
| **提醒面板** | 超出目标联系周期的人脉，按逾期天数降序排列 |
| **疏远提醒** | 每天 09:00 Telegram 汇总："3 人已经很久没联系了…" |
| **Google 通讯录导入** | 通过 Google People API 一次性批量导入，按邮箱/电话去重 |

---

## 添加人脉

### 方式 1: 名片扫描

```
用户: [附上名片图片]
AI:   我分析了这张名片，并把它添加为新的人脉。
      姓名: Kim Cheol-su
      公司: ACME Corp
      职位: Senior Engineer
      邮箱: kim@acme.com
      电话: +82-10-1234-5678
```

幕后 `connect-ocr` 技能调用 Gemini Vision 做 OCR → 提取字段 → 直接写入 `connections` 表。原始图片存储在 `business_card` JSONB 字段中，PersonaCard 可以预览并放大。

### 方式 2: 手动输入

Web UI `/connect` → "添加新人脉" 按钮 → 输入姓名、邮箱、分类等 → 保存。

### 方式 3: Google 通讯录批量导入 (Phase 3)

```
用户: 把我 Google 通讯录里的联系人都导入 Connect
AI:   在 Google 通讯录中找到 142 个联系人，其中 1 个已存在。
      要导入剩余 141 个吗?
用户: 好
AI:   已将 141 个联系人导入 Connect。
      你可以在人脉页面按 'google_contacts' 标签筛选。
```

`connect-contacts-import` 技能通过分页调用 Google People API 遍历全部通讯录，按邮箱 → 电话顺序与已有人脉去重，仅将新联系人以 `category=acquaintance`、`tags=['google_contacts']` 插入。这是**一次性导入**，不是定期的双向同步。

> **前置条件:** Google Workspace 技能需要 `contacts.readonly` 作用域。2026-04 之前接入的用户需要到 `/skills` → Google Workspace → 断开连接 → 重新连接以授权新作用域。

---

## 分类与目标联系周期

每个人脉归入四种分类之一：

| 分类 | 基础重要性 | 建议联系周期 |
|---|---|---|
| `family` | 0.9 | 2 周 |
| `business` | 0.7 | 1 个月 |
| `friend` | 0.7 | 1 个月 |
| `acquaintance` | 0.4 | 3 个月 |

每条人脉都有一个 `contact_frequency_target` 字段（以天为单位），它同时驱动疏远检测和评分公式。

---

## 上下文备注

一个自由文本区，用于记录**关于此人的静态事实** —— 那些不常变化的内容。例如 "素食"、"孩子：小学的女儿和幼儿园的儿子"、"对 Next.js 感兴趣"。与活动时间轴分开（备注 = 个人资料，时间轴 = 事件日志）。

你可以从聊天直接编辑：

```
用户: 在 Kim 的备注里加上"素食，喜欢骑行"
AI:   已添加到 Kim Cheol-su 的备注。
```

`connect-memo` 技能支持对 `context_notes` 字段的 append / replace / clear 三种操作。最大长度为 4,096 字符 (BR-CONTEXT-1)。

---

## 活动时间轴 (Phase 2)

**"一起做了什么、什么时候做的"事件日志**。两种录入途径 —— 手动和自动 —— 在 PersonaCard 的右侧面板渲染为带彩色圆点的纵向时间轴。

### 手动记录

PersonaCard → "+ 添加记录" → 选择分类芯片（会议 / 通话 / 吃饭 / 协作 / 消息 / 其他） → 输入备注、可选日期时间、可选时长 → 保存。

或者通过聊天：

```
用户: 昨天和 Kim 吃了午饭。COEX 会面 45 分钟。
AI:   已添加 4 月 12 日与 Kim Cheol-su 的午餐记录。
```

`connect-activity` 技能处理此流程。手动添加时会自动推进 `connections.last_contact_at`（单调 —— 时间戳永不回退）。

### 自动采集 (Gmail + Google 日历)

通过 **cron 或手动触发**，把最近的邮件和日历事件自动拉到人脉时间轴上。

- **Cron (`connect_activity_ingest`)**: 每天 02:00，默认 OFF —— 在 `/cron` 开启
- **手动触发**: 通知中心 → "人脉活动同步" ▶ 按钮
- **技能调用**: `"把我的日程同步到 Connect"`

### 匹配策略

对每封邮件 / 每个事件：

1. **一级: 邮箱匹配** —— `From:` / `To:` / `Cc:` / `attendees[].email` → `connections.email`
2. **兜底: 名字匹配** —— 如果邮箱匹配失败，在主题或事件标题中搜索任一人脉的名字（≥2 字符），不区分大小写

例如：一个名为 "与 Kim Cheol-su 的会议" 的个人事件（无参与者）仍可通过名字兜底链接到 `Kim Cheol-su` 这条人脉。

### 过滤规则

- 丢弃 `noreply@`、`notifications@`、`alerts@` 等自动发送者
- 丢弃收件人数 > 20（邮件列表噪声）的条目
- 权重衰减: `1 / sqrt(participants)` —— 1:1 会议 = 1.0，4 人 = 0.5，16 人 = 0.25
- 未来事件**会显示在时间轴上**，但**不会**推进 `last_contact_at`（防止疏远检测出现负天数）

### 种类颜色

时间轴的圆点按来源着色：

- 🔵 邮件 (`email`, sky-400)
- 🟢 日历 (`calendar`, emerald-400)
- 🟣 手动 (`manual`, violet-400)
- 🔷 Telegram (`telegram`, cyan-400)

---

## Nion 建议

PersonaCard 顶部的**数据驱动摘要框**。结合近期活动、疏远状态和分类严重度，生成一句话的行动提示。不调用 LLM —— 完全在客户端计算。

```
✨ NION 的建议
27 天未联系 (目标 30 天)
近 90 天: 📧 邮件 4  📅 日程 1
最近活动: 3 天前 · 会议 (45 分钟)
─────────────────────────────
→ 下次定期联系快到了，先发个简短问候吧。
```

从 9 格矩阵（分类 × 严重度 × 是否从未联系）中自动挑选：

- **family**（家人） → 第 1 档就开始较强的语气
- **business / friend / acquaintance** → 第 1/2/3 档逐步加强
- **healthy**（健康） → "您一直在保持联系 👍"
- **从未联系** → "发一条简短的问候开个头吧"

---

## 连接评分

一个 0.0 到 1.0 之间的数字，用于表达**关系的健康度**。`connect_score_recompute` cron 每晚 03:00 重新计算。

**公式** (architecture-design.md §D):

```
score = 0.45 × recency + 0.35 × frequency + 0.20 × importance

recency    = exp(-days_since_contact / (2 × target_interval))
frequency  = min(1, activity_weight_90d / (90 / target_interval))
importance = category_base[category] + tag_boost
```

- **recency**: 在目标周期内接近 1.0，2 倍目标时约 0.37
- **frequency**: 近 90 天的加权活动数 / 期望值
- **importance**: family 0.9，business/friend 0.7，acquaintance 0.4

当变化幅度 `|Δ| < 0.005` 时跳过写入，以减少 cron churn。

---

## 提醒 (疏远检测)

### 提醒面板

`/connect` → 右侧面板顶部的切换 → "提醒"。

展示满足 `last_contact_at + contact_frequency_target < NOW()` 的人脉，按**逾期天数降序**排列。点击任一行会跳到对应的 PersonaCard。

### 疏远提醒 Cron

- **Job**: `connect_drift_reminder`（每天 09:00，默认 OFF）
- **通道**: Telegram（已连接时）
- **格式**: "3 人已经很久没联系了: Kim、Park、Lee。请到人脉页面查看。"
- **前 3 名** 会点名列出，其余以 "+N 人" 形式
- **去重**: 每天最多一条

提醒面板和疏远提醒 cron 调用**相同的查询** (`ListDriftingConnections`)，只是输出到不同渠道。面板是实时的 —— 它不依赖 cron 运行。

---

## Cron 概览

通知中心 (`/cron`) 中可单独切换的三个系统任务：

| Job ID | 时间 | 动作 | 默认 | 说明 |
|---|---|---|---|---|
| `connect_activity_ingest` | 02:00 | maintenance | OFF | Gmail + 日历 → 时间轴自动采集 |
| `connect_score_recompute` | 03:00 | maintenance | OFF | 重新计算连接评分 |
| `connect_drift_reminder` | 09:00 | smart_notify | OFF | Telegram 疏远汇总 |

三个任务全部**默认 OFF**（opt-in） —— 用户需在 `/cron` 页面显式开启。▶ 触发按钮可立即运行一次，便于测试。

---

## 四个 Connect 技能

| 技能 | 用途 |
|---|---|
| `connect-ocr` | 名片图片 → OCR → 新人脉 |
| `connect-memo` | 上下文备注的 add / replace / clear |
| `connect-activity` | 活动时间轴的 find / add / list / delete + Gmail/日历同步 |
| `connect-contacts-import` | Google 通讯录批量导入 (preview / import) |

四个技能都用 Python psycopg2 直接写入 Postgres，并严格按 `WHERE user_id = %s` 隔离（BR-AUTH-1）。根据 BR-SOCIAL-3，OCR 和 Contacts import 路径**绝不**写入 `social_profiles` —— 社交链接必须在 Web UI 中手动输入。

---

## 业务规则一览

| 规则 | 内容 |
|---|---|
| BR-AUTH-1 | 所有查询按 `user_id` 作用域 —— 无跨租户访问 |
| BR-CAT-1 | 分类必须是 `family / friend / business / acquaintance` 之一（区分大小写） |
| BR-TAG-1 | 最多 16 个标签，每个 ≤32 字符，不区分大小写去重 |
| BR-CONTEXT-1 | 上下文备注 ≤ 4,096 字符 |
| BR-SOCIAL-1 | `social_profiles` 键限于 facebook / instagram / x / linkedin / threads |
| BR-SOCIAL-2 | PATCH 使用 merge-patch 语义（nil 值 = 删除键） |
| BR-SOCIAL-3 | OCR / import 路径绝不触碰 `social_profiles` |
| BR-SCORE-1 | `connection_score` 由服务器所有；PATCH 会静默丢弃 |
| BR-109-1 | `last_contact_at` 是单调的；超过 NOW() + 60s 的未来时间戳会被拒绝 |

---

## 问题排查

### "Google 认证过期但自动刷新不工作"

v0.4.0 之前的版本里 starnion_utils 的 `decrypt_value` 无法读取 gateway 刷新时写入的 v2 密文格式。升级到 v0.4.0 并重启 gateway 即可解决。

### "我的日历事件没出现在时间轴里"

有两点要检查：

1. **窗口**: cron 只扫描过去 7 天 + 未来 14 天。需要更大范围的补录时，可直接用技能 `sync --days 90`。
2. **匹配**: 如果事件没有参与者，匹配会退回到**名字搜索** —— 事件标题必须包含某个人脉的名字。如果两种都失败，会视为个人待办而跳过。

### "提醒面板是空的"

很可能是合法状态。面板只显示超出目标周期的人脉。如果没有人逾期，就会看到 "一切都在您的掌握之中 👍" 的空状态。要用真实数据测试：

```sql
UPDATE connections SET last_contact_at = NOW() - INTERVAL '60 days'
WHERE name = '...' AND user_id = '...';
```

### "连接评分没有更新"

`connect_score_recompute` 可能是 OFF。到 `/cron` 开启它，或点击 ▶ 触发按钮立即运行一次。

---

## 相关链接

- [技能](../skills.md) —— connect-ocr / connect-memo / connect-activity / connect-contacts-import 的详细说明
- [通知 & 日程](schedules.md) —— cron 系统任务配置
- [架构](../architecture.md) —— Clean Architecture 分层与领域模型
