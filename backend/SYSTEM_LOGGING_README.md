# System Event Logging Setup

## Overview
This system now includes real-time event logging that tracks all backend and frontend activities in the database. No more mock/static data!

## What Was Created

### 1. Database Model (`models.py`)
- **SystemLog** table to store all events
- **LogLevelEnum**: DEBUG, INFO, WARN, ERROR, SUCCESS
- **LogCategoryEnum**: TRANSACTION, ALERT, AUTH, SYSTEM, API, DATABASE

### 2. Logging Utility (`logging_utils.py`)
- Centralized logging functions
- Automatically writes to both database and console
- Helper functions: `log_info()`, `log_success()`, `log_warn()`, `log_error()`, `log_debug()`

### 3. API Endpoints (`routers/logs.py`)
- `GET /api/logs/` - Retrieve system logs with filters
- `GET /api/logs/stats` - Get log statistics
- `DELETE /api/logs/cleanup` - Clean up old logs

### 4. Frontend Event Log Page (`auditor/events/page.tsx`)
- Terminal-like UI showing real-time logs
- Fetches from `/api/logs/` endpoint only (no mock data)
- Auto-refresh every 5 seconds
- Filtering by category, search, pause/resume
- Export functionality

### 5. Automatic Logging Integration
- Server startup events logged
- Database initialization logged
- Firebase authentication events logged
- User login/logout tracked with metadata

## Setup Instructions

### Step 1: Run Database Migration
```bash
cd backend
python scripts/add_system_logs_table.py
```

This will create the `system_logs` table in your database.

### Step 2: Restart Backend Server
```bash
cd backend
python -m uvicorn main:app --reload
```

The server will automatically log startup events to the database.

### Step 3: Test Event Logging

#### Test Authentication Events:
1. Go to `/admin/login` or `/auditor/login`
2. Sign in with Google
3. Check `/auditor/events` - you should see login events!

#### Test Manual Logging (Python):
```python
from logging_utils import log_info, log_success
from models import LogCategoryEnum

log_info(
    LogCategoryEnum.SYSTEM,
    "Test",
    "This is a test log message",
    metadata={"key": "value"}
)
```

#### Test via API:
The logging happens automatically, but you can view logs:
```bash
curl http://localhost:8000/api/logs/?limit=10
```

## How to Add Logging to Your Code

### In Backend Python:
```python
from logging_utils import log_success, log_error, log_info
from models import LogCategoryEnum

# Log a successful operation
log_success(
    LogCategoryEnum.API,
    "API Endpoint",
    "User created successfully",
    user_id="user@example.com",
    metadata={"user_id": 123}
)

# Log an error
log_error(
    LogCategoryEnum.DATABASE,
    "Database",
    f"Failed to connect: {str(error)}"
)

# Log info
log_info(
    LogCategoryEnum.TRANSACTION,
    "Blockchain",
    f"Transaction submitted: {tx_hash}",
    metadata={"hash": tx_hash, "amount": amount}
)
```

### Key Features:
- **category**: TRANSACTION, ALERT, AUTH, SYSTEM, API, DATABASE
- **source**: Human-readable source name (e.g., "Authentication", "Backend API")
- **message**: The log message
- **metadata** (optional): Dictionary with additional data
- **user_id** (optional): User identifier for tracking
- **request_id** (optional): For request tracing

## Event Log Page Features

### Filters:
- **Category**: ALL, TRANSACTION, ALERT, AUTH, SYSTEM
- **Search**: Real-time text search
- **Live/Pause**: Control event streaming
- **Auto-scroll**: Toggle automatic scrolling

### Stats:
- Total events
- Transaction count
- Alert count
- Filtered event count

### Terminal UI:
- Color-coded log levels
- Metadata preview on hover
- Export to .txt file
- Clear all events

## API Endpoints

### GET /api/logs/
Retrieve system logs with optional filters:
- `limit`: Max logs to return (default: 100, max: 1000)
- `level`: Filter by level (DEBUG, INFO, WARN, ERROR, SUCCESS)
- `category`: Filter by category
- `source`: Filter by source name
- `since`: ISO timestamp to get logs since

### GET /api/logs/stats
Get statistics about logs:
- `hours`: Time window in hours (default: 24)

### DELETE /api/logs/cleanup
Delete old logs:
- `days`: Delete logs older than N days (default: 30)

## Log Retention

Consider setting up a cron job to clean up old logs:
```bash
# Clean logs older than 30 days
curl -X DELETE "http://localhost:8000/api/logs/cleanup?days=30"
```

## What Gets Logged Automatically

Currently logging:
- ✅ Server startup
- ✅ Database initialization
- ✅ Blockchain connection status
- ✅ User authentication (login/logout)
- ✅ Access denied attempts
- ✅ Firebase initialization
- ✅ ML model initialization

## Next Steps

You can add logging to:
- Transaction submissions
- Alert creation
- Pool operations
- Lending operations
- Smart contract interactions
- API request/response
- Error handlers
- Background tasks

Just import the logging utils and call the appropriate function!

## Troubleshooting

### No logs appearing?
1. Make sure the database table was created: `python scripts/add_system_logs_table.py`
2. Check backend console for errors
3. Verify API endpoint: `http://localhost:8000/api/logs/`
4. Check browser console for frontend errors

### Too many logs?
Use the cleanup endpoint or add filtering in your queries.

### Performance concerns?
- Use indexes on timestamp, level, and category (already added)
- Set up regular cleanup jobs
- Consider log rotation after X days
- Use pagination (`limit` parameter)
