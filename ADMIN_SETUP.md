# Development: Multiple Admin Login Setup

## Problem
Currently, when multiple developers try to login to the admin portal using the same Google account, they disconnect each other.

## Solution: Use Separate Google Accounts

Each team member should use their own Google account for admin access.

---

## Quick Start - Add Your Team Members

### Option 1: Interactive Script (Easiest)

Run this in your backend terminal:

```powershell
cd "D:\SPIT Hackathon\Dotlocal\backend"
.\venv\Scripts\Activate.ps1
python scripts/add_admin.py
```

Then enter:
- Your Google email (the one you use to sign in)
- Your name
- Role (ADMIN or AUDITOR)

**Example:**
```
Enter Google email address: alice@gmail.com
Enter display name: Alice Developer
Enter role (ADMIN/AUDITOR) [ADMIN]: ADMIN

✅ SUCCESS! Provisioned alice@gmail.com as ADMIN
```

Repeat for each team member!

### Option 2: Batch Add (Multiple at Once)

1. Edit `backend/scripts/provision_dev_admins.py`
2. Add your team's emails to the `dev_admins` list:

```python
dev_admins = [
    ("alice@gmail.com", "Alice"),
    ("bob@gmail.com", "Bob"),
    ("charlie@gmail.com", "Charlie"),
    ("diana@gmail.com", "Diana"),
]
```

3. Run:
```powershell
cd "D:\SPIT Hackathon\Dotlocal\backend"
.\venv\Scripts\Activate.ps1
python scripts/provision_dev_admins.py
```

### Option 3: Using the API

You can also use the `/auth/provision` endpoint:

```powershell
# Using PowerShell
$body = @{
    secret = "provision-secret-change-me"
    uid = "dev_alice_001"
    email = "alice@gmail.com"
    name = "Alice Developer"
    picture = ""
    role = "ADMIN"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/auth/provision" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

---

## Check Current Admins

List all provisioned admins:

```powershell
cd "D:\SPIT Hackathon\Dotlocal\backend"
.\venv\Scripts\Activate.ps1
python scripts/add_admin.py list
```

---

## How It Works

1. **Each developer has their own Google account**
   - alice@gmail.com → Admin
   - bob@gmail.com → Admin
   - charlie@gmail.com → Auditor

2. **Firebase allows unlimited concurrent sessions**
   - Everyone can be logged in at the same time
   - Sessions are independent per Google account

3. **JWT tokens are stateless**
   - No server-side session tracking
   - No conflict between users

---

## Login Flow

1. Go to `http://localhost:3000/admin/login`
2. Click **"Continue with Google"**
3. Sign in with **your** Google account (not someone else's)
4. You're in! ✅

---

## Troubleshooting

### "Access Denied - Admin and Auditor accounts only"

**Problem:** Your Google account isn't provisioned yet.

**Solution:** Run one of the scripts above to add your email to the database.

### Still getting disconnected?

**Check if you're using the same Google account:**

1. Open browser DevTools (F12)
2. Go to Application → Storage → Local Storage → `http://localhost:3000`
3. Look for the `authStore` key
4. Check the `email` field - if it's the same as your teammate's, you're using the same account!

**Solution:** Each person should use their own unique Google account.

---

## For Production

In production, you'd provision admins through a secure admin panel or CLI tool. For development, these scripts make it easy to add/remove team members quickly.

**Security Note:** The `PROVISION_SECRET` in `.env.local` should be changed for production deployments.
