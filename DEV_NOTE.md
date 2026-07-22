# Scheduler 插件 — 开发者笔记 (devNote)

## 项目概览

基于 Obsidian Dataview API 的日程管理插件，提供 Table/Calendar/Timeline 三种视图，支持 frontmatter 数据源和 `[key:: value]` 行内字段。

| 项目 | 说明 |
|------|------|
| 依赖 | Obsidian >= 1.4.0, Dataview（运行时） |
| UI 框架 | Preact 10.x |
| 构建工具 | esbuild |
| 数据来源 | Dataview API (`api.pages()`) + Obsidian vault 直接读取 |
| 写回方式 | `app.vault.process(file, fn)` 直接修改 MD 文件 frontmatter |

---

## 已完成功能

### Phase 1: 插件骨架 + 数据层

- [x] Obsidian 插件生命周期（onload/onunload）
- [x] Ribbon 图标 + Ctrl+P 命令打开独立面板
- [x] 设置面板：字段映射（dateField/titleField/tagFields/startField/endField）
- [x] 设置面板：文件夹范围、默认视图选择
- [x] 代码块处理器（````scheduler````/````scheduler-table````/````scheduler-calendar````/````scheduler-timeline````）
- [x] Dataview API 运行时检测（未安装时显示提示）
- [x] PageEntry 类型系统 + fieldMapping 引擎
- [x] QueryEngine: fetchPages / applySort / applyFilters（静态方法）

### Phase 2: Table 视图

- [x] 表格列自动发现（从 frontmatter 字段）
- [x] 排序：点击列头 → 升序 ↑1 / 降序 ↓1 / 取消。多列排序支持，带优先级数字标注
- [x] 筛选栏：+ Filter 添加条件（字段 + 运算符 + 值）、× 删除、Clear 清空
- [x] 筛选运算符：= / contains / > / < / < date / > date
- [x] 列显隐：Columns 下拉菜单勾选
- [x] 条目计数（筛选后 / 总数）
- [x] 单元格行内编辑（双击 → 输入框 → Enter 写入 frontmatter）
- [x] 标题列点击打开对应 MD 文件

### Phase 3: Calendar 视图

- [x] 月历网格渲染（7 列 × 可变行数）
- [x] 上月/下月导航 + Today 按钮
- [x] 今日单元格高亮（蓝色数字）
- [x] 事件显示（每格最多 3 个，超出显示 "+N more"）
- [x] 点击事件 → 打开 MD 文件
- [x] 拖拽事件到其他日期 → 立即写入 frontmatter dateField
- [x] 日期比较使用本地时间（避免时区偏移）

### Phase 4: Timeline 视图

- [x] 日时间轴网格（00:00–23:59，60px/小时）
- [x] 时间块渲染（根据 startField/endField 定位和高度）
- [x] All-day 区域（无具体时间的条目，按日期过滤）
- [x] 当前时间红线指示器（仅当天显示）
- [x] 前一天/后一天/Today 导航
- [x] 拖拽时间块上下移动 → 调整时间
- [x] 拖拽下边缘 → 调整持续时间
- [x] 15 分钟吸附对齐
- [x] 重叠事件并排显示
- [x] 时间变更立即写入 frontmatter startField/endField
- [x] 点击事件 → 打开 MD 文件
- [x] 日期比较使用本地时间（避免时区偏移）

### Phase 5: Inline Fields

- [x] `[key:: value]` 格式正则解析（`src/schema/inline-fields.ts`）
- [x] 每行自动提取为独立 PageEntry
- [x] 继承所在页面 frontmatter
- [x] 设置开关（默认开启）
- [x] 在 Table/Calendar/Timeline 中均可使用
- [x] fetchInlineTasks 异步读取 + useState 管理

### 工程

- [x] esbuild 构建配置（生产/开发模式）
- [x] TypeScript 类型检查入口（tsc --noEmit）
- [x] ReactRenderer 桥接（MarkdownRenderChild 生命周期）
- [x] ErrorBoundary 组件（日历/时间表渲染错误显示）
- [x] `npm run dev` 开发监听 / `npm run deploy` 部署到 test-vault
- [x] Git 子模块管理
- [x] USER_GUIDE.md（160 行使用文档）

---

## 设计原则

### 视图中新增文件自动继承筛选条件

在任意视图（Table / Calendar / Timeline）中创建新 MD 文件时，新文件的前置元数据必须自动包含当前激活的全部筛选条件，确保文件能在当前视图中显示。

**规则：**

1. **精确匹配条件**（`equals`）→ 直接写入对应字段值。
   - 示例：筛选 `status = 进行中` → 新文件 frontmatter 包含 `status: 进行中`

2. **包含条件**（`contains`）→ 写入该值的第一个单词或整体作为标签。
   - 示例：筛选 `tags contains work` → 新文件 frontmatter 包含 `tags: [work]`

3. **比较条件**（`greater_than` / `less_than`）→ 写入一个边界值，确保满足筛选。
   - 示例：筛选 `priority > 中` → 新文件 frontmatter 包含 `priority: 高`（字母序 > "中"）
   - 优先级映射："低" < "中" < "高" < "紧急"

4. **日期比较条件**（`before` / `after`）→ 以当天日期为边界填充。
   - 示例：筛选 `due > date 2026-07-01` → 新文件 frontmatter 包含 `due: <当天日期>`

5. **Date Field 自动填充** → 始终包含当前视图的日期上下文。
   - Table 视图：用当前日期
   - Calendar 视图：用当前选中的日期格
   - Timeline 视图：用当前选中日

---

## 未完成功能

### 优先级高

#### Table 视图增强
- [x] 表格分页（25/50/100/全部，上一页/下一页 + 页码指示）
- [x] 列宽拖拽调整（表头右缘拖拽手柄，colgroup 固定布局）
- [x] 多选 + 批量修改（行复选框 + 页全选 + 批量工具条）
- [x] 行内编辑支持日期字段（日期选择器 `<input type="date">`）
- [x] 行内编辑支持标签字段（逗号分隔多值，写回 YAML 数组）
- [x] 编辑后自动刷新（cell/date/time 编辑后延时触发 Dataview 重新索引）

#### Calendar 视图增强
- [x] 周视图切换（Month/Week 切换，导航按模式步进）
- [x] 日期选择器跳转（`<input type="month">` 直接跳到任意月份）
- [x] 跨月/多天事件（新增可选 `endDateField`；事件按 [date, dateEnd] 展开，跨单元格以连通条显示）
- [ ] 左侧 Ribbon 显示小号日历（需在左侧边栏注册独立视图，架构改动较大，留待后续）

#### Timeline 视图增强
- [x] 多日视图（1/3/5/7 天列并排，顶部天数列选择器；导航按可见天数步进）
- [x] 时间段选取创建新事件（在空白时间轴拖拽选取区间 → 带日期+起止时间创建新文件）
- [x] 在时间轴上拖拽创建新时间块（同上，落点即创建，写回 startField/endField）
- [x] 拖拽时视觉反馈（半透明 ghost 预览，仅 mouseup 时提交一次）

### 优先级中

#### 数据层
- [x] 编辑后自动触发 Dataview 重新索引（编辑后 `setDataVersion` 延时重查询 + 数据缓存层失效，无需手动切换）
- [x] `Key:: Value` 整行字段格式支持（数据缓存层合并 Obsidian `metadataCache.inlineFields`，整行 `key:: value` 与括号 `[key:: value]` 形式均识别并进入 `fields`/可筛选）
- [x] 字段类型自动推断（`src/schema/field-types.ts`：按字段值推断 date/number/tags/text，驱动单元格编辑器与筛选默认操作符；数组字段自动按标签处理）
- [x] 数据缓存层（`src/query/data-cache.ts`：签名缓存 + vault/metadata 变更自动失效，避免每次渲染重复查询）

#### 通用功能
- [x] 搜索框（全局搜索，匹配标题与字段值，跨 Table/Calendar/Timeline 生效）
- [x] 主题自适应优化（统一使用 Obsidian CSS 变量，自动适配 dark/light）
- [x] 移动端响应式适配（`@media` 窄屏布局 + `prefers-reduced-motion`）
- [x] Markdown 导出视图（命令 + 工具栏「Export .md」按钮，将当前条目导出为 Markdown 表格笔记）
- [x] 键盘快捷键（表格↑/↓ 移动高亮行、Enter 打开文件；命令面板可绑定「Open Scheduler panel」等）
- [x] 撤销 / 重做支持（UndoManager 快照每次 frontmatter 改写前后全文，命令 `undo-edit` / `redo-edit`，还原后自动刷新视图）

### 优先级低（Phase 6）

- [x] 看板（Kanban）视图（分组字段可选；卡片拖拽跨列改写字段值；列内 + 创建继承列值；支持空列新增、"Unassigned" 列）
- [x] 重复事件支持（RRULE 或自定义语法）
- [x] 通知 / 提醒系统（Obsidian 系统通知；加载后定时扫描，到期弹出 Notice 并可点击打开文件；支持提前量、重复事件按次提醒）
- [x] 多字段排序 UI 细化（工具栏 "Sort" 面板，拖拽调整排序优先级，可切换升/降序、删除、新增字段；列头点击仍可快速排序）
- [x] iCal 导入/导出（导出 VEVENT 含 DTSTART/DTEND/RRULE；导入解析 VEVENT 生成 frontmatter 笔记；工具栏 Export/Import 按钮 + 命令）
- [x] 视图模板保存（视图工具栏下拉套用预设 + "Save" 内联命名保存当前视图；codeblock 参数 `template: <name>` 自动加载预设；设置页可管理/删除）

---

## 已知问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 编辑后数据不刷新 | 低 | 已通过编辑后 `setDataVersion` 延时触发重新查询 + Dataview 自动重索引缓解；撤销/重做还原后也会经 `notifyDataChanged` 自动刷新；极少数情况下可手动切换 Tab 强制刷新 |
| 拖拽写入 ISO 时间含时区偏移 | 低 | 已修复：Timeline 拖拽/创建改写本地时间 `YYYY-MM-DDTHH:MM`，不再含 UTC 偏移 |
| 大量条目（>1000）时表格性能 | 低 | 已加分页（默认 50/页），极端情况仍可能卡顿 |
| Tab 切换时状态丢失 | 低 | 切换到不同视图类型（如 表格↔日历）后，排序/筛选/导航位置重置（Table 内部状态在反复分页时保留）。此为有意设计，非缺陷 |
| 重复事件拖拽/编辑影响锚点 | 低 | 重复事件的某次出现被拖拽或单元格编辑时，写入的是文件根 `date`/`start`/`end` 字段（即锚点），会整体平移整个序列；v1 暂不支持「仅此一次」例外 |

### 代码打磨（近期）

- **撤销/重做原子化**：`UndoManager.capture()` + 独立 `vault.process()` 改为单次 `vault.process()` 内的 `apply()`，读取与写入在同一回调中完成，`before` 快照始终为真实当前内容，避免同文件快速连续编辑时快照错乱。
- **frontmatter 写入去重 + `$` 注入修复**：四个编辑 handler（日期/时间/单元格/字段）重复的 YAML 改写逻辑收敛为 `setFrontmatterField` / `setFrontmatterFields`，替换使用函数式 replacer，值中含 `$`（如标签）时不再被当作正则反向引用。
- **移除 `globalThis.app` 全局 hack**：Table / Calendar / Timeline 打开文件改为经 `onOpenEntry` 回调（与 Kanban 一致），不再依赖 Obsidian 桌面端暴露的全局 `app`。
- **清理死代码**：移除 `main.ts`/`react-renderer.tsx` 中未使用的 `new QueryEngine(...)`；导出命令改用 `dataCache.getEntries()` 复用缓存。
- 新增 `README.md` / `RELEASE.md`（发布清单）。

---

## 文件结构

```
obsidian-scheduler/
├── src/
│   ├── main.ts                    # 插件入口：注册视图/命令/codeblock、提醒扫描、iCal/Markdown 导出、撤销重做
│   ├── settings.ts                # 设置面板 + 默认值
│   ├── types.ts                   # 共享类型（FieldMapping / PageEntry / SchedulerSettings / ViewTemplate ...）
│   ├── schema/
│   │   ├── field-mapping.ts       # Dataview 数据 → PageEntry 映射
│   │   ├── inline-fields.ts       # [key:: value] / 整行 key:: value 解析
│   │   └── field-types.ts         # 字段类型推断（date/number/tags/text）+ 筛选默认操作符
│   ├── query/
│   │   ├── query-engine.ts        # Dataview API 封装 + 纯函数 applySort/applyFilters
│   │   └── data-cache.ts          # 签名缓存层（vault/metadata 变更自动失效）
│   ├── utils/
│   │   ├── dataview-api.ts        # Dataview 运行时检测
│   │   ├── recurrence.ts          # RRULE 子集解析 + 重复事件展开
│   │   ├── reminders.ts           # 提醒派生（due 时刻 + 通知判定）
│   │   ├── ical.ts                 # iCal 导出/导入（RFC5545 行折叠展开）
│   │   ├── markdown-export.ts     # 条目导出为 Markdown 表格
│   │   ├── undo-manager.ts        # 撤销/重做（frontmatter 全文快照，单次 vault.process 原子写）
│   │   ├── new-file-builder.ts    # 筛选 → frontmatter + 文件名清洗
│   │   └── new-entry-modal.ts     # 新建条目标题输入弹窗
│   └── views/
│       ├── react-renderer.tsx     # Preact 根组件 SchedulerApp + 工具栏 + 4 个 frontmatter 编辑 handler + ItemView
│       ├── table/
│       │   ├── table-view.tsx      # 表格视图（分页/列宽/多选/排序管理器/键盘导航）
│       │   └── table-utils.ts      # 列收集、单元格格式化、标签/日期格式化
│       ├── calendar/
│       │   └── calendar-view.tsx   # 月/周历（拖拽改期、多天连通条、↻ 标记）
│       ├── timeline/
│       │   └── timeline-view.tsx   # 日时间轴（多日列、拖拽移动/缩放、区段选取创建）
│       └── kanban/
│           └── kanban-view.tsx     # 看板（分组字段、卡片跨列拖拽改字段值、+Add 继承）
├── styles.css                     # 全局样式
├── manifest.json                  # Obsidian 插件清单
├── package.json                   # 构建脚本
├── tsconfig.json                  # TypeScript 配置
├── esbuild.config.mjs             # 构建入口
├── USER_GUIDE.md                  # 使用文档
├── README.md                      # 项目 README（安装/特性/开发）
├── RELEASE.md                     # 发布清单
└── DEV_NOTE.md                    # 本文件
```
