"""
Participant management routes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Participant
from schemas import ParticipantCreate, ParticipantResponse
from typing import List

router = APIRouter(prefix="/participants", tags=["Participants"])


@router.post("/register", response_model=ParticipantResponse)
async def register_participant(
    participant: ParticipantCreate,
    db: Session = Depends(get_db)
):
    """Register a new participant with wallet and role"""
    
    # Check if wallet already exists
    existing = db.query(Participant).filter(
        Participant.wallet == participant.wallet
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Wallet address already registered"
        )
    
    # Create new participant
    db_participant = Participant(
        wallet=participant.wallet,
        role=participant.role,
        score=500  # Default credit score
    )
    
    db.add(db_participant)
    db.commit()
    db.refresh(db_participant)
    
    return db_participant


@router.get("/", response_model=List[ParticipantResponse])
async def get_all_participants(db: Session = Depends(get_db)):
    """Get all registered participants"""
    participants = db.query(Participant).all()
    return participants


@router.get("/{wallet}", response_model=ParticipantResponse)
async def get_participant(wallet: str, db: Session = Depends(get_db)):
    """Get participant by wallet address"""
    participant = db.query(Participant).filter(
        Participant.wallet == wallet
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    return participant


@router.put("/{wallet}/score")
async def update_participant_score(wallet: str, payload: dict, db: Session = Depends(get_db)):
    """Update credit score for a participant (300-850)"""
    participant = db.query(Participant).filter(
        Participant.wallet == wallet
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    score = payload.get("score")
    if score is None or not isinstance(score, int) or not (300 <= score <= 850):
        raise HTTPException(status_code=422, detail="Score must be an integer between 300 and 850")

    participant.score = score
    db.commit()
    db.refresh(participant)
    return {"wallet": wallet, "score": participant.score}


@router.delete("/{wallet}")
async def delete_participant(wallet: str, db: Session = Depends(get_db)):
    """Delete a participant"""
    participant = db.query(Participant).filter(
        Participant.wallet == wallet
    ).first()
    
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    db.delete(participant)
    db.commit()
    
    return {"message": "Participant deleted successfully"}
