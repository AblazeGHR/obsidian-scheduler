# Obsidian Scheduler

[English](./README.md) | [中文](./README.zh-CN.md)

[![GitHub release](https://img.shields.io/github/v/release/AblazeGHR/obsidian-scheduler?style=flat-square)](https://github.com/AblazeGHR/obsidian-scheduler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%237C3AED?style=flat-square&logo=obsidian)](https://obsidian.md)

基于 [Dataview](https://obsidian.md/plugins?id=dataview) 的 Obsidian 日程管理插件。读取笔记 frontmatter 和内联字段，提供 **表格**、**日历**、**时间线**、**看板** 四种视图，支持行内编辑、重复事件、提醒、iCal 导入/导出，以及保存视图模板。

> **依赖** [Dataview](https://obsidian.md/plugins?id=dataview) 社区插件。

---

## 功能

### 四种视图

| 视图 | 亮点 |
|------|------|
| **表格** | 多列排序（拖拽调整优先级）、筛选、列显隐、行内编辑、多选批量编辑、分页、键盘导航 |
| **日历** | 月/周切换、拖拽条目改日期、**框选多选**并批量移动、跨日事件、溢出提示 |
| **时间线** | 24 小时日轴、**全天事件条**、拖拽移动/调整时间段、点击空白区域创建、当前时间指示线 |
| **看板** | 按任意字段分组、拖拽卡片换列、「未分配」列、行内添加卡片 |

### 数据来源

- **Frontmatter** — 读取 `due`、`start`、`end`、`title`、`tags` 及任意自定义字段（均可配置映射）。
- **内联字段** — 支持 `[key:: value]` 和整行 `key:: value` 内联语法。
- **Dataview** — 通过 Dataview API 查询笔记库，无需额外数据库。

### 工作流

- **重复事件** — 支持 RRULE 子集（`FREQ` / `INTERVAL` / `BYDAY` / `COUNT` / `UNTIL`）。
- **内联条目编辑** — 来源于内联字段的条目可直接在任意视图中编辑，修改会写回源行（`file#Ln`）；内联条目同样可在日历与时间线中显示。
- **提醒** — 到达时间时弹出 Obsidian 通知（可设置提前量）。
- **iCal 导入/导出** — 导出当前视图为 `.ics` 文件；导入 `.ics` 文件创建笔记。
- **Markdown 导出** — 导出当前视图为格式化表格笔记。
- **视图模板** — 保存当前视图（类型、排序、筛选），可从工具栏或代码块参数快速加载。
- **撤销/重做** — 插件写入的 frontmatter 修改可通过命令撤销/重做。

### 代码块

在笔记中嵌入任意视图：

````
```scheduler
```
````

使用别名直接指定视图：

````
```scheduler-table
```
```scheduler-calendar
```
```scheduler-timeline
```
```scheduler-kanban
```
````

代码块参数（每行一个 `key: value`）：

```
view: table
folder: projects/
template: My Weekly Review
```

视图状态（排序、筛选、隐藏列、搜索）会在操作完成后自动写入代码块，下次打开自动恢复。

---

## 安装

### 社区插件商店

1. 打开 Obsidian → **设置** → **第三方插件** → **浏览**。
2. 搜索 **Scheduler** 并安装。
3. 启用插件。

### 手动安装

1. 确保已安装并启用 **Dataview**。
2. 从 [最新 Release](https://github.com/AblazeGHR/obsidian-scheduler/releases) 下载 `main.js`、`manifest.json`、`styles.css`。
3. 放入 `<笔记库>/.obsidian/plugins/obsidian-scheduler/`。
4. 在设置 → 第三方插件中启用 **Scheduler**。

### BRAT（测试版）

在 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 中添加 `AblazeGHR/obsidian-scheduler`。

---

## 配置

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| 日期字段 | 主日期字段 | `due` |
| 结束日期字段 | 跨日事件的结束日期（可选） | *(空)* |
| 重复规则字段 | RRULE 字段 | `recurrence` |
| 开始/结束时间字段 | 时间段字段 | `start` / `end` |
| 标题字段 | 显示标题字段 | `title` |
| 标签字段 | 逗号分隔的标签字段 | `tags` |
| 可筛选字段 | 筛选 UI 中可选字段 | `due`, `title`, `tags`, ... |
| 文件夹 | 限定范围（空 = 整个笔记库） | *(空)* |
| 默认视图 | 打开面板时的默认视图 | `table` |
| 提醒 | 通知开关 + 提前时间 | 开 / `0` 分钟 |

---

## 使用

点击功能区图标（📅）或运行命令面板中的 **Open Scheduler panel** 打开独立面板。

在任意笔记中添加代码块即可嵌入视图：

````
```scheduler
view: calendar
```
````

完整使用说明见 [USER_GUIDE.md](./USER_GUIDE.md)。

---

## 开发

```bash
git clone https://github.com/AblazeGHR/obsidian-scheduler
cd obsidian-scheduler
npm install
npm run dev      # 监听模式
npm run build    # 生产构建
npm run deploy   # 构建并复制到 test-vault
```

UI 使用 **[Preact](https://preactjs.com)** 构建，打包工具为 **[esbuild](https://esbuild.github.io)**。

架构及开发日志见 [DEV_NOTE.md](./DEV_NOTE.md)。

---

## 已知局限

- **重复事件的单次编辑会移动整个序列** — 拖拽或编辑重复事件的某个实例会改写整个序列的锚点日期，暂不支持「仅本次」例外。
- **依赖 Dataview** — 必须安装并启用 Dataview 社区插件。

---

## 许可证

[MIT](./LICENSE)

---

## 贡献

欢迎提交 Issue 和 Pull Request。提交 PR 前请：

1. 阅读 [DEV_NOTE.md](./DEV_NOTE.md) 了解架构。
2. 运行 `npm run build` 确保构建通过。
3. 在测试笔记库中手动验证。
