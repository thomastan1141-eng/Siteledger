# Workspace migration assumptions

## Goal

Move SiteLedger from a single hard-coded tenant (`companies/siteledger`) to
workspace-isolated multi-tenant accounts without deleting data.

## Assumptions

1. There is currently one production company path: `companies/siteledger`.
2. The existing bootstrap admin is recorded in `companies/siteledger/meta/setup.adminUid`.
3. Existing projects live under `companies/siteledger/projects/{projectId}`.
4. Existing Storage objects remain under `companies/siteledger/projects/...`.
5. We do **not** duplicate project documents or media files.

## What onboarding does for the legacy admin

When the bootstrap admin completes `/api/onboarding`:

1. Creates `workspaces/siteledger` (id reused = legacy company id).
2. Creates `workspaces/siteledger/members/{adminUid}` with role `OWNER`.
3. Creates/merges `users/{adminUid}` with `defaultWorkspaceId: "siteledger"`.
4. Mirrors admin into `companies/siteledger/users/{adminUid}` if needed.
5. Stamps existing projects missing `workspaceId` with:
   - `workspaceId: "siteledger"`
   - `companyId: "siteledger"`

## New public signups

1. Firebase Auth account is created on `/signup`.
2. Email verification is required.
3. `/api/onboarding` creates a **new** workspace id (not `siteledger`).
4. Tenant data for that studio lives under `companies/{workspaceId}/...`.
5. New projects always include `workspaceId` and `companyId` equal to that workspace.

## Client portal users

Invited project clients remain `role: "client"` under
`companies/{workspaceId}/users/{uid}` and do **not** receive a SaaS workspace.

## Billing fields

Workspace documents include:

- `plan: "FREE"`
- `subscriptionStatus: "NONE"`
- `trialStartsAt: null`
- `trialEndsAt: null`

These are not client-writable. Stripe is not integrated yet.
