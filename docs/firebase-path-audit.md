# Firebase Path Audit — SiteLedger

> **Mode:** read-only repository audit. No application code, Rules, indexes, schemas, or production data were modified. No deploy, push, or migration scripts were created.  
> **Date:** 2026-08-04  
> **Repo:** `C:\Users\User\OneDrive\Desktop\Siteledger_latest`  
> **Firebase project (from prior ops context):** `siteledger-52e17`  
> **Canonical helpers:** `src/lib/paths.ts`  
> **Legacy tenant constant:** `COMPANY_ID = "siteledger"` (`src/lib/constants.ts`)

---

## Files inspected

### Config / Rules / indexes

| File | Role |
|------|------|
| `firebase.json` | Points at `firestore.rules`, `firestore.indexes.json`, `storage.rules` |
| `firestore.rules` | Full Firestore security rules |
| `storage.rules` | Full Storage security rules |
| `firestore.indexes.json` | Composite indexes + fieldOverrides |
| `docs/WORKSPACE_MIGRATION.md` | Existing migration assumptions (read for context) |
| `src/lib/constants.ts` | `COMPANY_ID` |
| `src/lib/paths.ts` | All path helper templates |
| `src/lib/organization.ts` | Product naming notes (no I/O) |
| `src/lib/firebase.ts` | Client SDK init |
| `src/lib/firebase-admin.ts` | Admin SDK init |
| `src/middleware.ts` | Bunny webhook / cron pass-through only (no Firebase I/O) |

### Client services

| File |
|------|
| `src/lib/services/users.ts` |
| `src/lib/services/workspaces.ts` |
| `src/lib/services/projects.ts` |
| `src/lib/services/categories.ts` |
| `src/lib/services/schedule.ts` |
| `src/lib/services/daily-plans.ts` |
| `src/lib/services/updates.ts` |
| `src/lib/services/media.ts` |
| `src/lib/services/purchases.ts` |
| `src/lib/services/reminders.ts` |
| `src/lib/services/invites.ts` (HTTP to API only — no direct Firestore) |
| `src/lib/demo.ts` (demo data / fake storage paths under AUTH_BYPASS) |

### Server libraries

| File |
|------|
| `src/lib/server/auth.ts` |
| `src/lib/server/audit.ts` |
| `src/lib/server/idempotency.ts` |
| `src/lib/server/invitations.ts` |
| `src/lib/server/project-permissions.ts` |
| `src/lib/bunny/media-store.ts` |
| `src/lib/bunny/server.ts` (Bunny HTTP API; webhook uses media-store) |

### API routes

| File |
|------|
| `src/app/api/onboarding/route.ts` |
| `src/app/api/projects/create/route.ts` |
| `src/app/api/projects/[projectId]/trash/route.ts` |
| `src/app/api/projects/[projectId]/restore/route.ts` |
| `src/app/api/projects/[projectId]/purge/route.ts` |
| `src/app/api/projects/[projectId]/media/sync-processing/route.ts` |
| `src/app/api/cron/purge-trashed/route.ts` |
| `src/app/api/invitations/create/route.ts` |
| `src/app/api/invitations/accept/route.ts` |
| `src/app/api/invitations/revoke/route.ts` |
| `src/app/api/invitations/list/route.ts` |
| `src/app/api/access/create/route.ts` |
| `src/app/api/access/revoke/route.ts` |
| `src/app/api/access/clear-password-flag/route.ts` |
| `src/app/api/media/[mediaId]/download/route.ts` |
| `src/app/api/media/[mediaId]/visibility/route.ts` |
| `src/app/api/bunny/webhook/route.ts` |
| `src/app/api/bunny/videos/create-upload/route.ts` |
| `src/app/api/bunny/videos/[mediaId]/route.ts` |
| `src/app/api/bunny/videos/[mediaId]/upload-complete/route.ts` |
| `src/app/api/bunny/videos/[mediaId]/sync/route.ts` |
| `src/app/api/bunny/videos/[mediaId]/playback/route.ts` |
| `src/app/api/bunny/videos/[mediaId]/cancel/route.ts` |
| `src/app/api/organization/migrate/route.ts` (501 stub — no path I/O) |

### Types / related UI (path-adjacent only)

| File | Note |
|------|------|
| `src/lib/types.ts` | Field shapes (`workspaceId`, `companyId`, Bunny media fields) |
| `src/lib/workspace-context.tsx` | Loads workspace via Client services |
| `src/lib/auth-context.tsx` | Profile load; sessionStorage keys only |
| `src/components/media/simple-media-uploader.tsx` | Calls media/Bunny APIs |
| `src/components/media/bunny-video-uploader.tsx` | Calls Bunny APIs |
| `src/components/progress/week-timeline.tsx` | Calls schedule Client service |
| `src/components/progress/month-calendar.tsx` | Calls daily-plans Client service |

### Search patterns used (non-destructive)

`collection`, `collectionGroup`, `doc`, `getDoc`, `getDocs`, `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, `onSnapshot`, `query`, `where`, `orderBy`, `writeBatch`, `runTransaction`, `ref`, `uploadBytes`, `uploadBytesResumable`, `getDownloadURL`, `deleteObject`, `admin.firestore` / `getAdminDb` / `firebase-admin`, `companies/`, `workspaces/`, `organizationId`, `COMPANY_ID`, `siteledger`.

### Not found in repo

| Item | Result |
|------|--------|
| `onSnapshot` | **None** |
| `runTransaction` | **None** |
| `uploadBytes` (non-resumable) | **None** (uses `uploadBytesResumable`) |
| `scripts/` migration scripts | **None** |
| Firestore path segment `organizations/` | **None** |
| Field/path `organizationId` used for I/O | **None** (comments / migrate stub body only) |

---

## 1. Every Firestore path currently used

Tenant key note: path segment `{companyId}` in helpers is the same string as `{workspaceId}` in product terms. Below uses the template as written in code.

### Top-level

| Path template | SDK | Operations | Files / functions |
|---------------|-----|------------|-------------------|
| `users/{uid}` | Client | `getDoc`, `setDoc` (merge) | `users.ts` → `getUserProfile`, `ensureBootstrapAdmin` |
| `users/{uid}` | Admin | `get`, `set`/`update` | `onboarding`, `projects/create`, `invitations/accept`, `access/*`, `bunny/videos/create-upload`, `project-permissions.ts`, `invitations.ts` (`assertWorkspaceAdmin`) |
| `workspaces/{workspaceId}` | Client | `getDoc` | `workspaces.ts` → `getWorkspace` |
| `workspaces/{workspaceId}` | Admin | `get`, `set` | `onboarding` |
| `workspaces/{workspaceId}/members/{uid}` | Client | `getDoc` | `workspaces.ts` → `getWorkspaceMember` |
| `workspaces/{workspaceId}/members/{uid}` | Admin | `get`, `set` | `onboarding`, `projects/create`, `access/create`, `access/revoke`, `trash`, `project-permissions`, `invitations` (`assertWorkspaceAdmin`) |

### Tenant root `companies/{workspaceId}`

| Path template | SDK | Operations | Files / functions |
|---------------|-----|------------|-------------------|
| `companies/{workspaceId}` (parent doc) | — | **No code create/read of parent doc found** | Rules allow read/write; only subcollections used |
| `companies/{workspaceId}/meta/setup` | Client | `getDoc`, `setDoc` | `users.ts` → `ensureBootstrapAdmin` (defaults to `COMPANY_ID`) |
| `companies/{workspaceId}/meta/setup` | Admin | `get`, `set` | `onboarding` (hardcoded `companies/${COMPANY_ID}/meta/setup`) |
| `companies/{workspaceId}/users/{uid}` | Client | `getDoc`, `getDocs`, `setDoc`, `updateDoc` | `users.ts` → `getCompanyUserProfile`, `listUsersByRole`, `ensureBootstrapAdmin`, `upsertUserProfile`, `setClientAccess` |
| `companies/{workspaceId}/users/{uid}` | Admin | `get`, `set`, `update` | onboarding, access/*, invitations/accept, clear-password-flag, project-permissions, bunny create-upload, trash |
| `companies/{workspaceId}/workCategories/{categoryId}` | Client | `getDocs`+`orderBy`, `writeBatch`, `addDoc`, `updateDoc` | `categories.ts` → `listWorkCategories`, `seedDefaultWorkCategories`, `createWorkCategory`, `setWorkCategoryActive` |
| `companies/{workspaceId}/reminders/{reminderId}` | Client | `getDocs`+`where`, `addDoc`, `updateDoc` | `reminders.ts` → `listOpenReminders`, `createReminder`, `resolveReminder` |
| `companies/{workspaceId}/createRequests/{id}` | Admin | `get`, `set` | `idempotency.ts` → `getCreateRequest`, `saveCreateRequest` (`id` = `{uid}_{requestId}`) |
| `companies/{workspaceId}/auditEvents/{eventId}` | Admin | `add` | `audit.ts` → `writeAuditEvent` |

### Projects and subcollections

| Path template | SDK | Operations | Files / functions |
|---------------|-----|------------|-------------------|
| `companies/{workspaceId}/projects/{projectId}` | Client | `getDocs`+queries, `getDoc`, `addDoc`, `updateDoc` | `projects.ts` → `listProjects`, `listTrashedProjects`, `listClientProjects`, `getProject`, `createProject`, `updateProject`, … |
| `companies/{workspaceId}/projects/{projectId}` | Admin | `get`, `set`, `update`, `delete`, collection list, **collectionGroup** | create, trash, restore, purge, cron, invitations/*, access/revoke, onboarding legacy stamp, `project-permissions` |
| `.../projects/{projectId}/members/{uid}` | Admin | `get`, `set`, `update`, `delete` (purge batch), **collectionGroup** | projects/create, access/*, invitations/*, download, sync-processing, purge, cron, invitations/list |
| `.../projects/{projectId}/invitations/{invitationId}` | Admin | `set`, `get`, `update`, `delete` (purge), **collectionGroup** | `invitations.ts` create/find; accept/revoke routes; list; purge/cron |
| `.../projects/{projectId}/schedule/{itemId}` | Client | `getDocs`+`orderBy`, `addDoc`, `updateDoc`, `writeBatch`, `deleteDoc` | `schedule.ts` (+ UI: week-timeline, manage-stages) |
| `.../schedule/{itemId}` | Admin | `delete` (purge batches) | purge, cron |
| `.../dailyPlans/{planId}` | Client | `getDocs` (full col), `setDoc` merge | `daily-plans.ts` → `listDailyPlans`, `saveDailyPlan` (doc id = `YYYY-MM-DD`) |
| `.../dailyPlans/{planId}` | Admin | `delete` (purge) | purge, cron |
| `.../updates/{updateId}` | Client | `getDocs`+`orderBy`/`where`, `addDoc` | `updates.ts` → `listUpdates`, `hasUpdateOnDate`, `publishDailyUpdate` |
| `.../updates/{updateId}` | Admin | `delete` (purge) | purge, cron |
| `.../media/{mediaId}` | Client | `addDoc`, `getDocs`+`orderBy`, `updateDoc`, `writeBatch` | `media.ts`; `updates.ts` also updates media docs by path string |
| `.../media/{mediaId}` | Admin | `set`/`update`/`get`/`where`/`collectionGroup`/`delete` | `media-store.ts` (Bunny), all bunny video routes, webhook, visibility, download, sync-processing, purge, cron |
| `.../purchases/{purchaseId}` | Client | `getDocs`+`orderBy`, `addDoc`, `updateDoc`, `deleteDoc` | `purchases.ts` |
| `.../purchases/{purchaseId}` | Admin | `delete` (purge) | purge, cron |

### Alias (same path)

| Alias | Resolves to |
|-------|-------------|
| `stagesPath` | `schedulePath` → `.../schedule` (`paths.ts` comment: product name “stages”, storage path kept for migration) |

### Bunny-related Firestore records

All Bunny Stream video rows live in:

`companies/{workspaceId}/projects/{projectId}/media/{mediaId}`

Key fields written by Admin (`media-store.ts` / bunny routes / webhook):

`provider: "BUNNY_STREAM"`, `bunnyVideoId`, `bunnyLibraryId`, `status` (INITIALIZING / PROCESSING / READY / …), `encodeProgress`, `clientUploadId`, `storagePath` (empty for Bunny; photos use Storage path), `thumbnailUrl`, `durationSeconds`, `availableResolutions`, `clientVisible` / `visibility`, `workspaceId` + `companyId` (both = workspace), `uploadedBy`, `capturedAt`, `date`, soft-delete fields.

Lookup patterns:

| Function | Query |
|----------|-------|
| `findMediaByClientUploadId` | Collection `.../media` where `clientUploadId ==` limit 1 |
| `findMediaByBunnyVideoId` | **collectionGroup `media`** where `bunnyVideoId ==` limit 1 |
| sync-processing | Collection where `provider == "BUNNY_STREAM"` limit 80 |
| webhook | Uses `findMediaByBunnyVideoId` then `updateMediaAdmin` |

---

## 2. Every Firebase Storage path currently used

| Path template | SDK | Operations | Files / functions |
|---------------|-----|------------|-------------------|
| `workspaces/{workspaceId}/projects/{projectId}/cover/{fileName}` | Client | `uploadBytesResumable`, `getDownloadURL` | `projects.ts` → `uploadCoverPhoto` via `storageCoverPath` |
| `companies/{companyId}/projects/{projectId}/3d/{fileName}` | Client | `uploadBytesResumable`, `getDownloadURL` | `projects.ts` → `uploadProject3dImages` via `storage3dPath` |
| `companies/{companyId}/projects/{projectId}/updates/{date}/{kind}/{fileName}` | Client | `uploadBytesResumable`, `getDownloadURL` | `media.ts` → `uploadMediaFile` via `storageMediaPath`; `kind` ∈ `photos\|videos\|internal\|handover\|documents` |
| `companies/{companyId}/projects/{projectId}/purchases/{purchaseId}/photos/{fileName}` | Client | `uploadBytesResumable`, `getDownloadURL`, `deleteObject` | `purchases.ts` → upload / remove / delete purchase |
| `{media.storagePath}` (dynamic field) | Admin | `bucket().file(...).delete`, signed URL | purge, cron, `media/.../download` |
| `{photo.storagePath}` (dynamic field) | Client | `deleteObject` | `purchases.ts` (skips demo paths) |
| `demo/...` | — | Not real Storage (AUTH_BYPASS only) | `demo.ts`, demo branches in services |

---

## 3. Files and functions using each path

See tables in §1–§2. Quick index by module:

| Module | Paths touched |
|--------|----------------|
| `paths.ts` | All templates |
| `users.ts` | `users/{uid}`, `companies/{ws}/users`, `meta/setup` |
| `workspaces.ts` | `workspaces/{id}`, `.../members/{uid}` |
| `projects.ts` | `companies/{ws}/projects`, Storage cover + 3d |
| `categories.ts` | `workCategories` |
| `reminders.ts` | `reminders` |
| `schedule.ts` | `schedule` |
| `daily-plans.ts` | `dailyPlans` |
| `updates.ts` | `updates`, media doc updates |
| `media.ts` | `media` + Storage updates path |
| `purchases.ts` | `purchases` + Storage purchase photos |
| `media-store.ts` | `media` (Admin Bunny) |
| `idempotency.ts` | `createRequests` |
| `audit.ts` | `auditEvents` |
| `invitations.ts` + invitation APIs | `invitations`, `members`, `projects`, company users, `users` |
| access APIs | company users, project members, projects, workspace members |
| trash/restore/purge/cron | projects + subcollections + Storage + Bunny delete |
| bunny APIs + webhook | media docs (+ users/company users for auth on upload create) |
| onboarding | users, workspaces, members, company users, meta/setup, legacy projects stamp |
| `organization/migrate` | **none** (returns 501) |
| `middleware.ts` | **none** |

---

## 4. Client SDK vs Admin SDK

| Layer | Typical use |
|-------|-------------|
| **Client SDK** | Interactive CRUD for projects, schedule, dailyPlans, updates, photo media, purchases, categories, reminders; reads for workspace/membership/account; Storage uploads for photos/cover/3d/purchase receipts |
| **Admin SDK** | Onboarding, project create (idempotent), soft-delete lifecycle, invites, access provisioning, Bunny media lifecycle, media visibility/download signing, audit, createRequests, cron purge, permission resolution |

**Rules intentionally deny Client** on: `createRequests`, `auditEvents`, project hard delete, invitation writes, project member writes, Bunny media create (`provider == BUNNY_STREAM` / `bunnyVideoId`).

---

## 5. Singular / plural conflicts

| Observation | Detail |
|-------------|--------|
| `users` vs `users` | Top-level SaaS account collection **and** tenant subcollection share the same plural name at different depths — easy to confuse in reviews |
| `schedule` (singular) vs product “stages” | Collection id is singular `schedule`; helper alias `stagesPath` does not change the storage id |
| `media` (uncountable / singular form) | One collection for photos + Bunny videos |
| `meta/setup` | Singular document id under plural-ish `meta` |
| CamelCase plurals | `workCategories`, `dailyPlans`, `createRequests`, `auditEvents` — inconsistent with snake_case / kebab elsewhere in product copy |
| `members` collision | Same collection id under `workspaces/{id}/members` **and** `projects/{id}/members` — critical for collectionGroup queries (§12) |
| Storage folder `photos` vs `3d` | Mixed plural / opaque short name |

No Firestore collection named `stage` / `stages` / `organization` / `organizations` exists in code.

---

## 6. Top-level versus subcollection conflicts

| Conflict | Detail |
|----------|--------|
| Dual identity store | Account at `users/{uid}` **and** mirror at `companies/{ws}/users/{uid}` — different rules, roles (`admin`/`staff`/`client` vs workspace `OWNER`/`ADMIN`) |
| Workspace metadata vs tenant data | `workspaces/{id}` holds SaaS workspace fields; **all project/media data** lives under `companies/{id}/...`, not under `workspaces/{id}/projects/...` |
| Storage split | Cover photos → `workspaces/{ws}/projects/.../cover/`; journal/media/3d/purchases → mostly `companies/{ws}/projects/...` |
| Rules Storage “future” paths | `workspaces/.../journal/` and `workspaces/.../purchases/` exist in `storage.rules` but Client writers use `companies/...` layouts |
| Parent company doc | Rules match `companies/{companyId}` but app never materializes that document — only children |

---

## 7. `organizationId`, `workspaceId`, and `companyId` conflicts

| Identifier | Used in paths? | Used in document fields? | Notes |
|------------|----------------|--------------------------|-------|
| **workspaceId** | Yes: `workspaces/{workspaceId}/...`; Storage cover; **also** as `companies/{workspaceId}/...` | Yes on projects, media, members, invitations, account `defaultWorkspaceId` | Authoritative tenant key in current product |
| **companyId** | Yes: helper parameter name / `companies/{companyId}/...` | Yes, usually mirrored equal to workspaceId | Path segment name is legacy; value == workspaceId |
| **organizationId** | **No** | Only mentioned in `organization/migrate` stub comments/body | Product word “Organization” maps to workspace+company pair (`organization.ts`) — rename to `organizations/` deferred |
| **COMPANY_ID (`siteledger`)** | Default when workspace omitted (`tenantId()`, helper defaults) | Fallback in mappers | Hardcoded legacy tenant |

**Risk:** Client helpers that omit `workspaceId` silently write/read `companies/siteledger/...`, which is a different tenant than a user’s real `defaultWorkspaceId`. This class of bug has already affected schedule/color/daily-plan writes when callers forgot to pass workspace.

---

## 8. Paths referenced by Rules but never created by code

### Firestore

| Path | Rules | Code |
|------|-------|------|
| `companies/{companyId}` parent document | `allow read/write` for tenant admin / members | **No create/set of parent company document found** |
| (All other matched collections) | Have at least one Client or Admin writer | — |

### Storage

| Path | Rules | Code |
|------|-------|------|
| `workspaces/{workspaceId}/projects/{projectId}/journal/{fileName}` | read/write for member/staff | **No writer** |
| `workspaces/{workspaceId}/projects/{projectId}/purchases/{purchaseId}/{fileName}` | read/write | **No writer** — code uses `companies/.../purchases/.../photos/...` |

---

## 9. Paths created by code but missing from Rules

| Path / usage | Assessment |
|--------------|------------|
| Admin-only writes (`createRequests`, `auditEvents`, invitations, project members, Bunny media create, trash/purge deletes) | Covered by Rules with `allow write: if false` / restricted create — **Admin bypasses Rules** (expected) |
| Client `storageMediaPath` kinds `videos` / `documents` | Rules match `{folder}` under updates; staff write allowed for images/PDF via `canWritePhoto()` — **video MIME uploads would fail Storage rules** (intentional; videos go to Bunny) |
| Dynamic Admin Storage delete by `storagePath` field | Not a Rules path match issue (Admin) |
| Demo paths `demo/...` | Never hit production Storage |

**No Firestore collection used in application code lacks a `match` block** under `companies/{companyId}` or top-level `users` / `workspaces`.

---

## 10. Queries that cannot satisfy the current Rules

Firestore evaluates security rules against **every document a query could return**. Client-side filtering after `getDocs` does not help.

| Query | Location | Problem |
|-------|----------|---------|
| `listProjects` primary: `where(workspaceId==) + orderBy(updatedAt desc)` | `projects.ts` | Result set can include `status in ['trashed','purging']`. Rules allow trashed reads **only for creator**. Any other user’s trashed project in the same workspace → **entire query fails** with permission-denied. Code filters trashed **after** fetch. |
| `listProjects` fallback: `orderBy(updatedAt desc)` only | `projects.ts` | Same issue, broader. Also may include docs the caller cannot read (staff assignment rules). |
| `listProjects` staff: `where(staffIds array-contains)` | `projects.ts` | Does not exclude trashed; staff assigned to a project later trashed by creator → query can fail. Also does not constrain `managerId`-only assignments (rules allow managerId OR staffIds). |
| `listClientProjects`: `where(clientUserIds array-contains)` | `projects.ts` | Same trashed mismatch: clients cannot read trashed projects. |
| `listMedia`: `orderBy(createdAt desc)` | `media.ts` | Rules deny read when `status in ['DELETED','CANCELLED']`. Soft-deleted Bunny rows in the collection → **query fails**; code filters with `isActiveMedia` only after fetch. |
| Historical trash list: `where(status==trashed)` without `createdBy` | Was failing; **current code** adds `createdBy==uid` (aligned with rules) | Requires composite index `status + createdBy` (§11) |
| Client writes to schedule/dailyPlans/media with default `tenantId()` | Multiple services | Not a query rule failure, but writes land under `companies/siteledger` when workspace omitted → permission-denied or wrong tenant |

Admin SDK queries are **not** subject to these Rules constraints.

---

## 11. Missing / unused Firestore indexes

### Declared in `firestore.indexes.json`

| Scope | Fields | Used by |
|-------|--------|---------|
| COLLECTION `projects` | `workspaceId` ASC, `updatedAt` DESC | Client `listProjects` |
| COLLECTION `projects` | `status` ASC, `createdBy` ASC | Client `listTrashedProjects` |
| COLLECTION `projects` | `status` ASC, `purgeAt` ASC | **Likely unused** — cron uses collectionGroup |
| COLLECTION_GROUP `projects` | `status` ASC, `purgeAt` ASC | Admin cron `purge-trashed` |
| COLLECTION `media` | `clientUploadId` ASC, `createdAt` DESC | **Likely unused** — Admin query is `where(clientUploadId)` only (no `orderBy`) |
| fieldOverride CG `media.bunnyVideoId` | ASC | `findMediaByBunnyVideoId` |
| fieldOverride CG `invitations.tokenHash` | ASC | `findInvitationByRawToken` |
| fieldOverride CG `invitations.workspaceId` | ASC | invitations/list |
| fieldOverride CG `members.workspaceId` | ASC | invitations/list |

### Likely missing or fragile (for Client queries that should be Rules-safe)

| Needed query shape | Why |
|--------------------|-----|
| `projects`: `workspaceId` + `status` (+ `updatedAt`) or inequality excluding trashed | To list active projects without returning unreadable trashed docs |
| `media`: `status` not-in / or positive status filter + `createdAt` | To list media without returning DELETED/CANCELLED |
| `projects`: `staffIds` array-contains + `status` | Staff list safety with trash |
| `projects`: `clientUserIds` array-contains + `status` | Client list safety with trash |

Single-field indexes (auto) cover many simple `where` / `orderBy` cases (`sortOrder`, `resolved`, `date`, `provider`, etc.).

---

## 12. Collection-group queries

| Collection group | Constraints | SDK | File / function |
|------------------|-------------|-----|-----------------|
| `projects` | `status == "trashed"`, `purgeAt <= nowIso`, `limit(10)` | Admin | `api/cron/purge-trashed` |
| `media` | `bunnyVideoId ==`, `limit(1)` | Admin | `bunny/media-store.ts` → `findMediaByBunnyVideoId` (webhook + sync) |
| `invitations` | `tokenHash ==` | Admin | `server/invitations.ts` → `findInvitationByRawToken` |
| `invitations` | `workspaceId ==` | Admin | `api/invitations/list` |
| `members` | `workspaceId ==` | Admin | `api/invitations/list` |

### Collection-group collision: `members`

`collectionGroup("members")` matches **both**:

1. `workspaces/{workspaceId}/members/{uid}`
2. `companies/{workspaceId}/projects/{projectId}/members/{uid}`

`invitations/list` filters in memory by `projectId` / status, but workspace membership docs that also carry `workspaceId` can appear in the snap. Workspace member docs typically lack `projectId` — currently filtered into odd rows or empty project titles. This is a structural footgun if field shapes converge.

---

## 13. Legacy compatibility paths

| Mechanism | Location | Behavior |
|-----------|----------|----------|
| `COMPANY_ID = "siteledger"` | `constants.ts`, `paths.tenantId()` | Default tenant when workspace omitted |
| `getProject` fallback | `projects.ts` | If miss under current ws, retry `companies/siteledger/projects/{id}` |
| `project-permissions` resolve loop | `project-permissions.ts` | Tries hint ws, account default, then `"siteledger"` |
| Onboarding legacy attach | `onboarding/route.ts` | If user is bootstrap admin on `companies/siteledger/meta/setup`, reuses workspace id `siteledger` and stamps projects with `workspaceId`/`companyId` |
| Client create still exists | `projects.ts` → `createProject` | Alongside preferred Admin `POST /api/projects/create` |
| `stagesPath` alias | `paths.ts` | Same as `schedule` |
| Storage cover under `workspaces/...` | New; 3d/media still under `companies/...` | Dual Storage roots |
| Dual user profiles | `users/{uid}` preferred; company users for staff/client ops | `users.ts` documents this |
| `docs/WORKSPACE_MIGRATION.md` | Documents assumptions for single-tenant → multi-workspace | Not a script |
| `organization/migrate` API | Stub 501 | No path rewrite yet |

---

## 14. Production migration risks

| Risk | Severity | Notes |
|------|----------|-------|
| Silent fallback to `companies/siteledger` | **High** | Any Client call missing `workspaceId` reads/writes wrong tenant |
| Dual path roots (`companies` + `workspaces`) for Storage | **Medium** | Cover vs media layout divergence; rules allow unused workspace purchase/journal paths |
| Renaming path segment to `organizations/` | **High if done naively** | Would break all live `companies/{id}/projects/...` data; explicitly deferred in `organization.ts` |
| Trashed projects + list queries | **High (runtime)** | Permission-denied on project lists once trash is used in a shared workspace (§10) |
| Soft-deleted media + listMedia | **High (runtime)** | Same Rules/query mismatch for DELETED/CANCELLED |
| Collection group `members` ambiguity | **Medium** | invitations/list may mix workspace + project members |
| Incomplete purge batches | **Medium** | purge/cron delete subcollections with `limit(400)` once — large projects may leave orphans |
| Bunny media only under `companies/.../media` | **Low** | Webhook depends on CG `bunnyVideoId` index; wrong path parsing if media ever stored outside `companies/{ws}/projects/{pid}/media/{id}` |
| Parent `companies/{id}` doc missing | **Low** | Rules allow parent write; nothing creates it — future features assuming parent fields will fail |
| Legacy projects without `workspaceId` / `createdBy` | **Medium** | listProjects fallback + delete/trash creator checks behave inconsistently |
| `organizationId` introduction without dual-write | **High** | Would orphan all current path keys; migrate stub correctly refuses |

---

## Proposed canonical path table (not implemented)

> Proposal only — do **not** implement in this audit step.

| Domain | Canonical path | Notes |
|--------|----------------|-------|
| SaaS account | `users/{uid}` | Keep top-level; stop dual-writing sensitive role fields to company users except invite mirrors |
| Workspace (Organization) | `workspaces/{workspaceId}` | Product name Organization; **keep** physical id `workspaces` until a planned migrate |
| Workspace membership | `workspaces/{workspaceId}/members/{uid}` | Roles `OWNER`/`ADMIN`/… |
| Tenant data root | `companies/{workspaceId}/…` **or** future `organizations/{workspaceId}/…` | Prefer **one** root; today `companies` is production truth |
| Projects | `{tenant}/{workspaceId}/projects/{projectId}` | Always require workspaceId in API; ban Client default to `siteledger` |
| Project members | `.../projects/{projectId}/members/{uid}` | Rename CG-safe collection id long-term (e.g. `projectMembers`) to avoid clash with workspace `members` |
| Invitations | `.../projects/{projectId}/invitations/{invitationId}` | Admin-only writes |
| Stages | `.../projects/{projectId}/schedule/{itemId}` | Keep id `schedule` or migrate to `stages` with dual-read |
| Daily plans | `.../projects/{projectId}/dailyPlans/{date}` | Doc id = date |
| Journal updates | `.../projects/{projectId}/updates/{updateId}` | |
| Media (photo + Bunny) | `.../projects/{projectId}/media/{mediaId}` | Bunny fields on same docs |
| Purchases | `.../projects/{projectId}/purchases/{purchaseId}` | |
| Categories | `{tenant}/{workspaceId}/workCategories/{id}` | |
| Reminders | `{tenant}/{workspaceId}/reminders/{id}` | |
| Idempotency | `{tenant}/{workspaceId}/createRequests/{id}` | Admin-only |
| Audit | `{tenant}/{workspaceId}/auditEvents/{id}` | Admin-only |
| Storage media | `{tenant}/{workspaceId}/projects/{projectId}/updates/{date}/{folder}/{file}` | Single root (`companies` today) |
| Storage cover | Same tenant root: `.../projects/{projectId}/cover/{file}` | Align with media root (drop dual `workspaces/` Storage root long-term) |
| Storage purchases | `.../projects/{projectId}/purchases/{purchaseId}/photos/{file}` | Drop unused `workspaces/.../purchases` rule or implement it |
| Fields | `workspaceId` authoritative; `companyId` mirror deprecated | Do **not** introduce `organizationId` as path key until migrate dual-writes |

### Recommended query conventions (canonical)

| List | Required constraints |
|------|----------------------|
| Active projects | `workspaceId ==` AND `status in ['upcoming','active','completed',…]` (explicitly exclude trashed/purging) |
| Trashed projects | `status == trashed` AND `createdBy == uid` |
| Active media | exclude `DELETED`/`CANCELLED` in query, not only client-side |
| Bunny webhook lookup | keep CG `media.bunnyVideoId` |

---

## Appendix A — SDK API surface observed

| API | Present? |
|-----|----------|
| `collection` / `doc` / `getDoc` / `getDocs` / `setDoc` / `addDoc` / `updateDoc` / `deleteDoc` | Yes (Client) |
| `query` / `where` / `orderBy` | Yes (Client + Admin) |
| `writeBatch` | Yes (Client: categories, schedule, media; Admin: purge batches) |
| `collectionGroup` | Yes (Admin only) |
| `onSnapshot` | No |
| `runTransaction` | No |
| `uploadBytesResumable` / `getDownloadURL` / `deleteObject` / `ref` | Yes (Client Storage) |
| Admin `getStorage().bucket().file` | Yes (purge/download) |
| `firebase-admin` Auth `verifyIdToken` | Yes (`server/auth.ts`, trash reauth) |

---

## Appendix B — Original audit constraints

The initial audit step was read-only. A follow-up remediation pass (2026-08-04) implemented the high-priority fixes below without renaming `companies/` → `organizations/`.

---

## Appendix C — Remediation implemented (2026-08-04)

### Path helpers (`src/lib/paths.ts`)

- Added `requireTenantId()` — throws if workspace missing (used on Client writes / scoped lists).
- Kept `tenantId()` / `LEGACY_TENANT_ID` only for explicit legacy reads.
- Removed silent default `COMPANY_ID` args from path builders (callers must pass tenant).
- Cover Storage path aligned to `companies/{ws}/projects/{pid}/cover/...`.
- Added `createRequestsPath`, `auditEventsPath`, `LISTABLE_PROJECT_STATUSES`.

### Rules

- **Firestore media:** staff/tenant may read tombstones so `orderBy` lists succeed; clients still require live + client-visible.
- **Storage:** added `companies/.../cover/` match; legacy `workspaces/.../cover/` retained.

### Queries (Rules-safe)

- `listProjects` / staff / client lists use `status in LISTABLE_PROJECT_STATUSES` (excludes trashed/purging in the query).
- Client `listMedia` uses `clientVisible == true` + `orderBy(createdAt)`.
- Soft-delete / cancel clear `clientVisible` and set `visibility: internal`.

### Other

- Invitations list filters `collectionGroup("members")` to `/projects/` paths only.
- Purge/cron delete subcollections in full batches (`deleteCollectionInBatches`).
- Onboarding stamps missing `status` as well as `workspaceId`.
- Indexes added: `workspaceId+status`, `staffIds+status`, `clientUserIds+status`, `clientVisible+createdAt`.

### Still deferred

- Physical rename to `organizations/{id}`.
- Dual-write / backfill script for legacy docs missing `status` outside onboarding.
- Removing unused Storage rules for `workspaces/.../journal` and `workspaces/.../purchases`.

---

*End of audit.*
