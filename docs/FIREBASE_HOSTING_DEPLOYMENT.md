# Wibby — Firebase Hosting Deployment Guide (100% Free / ₹0)

Deploy the Wibby React/Vite SPA to **Firebase Hosting** under the free Firebase Spark plan (₹0 cost forever, zero credit card required).

---

## 1. Hosting Architecture
- **Firebase Project ID**: `wibby024`
- **Free Frontend URL**: `https://wibby024.web.app` (and `https://wibby024.firebaseapp.com` / `https://wibby.web.app` if registered)
- **Automatic SSL**: Google-managed TLS certificate included at ₹0.

---

## 2. Deploying Frontend to Firebase Hosting

### Step 1: Set Backend API URL & Build
Create `client/.env.production` (or set environment variable):
```bash
VITE_API_URL=https://YOUR_FREE_BACKEND_HOSTNAME
# ... plus your Firebase web keys from wibby024
```

Build the optimized production client bundle:
```bash
npm --prefix client run build
```
The output directory will be `client/dist`.

### Step 2: Login to Firebase (One-time)
```bash
npx firebase-tools login
```

### Step 3: Deploy to Firebase Hosting
From the root of the project:
```bash
npx firebase-tools deploy --only hosting --project wibby024
```

---

## 3. Authorized Domains in Firebase Authentication

In the **Firebase Console** (Project: `wibby024`):
1. Navigate to **Authentication** > **Settings** > **Authorized domains**.
2. Verify that `wibby024.web.app` and `wibby024.firebaseapp.com` are listed (added automatically by Firebase).
3. If using `wibby.web.app`, click **Add domain** and enter `wibby.web.app`.

---

## 4. Zero-Cost Summary
| Item | Provider | Cost |
| :--- | :--- | :--- |
| **Static Hosting (CDN)** | Firebase Hosting (Spark) | **₹0 / Free** |
| **SSL / HTTPS Certificate** | Google Managed Certificate | **₹0 / Free** |
| **Domain / Subdomain** | `*.web.app` / `*.firebaseapp.com` | **₹0 / Free** |
