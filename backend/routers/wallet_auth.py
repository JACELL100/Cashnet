"""
Authentication router for wallet-based (MetaMask) authentication.
Uses EIP-191 signature verification for secure, non-custodial auth.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import os
import secrets
import jwt
from eth_account.messages import encode_defunct
from web3 import Web3

from database import get_db
from models import Borrower
from schemas import NonceRequest, NonceResponse, AuthVerifyRequest, AuthResponse, BorrowerResponse

router = APIRouter(prefix="/api/auth", tags=["Wallet Authentication"])

JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

w3 = Web3()


def generate_nonce() -> str:
    return secrets.token_hex(32)


def create_auth_message(wallet_address: str, nonce: str) -> str:
    return (
        f"Sign this message to authenticate with Cashnet.\n\n"
        f"Wallet: {wallet_address}\nNonce: {nonce}\n\n"
        f"This request will not trigger a blockchain transaction or cost any gas fees."
    )


def verify_signature(wallet_address: str, signature: str, message: str) -> bool:
    try:
        encoded_message = encode_defunct(text=message)
        recovered_address = w3.eth.account.recover_message(encoded_message, signature=signature)
        return recovered_address.lower() == wallet_address.lower()
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False


def create_jwt_token(wallet_address: str, borrower_id: int) -> str:
    expiration = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "wallet_address": wallet_address,
        "borrower_id": borrower_id,
        "exp": expiration,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


@router.post("/nonce", response_model=NonceResponse)
async def get_nonce(request: NonceRequest, db: Session = Depends(get_db)):
    wallet_address = request.wallet_address.lower()
    if not w3.is_address(wallet_address):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Ethereum address")
    wallet_address = w3.to_checksum_address(wallet_address)

    borrower = db.query(Borrower).filter(Borrower.wallet_address == wallet_address).first()
    if not borrower:
        borrower = Borrower(wallet_address=wallet_address, nonce=generate_nonce())
        db.add(borrower)
    else:
        borrower.nonce = generate_nonce()

    db.commit()
    db.refresh(borrower)
    message = create_auth_message(wallet_address, borrower.nonce)
    return NonceResponse(nonce=borrower.nonce, message=message)


@router.post("/verify", response_model=AuthResponse)
async def verify_signature_and_login(request: AuthVerifyRequest, db: Session = Depends(get_db)):
    wallet_address = request.wallet_address.lower()
    if not w3.is_address(wallet_address):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Ethereum address")
    wallet_address = w3.to_checksum_address(wallet_address)

    borrower = db.query(Borrower).filter(Borrower.wallet_address == wallet_address).first()
    if not borrower:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found. Please request a nonce first.")

    message = create_auth_message(wallet_address, borrower.nonce)
    if not verify_signature(wallet_address, request.signature, message):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    borrower.last_login = datetime.utcnow()
    if request.name:
        borrower.name = request.name
    if request.email:
        borrower.email = request.email
    borrower.nonce = generate_nonce()
    db.commit()
    db.refresh(borrower)

    token = create_jwt_token(wallet_address, borrower.id)
    return AuthResponse(
        wallet_address=borrower.wallet_address,
        name=borrower.name,
        email=borrower.email,
        token=token,
        created_at=borrower.created_at,
    )


@router.get("/borrowers", tags=["Admin"])
async def list_all_borrowers(db: Session = Depends(get_db)):
    """Admin endpoint: list all registered borrowers from the wallet-auth table."""
    borrowers = db.query(Borrower).all()
    return [
        {
            "id": b.id,
            "wallet_address": b.wallet_address,
            "name": b.name,
            "email": b.email,
            "is_active": b.is_active,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "last_login": b.last_login.isoformat() if b.last_login else None,
        }
        for b in borrowers
    ]


@router.get("/me", response_model=BorrowerResponse)
async def get_current_user(token: str, db: Session = Depends(get_db)):
    payload = verify_jwt_token(token)
    borrower = db.query(Borrower).filter(Borrower.id == payload["borrower_id"]).first()
    if not borrower or not borrower.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found or inactive")
    return borrower


@router.post("/logout")
async def logout(token: str, db: Session = Depends(get_db)):
    payload = verify_jwt_token(token)
    borrower = db.query(Borrower).filter(Borrower.id == payload["borrower_id"]).first()
    if borrower:
        borrower.nonce = generate_nonce()
        db.commit()
    return {"message": "Logged out successfully"}
