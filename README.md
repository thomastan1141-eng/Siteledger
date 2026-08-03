# Starry Homestead · Project Track

装修公司内部使用的项目进度与影像记录系统。员工每日选择正在进行的工作、上传照片/影片并发布；客户登录查看进度、相册与时间线。

## 技术栈

- Next.js (App Router) + TypeScript + Tailwind CSS
- Firebase Authentication（Email/Password）
- Cloud Firestore
- Firebase Storage
- 部署建议：Vercel（前端）+ Firebase（Auth / Firestore / Storage）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Firebase

1. 在 [Firebase Console](https://console.firebase.google.com/) 创建项目
2. 启用 **Authentication → Email/Password**
3. 创建 **Firestore** 与 **Storage**
4. 复制 Web App 配置到 `.env.local`：

```bash
cp .env.example .env.local
```

### 3. 部署安全规则

```bash
npx firebase login
npx firebase use <your-firebase-project-id>
npx firebase deploy --only firestore:rules,storage
```

### 4. 建立第一位管理员

1. 在 Firebase Authentication 手动创建用户（Email/Password）
2. 在 Firestore 创建文档：

`companies/starry-home/users/{uid}`

```json
{
  "email": "admin@example.com",
  "displayName": "Admin",
  "role": "admin",
  "companyId": "starry-home",
  "projectIds": [],
  "active": true,
  "createdAt": "2026-08-02T00:00:00.000Z"
}
```

`{uid}` 必须与 Authentication 用户 UID 一致。

### 5. 启动

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## MVP 已实现

- 管理员 / 员工 / 客户登录与角色分流
- 建立项目、合同完成日、当前预计完成日
- 施工工作类别与简易 Schedule
- 每日现场更新（多选工作、批量照片、影片、Internal / Client visible / 待审核）
- 客户 Overview、Timeline、Photo/Video Gallery、Completed Work
- Dashboard 未更新 / 延误 / 完成日前提醒（页面内检查）
- Storage Usage
- Firestore / Storage 权限规则

## 核心流程

选择项目 → 选择当天工作 → 上传照片或影片 → 发布 → 客户查看

## 第一阶段暂不做

报价、发票、付款、VO、供应商、完整 Gantt、AI 进度判断、自动影片压缩、原生 App。

邮件提醒可通过后续 Firebase Scheduled Functions 接入；目前 Dashboard 已做本地提醒检查。
