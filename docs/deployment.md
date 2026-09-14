# Wibby Production Deployment Master Guide (₹0 Zero-Cost Architecture)

This guide documents the complete **100% Free / ₹0** production architecture for Wibby.

---

## 1. Zero-Cost (₹0) Architecture Summary

```
               https://wibby024.web.app (or wibby.web.app)
                               │
                               ▼
                        Firebase Hosting
                        (React/Vite SPA)
                               │
                          HTTPS / WSS
                               ▼
               https://YOUR_FREE_HOSTNAME (DuckDNS / sslip.io)
                               │
                               ▼
               Oracle Always Free ARM VM (Ubuntu)
               ├── Nginx (Reverse Proxy & TLS 1.3 Termination)
               ├── Node.js / Express (Port 3000, 127.0.0.1)
               ├── Socket.IO (Signaling & Presence)
               ├── MongoDB Community (Port 27017, 127.0.0.1 Private)
               ├── coturn (STUN/TURN on 3478 & 5349)
               └── PM2 Process Manager
                               │
                               ▼
                 Private Local Server Disk (₹0)
```

---

## 2. Cost Verification Matrix

| Component | Platform / Tech | Cost |
| :--- | :--- | :--- |
| **Frontend Hosting** | Firebase Hosting (Spark Plan) | **₹0** |
| **Frontend Domain** | `wibby024.web.app` / `wibby024.firebaseapp.com` | **₹0** |
| **Authentication** | Firebase Authentication (Spark Plan) | **₹0** |
| **Backend Compute** | Oracle Cloud Always Free VM (Ampere A1) | **₹0** |
| **Backend Free Hostname** | DuckDNS (`*.duckdns.org`) or `sslip.io` | **₹0** |
| **Database** | MongoDB Community (Self-Hosted on VM) | **₹0** |
| **TURN/STUN Server** | coturn (Self-Hosted on VM) | **₹0** |
| **SSL / HTTPS Certificates** | Let's Encrypt / Certbot | **₹0** |
| **Media Storage** | Local Persistent Storage on VM (200GB free tier) | **₹0** |
| **Total Monthly Cost** | — | **₹0.00** |

---

## 3. Step-by-Step Deployment Instructions

### A. Backend Setup (Oracle Always Free VM)
1. SSH into the Oracle VM:
   ```bash
   ssh -i /path/to/key.pem ubuntu@YOUR_ORACLE_VM_PUBLIC_IP
   ```
2. Clone repository into `/var/www/wibby`:
   ```bash
   sudo mkdir -p /var/www/wibby
   sudo chown -R ubuntu:ubuntu /var/www/wibby
   git clone https://github.com/your-org/wibby.git /var/www/wibby
   ```
3. Run the automated provisioning script:
   ```bash
   cd /var/www/wibby
   sudo ./deploy/oracle-vm-setup.sh
   ```
4. Set up Free Dynamic DNS (e.g. DuckDNS or sslip.io):
   - **DuckDNS Option**: Register a free subdomain at `duckdns.org` (e.g. `wibby024.duckdns.org`) pointing to your Oracle VM public IP.
   - **sslip.io Option**: Use your public IP directly as `<IP>.sslip.io` (e.g. `129.159.x.x.sslip.io`).
5. Configure `.env`:
   ```bash
   cp server/.env.production.example server/.env
   nano server/.env
   ```
   Set `CLIENT_URL=https://wibby024.web.app,https://wibby024.firebaseapp.com,https://wibby.web.app`.
6. Configure Nginx and SSL:
   ```bash
   sudo cp deploy/nginx/wibby.conf /etc/nginx/sites-available/wibby
   sudo ln -sf /etc/nginx/sites-available/wibby /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo certbot --nginx -d YOUR_FREE_BACKEND_HOSTNAME
   sudo systemctl reload nginx
   ```
7. Start the backend:
   ```bash
   ./deploy/deploy-backend.sh
   ```

### B. Frontend Setup (Firebase Hosting)
1. Build client with backend API URL:
   ```bash
   VITE_API_URL=https://YOUR_FREE_BACKEND_HOSTNAME npm --prefix client run build
   ```
2. Deploy to Firebase:
   ```bash
   npx firebase-tools deploy --only hosting --project wibby024
   ```
