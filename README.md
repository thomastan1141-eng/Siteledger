# SiteLedger

Renovation project operations portal for studios. Staff post daily site updates with photos and video; clients sign in to follow progress, galleries, and timeline.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Firebase Authentication (Email/Password)
- Cloud Firestore
- Firebase Storage
- Deploy: Firebase App Hosting + Firebase (Auth / Firestore / Storage)

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure Firebase

1. Create a project in [Firebase Console](https://console.firebase.google.com/)
2. Enable **Authentication → Email/Password**
3. Create **Firestore** and **Storage**
4. Copy the Web App config into `.env.local`

### 3. Deploy security rules

```bash
npx firebase login
npx firebase use siteledger-52e17
npx firebase deploy --only firestore:rules,storage
```

### 4. First admin

1. Create a user in Firebase Authentication (Email/Password)
2. Sign in on the login page — the first login creates the admin profile automatically

Firestore path:

`companies/siteledger/users/{uid}`

```json
{
  "email": "admin@example.com",
  "displayName": "Admin",
  "role": "admin",
  "companyId": "siteledger",
  "projectIds": [],
  "active": true,
  "createdAt": "2026-08-04T00:00:00.000Z"
}
```

`{uid}` must match the Authentication user UID.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Notes

- Tenant id: `siteledger` (`COMPANY_ID`)
- Platform name: SiteLedger
- Demo mode: `AUTH_BYPASS` in `src/lib/demo.ts` must stay `false` for production
