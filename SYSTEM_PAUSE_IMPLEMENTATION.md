# System Pause/Unpause Implementation

## Overview
Comprehensive emergency pause system for controlling all blockchain transactions across the platform. Admins can pause and unpause all contract operations from the admin dashboard with proper error handling and logging.

## Backend Implementation

### 1. Centralized Pause Check Middleware (`backend/middleware.py`)

Created a reusable dependency function that checks if the system is paused before allowing blockchain transactions:

```python
async def check_system_not_paused():
    """
    Dependency to check if system is paused before allowing blockchain transactions.
    Raises HTTPException with structured error if system is paused.
    """
```

**Error Response Format:**
```json
{
  "detail": {
    "error": "SYSTEM_PAUSED",
    "message": "System is currently paused. All blockchain transactions are frozen.",
    "suggestion": "Please wait for the system to be resumed or contact an administrator."
  }
}
```

### 2. Enhanced System Control Router (`backend/routers/system_control.py`)

**Features Added:**
- ✅ Comprehensive logging for all pause/unpause operations
- ✅ Structured error responses with error codes
- ✅ Admin email tracking in logs
- ✅ Transaction hash logging
- ✅ Timestamp metadata

**Endpoints:**
- `GET /system/status` - Get current pause state and blockchain status
- `POST /system/pause` - Emergency pause (Admin only)
- `POST /system/unpause` - Resume operations (Admin only)

**Logging Examples:**
```python
# Pause initiated
log_warn(LogCategoryEnum.SYSTEM, "System Control", 
    "⏸ EMERGENCY PAUSE initiated by admin: {email}")

# Pause successful
log_success(LogCategoryEnum.SYSTEM, "System Control",
    "✅ System PAUSED successfully - All blockchain operations frozen")

# Unpause successful
log_success(LogCategoryEnum.SYSTEM, "System Control",
    "✅ System RESUMED successfully - All blockchain operations restored")
```

### 3. Protected Endpoints

**Liquidity Pool Router (`backend/routers/pool.py`):**
- `/pool/add-liquidity` - Blocked when paused
- `/pool/remove-liquidity` - Blocked when paused
- `/pool/swap` - Blocked when paused

**Implementation:**
```python
@router.post("/swap", dependencies=[Depends(check_system_not_paused)])
async def swap_tokens(request: SwapRequest, db: Session = Depends(get_db)):
    # Transaction logic here
```

**Lending Router (`backend/routers/lending.py`):**
- Endpoints already disabled for backend execution (require MetaMask)
- Pause check not needed as transactions happen on-chain directly

## Frontend Implementation

### 1. Enhanced Error Handling (`frontend/hooks/useSystemControl.ts`)

**Features:**
- ✅ Structured error response parsing
- ✅ Graceful fallback for different error formats
- ✅ Automatic status refresh after pause/unpause

```typescript
const data = await res.json();
if (!res.ok) {
  // Handle structured error response
  const errorMsg = data.detail?.message || data.detail || 'Failed to pause system';
  throw new Error(errorMsg);
}
```

### 2. Enhanced Admin System Page (`frontend/app/admin/system/page.tsx`)

**New Features:**
- ✅ Detailed pause state information
- ✅ API endpoint status display
- ✅ Error response format documentation
- ✅ Toast notifications instead of alerts
- ✅ Better visual feedback

**Information Displayed:**
- Blockchain connection status
- Current pause state (ACTIVE/PAUSED)
- Block number
- Affected contracts with descriptions
- Affected API endpoints
- Expected error responses

**Toast Notifications:**
```typescript
// Success
addToast({ 
  message: 'System paused successfully. All contract operations are now frozen.', 
  severity: 'success' 
});

// Error
addToast({ 
  message: error || 'Failed to pause system', 
  severity: 'error' 
});
```

## User Experience

### When System is ACTIVE:
1. All blockchain transactions work normally
2. API endpoints accept requests
3. Green status indicators
4. "ACTIVE" badge on all contracts

### When System is PAUSED:
1. All transaction endpoints return `503 Service Unavailable`
2. Frontend displays error messages (not alerts)
3. Red status indicators with "FROZEN" badge
4. Clear error message: "System is currently paused. All blockchain transactions are frozen."
5. Users directed to contact admin

### Admin Actions:

**Pause System:**
1. Admin clicks "⏸ EMERGENCY PAUSE" button
2. Transaction sent to AccessControl contract
3. System logs the event with admin details
4. All API endpoints immediately blocked
5. Success toast shown
6. Status refreshed automatically

**Unpause System:**
1. Admin clicks "▶ Resume System Operations" button
2. Transaction sent to AccessControl contract
3. System logs the event with admin details
4. All API endpoints re-enabled
5. Success toast shown
6. Status refreshed automatically

## Error Response Format

### Standard Error (503 Service Unavailable)
```json
{
  "detail": {
    "error": "SYSTEM_PAUSED",
    "message": "System is currently paused. All blockchain transactions are frozen.",
    "suggestion": "Please wait for the system to be resumed or contact an administrator."
  }
}
```

### Pause/Unpause Errors (500 Internal Server Error)
```json
{
  "detail": {
    "error": "PAUSE_FAILED" | "UNPAUSE_FAILED",
    "message": "Failed to pause/unpause system: {error_details}",
    "suggestion": "Check blockchain connection and try again."
  }
}
```

## Logging & Monitoring

All pause/unpause operations are logged to the `system_logs` table with:
- **Level:** WARN (pause), INFO (unpause), SUCCESS (completed), ERROR (failed)
- **Category:** SYSTEM
- **Source:** "System Control"
- **Metadata:** 
  - `admin_id` - Admin user database ID
  - `admin_email` - Admin email address
  - `tx_hash` - Blockchain transaction hash
  - `timestamp` - ISO 8601 timestamp

**View Logs:**
- Admin dashboard: `/auditor/events`
- Filter by category: SYSTEM
- Filter by source: "System Control"

## Testing Checklist

### Backend Tests:
- [ ] Start backend server - no errors
- [ ] GET `/system/status` - returns pause state
- [ ] POST `/system/pause` - pauses successfully (admin auth)
- [ ] POST `/pool/swap` - returns 503 when paused
- [ ] POST `/system/unpause` - unpauses successfully
- [ ] POST `/pool/swap` - works when unpaused
- [ ] Logs created in database for all operations

### Frontend Tests:
- [ ] Visit `/admin/system` - page loads
- [ ] Status shows "ACTIVE" when unpaused
- [ ] Click "EMERGENCY PAUSE" - success toast appears
- [ ] Status refreshes to show "PAUSED"
- [ ] Affected contracts show "FROZEN" badges
- [ ] Click "Resume System Operations" - success toast appears
- [ ] Status refreshes to show "ACTIVE"
- [ ] No JavaScript alerts used anywhere
- [ ] Error messages display in toast notifications

## Security Considerations

1. **Admin-Only Access:** Only users with `ADMIN` role can pause/unpause
2. **On-Chain Verification:** Pause state stored in smart contract, not just database
3. **Transaction Signing:** All pause/unpause operations require blockchain transaction
4. **Audit Trail:** Complete logging of who paused/unpaused and when
5. **Fail-Safe:** If pause check fails (blockchain unreachable), operations still blocked

## Future Enhancements

1. **Scheduled Maintenance:** Allow scheduling pause/unpause for specific times
2. **Partial Pause:** Pause specific contracts instead of all
3. **Auto-Resume:** Automatic unpause after specified duration
4. **Multi-Signature:** Require multiple admins to pause system
5. **Notification System:** Alert all users when system is paused/unpaused
6. **Historical Analytics:** Track pause duration and frequency

## Files Modified

### Backend:
- ✅ Created: `backend/middleware.py` - Centralized pause check dependency
- ✅ Updated: `backend/routers/system_control.py` - Enhanced logging and error handling
- ✅ Updated: `backend/routers/pool.py` - Applied pause checks to transaction endpoints

### Frontend:
- ✅ Updated: `frontend/hooks/useSystemControl.ts` - Better error parsing
- ✅ Updated: `frontend/app/admin/system/page.tsx` - Enhanced UI and information display

## API Reference

### Get System Status
```http
GET /system/status
```

**Response:**
```json
{
  "connected": true,
  "block_number": 123456,
  "paused": false,
  "access_control_address": "0x..."
}
```

### Pause System
```http
POST /system/pause
Authorization: Bearer {admin_token}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "System paused successfully. All blockchain operations are now frozen.",
  "tx_hash": "0x...",
  "paused": true
}
```

### Unpause System
```http
POST /system/unpause
Authorization: Bearer {admin_token}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "System resumed successfully. All blockchain operations are now active.",
  "tx_hash": "0x...",
  "paused": false
}
```

---

**Implementation Complete** ✅
All blockchain transaction endpoints now respect the pause state with proper error handling and user-friendly messages.
