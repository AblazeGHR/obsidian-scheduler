# Obsidian Scheduler 移动端适配计划

分支：`feat/mobile-adaptation`（基于 main，2026-08-11 创建）

## 1. 背景与目标

本插件目前主要面向桌面端。Obsidian 的 iOS/Android 移动端与桌面共用同一份 `main.js`（无独立构建产物），因此移动端适配不需要改构建流程，而是通过 **CSS 定向 + 交互层替代** 两层工作完成。

目标：在手机（窄屏 ~390px、触屏、无键盘/鼠标/hover）上插件**可用**——所有功能有可触达的入口，布局不溢出、不遮挡。

不追求：在手机上 1:1 复现桌面的拖拽手感（见交互方案 B，列为后续增强）。

## 2. 现状诊断

### 2.1 架构（移动端共用的关键点）
- 构建：`esbuild.config.mjs` 单入口 `src/main.ts` → `main.js`，桌面/移动共用，**无需改构建**。
- UI 载体：
  - codeblock 渲染（5 种 `scheduler` 代码块）→ `src/views/react-renderer.tsx:882`
  - ItemView（`SchedulerView`）→ `react-renderer.tsx:843`，`main.ts:53` 注册
  - 弹窗：Obsidian `NewEntryModal`（`utils/new-entry-modal.ts`）+ 自建 overlay（fields/filter modal）
  - 右键菜单：`src/views/context-menu.tsx`，已 portal 到 `<body>`（fixed 偏移问题已解决）
  - 设置页：`src/settings.ts`

### 2.2 移动端失效/有问题的交互（按风险排序）

| # | 问题 | 位置 | 移动端表现 |
|---|------|------|-----------|
| 1 | **HTML5 拖拽**（`draggable=true` + drag/drop 事件） | `calendar/calendar-view.tsx:463-528`、`kanban/kanban-view.tsx:106-245`、`timeline/timeline-view.tsx`、`table/table-view.tsx:341-397` | 触屏不触发 drag 事件，**拖拽移动条目完全失效**；列宽拖拽 `table-view.tsx:750` 同样失效 |
| 2 | **hover 才显示的控件** | `styles.css:1180` 日历格"+"号 `opacity:0` 仅 hover 显示；全文 40+ 处 `:hover` | 触屏无 hover，**新增按钮不可见**（手机上是"长按/点按"仅触发一次，不维持 hover） |
| 3 | **硬编码最小宽度超手机屏幕**（390px） | `styles.css:217` fields-modal `min-width:400px`；`:680-681` filter-modal `480/640px`；`:516-517` filter-panel `420/560px`；`:1701/2054` 240px、`:1812` 200px、`:1934` 160px | 弹窗/面板溢出屏幕或被裁切 |
| 4 | **右键菜单（contextmenu）不可用** | `table-view.tsx:783`、`calendar-view.tsx:532`、`timeline-view.tsx:436/511`、`kanban-view.tsx:180/248` | 手机长按会触发系统文本选择/无响应，右键功能无入口 |
| 5 | **键盘快捷键导航/操作** | `react-renderer.tsx:696`、`calendar-view.tsx:130`、`table-view.tsx:110/304/727` | 移动端无键盘（外接键盘可忽略），部分操作缺 UI 替代入口 |
| 6 | **双击 auto-fit 列宽** | `table-view.tsx:752` | 手机双击行为不定，属弱化优先级 |
| 7 | **日历 7 列网格挤压** | `styles.css:1032/1057` `grid repeat(7,1fr)` | 390px 屏每格仅 ~55px，事件文字/日期号拥挤 |

### 2.3 已有基础（可复用/继承）
- `styles.css:1596` 已有 `@media (max-width:600px)`：toolbar 换行、搜索框 140px、时间轴日列 64px、pagination 换行。**注意 `:1614-1620` 的 `.scheduler-table` 三条规则缩进异常，疑似误写在媒体查询外/内边界，需顺手修正**。
- `styles.css:1844` 已有 kanban 600px 下纵向堆叠。
- 日期输入用原生 `type="date"` / `type="month"`（`table/date-cell.tsx:60`、`table-view.tsx:293`、`calendar-view.tsx:348`）——移动端调用系统选择器，天然可用，无需改。
- 表格已有横向滚动容器 `styles.css:331` `.scheduler-table-scroll overflow-x:auto`。
- `position:fixed` 仅两处全屏 overlay（`styles.css:200`、`:665`，均为 `inset:0`），不会被 workspace 偏移；右键菜单已 portal 到 body。→ 无 fixed 偏移隐患。

## 3. 适配策略总览

分四层，按"改动小、收益大、可独立验证"排序：

```
阶段一  CSS 层适配（零 JS 改动，解决 60% 问题）
阶段二  触摸交互替代（拖拽/右键/hover 的移动端方案）
阶段三  窄屏布局打磨（日历、弹窗、工具栏细节）
阶段四  验证与回归
```

**媒体查询策略**（贯穿阶段一~三）：
- 用 Obsidian 自动加在 `<body>` 上的 **`.is-mobile`** 类定向"真移动端"（`@media` 无法区分手机与桌面窄窗）。
- 保留现有 `@media (max-width:600px)` 处理桌面窄窗/分割窗格。
- 触屏专属规则用 `@media (hover: none)` 定向。
- 三者都写在本插件的 `styles.css`（无需新建 snippet），**统一在文件末尾追加"Mobile"区块**，不散改原有规则，便于回滚。

## 4. 分阶段任务

### 阶段一：CSS 层适配（styles.css）

1. **追加 `.is-mobile` 覆盖区块**（文件末尾）：
   - 弹窗宽度：`.scheduler-fields-modal-content`、`.scheduler-filter-modal-content`、`.scheduler-filter-panel` 在 `.is-mobile` 下改为 `min-width: 0; width: min(95vw, 480px); max-height: 85vh;`
   - 其余硬编码宽（240/200/160px 等）逐一检查，超出 `100vw` 的改为 `max-width: 100%` 或 `vw` 弹性值。
   - 底部安全区：对所有全屏/底部贴边元素加 `padding-bottom: calc(x + env(safe-area-inset-bottom))`（iPhone 刘海屏/Home 指示条遮挡）。先盘点哪些元素贴底（toolbar/分页/筛选条）。
2. **hover 控件可见化**：`.scheduler-calendar-cell-add` 等默认 `opacity:0` 的控件，在 `@media (hover: none)` 下 `opacity: 1`（或 0.6 + 点击高亮）。
3. **日历压缩**：`.is-mobile` 下减少 `.scheduler-calendar-cell` 内边距、日期号字号、事件文字字号/行高；`MAX_VISIBLE_EVENTS` 不足时在 JS 侧可配（见阶段三）。
4. **修正 `styles.css:1614-1620`** 媒体查询内的缩进/作用域异常（确认 `.scheduler-table` 规则是否误在块外）。

产出：手机端打开插件不溢出、新增按钮可见、弹窗不裁切。**验证**：`npm run build && npm run deploy`，桌面窗口缩到 360px 宽预览（Chrome DevTools 设备模拟也可）。

### 阶段二：触摸交互替代（src/）

1. **拖拽 → 移动端"选择式移动"**（推荐方案 A，改动小、复用现有数据流）：
   - 在 calendar / kanban / timeline / table 四个视图实现统一 hook（如 `useMobileMove`）：
     - 触屏（`Platform.isMobile`）下：点按条目 → 高亮选中（复用现有 `selectedPaths` 多选态）→ 点按目标日期/列/时段 → 调用现有 `onDateChange` / `onGroupChange` 完成移动；点空白取消。
     - 桌面端行为完全不变。
   - 数据层无改动，只加"移动端入口"到现有 handler。
   - 需检查各视图 drop 目标的 handler 签名（`calendar-view.tsx` `handleDrop` 已支持批量 `paths`，可直接复用）。
   - 方案 B（后续增强，不在本次范围）：pointer events 实现长按 500ms 进入拖拽 + 自动滚动。
2. **右键菜单 → 长按触发**：
   - `context-menu.tsx` 的 `open(e: MouseEvent, ...)` 目前只接收鼠标事件。加一个 touch 兼容入口：条目上 `touchstart` 计时 500ms（期间移动即取消）→ 以触点坐标调用同一 `open`（把 `clientX/Y` 换成触点坐标）。`open` 内部已做屏幕边界 clamp，无需改。
   - 触发点：四个视图的 `onContextMenu` 处（`table-view.tsx:783` 等）改为同时挂 `onContextMenu` + `onTouchStart` 长按。
3. **hover-only 控件的可点性**：阶段一 CSS 已让其可见；确认点击目标（`+`号按钮 onClick）在触屏上可达。
4. **键盘快捷键**：移动端禁用快捷键注册（`Platform.isMobile` 时跳过 `addCommand` 中依赖键盘的，或保留命令但确认命令面板可触达）；检查表格键盘增删行是否有 UI 替代（若无则补"添加行"按钮，若有则确认可点）。

产出：手机上能拖拽改期/改列/移动卡片，长按出右键菜单，全部功能有触屏入口。

### 阶段三：窄屏布局打磨

1. **日历**：`MAX_VISIBLE_EVENTS` 在窄屏下调低（手机每格空间小），"`+N more`"溢出入口已存在（`calendar-view.tsx:542-545`），确认可点击展开。
2. **表格**：确认横向滚动 + 首列不 sticky（保持现状，避免过度工程）；检查双击 auto-fit 在触屏的替代（可加"⋮ 菜单 → 自适应列宽"或在表头加小按钮）。
3. **工具栏/视图切换**：现有 600px 换行已覆盖；确认 5 种视图切换 Tab 在窄屏可点、不重叠。
4. **新增条目 Modal**（`utils/new-entry-modal.ts` 用的 Obsidian Modal）：Obsidian 移动端 modal 自动全屏，确认表单字段不挤压；如内联字段编辑器在窄屏溢出则加 `max-width:100%`。

### 阶段四：验证

1. 构建与部署：`npm run build` + `npm run deploy`（复制到 `../test-vault/.obsidian/plugins/obsidian-scheduler/`）。
2. **桌面窄窗回归**：窗口缩到 360px，过一遍五个视图 + 新增/编辑/筛选 + 设置页。
3. **真机清单**（需 Obsidian 移动端，vault 同步或直接复制插件目录）：
   - [ ] 五个视图能打开、切换，无横向溢出
   - [ ] 日历格"+"号可见可点
   - [ ] 拖拽改期（选择式移动）：日历、看板、时间轴、表格
   - [ ] 长按出右键菜单
   - [ ] 新增/编辑/筛选弹窗全屏可用、输入不裁切
   - [ ] 时间轴日列、看板列在手机上可读可操作
   - [ ] iPhone：底部安全区不遮挡分页/工具栏
   - [ ] 表格横向滚动流畅
4. 回归桌面功能不受影响（拖拽/右键/快捷键原样）。

## 5. 里程碑与范围

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| M1（本次） | 阶段一 CSS + 阶段二触摸交互 | 手机端全部功能可触达，无溢出裁切 |
| M2（后续） | 阶段三打磨 + 真机回归 | 真机清单全绿 |
| M3（可选） | 方案 B 长按拖拽、触屏细节优化 | 手机端拖拽手感接近桌面 |

## 6. 风险与注意

- **不改数据层**：移动端只是换交互入口，写文件逻辑（改期/改列）全部走现有 handler，避免双端数据行为分叉。
- **`.is-mobile` 依赖**：Obsidian 桌面版窄窗不会带 `.is-mobile`，所以窄窗靠 `@media`，手机靠 `.is-mobile`，两者规则可能叠加，注意优先级（`.is-mobile` 规则放在文件末尾自然覆盖）。
- **长按手势与滚动冲突**：长按拖拽/右键的 `touchstart` 计时期间若发生滚动应立即取消，否则破坏列表滚动。
- **不要在移动端禁用桌面功能**：方案 A 下桌面拖拽保持原样，仅手机进入选择式移动。
