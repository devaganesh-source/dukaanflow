
import hashlib
import hmac
import os
import secrets
import time

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import OTPChallenge, User, UserSession

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "dukaanflow_session"
SESSION_SECONDS = 8 * 60 * 60
OTP_SECONDS = 5 * 60
LOCK_SECONDS = 10 * 60
RESEND_SECONDS = 60


class OTPRequest(BaseModel):
    phone: str = Field(pattern=r"^[0-9]{10}$")


class OTPVerify(OTPRequest):
    otp: str = Field(pattern=r"^[0-9]{6}$")


def demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"


def auth_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(503, "Authentication is not configured")
    return secret.encode()


def demo_otp() -> str:
    if not demo_mode():
        raise HTTPException(503, "OTP delivery is not configured")

    otp = os.getenv("DEMO_OTP", "")
    if len(otp) != 6 or not otp.isascii() or not otp.isdigit():
        raise HTTPException(503, "Demo OTP is not configured")

    return otp


def otp_hash(user_id: int, code: str, secret: bytes) -> str:
    value = f"{user_id}:{code}".encode()
    return hmac.new(secret, value, hashlib.sha256).hexdigest()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def cookie_secure() -> bool:
    return os.getenv("COOKIE_SECURE", "true").lower() != "false"


@router.post("/request-otp")
def request_otp(
    body: OTPRequest,
    db: Session = Depends(get_db),
):
    code = demo_otp()
    secret = auth_secret()
    now = int(time.time())

    user = db.scalar(
        select(User).where(
            User.phone == body.phone,
            User.is_active.is_(True),
        )
    )

    message = {
        "message": "If the account exists, a verification challenge is ready."
    }

    if user is None:
        return message

    challenge = db.scalar(
        select(OTPChallenge).where(
            OTPChallenge.user_id == user.id
        )
    )

    if challenge is not None:
        if challenge.locked_until and challenge.locked_until > now:
            raise HTTPException(
                429, "Too many attempts. Try again later."
            )

        if challenge.locked_until and challenge.locked_until <= now:
            challenge.locked_until = None
            challenge.failed_attempts = 0

        remaining = RESEND_SECONDS - (now - challenge.last_sent_at)

        if remaining > 0:
            raise HTTPException(
                429,
                "Wait before requesting another code",
                headers={"Retry-After": str(remaining)},
            )

        challenge.otp_hash = otp_hash(user.id, code, secret)
        challenge.expires_at = now + OTP_SECONDS
        challenge.last_sent_at = now
    else:
        db.add(
            OTPChallenge(
                user_id=user.id,
                otp_hash=otp_hash(user.id, code, secret),
                expires_at=now + OTP_SECONDS,
                failed_attempts=0,
                locked_until=None,
                last_sent_at=now,
            )
        )

    db.commit()
    return message


@router.post("/verify-otp")
def verify_otp(
    body: OTPVerify,
    response: Response,
    db: Session = Depends(get_db),
):
    demo_otp()
    secret = auth_secret()
    now = int(time.time())

    user = db.scalar(
        select(User).where(
            User.phone == body.phone,
            User.is_active.is_(True),
        )
    )

    challenge = (
        db.scalar(
            select(OTPChallenge).where(
                OTPChallenge.user_id == user.id
            )
        )
        if user is not None
        else None
    )

    if challenge is None:
        raise HTTPException(401, "Invalid or expired code")

    if challenge.locked_until and challenge.locked_until > now:
        raise HTTPException(
            429, "Too many attempts. Try again later."
        )

    if challenge.locked_until and challenge.locked_until <= now:
        challenge.locked_until = None
        challenge.failed_attempts = 0

    if now >= challenge.expires_at:
        db.commit()
        raise HTTPException(401, "Invalid or expired code")

    expected_hash = otp_hash(user.id, body.otp, secret)

    if not hmac.compare_digest(challenge.otp_hash, expected_hash):
        challenge.failed_attempts += 1

        if challenge.failed_attempts >= 5:
            challenge.locked_until = now + LOCK_SECONDS

        db.commit()
        raise HTTPException(401, "Invalid or expired code")

    token = secrets.token_urlsafe(32)

    db.delete(challenge)

    db.add(
        UserSession(
            token_hash=token_hash(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + SESSION_SECONDS,
        )
    )

    db.commit()

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        path="/",
    )

    return {
        "id": user.id,
        "name": user.name,
        "role": user.role,
    }


def current_user(
    dukaanflow_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not dukaanflow_session:
        raise HTTPException(401, "Login required")

    session = db.get(
        UserSession, token_hash(dukaanflow_session)
    )

    if session is None:
        raise HTTPException(401, "Login required")

    if session.expires_at <= int(time.time()):
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Session expired")


    user = db.get(User, session.user_id)

    if user is None or not user.is_active:
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Login required")

    return user



@router.get("/me")
def me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "role": user.role,
    }



def require_retailer(
    user: User = Depends(current_user),
) -> User:
    if user.role != "retailer":
        raise HTTPException(
            status_code=403,
            detail="Retailer access required",
        )

    return user


def require_order_desk(
    user: User = Depends(current_user),
) -> User:
    if user.role != "order_desk":
        raise HTTPException(
            status_code=403,
            detail="Order desk access required",
        )

    return user


@router.post("/logout")
def logout(
    response: Response,
    dukaanflow_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if dukaanflow_session:
        session = db.get(
            UserSession, token_hash(dukaanflow_session)
        )

        if session:
            db.delete(session)
            db.commit()

    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=cookie_secure(),
        httponly=True,
        samesite="lax",
    )

    return {"message": "Logged out"}