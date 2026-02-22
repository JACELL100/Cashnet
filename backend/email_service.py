"""
Email Service — Threat Alert Notifications
============================================
Sends threat alert emails to all registered ADMIN accounts via SMTP.
Supports Gmail App Passwords and any SMTP relay.
Rate-limited to prevent email storms during cascading events.
"""

import asyncio
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, List, Optional
from collections import defaultdict


# Rate-limit: max 1 email per alert type per 60 seconds
_last_email_time: Dict[str, float] = defaultdict(float)
_EMAIL_COOLDOWN = 60.0  # seconds between emails of the same alert type

# In-memory notification log (last 200 sent emails for the API)
_sent_notifications: List[Dict[str, Any]] = []
_MAX_NOTIFICATION_LOG = 200


def _get_settings():
    try:
        from config import settings
        return settings
    except Exception:
        return None


def _get_admin_emails() -> List[str]:
    """Fetch all ADMIN account emails from the database."""
    try:
        from database import SessionLocal
        from models import AdminAuditor, AdminAuditorRoleEnum
        db = SessionLocal()
        try:
            admins = db.query(AdminAuditor).filter(
                AdminAuditor.role == AdminAuditorRoleEnum.ADMIN
            ).all()
            emails = list(set(a.email for a in admins if a.email))
            return emails
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️  email_service: failed to fetch admin emails: {e}")
        return []


def _build_html(alert_data: Dict[str, Any], groq_analysis: Optional[Dict[str, Any]] = None) -> str:
    """Build a styled HTML email body for a threat alert."""
    severity = alert_data.get("severity", "MEDIUM")
    alert_type = alert_data.get("type", alert_data.get("alert_type", "unknown"))
    description = alert_data.get("description", "No description")
    agent_id = alert_data.get("agent_id", "unknown")
    timestamp = alert_data.get("timestamp", "")

    sev_colors = {
        "LOW": "#22c55e",
        "MEDIUM": "#f0a500",
        "HIGH": "#ff3860",
        "CRITICAL": "#ff0033",
    }
    sev_color = sev_colors.get(severity.upper(), "#64748b")

    groq_section = ""
    if groq_analysis and groq_analysis.get("is_attack"):
        groq_section = f"""
        <div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-left: 3px solid #b367ff; border-radius: 4px;">
            <div style="font-size: 11px; color: #b367ff; font-weight: bold; margin-bottom: 6px;">🤖 GROQ AI ANALYSIS (llama-3.3-70b-versatile)</div>
            <div style="font-size: 13px; color: #e0e0e0;">
                <strong>Threat Type:</strong> {groq_analysis.get('threat_type', 'N/A')}<br/>
                <strong>AI Severity:</strong> {groq_analysis.get('severity', 'N/A').upper()}<br/>
                <strong>Recommendation:</strong> {groq_analysis.get('recommendation', 'N/A')}
            </div>
        </div>
        """

    return f"""
    <div style="font-family: 'Courier New', monospace; background: #0a0a1a; color: #e0e0e0; padding: 24px; border-radius: 8px; max-width: 600px;">
        <div style="border-bottom: 1px solid #333; padding-bottom: 16px; margin-bottom: 16px;">
            <div style="font-size: 18px; font-weight: bold; color: #ff3860;">⚠ CashNet Threat Alert</div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">Automated DeFi Threat Detection System</div>
        </div>

        <div style="padding: 12px; background: {sev_color}1a; border: 1px solid {sev_color}; border-radius: 6px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; font-weight: bold; color: {sev_color};">{severity.upper()} — {alert_type.replace('_', ' ').title()}</span>
            </div>
        </div>

        <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: #888;">Description</div>
            <div style="font-size: 13px; color: #e0e0e0; margin-top: 4px;">{description}</div>
        </div>

        <div style="display: flex; gap: 24px; margin-bottom: 12px;">
            <div>
                <div style="font-size: 11px; color: #888;">Agent</div>
                <div style="font-size: 12px; color: #00d4ff;">{agent_id}</div>
            </div>
            <div>
                <div style="font-size: 11px; color: #888;">Timestamp</div>
                <div style="font-size: 12px; color: #e0e0e0;">{timestamp}</div>
            </div>
        </div>

        {groq_section}

        <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #333; font-size: 10px; color: #666;">
            This is an automated alert from CashNet Threat Monitor.<br/>
            Log in to the Admin Dashboard → Threats page for full details.
        </div>
    </div>
    """


async def send_threat_alert_email(
    alert_data: Dict[str, Any],
    groq_analysis: Optional[Dict[str, Any]] = None,
    force: bool = False,
) -> bool:
    """
    Send a threat alert email to all registered admins.
    Rate-limited by alert_type to prevent email storms.
    Returns True if email was sent, False if skipped/failed.
    """
    s = _get_settings()
    if not s:
        return False

    if not s.alert_email_enabled:
        return False

    if not s.smtp_user or not s.smtp_password:
        # SMTP not configured — skip silently
        return False

    alert_type = alert_data.get("type", alert_data.get("alert_type", "unknown"))
    severity = alert_data.get("severity", "MEDIUM").upper()

    # Only email for HIGH and CRITICAL alerts
    if severity not in ("HIGH", "CRITICAL") and not force:
        return False

    # Rate-limit per alert type
    now = time.time()
    if not force and (now - _last_email_time[alert_type]) < _EMAIL_COOLDOWN:
        return False

    admin_emails = _get_admin_emails()
    if not admin_emails:
        return False

    # Build email
    subject = f"[{severity}] CashNet Alert: {alert_type.replace('_', ' ').title()}"
    html_body = _build_html(alert_data, groq_analysis)

    def _send():
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{s.smtp_from_name} <{s.smtp_user}>"
            msg["To"] = ", ".join(admin_emails)
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(s.smtp_user, s.smtp_password)
                server.sendmail(s.smtp_user, admin_emails, msg.as_string())

            return True
        except Exception as e:
            print(f"⚠️  email_service: SMTP send failed: {e}")
            return False

    # Run in executor to not block the event loop
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, _send)

    if success:
        _last_email_time[alert_type] = now
        notification = {
            "type": "email",
            "alert_type": alert_type,
            "severity": severity,
            "recipients": admin_emails,
            "subject": subject,
            "timestamp": now,
            "groq_analysis": bool(groq_analysis),
        }
        _sent_notifications.append(notification)
        if len(_sent_notifications) > _MAX_NOTIFICATION_LOG:
            _sent_notifications.pop(0)
        print(f"📧 Threat alert email sent to {len(admin_emails)} admin(s): {subject}")

    return success


def get_sent_notifications(limit: int = 50) -> List[Dict[str, Any]]:
    """Get log of recently sent email notifications."""
    return _sent_notifications[-limit:]


def get_email_config_status() -> Dict[str, Any]:
    """Get email configuration status (without exposing secrets)."""
    s = _get_settings()
    if not s:
        return {"configured": False}
    return {
        "configured": bool(s.smtp_user and s.smtp_password),
        "enabled": s.alert_email_enabled,
        "smtp_host": s.smtp_host,
        "smtp_port": s.smtp_port,
        "from_name": s.smtp_from_name,
        "from_email": s.smtp_user if s.smtp_user else None,
        "total_sent": len(_sent_notifications),
    }
