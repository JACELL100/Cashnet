# Wallet Connection Guide for Android

## ✅ FIXED: MetaMask Opens But No Popup

### What Was Wrong:
1. **Double-encoded URI** - The WalletConnect URI was being encoded twice, breaking the connection request
2. **Missing query permissions** - Android 11+ needs explicit permission to detect wallet apps
3. **Short timeout** - 15 seconds wasn't enough time to switch apps and approve

### What's Fixed:
1. ✅ **Raw URI first** - Tries the raw WalletConnect URI (most compatible)
2. ✅ **Proper query declarations** - AndroidManifest now includes wallet app queries
3. ✅ **30-second timeout** - More time to switch to MetaMask and approve
4. ✅ **Better UX** - Clear instructions to switch to MetaMask

---

## How to Test Now:

### Step 1: Rebuild the App
```bash
cd flutter/cash_net
flutter clean
flutter pub get
flutter run
```

### Step 2: Connect Wallet
1. **Click "Connect Wallet"**
2. **MetaMask will open automatically**
3. **Switch to MetaMask app** (it should show a connection request)
4. **Tap "Connect"** in MetaMask
5. **Switch back to CashNet** - You should see dashboard

### Step 3: Check Debug Output
Look for these logs:
```
WalletConnect URI: wc:abc123...
Can launch wc:abc123...: true
Successfully launched: wc:abc123...
WalletConnect: Connected
```

---

## Troubleshooting

### Issue: MetaMask Opens But No Connection Request

**Try this:**
1. Close MetaMask completely
2. Clear MetaMask cache in Android settings
3. Try connecting from CashNet again
4. Check if MetaMask shows the connection request

**Check:**
- Open MetaMask manually
- Go to Settings → Networks
- Make sure "Sepolia" is added
- Make sure WalletConnect is enabled

### Issue: "Connection timeout"

**Possible causes:**
- You didn't approve in MetaMask within 30 seconds
- MetaMask crashed or froze
- Network issue preventing WalletConnect bridge

**Solutions:**
- Try again and approve faster
- Restart MetaMask
- Check internet connection
- Use mock login for testing

### Issue: Still No Popup in MetaMask

**Advanced troubleshooting:**

1. **Check MetaMask Version:**
   - Update to latest version from Play Store
   - Requires MetaMask v7.0.0+

2. **Check WalletConnect URI Format:**
   - Look at terminal output for `WalletConnect URI: wc:...`
   - Should start with `wc:` and have `@1` or `@2`
   - Example: `wc:abc123@1?bridge=https://...`

3. **Manual Test:**
   - Copy the WalletConnect URI from terminal
   - Open a browser on your phone
   - Paste: `metamask://wc?uri=<paste_uri_here>`
   - See if MetaMask opens with connection request

4. **Check Android Version:**
   - Must be Android 11+ for proper deep linking
   - Older Android may need different approach

---

## What You Should See

### Successful Connection Flow:
```
1. CashNet: Click "Connect Wallet"
   ↓
2. Dialog: "Opening Wallet App..."
   ↓
3. MetaMask: Opens automatically
   ↓
4. MetaMask: Shows "CashNet wants to connect"
   ↓
5. You: Tap "Connect" in MetaMask
   ↓
6. MetaMask: Tap "Switch to CashNet" or switch manually
   ↓
7. CashNet: Dialog closes → Shows dashboard
```

### Debug Logs (Expected):
```
flutter: WalletConnect URI: wc:abc123...@1?bridge=https://bridge.walletconnect.org&key=xyz
flutter: Can launch wc:abc123...: true
flutter: Successfully launched: wc:abc123...
flutter: WalletConnect: Connected
flutter: Account: 0x1234...
```

---

## Key Code Changes

### 1. Removed Double Encoding
**Before:**
```dart
final encodedUri = Uri.encodeComponent(uri);
'metamask://wc?uri=$encodedUri'  // ❌ Breaks connection
```

**After:**
```dart
'metamask://wc?uri=$uri'  // ✅ Works correctly
```

### 2. Added Wallet Query Permissions
**AndroidManifest.xml now includes:**
```xml
<queries>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="wc" />
    </intent>
    <intent>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="metamask" />
    </intent>
</queries>
```

### 3. Increased Timeout
**Changed from 15 to 30 seconds:**
```dart
final session = await sessionFuture.timeout(
  const Duration(seconds: 30),  // ✅ More time to approve
);
```

---

## Alternative: Use Mock Login

If wallet connection still doesn't work:

1. Click "Connect Wallet"
2. Wait for timeout or click "Cancel"
3. Click "Use Mock Login"
4. Test app functionality with mock wallet

Mock login creates:
- Fake wallet address: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- Test balance on Sepolia
- All features available for testing

---

## Network Configuration

### Connection Flow:
1. Click "Connect Wallet"
2. App attempts to launch wallet apps (MetaMask, Trust Wallet, Rainbow, etc.)
3. Wait up to 15 seconds for wallet app to respond
4. If timeout or no wallet → Offered mock login immediately

### Deep Link Support:
The app tries these wallet schemes in order:
- `metamask://wc?uri=...`
- `https://metamask.app.link/wc?uri=...` (universal link)
- `trust://wc?uri=...`
- `rainbow://wc?uri=...`
- `zerion://wc?uri=...`

## If Wallet Connection Doesn't Work:

### Option 1: Use Mock Login (Recommended for Testing)
1. Click "Connect Wallet"
2. Wait for timeout or click "Cancel"
3. Click "Use Mock Login"
4. Instant access with mock wallet address

### Option 2: Install MetaMask
1. Install MetaMask from Play Store
2. Create or import wallet
3. Make sure you're on Sepolia testnet
4. Try connecting from CashNet app again

### Option 3: Check Wallet App Setup
- **MetaMask**: Ensure WalletConnect is enabled in settings
- **Trust Wallet**: Update to latest version
- **Rainbow**: Check that app is not restricted

## Testing Without Real Wallet

For development and testing:
1. Select any role (BORROWER, LENDER, ADMIN, AUDITOR)
2. Click "Use Mock Login" button at bottom
3. App creates mock authentication
4. Redirects to dashboard with test data

## Troubleshooting

### "Connection timed out after 15 seconds"
**Cause**: Wallet app didn't respond in time
**Fix**: Use mock login or install MetaMask

### "No wallet app found"
**Cause**: No compatible wallet installed
**Fix**: Install MetaMask or use mock login

### "Opening Wallet App..." stuck
**Cause**: Deep link not working
**Fix**: Click "Cancel" and use mock login

### Wallet opens but doesn't connect
**Cause**: User rejected or app switched away
**Fix**: Try again or use mock login

## Android Manifest Configuration

The app includes deep link handling:
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="wc" />
</intent-filter>
```

This allows wallets to return to CashNet after connection approval.

## Key Changes Made

### 1. Added Timeout (wallet_service.dart)
```dart
final session = await sessionFuture.timeout(
  const Duration(seconds: 15),
  onTimeout: () {
    throw TimeoutException('Connection timeout');
  },
);
```

### 2. Aggressive Deep Linking
```dart
// Try all wallets without checking canLaunchUrl first
for (final scheme in walletSchemes) {
  await launchUrl(walletUri, mode: LaunchMode.externalApplication);
  await Future.delayed(const Duration(milliseconds: 500));
}
```

### 3. Cancel Button in Dialog
```dart
TextButton(
  onPressed: () => Navigator.of(context).pop(),
  child: const Text('Cancel'),
),
```

### 4. Immediate Mock Login Offer
```dart
if (walletAddress == null) {
  final useMock = await showDialog<bool>(...);
  if (useMock == true) {
    await _handleMockLogin();
  }
}
```

## Testing Checklist

- [ ] Click "Connect Wallet" - Dialog appears
- [ ] Wait 15 seconds - Times out gracefully
- [ ] Click "Cancel" - Returns to login screen
- [ ] Select "Use Mock Login" - Redirects to dashboard
- [ ] Install MetaMask - Wallet opens on connection
- [ ] Approve in wallet - Backend authenticates
- [ ] Reject in wallet - Returns with error + mock login option

## Network Configuration

**Backend URL**: `https://cash-net.onrender.com`
**Chain**: Sepolia (ChainID: 11155111)
**Bridge**: `https://bridge.walletconnect.org`

## Production Deployment

For production:
1. Test with real wallets on testnet
2. Verify deep links work on physical device
3. Test timeout handles network issues
4. Ensure mock login is disabled or protected
5. Add analytics for connection success/failure rates

## Support

If wallet connection still doesn't work:
- Check Android version (11+)
- Check internet connection
- Verify wallet app is updated
- Try clearing app cache
- Use mock login for immediate testing
