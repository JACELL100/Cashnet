# Google Sign-In Setup Guide for CashNet Flutter App

This guide will help you configure Google Sign-In for the Admin and Auditor roles.

## Why This Error Occurs

The error `PHASE_CLIENT_ALREADY_HIDDEN` happens when Google Sign-In fails to initialize because:
- No OAuth client ID is configured
- SHA-1 fingerprint is not registered
- Missing google-services.json file

## Development Mode (Quick Fix)

The app is currently in **Development Mode** which bypasses Google Sign-In with mock authentication.

To use it:
1. Select ADMIN or AUDITOR role
2. Click "Continue with Google"
3. A dialog will appear explaining the setup
4. Click "Continue" to use mock authentication

This allows you to test the app immediately without OAuth setup.

## Production Setup (Full Google Sign-In)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable **Google Sign-In API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Sign-In API"
   - Click "Enable"

### Step 2: Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"

**Create Web Client ID** (for backend verification):
- Application type: Web application
- Name: CashNet Backend
- Authorized JavaScript origins: `http://localhost:8000`
- Authorized redirect URIs: `http://localhost:8000/auth/google/callback`
- Save the **Client ID** - you'll need this

**Create Android Client ID**:
- Application type: Android
- Name: CashNet Mobile Android
- Package name: `com.example.cash_net`
- SHA-1 fingerprint: (get from Step 3)

### Step 3: Get SHA-1 Fingerprint

**For Debug Build:**
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

On Windows:
```powershell
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**For Release Build:**
```bash
keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
```

Copy the SHA-1 certificate fingerprint (looks like: `A1:B2:C3:...`)

### Step 4: Register SHA-1 in Google Cloud Console

1. Go back to "APIs & Services" → "Credentials"
2. Find your Android OAuth client
3. Add the SHA-1 fingerprint
4. Save changes

### Step 5: Download google-services.json (Optional)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Add your app or select existing project
3. Register Android app with package name: `com.example.cash_net`
4. Download `google-services.json`
5. Place it in: `flutter/cash_net/android/app/google-services.json`

### Step 6: Configure Flutter App

1. Open `lib/config/google_signin_config.dart`

2. Update the configuration:
```dart
class GoogleSignInConfig {
  static const bool isEnabled = true;  // Enable Google Sign-In
  
  // Paste your Web Client ID here
  static const String? webClientId = 'YOUR-CLIENT-ID.apps.googleusercontent.com';
  
  static const bool isDevelopment = false;  // Use production mode
}
```

3. Add your Web Client ID from Step 2

### Step 7: Update Android build.gradle (if using google-services.json)

1. Open `android/build.gradle`

2. Add Google services plugin:
```gradle
buildscript {
    dependencies {
        // ... existing dependencies
        classpath 'com.google.gms:google-services:4.3.15'
    }
}
```

3. Open `android/app/build.gradle`

4. Apply the plugin at the bottom:
```gradle
apply plugin: 'com.google.gms.google-services'
```

### Step 8: Test Google Sign-In

1. Run `flutter clean`
2. Run `flutter pub get`
3. Run the app: `flutter run`
4. Select ADMIN or AUDITOR role
5. Click "Continue with Google"
6. Google Sign-In dialog should appear
7. Sign in with your Google account

## Troubleshooting

### Error: "Sign in failed"
- Check that SHA-1 fingerprint matches exactly
- Verify package name is `com.example.cash_net`
- Wait 5-10 minutes for Google Cloud changes to propagate

### Error: "Invalid client ID"
- Web Client ID must be for OAuth 2.0
- Format: `xxxxx.apps.googleusercontent.com`
- Paste exactly as shown in Google Cloud Console

### Error: "PHASE_CLIENT_ALREADY_HIDDEN"
- Still happening? SHA-1 fingerprint might not match
- Regenerate SHA-1 for your current keystore
- Make sure you're using the debug keystore for development

### Error: "Account not found"
- Admin/Auditor accounts must be registered in backend
- Use backend endpoint: `POST /admin/register`
- Or add email to `adminandauditor` table manually

## Backend Configuration

Update your backend to verify Google ID tokens:

1. Install Google auth library:
```bash
pip install google-auth
```

2. Update `backend/routers/auth.py` to verify ID tokens
3. Check user email against `adminandauditor` table

## Alternative: Skip Google Sign-In

If you don't need Google Sign-In for development:

1. Keep `isDevelopment = true` in `google_signin_config.dart`
2. Use mock authentication dialog
3. Or use email/password login for all roles

## Security Notes

- Never commit OAuth client secrets to Git
- Use environment variables for production secrets
- Restrict OAuth client to your domain in production
- Enable only necessary scopes ('email', 'profile')

## Getting Your Debug SHA-1 Quick Command

**Windows:**
```powershell
cd $env:USERPROFILE\.android
keytool -list -v -keystore debug.keystore -alias androiddebugkey -storepass android -keypass android | Select-String "SHA1"
```

**macOS/Linux:**
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
```

Copy the output and paste into Google Cloud Console.

## Need Help?

- [Google Sign-In Flutter Plugin Docs](https://pub.dev/packages/google_sign_in)
- [OAuth 2.0 Setup Guide](https://developers.google.com/identity/protocols/oauth2)
- [Firebase Android Setup](https://firebase.google.com/docs/android/setup)
