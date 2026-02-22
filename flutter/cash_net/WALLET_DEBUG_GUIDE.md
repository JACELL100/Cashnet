# WalletConnect Debug Guide

## What Was Added

Enhanced debug logging throughout `wallet_service.dart` to diagnose why MetaMask opens but doesn't show the connection request popup.

## How to Use

1. **Run the app in debug mode:**
   ```bash
   cd flutter\cash_net
   flutter run
   ```

2. **Click "Connect Wallet"** on the login screen

3. **Watch the terminal output** for the following logs:

## Expected Log Flow

### 1. Connection Start
```
🚀 connect() called
Connector is null, initializing WalletConnect...
📡 Setting up WalletConnect event listeners...
✅ WalletConnect initialized and listening for events
📞 Calling createSession() with chainId: 11155111
```

### 2. URI Generation (Most Important!)
```
═══════════════════════════════════════════
WalletConnect URI Generated:
wc:12345678-1234-1234-1234-123456789012@1?bridge=https%3A%2F%2Fbridge.walletconnect.org&key=abcdef...
URI Length: 180
Starts with "wc:": true
═══════════════════════════════════════════
```

**CRITICAL:** The URI should:
- Start with `wc:`
- Contain `@1` (protocol version)
- Include `bridge=` parameter
- Include `key=` parameter
- Be around 180-200 characters long

### 3. Deep Link Attempts
You should see one or more of these succeed:

```
🔗 Attempting Method 1: Launch with raw WC URI
Parsed URI scheme: wc
Parsed URI host: 12345678-1234-1234-1234-123456789012
canLaunchUrl result: true
launchUrl result: true
✅ Successfully launched with raw URI
```

OR

```
🔗 Attempting Method 2: MetaMask scheme
Trying: metamask://wc?uri=wc:...
canLaunchUrl result: true
launchUrl result: true
✅ Successfully launched with MetaMask scheme
```

OR

```
🔗 Attempting Method 3: MetaMask Universal Link
Trying: https://metamask.app.link/wc?uri=wc:...
canLaunchUrl result: true
launchUrl result: true
✅ Successfully launched with Universal Link
```

### 4. Waiting for Approval
```
⏳ Waiting for wallet approval (30 second timeout)...
If MetaMask opened, check the app for connection request
```

**At this point, check your MetaMask app!** You should see a connection request popup.

### 5. Connection Success
If everything works, you'll see:

```
🔔 "connect" event received from WalletConnect
🔔 _onConnect callback triggered!
Session type: SessionStatus
✅ Session is SessionStatus
Session accounts: [0x1234...]
Session chainId: 11155111
✅ Set account to: 0x1234...

✅ Session received from WalletConnect!
Session chainId: 11155111
Session accounts: [0x1234...]
✅ Connected to account: 0x1234...
```

## What to Report

### If MetaMask Opens But No Popup

Copy the entire terminal output and look for:

1. **Is the WalletConnect URI correct?**
   - Does it start with `wc:`?
   - Does it have `@1` in it?
   - Does it contain `bridge=` and `key=` parameters?
   - Is the length reasonable (180-200 chars)?

2. **Which deep link method worked?**
   - Look for "✅ Successfully launched with..."
   - This tells us HOW MetaMask was opened

3. **Does the `connect` event fire?**
   - Look for "🔔 'connect' event received from WalletConnect"
   - If this appears, WalletConnect is working but MetaMask isn't responding
   - If this DOESN'T appear, the connection protocol isn't completing

### If Nothing Opens

Check if ANY of the deep link methods returned true:
- `canLaunchUrl result: true`
- `launchUrl result: true`

If all are false, the wallet apps might not be installed or the manifest queries are wrong.

### If Timeout Occurs

```
❌ WalletConnect connection timeout after 30 seconds
User did not approve connection in MetaMask
```

This means:
- MetaMask opened successfully (deep link worked)
- The connection request was sent
- But MetaMask either didn't show the popup OR user didn't approve in 30 seconds

## Common Issues

### Issue 1: URI is Malformed
**Symptoms:**
- URI doesn't start with `wc:`
- Missing `@1` or `bridge=` or `key=`
- URI looks encoded/garbled

**Fix:** Check WalletConnect library initialization

### Issue 2: Deep Links All Fail
**Symptoms:**
- All three `canLaunchUrl result: false`
- MetaMask never opens

**Fix:** 
- Install MetaMask Mobile (download from Play Store)
- Check Android manifest has wallet app queries

### Issue 3: MetaMask Opens, No Popup, No Connect Event
**Symptoms:**
- "✅ Successfully launched" appears
- But no "🔔 'connect' event received" appears
- Timeout after 30 seconds

**Likely cause:** 
- WalletConnect URI format is technically correct but MetaMask doesn't recognize it
- Possible MetaMask version incompatibility
- Bridge server issue

**Fix:**
- Update MetaMask to latest version
- Try alternative wallet (Trust Wallet, Rainbow)
- Check bridge server status

### Issue 4: MetaMask Opens, Connect Event Fires, But No Session
**Symptoms:**
- "🔔 'connect' event received" appears
- But "⚠️ Session accounts is empty!" appears

**Fix:** User needs to unlock MetaMask and select an account

## Testing Alternative Wallets

To isolate if the issue is MetaMask-specific, try:

1. **Trust Wallet:** Already configured in code
2. **Rainbow Wallet:** Already configured in code

The same logs will appear - just different wallet app will open.

## Next Steps Based on Logs

Send the terminal output to identify:
1. Is the URI correct? (most likely issue)
2. Does the connect event fire?
3. What does MetaMask's internal state show?

This will tell us whether the problem is:
- Our code (URI generation)
- The protocol (WalletConnect handshake)
- MetaMask (app compatibility)
