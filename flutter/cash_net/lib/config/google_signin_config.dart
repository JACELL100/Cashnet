/// Google Sign-In Configuration
///
/// To enable Google Sign-In in production:
///
/// 1. Go to Google Cloud Console: https://console.cloud.google.com
/// 2. Create/Select a project
/// 3. Enable Google Sign-In API
/// 4. Create OAuth 2.0 credentials:
///    - Web Client ID (for backend)
///    - Android Client ID (for mobile app)
/// 5. Get your app's SHA-1 fingerprint:
///    Debug: keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
///    Release: keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
/// 6. Register SHA-1 in Google Cloud Console
/// 7. Paste your Web Client ID below

class GoogleSignInConfig {
  // Set this to true to enable Google Sign-In
  static const bool isEnabled = false;

  // Your Web Client ID from Google Cloud Console
  // Format: xxxxx.apps.googleusercontent.com
  static const String? webClientId = null;

  // Development mode - bypasses actual Google Sign-In
  static const bool isDevelopment = true;
}
