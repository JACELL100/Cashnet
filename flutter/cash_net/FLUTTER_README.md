# CashNet Flutter Mobile App

A Flutter mobile application for the CashNet DeFi platform with role-based authentication matching the web interface.

## Features

- **Role-Based Login**: Support for 4 user roles (ADMIN, AUDITOR, LENDER, BORROWER)
- **Multiple Auth Methods**:
  - Email/Password authentication
  - Google Sign-In (for Admin/Auditor)
  - Wallet Connection (for Lender/Borrower)
- **Matching UI**: Dark theme with role-specific colors matching the web app
- **State Management**: Provider pattern for authentication state
- **Persistent Sessions**: Local storage for login persistence

## Role Colors

- **ADMIN**: Red (#FF3860) - Full protocol access
- **AUDITOR**: Orange (#F0A500) - Read-only compliance access
- **LENDER**: Purple (#B367FF) - Liquidity provision
- **BORROWER**: Cyan (#00D4FF) - Credit facilities access

## Setup

### Prerequisites

- Flutter SDK 3.4.3 or higher
- Dart SDK
- Android Studio / Xcode for mobile development
- Running CashNet backend at `http://localhost:8000`

### Installation

1. Navigate to the Flutter project:
```bash
cd flutter/cash_net
```

2. Install dependencies:
```bash
flutter pub get
```

3. Run the app:
```bash
# For Android emulator/device
flutter run

# For iOS simulator/device
flutter run -d ios

# For web
flutter run -d chrome
```

## Project Structure

```
lib/
├── config/
│   └── theme.dart              # App theme and color definitions
├── models/
│   └── user.dart               # User and auth models
├── providers/
│   └── auth_provider.dart      # Authentication state management
├── screens/
│   ├── login_page.dart         # Login page with role selection
│   └── dashboard_page.dart     # Dashboard after login
├── services/
│   └── auth_service.dart       # API communication for auth
└── main.dart                   # App entry point
```

## Authentication Flow

### Email/Password Login
1. User selects role (BORROWER, LENDER, ADMIN, AUDITOR)
2. Enters email and password
3. Backend validates credentials
4. JWT token stored locally
5. User redirected to role-specific dashboard

### Google Sign-In (Admin/Auditor only)
1. User selects ADMIN or AUDITOR role
2. Clicks "Continue with Google"
3. Google OAuth popup
4. Backend verifies ID token
5. Checks `adminandauditor` table for access
6. Redirects to dashboard or shows access denied

### Wallet Connection (Lender/Borrower)
1. User selects LENDER or BORROWER role
2. Clicks "Connect Wallet"
3. Wallet extension prompts signature
4. Backend verifies signature
5. User authenticated and redirected

## Environment Configuration

Update `lib/services/auth_service.dart` to change the API base URL:

```dart
static const String apiBaseUrl = 'http://YOUR_BACKEND_URL:8000';
```

For production, use:
- `http://YOUR-IP:8000` for physical device
- `http://10.0.2.2:8000` for Android emulator
- `http://localhost:8000` for iOS simulator

## Dependencies

- `provider: ^6.1.1` - State management
- `http: ^1.2.0` - HTTP client for API calls
- `shared_preferences: ^2.2.2` - Local storage for auth tokens
- `google_sign_in: ^6.2.1` - Google OAuth authentication
- `web3dart: ^2.7.3` - Web3 wallet integration
- `url_launcher: ^6.2.4` - External link handling

## Testing

### Test Credentials (Development)

**Admin:**
- Any email/password will work in development mode
- Login triggers Google SSO for production

**Borrower/Lender/Auditor:**
- Any email/password combination
- Mock authentication for testing

## UI Components

### Login Page
- Role selector with visual feedback
- Email/password form
- Google Sign-In button (Admin/Auditor)
- Wallet Connect button (Lender/Borrower)
- Role-specific information cards
- Network indicator (Sepolia)

### Dashboard Page
- Welcome card with role badge
- Account information display
- Role-specific features list
- Logout functionality

## State Management

The app uses Provider for state management:

```dart
// Access auth state
final auth = context.watch<AuthProvider>();

// Check authentication
if (auth.isAuthenticated) {
  // User is logged in
}

// Get current user
final user = auth.user;

// Perform login
await auth.login(email: '...', password: '...', role: 'BORROWER');
```

## Troubleshooting

### Backend Connection Issues
- Ensure backend is running at `http://localhost:8000`
- For physical devices, use your machine's IP address
- Check firewall settings

### Google Sign-In Not Working
- Add `google_sign_in` platform-specific setup
- Configure OAuth client IDs in Firebase/Google Cloud Console
- Enable Google Sign-In in Firebase Authentication

### Wallet Connection Not Working
- Web3 wallet integration requires additional setup
- Install MetaMask or WalletConnect dependencies
- Configure deep linking for mobile wallets

## Next Steps

1. **Implement Wallet Connection**: Add WalletConnect or Web3Modal integration
2. **Add Dashboard Features**: Implement role-specific functionalities
3. **Offline Support**: Add local caching and sync
4. **Push Notifications**: Alert users of important events
5. **Biometric Auth**: Add fingerprint/face ID support

## License

This project is part of the CashNet DeFi platform.
