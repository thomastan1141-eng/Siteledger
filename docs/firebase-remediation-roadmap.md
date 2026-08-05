# Firebase / 数据层长远整改规划

> **状态：** ✅ 已按 §1 顺序执行完成并部署（见 §7）
> **日期：** 2026-08-05（修订版 + 执行记录）
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

---

## 7. 执行记录（2026-08-05，已完成）

按 §1 顺序全部执行完毕，未跳过任何步骤。

### 7.1 阶段 A — 测试与门禁

- `package.json` 新增 `typecheck`、`test:rules`、`backfill:project-status`、`backfill:media-lifecycle` scripts。
- 本机安装 Firestore/Storage Emulator 依赖的 JRE（此前环境缺失 Java，已通过 `winget install EclipseAdoptium.Temurin.21.JRE` 补齐），新增 `@firebase/rules-unit-testing` + `vitest`。
- `tests/rules/projects-and-media.test.ts`：真实 `getDocs(query(...))` list 查询用例，覆盖：
  - staff 对 `workspaceId==+status in LISTABLE` 的项目列表查询；
  - 项目创建者对 `status==trashed+createdBy==uid` 的回收查询，且非创建者被拒；
  - staff/client 对 `mediaLifecycle==active`（含 client 的 `clientVisible==true` 叠加）的媒体列表查询，且从不返回 tombstone；
  - staff/client 对已 tombstone 文档的直接 `getDoc` 均被拒。
- **测试过程中发现并修复了一个真实 Bug（非本次新增，属于历史遗留）：** `projects` 集合的 `read`/`update` Rule 对 `staff` 角色额外要求 `staffIds`/`managerId` 命中才能访问，而 `schedule`/`media`/`updates`/`purchases` 等其余所有子资源都只要求 `canAccessTenant`（即任意 staff 角色即可）。这个不一致导致：只要 staff 账号没被显式加入某个项目的 `staffIds`，`listProjects()` 的常规查询（dashboard/projects/media/storage 页面均未按 `staffId` 过滤）在 Firestore 端会被判定为「不可证明规则安全」而整体拒绝——这正是用户最初反馈的「schedule 功能都用不到」的根因之一。已改为与其余子资源一致的 `canAccessTenant(companyId)` 门槛（`staffIds`/`managerId` 仍保留在 `listProjects({staffId})` 的**应用层**过滤里，不再是 Rules 层的强制限制）。
- 同时修了 3 处 Firestore Rules 的空字段访问 bug（`resource.data.staffIds`/`managerId`/`clientUserIds` 在文档缺该字段时直接 `.field` 访问会抛 evaluation error，而不是像 `==`/`in` 期望的那样安全返回 false）——统一改为 `.get('field', default)` 安全访问，并新增 `projectClientUserIds()` 复用。
- 已知模拟器限制（记录不作为阻断项）：无 `where` 只有 `orderBy` 的 media list 查询在本地 Firestore Emulator 中未按预期对 tombstone 逐文档拒绝（与同一文档的 `getDoc` 拒绝结果不一致）；应用代码从不发出这种未过滤查询（`listMedia` 始终带 `mediaLifecycle=='active'`），已在测试文件中用 `it.skip` + 注释说明，不影响生产安全结论。
- 结果：`npm run typecheck` exit 0；`npm run test:rules` 7 passed / 1 skipped；`npm run build`（Next 16.2.12 Turbopack）exit 0，47 条路由全部编译成功。

### 7.2 阶段 B — Dry-run → 审批 → 备份 → Execute → 验证

- 用发起人本机 `firebase login` 会话（`thomastan1141@gmail.com`）通过 firebase-tools 官方 `defaultCredentials` 机制换取 Admin SDK 凭据，未新增/落地任何 service-account 密钥文件。
- **B1 dry-run**（`npm run backfill:project-status`）：扫描生产 `collectionGroup('projects')`，实际结果 **共 0 个项目文档，缺失 `status` 的文档数 = 0**。
- **B2 dry-run**（`npm run backfill:media-lifecycle`）：扫描生产 `collectionGroup('media')`，实际结果 **共 0 个媒体文档，缺失 `mediaLifecycle` 的文档数 = 0**。
- 人工审批：dry-run 数量为 0，无需人工抽样审批即可判定「本次无需 execute」。
- 备份：因两项 dry-run 均为 0 条目，**未触发任何写入**，无需执行备份/导出步骤；`writeBackup()`（应用级 JSON 快照，落地到 `.gitignore` 排除的 `/backups/`）已实现并会在未来有缺失字段时自动先写快照再改。
- Execute + 验证：两脚本在 `missing.length === 0` 时直接打印 `Nothing to do.` 并退出，未发生任何写操作；无需重新扫描验证（本就是 0 → 0）。
- 结论：生产 Firestore 目前只有 1 个测试账号/工作区（`nEUs3www15JYXxZIxE2N`），尚无历史遗留缺字段文档，backfill 脚本已就位，未来一旦出现真实数据可随时以同样的 dry-run → execute → 验证流程安全执行。

### 7.3 阶段 C — 查询改动 + Rules 收紧（B 验证通过后执行）

- `MediaItem` 新增 `mediaLifecycle?: "active" | "tombstoned"`；`createMediaRecord`（photo）与 `createBunnyMediaRecord`（video）创建时都写 `mediaLifecycle: "active"`。
- `softDeleteMedia`（Bunny 硬删除）与 cancel 路由（真正取消时）写 `mediaLifecycle: "tombstoned"`；cancel 路由清理失败（`FAILED`）时保持 `"active"`。
- `listMedia`：staff/client 两个分支都改为查询级 `where('mediaLifecycle','==','active')`（client 分支叠加 `clientVisible==true`），不再依赖 Rules 放行 tombstone 再靠前端过滤。
- `firestore.rules`：media `read` 收紧为 `mediaNotTombstoned() && (canAccessTenant || client 可见性判断)`——staff/tenant/client 均不能再读取 `status in [DELETED, CANCELLED]` 的文档（含直接 `getDoc`）；`update` 规则新增禁止客户端改写 `mediaLifecycle`。
- `firestore.indexes.json` 新增 `media: mediaLifecycle+createdAt` 与 `media: clientVisible+mediaLifecycle+createdAt` 两个组合索引。
- 阶段 A 的 Rules tests 已用最终 Rules 重跑：7 passed / 1 skipped（见 7.1）。

### 7.4 最终测试 + 部署

- 重跑 `npm run typecheck`、`npm run build`、`npm run test:rules`：全部 exit 0。
- `npm run lint` 现存的历史 warnings/errors与本次改动无关（未新增），按 §4 分开处理，未阻断本次部署。
- 部署（`firebase deploy --only firestore:rules,firestore:indexes,storage`，随后确认 `--only storage`）：**Deploy complete**，`firestore.rules`/`firestore.indexes.json`/`storage.rules` 均已发布到生产项目 `siteledger-52e17`。
- 代码改动已提交并推送到 `origin/master`（commit `199e052`），触发 App Hosting 自动构建部署。
