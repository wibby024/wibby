# Wibby Storage, Data Cleaning & Encryption Verification Guide

This document provides a comprehensive runbook and technical reference for inspecting, testing, verifying encryption, and cleaning data across the **Wibby 2-Person Private Channel** platform.

---

## 1. Storage Architecture Overview

Wibby divides data across three distinct tiers to ensure zero unauthorized leakage:

| Storage Tier | Technology | Location | Contents |
| :--- | :--- | :--- | :--- |
| **Database** | MongoDB | `mongodb://localhost:27017/wibby` | Users, conversations, message records, call session telemetry, story status, pairing invitation codes. |
| **Encrypted File Store** | Local Storage / OCI Object Storage | `server/uploads/<conversationId>/<YYYY>/<MM>/<UUID>-<file>` | Images, videos, voice recordings, documents, audio clips. |
| **Client Secrets** | WebCrypto / LocalStorage | Browser `localStorage` (`wibby_e2ee_*`, `wibby-token`) | ECDH P-256 private keys, public keys, session authentication tokens. |

---

## 2. How to Verify Encryption

### 🔒 A. Chat Messages & Text E2EE Encryption
1. **Cryptographic Algorithm**:
   - **Key Exchange**: ECDH (Elliptic Curve Diffie-Hellman) on standard curve **P-256** using the native W3C Web Cryptography API (`window.crypto.subtle`).
   - **Symmetric Encryption**: **AES-GCM-256** with an ephemeral 96-bit random IV generated for every message.
   - **Safety Number**: 60-digit SHA-256 fingerprint generated from both parties' public keys.
2. **How to Verify in Browser**:
   - Open Developer Tools (`F12` or `Cmd+Option+I`) → **Application** tab → **Local Storage** → `http://localhost:5173`.
   - Inspect `wibby_e2ee_priv_<uid>`: Contains the user's private key in JWK format. **This key never leaves the client.**
   - In the chat, tap your partner's name → **Chat info & Shared media** → **E2EE Security Card** to view and cross-verify the 60-digit safety number with your partner.
3. **How to Verify in Network / Database**:
   - In DevTools **Network** tab, inspect `POST /api/conversations/:id/messages`. Notice the server only manages message delivery and never receives the decryption key.

---

### 🛡️ B. Images, Videos, Voice Notes & File Attachments
1. **Access Control & Storage Isolation**:
   - Media files are stored inside partitioned subdirectories: `server/uploads/<conversationId>/<YYYY>/<MM>/<UUID>-<file>`.
   - Files are **never served as public static assets**.
   - Every file request is gated behind `GET /api/conversations/:conversationId/media/:key`.
   - The server enforces two middleware barriers:
     - `requireAuth`: Validates Firebase ID token signature.
     - `verifyMembership`: Confirms the requester is strictly one of the 2 authenticated members of that private channel.
2. **How to Verify Unauthorized Access Prevention**:
   - Copy any media URL (e.g., `http://localhost:3000/api/conversations/<id>/media/<key>`).
   - Open an Incognito / Private browser window without logging in and paste the URL.
   - **Expected Result**: Immediate `HTTP 401 Unauthorized` or `HTTP 403 Forbidden`. The file cannot be downloaded without cryptographic session credentials.

---

### 📹 C. Voice & Video Call Encryption
1. **Standard & Protocol**:
   - Calls use **WebRTC DTLS-SRTP** (Datagram Transport Layer Security / Secure Real-time Transport Protocol).
   - Audio and video RTP packets are encrypted end-to-end between peer browsers using **AES-128 / AES-256 GCM**.
   - The Node.js server functions purely as a signaling relay for ephemeral SDP offers/answers and ICE candidate negotiation. **No audio or video streams are ever decoded or stored on the server.**
2. **How to Verify in Google Chrome**:
   - Start an active voice or video call in Wibby.
   - In a new browser tab, navigate to `chrome://webrtc-internals`.
   - Expand the active `RTCPeerConnection` → inspect the `DtlsTransport` and `IceTransport` sections:
     - `dtlsState: connected`
     - `srtpCipher: AEAD_AES_128_GCM` (or `AES_CM_128_HMAC_SHA1_80`)
     - Confirm all audio/video packets sent and received are cryptographically secured.

---

## 3. Data Cleaning & Storage Management Commands

Wibby includes built-in auditing and storage cleaning tools in `server/package.json`:

### 1. 🔍 Inspect Storage & Database (Read-Only)
Inspects MongoDB record counts, active users, conversation partitions, and physical storage usage on disk without modifying anything:
```bash
cd server
npm run storage:inspect
```

### 2. 🛡️ Verify Security & Encryption
Runs automated audit checks on database confidentiality, media route protection, and WebRTC encryption parameters:
```bash
cd server
npm run storage:verify-encryption
```

### 3. 🧹 Clean Automated Test Fixtures Only (Safe Cleanup)
Removes automated test dummy data (e.g. test audio recordings, mock test accounts, automated call test fixtures) **while preserving real user accounts, active pair links, and real chat messages**:
```bash
cd server
npm run storage:clean-tests
```

### 4. ⚠️ Wipe All Storage & Database (Clean Slate)
Empties all database collections and wipes all uploaded files from the disk:
```bash
cd server
npm run storage:wipe-all
```

---

## 4. Folder Structure & Organization Reference

To maintain stability and prevent crashes, keep the following directory structure:

```
wibby/
├── client/                      # Frontend Application (React 19, TypeScript, Vite)
│   ├── src/
│   │   ├── components/          # Modular UI components (ChatHeader, MessageArea, etc.)
│   │   │   ├── call/            # Voice & Video call panels (ActiveCallPanel, etc.)
│   │   │   └── stories/         # 24h stories drawer & creator
│   │   ├── context/             # React Contexts (AuthContext, CallContext, SocketContext)
│   │   ├── services/            # Client services (e2eeService, locationService, etc.)
│   │   ├── config/              # Media & WebRTC configuration
│   │   ├── types/               # TypeScript interfaces & definitions
│   │   └── utils/               # Time formatting, validation helpers
│   └── package.json
│
├── server/                      # Backend Application (Express, Socket.IO, MongoDB)
│   ├── src/
│   │   ├── config/              # Firebase Admin SDK & environment config
│   │   ├── lib/                 # MongoDB database connector
│   │   ├── middleware/          # auth.ts, membership.ts security gates
│   │   ├── routes/              # Express API route handlers
│   │   ├── scripts/             # clean-storage.mjs, verify-encryption.mjs
│   │   ├── services/storage/    # Local & Oracle Cloud Object Storage providers
│   │   └── socket/              # WebRTC signaling, Live location, Together mode
│   ├── uploads/                 # Partitioned local file upload storage
│   └── package.json
│
└── docs/                        # Architecture, Deployment & Security guides
```
