
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials as fb_creds
from jose import jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
import base64, json

from database import get_db
from models import AdminAuditor, AdminAuditorRoleEnum
from config import settings
import os

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

# --- Caches (token verify + admin record) ------------------------------------
import time as _time, hashlib as _hashlib

_admin_cache: dict = {}   # email -> {"role","uid","exp"}
_token_cache: dict = {}   # sha256(credential) -> (decoded, exp_monotonic)
_ADMIN_TTL = 300          # 5 min
_TOKEN_TTL = 300          # 5 min

def _admin_cache_get(email: str):
    e = _admin_cache.get(email)
    return e if e and e["exp"] > _time.monotonic() else None

def _admin_cache_set(email: str, role: str, uid: str):
    _admin_cache[email] = {"role": role, "uid": uid, "exp": _time.monotonic() + _ADMIN_TTL}

def _admin_cache_bust(email: str):
    _admin_cache.pop(email, None)

def _token_cache_get(cred: str):
    key = _hashlib.sha256(cred.encode()).hexdigest()
    e = _token_cache.get(key)
    return e[0] if e and e[1] > _time.monotonic() else None

def _token_cache_set(cred: str, decoded: dict):
    key = _hashlib.sha256(cred.encode()).hexdigest()
    _token_cache[key] = (decoded, _time.monotonic() + _TOKEN_TTL)


# â”€â”€â”€ Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    # 1. Verify Firebase ID token — use cached result when same token is reused (e.g. 10-min session refresh)
    #    check_revoked=False avoids a second outbound HTTP call to Google (~1.5s savings)
    decoded = _token_cache_get(body.credential)
    if decoded is None:
        try:
            decoded = firebase_auth.verify_id_token(body.credential, check_revoked=False)
            _token_cache_set(body.credential, decoded)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Firebase token: {e}")

    uid: str     = decoded["uid"]
    email: str   = decoded.get("email", "")
    name: str    = decoded.get("name", email)
    picture: str = decoded.get("picture", "")

    # 2. Check admin record cache first; fall back to DB — auto-create on first login
    cached = _admin_cache_get(email)
    if cached:
        role_value = cached["role"]
        record = None  # uid/last_login sync happens below if uid drifted
    else:
        record = db.query(AdminAuditor).filter(AdminAuditor.email == email).first()
        if not record:
            # First-time sign-in: auto-provision as AUDITOR
            record = AdminAuditor(
                uid=uid,
                email=email,
                name=name,
                picture=picture,
                role=AdminAuditorRoleEnum.AUDITOR,
            )
            db.add(record)
            try:
                db.commit()
                db.refresh(record)
            except Exception:
                db.rollback()
                raise HTTPException(status_code=500, detail="Failed to create account")
        role_value = record.role.value
        _admin_cache_set(email, role_value, record.uid)

    # 3. Single commit: back-fill uid + last_login only when something changed
    if record is not None or (cached and cached.get("uid") != uid):
        if record is None:
            record = db.query(AdminAuditor).filter(AdminAuditor.email == email).first()
        if record:
            dirty = False
            if record.uid != uid:
                record.uid = uid
                dirty = True
                _admin_cache_bust(email)
            try:
                record.last_login = datetime.utcnow()
                dirty = True
            except Exception:
                pass
            if dirty:
                try:
                    db.commit()
                except Exception:
                    db.rollback()

    # 4. Issue JWT
    token = create_jwt({"uid": uid, "email": email, "role": role_value})

    return UserOut(
        uid=uid,
        email=email,
        name=name,
        picture=picture,
        role=role_value,
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

