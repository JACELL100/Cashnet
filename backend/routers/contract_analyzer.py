"""
Smart Contract Analyzer Router
Analyzes Solidity smart contracts for vulnerabilities, threats, and attack vectors
Uses Groq API for AI-powered analysis and improved code generation
"""
import json
import os
import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from config import settings  # ensures .env.local is loaded via load_dotenv

router = APIRouter(prefix="/api/contract", tags=["Contract Analyzer"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


class ContractAnalysisRequest(BaseModel):
    code: str
    filename: Optional[str] = "contract.sol"


class ContractAnalysisResponse(BaseModel):
    filename: str
    summary: str
    severity_score: int  # 0-100, 100 = critical
    vulnerabilities: list
    simulation_results: list
    mermaid_diagram: str
    improved_code: str
    recommendations: list


SYSTEM_PROMPT = """You are an expert smart contract security auditor and blockchain developer.
Analyze the provided Solidity smart contract and return a comprehensive JSON report.

Your response MUST be valid JSON with this exact structure:
{
  "summary": "Brief description of what the contract does",
  "severity_score": <integer 0-100 where 100=critical>,
  "vulnerabilities": [
    {
      "id": "V001",
      "name": "Vulnerability Name",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
      "line": <line number or null>,
      "description": "Detailed description",
      "impact": "What can happen if exploited",
      "cwe": "CWE-XXX"
    }
  ],
  "simulation_results": [
    {
      "scenario": "Scenario name (e.g. Reentrancy Attack)",
      "attack_type": "Type of attack",
      "outcome": "VULNERABLE|SAFE|PARTIAL",
      "description": "What happens when this attack is attempted",
      "funds_at_risk": "<amount or percentage or N/A>",
      "steps": ["Step 1", "Step 2", "Step 3"]
    }
  ],
  "mermaid_diagram": "flowchart TD\\n    A[Contract Entry] --> B{Check};\\n    ...",
  "improved_code": "// SPDX-License-Identifier: MIT\\npragma solidity ...\\n...",
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

For simulation_results, test ALL of these scenarios:
1. Reentrancy Attack
2. Integer Overflow/Underflow  
3. Access Control Bypass
4. Flash Loan Attack
5. Front-Running / MEV
6. Oracle Manipulation
7. Denial of Service
8. Timestamp Manipulation
9. Delegate Call Vulnerability
10. Phishing via tx.origin

For the mermaid_diagram, create a flowchart showing:
- The contract's execution flow
- WHERE vulnerabilities exist (mark with ⚠)
- HOW each vulnerability can be exploited
- The attack vectors and their impact

The improved_code should be a fixed, production-ready version of the contract with all vulnerabilities patched, using:
- OpenZeppelin libraries where appropriate  
- ReentrancyGuard
- Proper access controls
- Safe math (Solidity 0.8+)
- Detailed NatSpec comments

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation outside the JSON."""


async def call_groq(prompt: str) -> dict:
    """Call Groq API and return parsed JSON response"""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set in environment variables.")
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Analyze this smart contract:\n\n```solidity\n{prompt}\n```"},
                ],
                "temperature": 0.2,
                "max_tokens": 8192,
                "response_format": {"type": "json_object"},
            },
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Groq API error: {response.status_code} — {response.text}"
            )
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=500, detail=f"Failed to parse Groq response as JSON: {e}")


@router.post("/analyze", response_model=None)
async def analyze_contract(request: ContractAnalysisRequest):
    """
    Analyze a smart contract for vulnerabilities and generate improvement suggestions.
    Accessible to all authenticated roles.
    """
    if not request.code or len(request.code.strip()) < 20:
        raise HTTPException(status_code=400, detail="Contract code is too short or empty.")

    if len(request.code) > 50_000:
        raise HTTPException(status_code=400, detail="Contract code exceeds 50,000 character limit.")

    try:
        result = await call_groq(request.code)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    # Ensure all expected fields exist with fallbacks
    return {
        "filename": request.filename or "contract.sol",
        "summary": result.get("summary", "No summary available"),
        "severity_score": int(result.get("severity_score", 0)),
        "vulnerabilities": result.get("vulnerabilities", []),
        "simulation_results": result.get("simulation_results", []),
        "mermaid_diagram": result.get("mermaid_diagram", "flowchart TD\n    A[Contract] --> B[No diagram generated]"),
        "improved_code": result.get("improved_code", "// No improved code generated"),
        "recommendations": result.get("recommendations", []),
    }


@router.post("/analyze-file", response_model=None)
async def analyze_contract_file(file: UploadFile = File(...)):
    """
    Upload a .sol file and analyze it.
    Accessible to all authenticated roles.
    """
    if not file.filename.endswith((".sol", ".txt", ".vy")):
        raise HTTPException(status_code=400, detail="Only .sol, .txt, or .vy files are supported.")

    content = await file.read()
    try:
        code = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be a valid UTF-8 text file.")

    if len(code.strip()) < 20:
        raise HTTPException(status_code=400, detail="Uploaded contract is too short or empty.")

    if len(code) > 50_000:
        raise HTTPException(status_code=400, detail="Contract file exceeds 50,000 character limit.")

    try:
        result = await call_groq(code)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    return {
        "filename": file.filename,
        "summary": result.get("summary", "No summary available"),
        "severity_score": int(result.get("severity_score", 0)),
        "vulnerabilities": result.get("vulnerabilities", []),
        "simulation_results": result.get("simulation_results", []),
        "mermaid_diagram": result.get("mermaid_diagram", "flowchart TD\n    A[Contract] --> B[No diagram generated]"),
        "improved_code": result.get("improved_code", "// No improved code generated"),
        "recommendations": result.get("recommendations", []),
    }


@router.get("/scenarios")
async def get_attack_scenarios():
    """Return the list of attack scenarios that are simulated"""
    return {
        "scenarios": [
            {"id": "reentrancy", "name": "Reentrancy Attack", "description": "Recursive external calls before state updates", "severity": "CRITICAL"},
            {"id": "overflow", "name": "Integer Overflow/Underflow", "description": "Arithmetic exceeding uint bounds", "severity": "HIGH"},
            {"id": "access_control", "name": "Access Control Bypass", "description": "Missing or weak permission checks", "severity": "CRITICAL"},
            {"id": "flash_loan", "name": "Flash Loan Attack", "description": "Manipulating state within a single atomic transaction", "severity": "HIGH"},
            {"id": "front_running", "name": "Front-Running / MEV", "description": "Transaction ordering exploitation", "severity": "MEDIUM"},
            {"id": "oracle", "name": "Oracle Manipulation", "description": "Price feed manipulation via DEX manipulation", "severity": "HIGH"},
            {"id": "dos", "name": "Denial of Service", "description": "Blocking contract functionality", "severity": "HIGH"},
            {"id": "timestamp", "name": "Timestamp Manipulation", "description": "Miner-controlled block.timestamp exploitation", "severity": "MEDIUM"},
            {"id": "delegatecall", "name": "Delegate Call Vulnerability", "description": "Storage collision via delegatecall", "severity": "CRITICAL"},
            {"id": "phishing", "name": "Phishing via tx.origin", "description": "tx.origin auth bypass in phishing scenario", "severity": "HIGH"},
        ]
    }
