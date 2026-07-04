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

## 未完成功能

### 优先级高

#### Table 视图增强
- [ ] 表格分页（大量条目时的性能优化）
- [ ] 列宽拖拽调整
- [ ] 多选 + 批量修改
- [ ] 行内编辑支持日期字段（日期选择器）
- [ ] 行内编辑支持标签字段（多值输入）
- [ ] 编辑后自动刷新 Dataview 索引（等待重新索引）

#### Calendar 视图增强
- [ ] 周视图切换
- [ ] 日期选择器跳转
- [ ] 跨月事件（跨多天的事件在单元格间连线）
- [ ] 左侧 Ribbon 显示小号日历

#### Timeline 视图增强
- [ ] 多日视图（5 天 / 7 天列并排）
- [ ] 时间段选取创建新事件
- [ ] 在时间轴上拖拽创建新时间块
- [ ] 拖拽时视觉反馈（半透明阴影跟随）

### 优先级中

#### 数据层
- [ ] 编辑后自动触发 Dataview 重新索引（目前需手动切换视图或重启插件刷新）
- [ ] `Key:: Value` 整行字段格式支持（目前仅支持 `[key:: value]`）
- [ ] 字段类型自动推断（数字/日期/布尔等类型化存储）
- [ ] 数据缓存层（减少重复 vault.process 调用）

#### 通用功能
- [ ] Markdown 导出视图
- [ ] 主题自适应优化（dark/light 模式细化）
- [ ] 移动端响应式适配
- [ ] 键盘快捷键（表格导航、日历翻页等）
- [ ] 撤销 / 重做支持
- [ ] 搜索框（全文搜索条目标题）

### 优先级低（Phase 6）

- [ ] 看板（Kanban）视图
- [ ] 重复事件支持（RRULE 或自定义语法）
- [ ] 通知 / 提醒系统（Obsidian 系统通知）
- [ ] 多字段排序 UI 细化（拖拽调整排序优先级）
- [ ] iCal 导入/导出
- [ ] 视图模板保存（快速切换常用视图配置）

---

## 已知问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 编辑后数据不刷新 | 中 | `vault.process` 修改后，Dataview 需要重新索引才能反映在 Scheduler 中。目前需手动切换 Tab 触发刷新 |
| 拖拽写入 ISO 时间含时区偏移 | 低 | Timeline 拖拽后用 `toISOString()` 写入，可能包含 UTC 偏移。日历拖拽已用本地时间处理 |
| 大量条目（>1000）时表格性能 | 低 | 未做虚拟滚动或分页，大量条目时可能卡顿 |
| Tab 切换时状态丢失 | 低 | 切换到不同 Tab 后，排序/筛选/导航位置重置 |

---

## 文件结构

```
obsidian-scheduler/
├── src/
│   ├── main.ts                    # 插件入口
│   ├── settings.ts                # 设置面板 + 默认值
│   ├── types.ts                   # 共享类型
│   ├── schema/
│   │   ├── field-mapping.ts       # Dataview 数据 → PageEntry 映射
│   │   └── inline-fields.ts       # [key:: value] 解析
│   ├── query/
│   │   └── query-engine.ts        # Dataview API 封装 + sort/filter
│   ├── utils/
│   │   └── dataview-api.ts        # Dataview 运行时检测
│   └── views/
│       ├── react-renderer.tsx      # Preact 根组件 + TableView + FilterBar + EditableCell
│       ├── calendar/
│       │   └── calendar-view.tsx   # Calendar 月视图
│       └── timeline/
│           └── timeline-view.tsx   # Timeline 日时间轴
├── styles.css                     # 全局样式
├── manifest.json                  # Obsidian 插件清单
├── package.json                   # 构建脚本
├── tsconfig.json                  # TypeScript 配置
├── esbuild.config.mjs             # 构建入口
├── USER_GUIDE.md                  # 使用文档
└── DEV_NOTE.md                    # 本文件
```
