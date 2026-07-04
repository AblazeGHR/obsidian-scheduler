# Scheduler Plugin — 使用文档

> Obsidian 插件，提供日历、时间表、表格三种视图来管理 Markdown frontmatter 中的日程数据。

---

## 1. 安装

1. 将 `obsidian-scheduler` 文件夹放入 vault 的 `.obsidian/plugins/` 目录
2. 在 Obsidian 设置 → Community Plugins 中启用 **Scheduler**
3. **依赖**：需同时启用 **Dataview** 插件（提供数据索引和 frontmatter 解析）

---

## 2. 配置

### 设置 → Scheduler

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| **Date Field** | 哪个 frontmatter 字段代表日期 | `due` |
| **Start Field** | 时间范围的开始字段 | `start` |
| **End Field** | 时间范围的结束字段 | `end` |
| **Title Field** | 显示标题字段 | `title` |
| **Tag Fields** | 标签字段（逗号分隔） | `tags` |
| **Filterable Fields** | 筛选 UI 中可选的字段列表 | `due,title,tags,priority,status,...` |
| **Folders** | 限定搜索范围（逗号分隔，留空=全仓库） | 空 |
| **Default View** | 默认打开哪个视图 | `table` |

---

## 3. 数据格式

插件从 frontmatter 读取数据。示例文件：

```yaml
---
title: Sprint Review
due: 2026-07-10
priority: 中
tags:
  - work
  - 会议
start: 2026-07-10T14:00
end: 2026-07-10T15:30
status: 进行中
---
```

- `due` → 日历视图的日期、表格的 date 列、时间表的日期
- `start` / `end` → 时间表视图中的时间块
- 所有其他 frontmatter 字段均可用于筛选和排序

### Inline Fields（行内字段）

在 Markdown 正文中，可以使用 `[key:: value]` 标记任务级别的字段：

```markdown
---
title: 本周任务
due: 2026-07-15
---

- [ ] 重构前端 [priority:: 高] [effort:: 8h]
- [ ] Code Review [priority:: 中] [effort:: 2h]
```

每个带 inline field 的行会被提取为独立记录，并**继承所在页面的 frontmatter**。例如上面会生成 3 条记录（1 条页面级 + 2 条任务级）。

任务级记录可以通过 `priority`、`effort` 等字段筛选和排序，也可以在日历和时间表中显示（如果继承了 `due` 字段）。

**设置**：Settings → Scheduler → "Extract tasks from inline fields"（默认开启）

---

## 4. 使用方式

### 方式 A：代码块（嵌入笔记）

```markdown
​```scheduler
​```
```

```markdown
​```scheduler-table
​```
```

```markdown
​```scheduler-calendar
​```
```

```markdown
​```scheduler-timeline
​```
```

代码块参数（每行一个 `key: value`）：

```markdown
​```scheduler
view: calendar
​```
```

### 方式 B：独立面板

- 左侧 Ribbon 栏点击日历时钟图标
- 或 Ctrl/Cmd+P → "Open Scheduler panel"

---

## 5. Table 视图

| 功能 | 操作 |
|------|------|
| **排序** | 点击列头：升序 → 降序 → 取消。支持多列排序，优先级数字标注 (↑1, ↓1, ↑2...) |
| **筛选** | 点击 "+ Filter" → 选择字段 → 选择运算符 → 输入值。运算符：`=` / `contains` / `>` / `<` / `< date` / `> date` |
| **列显隐** | 点击 "Columns" 按钮 → 勾选/取消 |
| **显示计数** | 右侧 `筛选后 / 总数` |

### 运算符说明

| 运算符 | 含义 | 示例 |
|--------|------|------|
| `=` | 完全相等 | `status = 进行中` |
| `contains` | 包含子串 | `tags contains work` |
| `>` | 大于（字符串比较） | `priority > 低` |
| `<` | 小于 | `priority < 高` |
| `< date` | 日期早于 | `due < date 2026-07-15` |
| `> date` | 日期晚于 | `due > date 2026-07-01` |

---

## 6. Calendar 视图

| 功能 | 操作 |
|------|------|
| **月历导航** | 点击 `‹` `›` 切换月份 |
| **回到今天** | 点击 "Today" 按钮 |
| **今日高亮** | 今天的日期格有蓝色数字 |
| **查看事件** | 每个格子最多显示 3 个事件标题 |
| **打开文件** | 点击事件 → 在 Obsidian 中打开对应 MD |
| **改日期** | 拖拽事件到另一个日期格 → 立即写入 frontmatter |

---

## 7. Timeline（时间表）视图

| 功能 | 操作 |
|------|------|
| **导航** | 点击 `‹` `›` 切换日期，点击 "Today" 回到今天 |
| **All-day 区域** | 没有具体时间的条目显示在顶部 |
| **时间块** | 有 start/end 的条目显示为时间块 |
| **改时间** | 拖拽块的顶部区域 → 整体移动时间 |
| **改时长** | 拖拽块底部边缘 → 缩放持续时间 |
| **对齐** | 自动吸附到 15 分钟刻度 |
| **当前时间** | 红线指示器（仅当天可见） |
| **重叠** | 时间冲突的事件自动并排显示 |

---

## 8. 创建新条目

所有三个视图的顶部都有 **+ New** 按钮。点击后输入标题，自动创建一个 MD 文件，其 frontmatter **继承当前激活的筛选条件**：

| 筛选条件 | 新文件 frontmatter |
|---------|------------------|
| `status = 进行中` | `status: 进行中` |
| `priority > 中` | `priority: 高`（边界值） |
| `due > date 2026-07-01` | `due: <当天日期>` |
| `tags contains work` | `tags: work` |

文件会创建在 Settings 中配置的第一个文件夹下（无配置则在 vault 根目录）。

## 9. 常见问题

**Q: 代码块没有任何显示？**
A: 确保 Dataview 插件已安装并启用。Ctrl+R 重新加载 Obsidian。

**Q: 表格是空的？**
A: 检查 Settings → Folders 是否排除了你的文件夹。确保 MD 文件有 frontmatter。

**Q: 日历里没有事件？**
A: 检查 Settings → Date Field 是否和 frontmatter 中的字段名一致（默认是 `due`）。

**Q: 时间表没有时间块？**
A: 需要同时有 start 和 end 两个 frontmatter 字段。切换到有事件的日期。

**Q: 拖拽后 frontmatter 没更新？**
A: 检查被拖拽的文件是否在 Obsidian 中已打开。拖拽立即调用 `app.vault.process` 写入，Obsidian 会自动刷新。
