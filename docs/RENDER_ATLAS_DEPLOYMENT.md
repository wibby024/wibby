# WIBBY — RENDER + MONGODB ATLAS + FIREBASE HOSTING (₹0 DEPLOYMENT)

This document provides the complete, production-verified guide to running Wibby at **strictly ₹0 cost**.

---

## 1. Zero-Cost Topology Overview

| Layer | Service | Plan / Limits | Monthly Cost |
|---|---|---|---|
| **Frontend** | Firebase Hosting (`https://wibby024.web.app`) | Spark Plan (10GB storage, 360MB/day transfer) | **₹0.00** |
| **Backend** | Render Free Web Service (Node.js/Socket.IO) | 512 MB RAM, 0.1 CPU, spun down after 15m idle | **₹0.00** |
| **Database** | MongoDB Atlas M0 Cluster | 512 MB Storage, Shared RAM, 500 connections | **₹0.00** |
| **Persistent Media** | MongoDB GridFS inside Atlas M0 | 512 MB binary storage (persistent across restarts) | **₹0.00** |
| **Auth** | Firebase Authentication | 50,000 MAU | **₹0.00** |
| **WebRTC / Calls** | Google STUN (`stun.l.google.com:19302`) | Unlimited Direct Peer-to-Peer Calls | **₹0.00** |

---

## 2. One-Time Step: MongoDB Atlas Free Setup

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Create an **M0 Free Cluster** (Select AWS / Google Cloud in nearest region, e.g., Mumbai `ap-south-1` or Singapore `ap-southeast-1`).
3. Under **Security → Database Access**:
   - Create a database user (e.g. `wibby_admin`) with password.
   - Assign role `readWriteAnyDatabase@admin` or read/write on `wibby`.
4. Under **Security → Network Access**:
   - Add IP Address: `0.0.0.0/0` (Allow access from anywhere, required because Render Free outbound IPs are dynamic).
5. Click **Connect → Drivers (Node.js)** and copy the connection string:
   ```
   mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/wibby?retryWrites=true&w=majority
   ```

---

## 3. One-Time Step: Render Web Service Deployment

1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New + → Web Service**.
3. Connect your GitHub repository (`wibby`).
4. Set the following settings:
   - **Name:** `wibby-backend` (or your choice)
   - **Region:** Singapore / Frankfurt / Oregon (nearest to users)
   - **Root Directory:** `server`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Under **Advanced → Health Check Path**, set:
   ```
   /health
   ```
6. Under **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `CLIENT_URL`: `https://wibby024.web.app,https://wibby024.firebaseapp.com,https://wibby.web.app`
   - `MONGODB_URI`: `<Your MongoDB Atlas connection string from Step 2>`
   - `MONGODB_DB_NAME`: `wibby`
   - `FIREBASE_PROJECT_ID`: `wibby024`
   - `FIREBASE_CLIENT_EMAIL`: `<Your Firebase Service Account Client Email>`
   - `FIREBASE_PRIVATE_KEY`: `"<Your Firebase Service Account Private Key>"`
   - `STORAGE_PROVIDER`: `gridfs`
7. Click **Create Web Service**.
8. Note your public backend URL (e.g. `https://wibby-backend.onrender.com`).

---

## 4. Frontend Connection & Firebase Deployment

Once you have your live Render backend URL:

1. Update `client/.env.local` or build with `VITE_API_URL`:
   ```bash
   VITE_API_URL=https://<your-render-service>.onrender.com npm --prefix client run build
   ```
2. Deploy to Firebase Hosting:
   ```bash
   firebase deploy --only hosting
   ```
3. Open `https://wibby024.web.app` in your browser.

---

## 5. Cold Start Characteristic & Limitations

- **Inactivity Sleep:** Render Free spins down after 15 minutes of zero HTTP/WebSocket traffic.
- **Waking Duration:** When accessing Wibby after spin-down, the container startup takes ~40–50 seconds.
- **Subsequent Performance:** Once awake, Socket.IO and REST API respond with sub-100ms latency.
- **Storage Limit:** Atlas M0 Free provides 512 MB total database + GridFS media storage. Ideal for two users sharing photos, voice notes, and documents.
