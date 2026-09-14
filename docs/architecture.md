# Wibby ₹0 Production Architecture

This document describes the ₹0 infrastructure architecture for Wibby.

## Stack Overview

- **Frontend:** React, Vite, TypeScript, Vanilla CSS
- **Backend:** Node.js, Express, Socket.IO
- **Database:** MongoDB (Self-hosted on Oracle Cloud VM)
- **Authentication:** Firebase Authentication
- **File Storage:** Oracle Cloud Object Storage
- **Media/WebRTC:** Socket.IO signaling, Free TURN servers

## Architecture Components

### 1. Identity Authority (Firebase Auth)
Firebase Authentication serves as the single source of truth for identity. 
When a user registers, they are first created in Firebase Auth.
The `firebaseUid` is used as the primary identifier across the system.

### 2. Application Database (MongoDB)
MongoDB stores all application state:
- User profiles (linked to `firebaseUid`)
- Conversation metadata and memberships
- Pairing codes

We use MongoDB's ACID transactions to ensure secure, atomic pairing between exactly two users.

### 3. Realtime Communication (Socket.IO + WebRTC)
- **Signaling:** Socket.IO handles the exchange of WebRTC offers, answers, and ICE candidates.
- **Media:** WebRTC handles peer-to-peer audio and video transmission.
