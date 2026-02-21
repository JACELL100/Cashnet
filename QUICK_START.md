# CashNet Platform - Quick Start Guide

Complete guide to run the CashNet DeFi platform (Backend + Frontend + Mobile App).

## Prerequisites

- Python 3.9+
- Node.js 16+ and pnpm
- Flutter 3.4.3+
- Running Sepolia testnet node (or Infura/Alchemy RPC)

## 1. Start Backend (FastAPI)

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend server
python main.py
```

Backend will start at `http://localhost:8000`

**API Documentation**: http://localhost:8000/docs

## 2. Start Frontend (Next.js)

Open a new terminal:

```bash
cd frontend

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Frontend will start at `http://localhost:3000`

## 3. Run Mobile App (Flutter)

Open a third terminal:

```bash
cd flutter/cash_net

# Install dependencies
flutter pub get

# List available devices
flutter devices

# Run on specific device
flutter run -d <device-id>

# Or run on Android emulator
flutter run

# Or run on Chrome (web)
flutter run -d chrome
```

## Access Points

| Component | URL | Notes |
|-----------|-----|-------|
| **Backend API** | http://localhost:8000 | FastAPI server |
| **API Docs** | http://localhost:8000/docs | Swagger UI |
| **Frontend Web** | http://localhost:3000 | Next.js app |
| **Mobile App** | Device/Emulator | Flutter app |

## Test the Platform

### 1. Test Backend Health

```bash
curl http://localhost:8000/health
```

### 2. Access Web Dashboard

Navigate to: http://localhost:3000/dashboard

### 3. Run Stress Tests

Navigate to: http://localhost:3000/dashboard/stress

### 4. Mobile App Login

1. Open Flutter app on device/emulator
2. Select role (BORROWER, LENDER, ADMIN, AUDITOR)
3. Enter test credentials
4. Login and view dashboard

## Default Test Accounts

### Web Platform

**Admin:**
- Login via Google SSO
- Must be registered in `adminandauditor` table

**Lender/Borrower:**
- Connect wallet (MetaMask)
- Sign message to authenticate

### Mobile App

**Development Mode:**
- Email: any@example.com
- Password: any password
- All roles available

## Environment Configuration

### Backend (.env)

Create `backend/.env`:

```
DATABASE_URL=sqlite:///./cashnet.db
BLOCKCHAIN_RPC=https://sepolia.infura.io/v3/YOUR_KEY
ADMIN_WALLET=0xYourAdminWallet
SECRET_KEY=your-secret-key-here
```

### Frontend (.env.local)

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_BLOCKCHAIN_NETWORK=sepolia
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your-project-id
```

### Mobile App

Update `flutter/cash_net/lib/services/auth_service.dart`:

```dart
static const String apiBaseUrl = 'http://10.0.2.2:8000'; // Android emulator
// or
static const String apiBaseUrl = 'http://YOUR-IP:8000'; // Physical device
```

## Verify Installation

### Backend Tests

```bash
cd backend
python scripts/verify_backend.py
```

### Frontend Tests

Navigate to: http://localhost:3000/dashboard/testing

### Mobile App Tests

1. Login with test credentials
2. Check role badge displays correctly
3. Verify logout functionality

## Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Update main.py to use different port
uvicorn.run(app, host="0.0.0.0", port=8001)
```

### Frontend Issues

**Port 3000 already in use:**
```bash
# Update package.json
"dev": "next dev -p 3001"
```

### Mobile Issues

**Backend connection:**
- Android emulator: Use `http://10.0.2.2:8000`
- iOS simulator: Use `http://localhost:8000`
- Physical device: Use your machine's IP (e.g., `http://192.168.1.100:8000`)

**Google Sign-In:**
- Configure OAuth in Google Cloud Console
- Add SHA-1 fingerprint for Android

## Development Workflow

### Making Changes

1. **Backend changes**: FastAPI auto-reloads
2. **Frontend changes**: Next.js hot-reloads
3. **Mobile changes**: Use hot reload (press `r` in terminal)

### Testing Flow

1. Start backend
2. Run backend tests: `python scripts/verify_backend.py`
3. Start frontend
4. Run stress tests: http://localhost:3000/dashboard/stress
5. Start mobile app
6. Test authentication flows

## Production Deployment

### Backend
- Deploy to cloud provider (AWS, GCP, Azure)
- Use production database (PostgreSQL)
- Configure CORS for frontend domain
- Set up SSL/TLS

### Frontend
- Build: `pnpm build`
- Deploy to Vercel/Netlify
- Update API URL environment variable

### Mobile
- Build APK: `flutter build apk`
- Build iOS: `flutter build ios`
- Submit to Play Store/App Store

## Additional Resources

- [Backend API Reference](backend/scripts/API_REFERENCE.md)
- [Backend Summary](backend/scripts/BACKEND_SUMMARY.md)
- [Flutter App Guide](flutter/cash_net/FLUTTER_README.md)
- [Integration Guide](backend/scripts/INTEGRATION_README.md)

## Support

For issues or questions:
1. Check error logs in terminal
2. Review API documentation at /docs
3. Use browser DevTools for frontend issues
4. Use Flutter DevTools for mobile debugging

## Next Steps

- Configure Google OAuth for production
- Set up WalletConnect for mobile
- Deploy smart contracts to testnet
- Implement additional role features
- Add comprehensive test coverage
