# Firebase / 数据层长远整改规划

> **状态：** 待确认（确认前不改业务代码、不部署、不碰生产数据）
> **日期：** 2026-08-05（修订版）
> **依据：** `docs/firebase-path-audit.md`、当前 `LISTABLE_PROJECT_STATUSES` 列表查询、产品租户模型（`workspaceId` 权威，`companyId` 镜像）

---

## 1. 最终执行顺序（强制，不可乱序）

```
A  测试/门禁就绪（typecheck + build + Rules tests，含真实 list 查询）
   ↓
B1/B2 Dry-run（只读扫描，输出缺失字段统计，不写入）
   ↓
人工审批（人工看 dry-run 报告，确认数量/范围）
   ↓
备份（Firestore 导出，覆盖将要写入的 collection）
   ↓
B1/B2 Execute（受控 backfill，仅补齐缺失字段）
   ↓
验证：缺失字段计数 = 0（对 backfill 目标字段重新扫描确认）
   ↓
C 查询改动 + Rules 收紧（media 查询排除 tombstone；Rules 收回 tenant 读 tombstone 权限）
   ↓
最终测试（typecheck + lint + build + Rules tests 全部重跑）
```

**关键约束：**

- 第 1–4 步之前，**不**改任何查询逻辑、**不**收紧任何 Rules。
- Backfill（B1/B2）与 Rules/查询收紧（C）之间必须有「验证缺失字段=0」的检查点。
- lint 清理与数据库迁移**分开**，互不阻塞、互不混提交。

---

## 2. 需求点修正说明

### 2.1 Project `status` backfill（补齐旧项目）

- **只更新缺失 `status` 的文档**（即 `!('status' in data)` 或 `data.status == null`）。
- 缺失时默认写入现有规范值 `"upcoming"`（与 `mapProject` 默认一致）。
- **绝不覆盖**任何已存在的合法值，包括 `trashed`、`purging`，也不覆盖任何非空但未知的字符串值——未知值只记录到报告，不做自动纠正。
- 不做「按 lastUpdateAt 推断 in_progress」之类的启发式覆盖（已从规划中移除）。

### 2.2 Media `mediaLifecycle` backfill 与查询

- 字段：`mediaLifecycle: "active" | "tombstoned"`。
- Backfill 规则（一次性，只在缺失字段时写入）：
  - `status in [DELETED, CANCELLED]` 或存在 `deletedAt` → `tombstoned`
  - 其余（含无 `status` 的旧 photo）→ `active`
- **已移除「临时双读」方案。** 原因：`where('mediaLifecycle', '==', 'active')` 天然不会返回缺少该字段的文档，不存在需要兼容的「双读」窗口——只要 backfill 完整覆盖所有文档，查询就是安全的。不引入过渡期 Rules 例外。
- **顺序强制：** 在 backfill 验证「缺失 `mediaLifecycle` 计数 = 0」之前，**不得**：
  - 修改 `listMedia` 查询为 `mediaLifecycle == 'active'`
  - 收紧 Rules 禁止 tenant 读取 tombstone
  否则会出现两类问题：查询侧漏掉未打标的旧 active 媒体（列表变空/不完整），或 Rules 侧因集合中仍有未打标文档导致裸 `orderBy` 查询在收紧后整体失败。

### 2.3 测试门禁（阶段 A）

- 新增 `typecheck` npm script。
- 新增 Firebase Emulator + `@firebase/rules-unit-testing` 套件，路径 `tests/rules/*.test.ts`。
- **Rules 测试必须覆盖真实的 list 查询（`getDocs(query(...))`），而不仅是单文档 `getDoc`。** 具体用例：
  - `listProjects`：`where(workspaceId==) + where(status in LISTABLE)` 对不同角色（admin/staff/client）返回预期集合，且集合中混入 `trashed`/`purging` 文档时查询仍成功。
  - `listTrashedProjects`：`where(status==trashed) + where(createdBy==uid)` 对非创建者返回空/被拒，对创建者成功。
  - `listMedia`（staff）：`where(mediaLifecycle==active)` 在集合含 tombstone 时查询成功且不返回 tombstone。
  - `listMedia`（client）：`where(clientVisible==true)` 组合 `mediaLifecycle==active`。
  - Admin SDK 路径（trash/purge/webhook）不受 Client Rules 测试约束，单独标注跳过。
- 门禁标准：typecheck + build + Rules tests 全绿才允许进入 backfill 的人工审批步骤；lint 单独跑，不作为 backfill 阻断条件（见 §4）。

---

## 3. 分阶段任务（对应 §1 顺序）

### 阶段 A — 测试与门禁（不改生产数据）

| 任务 | 产出 |
|------|------|
| 添加 `typecheck`、`test:rules` npm scripts | `package.json` |
| 引入 Emulator + `@firebase/rules-unit-testing` | `tests/rules/*.test.ts` |
| 编写真实 list 查询用例（见 §2.3） | 同上 |
| 本地跑 typecheck / build / rules tests，全绿 | 记录结果 |

### 阶段 B — Dry-run → 审批 → 备份 → Execute → 验证

| 步骤 | 内容 |
|------|------|
| B1 dry-run | Admin 脚本扫描 `collectionGroup('projects')`，只读，输出 `missingStatus` / `alreadyOk(含trashed/purging)` / `unknownStatus` 数量与文档 ID 列表 |
| B2 dry-run | Admin 脚本扫描各项目 `media`，输出 `missingLifecycle → 将写 active/tombstoned` 的分类数量 |
| 人工审批 | 人工核对 dry-run 报告的数量与抽样文档，确认无异常后签字放行 |
| 备份 | 对将写入的 collection 做 Firestore 导出（`gcloud firestore export` 或等效），记录导出路径/时间戳 |
| B1 execute | 仅对 `missingStatus` 文档写 `status: "upcoming"`（merge） |
| B2 execute | 仅对 `missingLifecycle` 文档写 `mediaLifecycle`（按分类） |
| 验证 | 重新扫描，确认 `missingStatus == 0` 且 `missingLifecycle == 0`；否则回到 dry-run 排查，不进入阶段 C |

**约束：** 脚本默认 dry-run；无 `--execute` 标志不写入；execute 前必须已完成备份且拿到人工审批记录。

### 阶段 C — 查询改动 + Rules 收紧（仅在 B 验证通过后）

| 步骤 | 内容 |
|------|------|
| C1 | `listMedia`（staff）改为 `where('mediaLifecycle','==','active') + orderBy('createdAt','desc')` |
| C2 | `listMedia`（client）叠加 `mediaLifecycle=='active'` 与现有 `clientVisible==true` |
| C3 | Rules 收回：tenant/staff 不可读 `mediaLifecycle=='tombstoned'`（或 `status in [DELETED,CANCELLED]`）；仅 Admin SDK 可读 |
| C4 | 新增索引：`mediaLifecycle + createdAt`；client 侧 `clientVisible + mediaLifecycle + createdAt` |
| C5 | 阶段 A 的 Rules tests 更新为收紧后的期望结果，重跑全绿 |

### 阶段「最终测试」

- 重跑：typecheck、lint、build、Rules tests（含 §2.3 全部 list 查询用例）。
- 全绿后才可讨论部署（部署仍需你单独批准，本规划不默认执行）。

---

## 4. Lint 与数据库迁移分离

- Lint 现存 6 errors（`react-hooks/set-state-in-effect`，见 §5.2）与本次 Firebase backfill/Rules 工作无关。
- 处理方式：**独立提交**，不与阶段 B/C 的数据脚本或查询改动混在同一次改动中；不阻塞 backfill 的审批与执行。
- 阶段 A 的「测试门禁」中，lint 作为单独检查项记录状态，但不作为进入 B 阶段人工审批的必要条件。

---

## 5. 验证结果（当前仓库基线，2026-08-05）

> 本次未实施任何代码/数据改动，仅记录基线，供阶段 A 对比。

### 5.1 TypeScript (`npx tsc --noEmit`)

| 项 | 结果 |
|----|------|
| Exit code | 0 |
| 结论 | **通过** |

### 5.2 Lint (`npm run lint`)

| 项 | 结果 |
|----|------|
| Exit code | 1 |
| 统计 | 6 errors, 6 warnings |
| 结论 | **未通过**（与本规划分离处理，见 §4） |

Errors 均为 `react-hooks/set-state-in-effect`：`app/(staff)/media/page.tsx:36`、`app/(staff)/storage/page.tsx:23`、`components/progress/month-calendar.tsx:67`、`components/progress/overview-3d.tsx:43`、`components/progress/week-timeline.tsx:94`、`lib/client-project.tsx:69`。

### 5.3 Production build (`npm run build`)

| 项 | 结果 |
|----|------|
| Exit code | 0 |
| Next.js | 16.2.12 (Turbopack)，编译成功，12/12 静态页生成 |
| 结论 | **通过** |

### 5.4 Rules tests

| 项 | 结果 |
|----|------|
| 单元测试套件 | **不存在**（无 `@firebase/rules-unit-testing`，无 `tests/rules/**`） |
| Firestore Rules 编译 dry-run | 通过（`firebase deploy --only firestore:rules --dry-run`，exit 0） |
| Storage Rules 编译 dry-run | 通过（`firebase deploy --only storage --dry-run`，exit 0） |
| 结论 | **无行为级测试**，仅编译级 smoke check；阶段 A 需新增覆盖真实 list 查询的测试（见 §2.3） |

### 5.5 汇总

| 检查 | 结果 |
|------|------|
| TypeScript | PASS |
| ESLint | FAIL（与迁移工作分离，不阻断） |
| Production build | PASS |
| Rules unit tests | N/A（待阶段 A 建立） |
| Rules compile (dry-run) | PASS |

---

## 6. 决策清单（请确认）

| # | 决策 | 建议默认 |
|---|------|----------|
| D1 | 无 `status` 的旧项目补齐为 `"upcoming"`，绝不覆盖已有值 | 同意 |
| D2 | 不使用启发式推断状态（如按 lastUpdateAt 猜 in_progress） | 同意 |
| D3 | Media 使用 `mediaLifecycle: active\|tombstoned`，不设「临时双读」 | 同意 |
| D4 | Backfill 顺序：dry-run → 人工审批 → 备份 → execute → 验证=0 → 才做 C | 同意 |
| D5 | C 阶段查询/Rules 改动必须晚于 B 验证通过 | 同意 |
| D6 | Rules tests 必须含真实 list 查询用例，不只 getDoc | 同意 |
| D7 | Lint 清理与本次迁移分开提交，不互相阻塞 | 同意 |
| D8 | 本次仍不部署、不 push master、不做 `organizations/` 改名 | 同意 |

---

*确认决策清单后，按 §1 顺序开始阶段 A 的代码与测试落地。*
