# Firebase Setup Guide

## 1. Create a Firebase Project
- Go to the [Firebase Console](https://console.firebase.google.com/).
- Create a new project.

## 2. Enable Authentication
- Navigate to Authentication > Sign-in method.
- Enable Email/Password.

## 3. Get Frontend Config
- Add a Web App to your project.
- Copy the `firebaseConfig` object and add the values to `client/.env.local`.

## 4. Get Backend Credentials
- Go to Project Settings > Service Accounts.
- Generate a new private key.
- Save the downloaded JSON file securely and extract `project_id`, `client_email`, and `private_key` into `server/.env`.
