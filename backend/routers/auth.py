from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials as fb_creds
from jose import jwt, JWTError
from datetime import datetime, timedelta
from pydantic import BaseModel
import base64, json

from database import get_db
from models import AdminAuditor, AdminAuditorRoleEnum
from config import settings
import os

# HTTP Bearer token scheme for protected endpoints
security = HTTPBearer()

if not firebase_admin._apps:
    try:
        sa_b64 = os.getenv("FIREBASE_SA_B64")
        if sa_b64:
            # Decode base64 service-account JSON from env var
            sa_json = json.loads(base64.b64decode(sa_b64))
            cred = fb_creds.Certificate(sa_json)
            firebase_admin.initialize_app(cred)
            print("✅ Firebase Admin SDK initialized from FIREBASE_SA_B64")
        else:
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = fb_creds.Certificate(cred_path)
                firebase_admin.initialize_app(cred)             
                print("✅ Firebase Admin SDK initialized from GOOGLE_APPLICATION_CREDENTIALS")
            else:
                cred = fb_creds.ApplicationDefault()
                firebase_admin.initialize_app(cred)
                print("✅ Firebase Admin SDK initialized from Application Default Credentials")
    except Exception as e:
        print(f"Warning: Firebase Admin SDK initialization failed: {e}")
        print("Firebase token verification will not work until this is resolved.")

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleTokenRequest(BaseModel):
    credential: str          # Google ID token from frontend

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

@router.post("/google", response_model=UserOut)
def google_login(body: GoogleTokenRequest, db: Session = Depends(get_db)):
    """
    Verify Google ID token. Lookup UID in adminandauditor table.
    - If found   â†’ return user + JWT
    - If missing â†’ 403 "Admin or Auditor access only"
    """
    # 1. Verify Firebase ID token
    try:
        decoded = firebase_auth.verify_id_token(body.credential)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Firebase token: {e}")

    uid: str = decoded["uid"]
    email: str = decoded.get("email", "")
    name: str = decoded.get("name", email)
    picture: str = decoded.get("picture", "")

    # 2. Check provisioned table — email is the canonical key; uid is back-filled on first login
    record = db.query(AdminAuditor).filter(AdminAuditor.email == email).first()

    # Back-fill / update the real UID whenever it changes or was a placeholder
    if record and record.uid != uid:
        record.uid = uid
        db.commit()
        db.refresh(record)

    if not record:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "access_denied",
                "message": "This portal is restricted to Admin and Auditor accounts only. "
                           "Contact the system operator to request access.",
            },
        )

    # 3. Update last_login
    record.last_login = datetime.utcnow()
    db.commit()

    # 4. Issue JWT
    token = create_jwt({"uid": uid, "email": email, "role": record.role.value})

    return UserOut(
        uid=uid,
        email=email,
        name=name,
        picture=picture,
        role=record.role.value,
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


