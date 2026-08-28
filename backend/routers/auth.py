from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime, timedelta
from pydantic import BaseModel
import httpx

from database import get_db
from models import AdminAuditor, AdminAuditorRoleEnum
from config import settings
from logging_utils import log_success, log_error, log_warn, log_info
from models import LogCategoryEnum
import os

# HTTP Bearer token scheme for protected endpoints
security = HTTPBearer()

router = APIRouter(prefix="/auth", tags=["auth"])


class SupabaseTokenRequest(BaseModel):
    access_token: str

class ProvisionRequest(BaseModel):
    secret: str              # Must match PROVISION_SECRET in env
    uid: str                 # Google UID (sub)
    email: str
    name: str
    picture: str = ""
    role: AdminAuditorRoleEnum

class UserOut(BaseModel):
    uid: str
    email: str
    name: str
    picture: str
    role: str
    token: str               # JWT for frontend session

    class Config:
        from_attributes = True



def create_jwt(payload: dict, days: int = 7) -> str:
    data = payload.copy()
    data["exp"] = datetime.utcnow() + timedelta(days=days)
    return jwt.encode(data, settings.jwt_secret, algorithm="HS256")

# â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/session", response_model=UserOut)
def supabase_login(body: SupabaseTokenRequest, db: Session = Depends(get_db)):
    """
    Validate a Supabase access token and look up the user in adminandauditor.
    - If found   â†’ return user + JWT
    - If missing â†’ 403 "Admin or Auditor access only"    
    Note: Users can have multiple roles (e.g., both ADMIN and AUDITOR).
    We return the highest privilege role (ADMIN > AUDITOR).    """
    # 1. Ask Supabase Auth to validate the access token.
    try:
        if not settings.supabase_url or not settings.supabase_anon_key:
            raise RuntimeError("SUPABASE_URL or SUPABASE_ANON_KEY is not configured")
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {body.access_token}",
                "apikey": settings.supabase_anon_key,
            },
            timeout=10,
        )
        if response.status_code != 200:
            raise ValueError("Supabase access token was rejected")
        decoded = response.json()
    except Exception as e:
        log_error(LogCategoryEnum.AUTH, "Authentication", f"Invalid Supabase token: {str(e)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase access token")

    uid: str = decoded["id"]
    metadata = decoded.get("user_metadata") or {}
    email: str = decoded.get("email", "")
    name: str = metadata.get("full_name") or metadata.get("name") or email
    picture: str = metadata.get("avatar_url") or metadata.get("picture") or ""

    # 2. Check provisioned table — email is the canonical key; uid is back-filled on first login
    # Note: User may have multiple roles (ADMIN, AUDITOR), so get ALL records
    records = db.query(AdminAuditor).filter(AdminAuditor.email == email).all()

    if not records:
        log_warn(LogCategoryEnum.AUTH, "Authentication", f"Access denied for unauthorized user: {email}", user_id=email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "access_denied",
                "message": "This portal is restricted to Admin and Auditor accounts only. "
                           "Contact the system operator to request access.",
            },
        )

    # Back-fill / update the real UID and last_login for ALL role records
    for record in records:
        if record.uid != uid:
            record.uid = uid
        record.last_login = datetime.utcnow()
    
    db.commit()

    # 3. Determine primary role (ADMIN takes precedence over AUDITOR)
    roles = [r.role.value for r in records]
    primary_role = "ADMIN" if "ADMIN" in roles else roles[0]

    # Log successful login
    log_success(
        LogCategoryEnum.AUTH,
        "Authentication",
        f"User login successful - {email} ({primary_role})",
        user_id=email,
        metadata={"uid": uid, "role": primary_role, "method": "Supabase Google OAuth"}
    )

    # 4. Issue JWT
    token = create_jwt({"uid": uid, "email": email, "role": primary_role, "roles": roles})

    return UserOut(
        uid=uid,
        email=email,
        name=name,
        picture=picture,
        role=primary_role,
        token=token,
    )


@router.post("/provision", status_code=status.HTTP_201_CREATED)
def provision_user(body: ProvisionRequest, db: Session = Depends(get_db)):
    """
    Operator-only endpoint to add an Admin or Auditor account.
    Requires PROVISION_SECRET from environment variables.
    """
    if body.secret != settings.provision_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid provision secret")

    existing = db.query(AdminAuditor).filter(
        (AdminAuditor.uid == body.uid) | (AdminAuditor.email == body.email)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already provisioned")

    record = AdminAuditor(
        uid=body.uid,
        email=body.email,
        name=body.name,
        picture=body.picture,
        role=body.role,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"message": f"{record.role.value} account provisioned", "email": record.email}


@router.get("/adminandauditor", tags=["auth"])
def list_admin_auditors(db: Session = Depends(get_db)):
    """List all provisioned admin/auditor accounts (admin use only in production)."""
    records = db.query(AdminAuditor).all()
    return [
        {"uid": r.uid, "email": r.email, "name": r.name, "role": r.role.value, "created_at": r.created_at}
        for r in records
    ]


# ─── Authentication Dependencies ──────────────────────────────────────────────

def get_current_admin_or_auditor(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> AdminAuditor:
    """
    Dependency to verify JWT token and return current admin/auditor user.
    Used for protected endpoints that require authentication.
    """
    token = credentials.credentials
    
    try:
        # Decode JWT token
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"]
        )
        uid: str = payload.get("uid")
        email: str = payload.get("email")
        
        if uid is None or email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        
        # Look up user in database
        user = db.query(AdminAuditor).filter(AdminAuditor.uid == uid).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        return user
        
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )


def get_current_admin(
    current_user: AdminAuditor = Depends(get_current_admin_or_auditor)
) -> AdminAuditor:
    """
    Dependency to ensure the current user is an ADMIN.
    """
    if current_user.role != AdminAuditorRoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


