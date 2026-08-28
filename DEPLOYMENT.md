# Deployment Guide for CashNet

This project is split into:

- Backend: FastAPI app running on Render (Docker)
- Frontend: Next.js app running on Vercel
- Database: Supabase/Postgres

## 1) Recommended deployment architecture

- Render hosts the backend API as a Dockerized web service.
- Vercel hosts the frontend Next.js app.
- Supabase/Postgres stores the app data.
- Optional secrets like Groq, wallet keys, SMTP, and JWT are stored in the hosting dashboards, not in the repo.

## 2) Required project files

The following deployment files are now included:

- [backend/Dockerfile](backend/Dockerfile)
- [backend/.dockerignore](backend/.dockerignore)
- [backend/.env.production.example](backend/.env.production.example)
- [frontend/.env.production.example](frontend/.env.production.example)
- [render.yaml](render.yaml)

## 3) Backend deployment to Render

1. Push this repository to GitHub.
2. Log in to Render and click New > Web Service.
3. Connect the GitHub repository.
4. Use these settings:
   - Name: cashnet-backend
   - Runtime: Docker
   - Root Directory: backend
   - Dockerfile Path: ./Dockerfile
   - Region: Oregon (or closest)
   - Plan: Free
5. In the Environment section, add the following variables:

   Required variables:
   - PORT=8000
   - DEBUG=false
   - DATABASE_URL=postgresql+psycopg://...
   - SUPABASE_URL=https://...
   - SUPABASE_ANON_KEY=...
   - SUPABASE_SERVICE_ROLE_KEY=...
   - SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
   - PRIVATE_KEY=your_private_key
   - ENABLE_BLOCKCHAIN_TXS=false
   - GROQ_API_KEY=...
   - JWT_SECRET=...
   - PROVISION_SECRET=...
   - CORS_ALLOWED_ORIGINS=https://your-vercel-app.vercel.app

   Optional variables:
   - COINDESK_API_KEY=...
   - SMTP_HOST=...
   - SMTP_PORT=587
   - SMTP_USER=...
   - SMTP_PASSWORD=...
   - SMTP_FROM_NAME=CashNet Threat Monitor
   - ALERT_EMAIL_ENABLED=true
   - ACCESS_CONTROL_ADDRESS=...
   - IDENTITY_REGISTRY_ADDRESS=...
   - CREDIT_REGISTRY_ADDRESS=...
   - COLLATERAL_VAULT_ADDRESS=...
   - LENDING_POOL_ADDRESS=...
   - LIQUIDITY_POOL_ADDRESS=...
   - PALLADIUM_ADDRESS=...
   - BADASSIUM_ADDRESS=...

6. Click Create Web Service.
7. After build finishes, open the Render URL and confirm /health returns a healthy JSON payload.

## 4) Frontend deployment to Vercel

1. Log in to Vercel.
2. Import the repository.
3. Set the project root to the frontend folder.
4. In Project Settings > Environment Variables add:
   - NEXT_PUBLIC_API_URL=https://your-render-service.onrender.com
   - NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
   - NEXT_PUBLIC_SUPABASE_URL=...
   - NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   - NEXT_PUBLIC_FIREBASE_API_KEY=...
   - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   - NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
   - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   - NEXT_PUBLIC_FIREBASE_APP_ID=...
5. Deploy the project.

## 5) Important production fixes included

- The backend now reads the Render-provided PORT variable.
- CORS is configurable through CORS_ALLOWED_ORIGINS instead of always allowing all origins.
- Docker is set up for production containerization.
- The frontend is ready to use NEXT_PUBLIC_API_URL from Vercel environment variables.

## 6) Final verification checklist

After deployment:

- Backend health URL: https://your-render-service.onrender.com/health
- Backend docs: https://your-render-service.onrender.com/docs
- Frontend home page: https://your-vercel-app.vercel.app
- API calls from frontend should succeed with NEXT_PUBLIC_API_URL
- No keys or secrets should remain in the repository

## 7) Security notes

- Never commit .env files.
- Rotate any secrets that were already checked into the repo.
- Prefer env variables in Render/Vercel dashboards over hardcoded values.
