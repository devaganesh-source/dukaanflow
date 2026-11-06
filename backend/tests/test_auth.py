
import pytest

import time

from sqlalchemy import select

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import  OTPChallenge, User, UserSession


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("DEMO_OTP", "654321")
    monkeypatch.setenv("SESSION_SECRET", "z" * 40)
    monkeypatch.setenv("COOKIE_SECURE", "false")

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add(
            User(
                phone="9000000001",
                name="Demo Retailer",
                role="retailer",
            )
        )
        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_db

    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.fixture
def auth_db(client):
    provider = app.dependency_overrides[get_db]()
    db = next(provider)

    try:
        yield db
    finally:
        provider.close()


def test_request_otp_does_not_leak_code(client):
    response = client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    assert response.status_code == 200
    assert "654321" not in response.text

    repeated = client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    assert repeated.status_code == 429


def test_login_session_and_logout(client):
    assert client.get("/api/auth/me").status_code == 401

    requested = client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )
    assert requested.status_code == 200

    verified = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    assert verified.status_code == 200
    assert verified.json()["role"] == "retailer"

    cookie = verified.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie

    assert client.get("/api/auth/me").status_code == 200

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_bad_otp_locks_account(client):
    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    for _ in range(5):
        response = client.post(
            "/api/auth/verify-otp",
            json={
                "phone": "9000000001",
                "otp": "000000",
            },
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    assert blocked.status_code == 429


def test_demo_mode_disabled(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")

    response = client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    assert response.status_code == 503

def test_expired_otp_is_rejected(client, auth_db):
    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    challenge = auth_db.scalar(select(OTPChallenge))
    challenge.expires_at = int(time.time()) - 1
    auth_db.commit()

    response = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_expired_lockout_allows_new_otp(client, auth_db):
    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    challenge = auth_db.scalar(select(OTPChallenge))
    now = int(time.time())

    challenge.failed_attempts = 5
    challenge.locked_until = now - 1
    challenge.last_sent_at = now - 61
    challenge.expires_at = now - 1
    auth_db.commit()

    response = client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    assert response.status_code == 200

    auth_db.refresh(challenge)
    assert challenge.failed_attempts == 0
    assert challenge.locked_until is None

    verified = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    assert verified.status_code == 200


def test_expired_session_is_rejected(client, auth_db):
    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    session = auth_db.scalar(select(UserSession))
    assert session is not None

    session.expires_at = int(time.time()) - 1
    auth_db.commit()

    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_inactive_user_loses_access(client, auth_db):
    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    user = auth_db.scalar(select(User))
    user.is_active = False
    auth_db.commit()

    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/products").status_code == 401


def test_secure_cookie_attributes(client, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "true")

    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    response = client.post(
        "/api/auth/verify-otp",
        json={
            "phone": "9000000001",
            "otp": "654321",
        },
    )

    assert response.status_code == 200

    cookie = response.headers["set-cookie"].lower()

    assert "secure" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=28800" in cookie


def test_otp_cannot_be_reused(client):
    client.post(
        "/api/auth/request-otp",
        json={"phone": "9000000001"},
    )

    payload = {
        "phone": "9000000001",
        "otp": "654321",
    }

    first = client.post(
        "/api/auth/verify-otp",
        json=payload,
    )

    second = client.post(
        "/api/auth/verify-otp",
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 401
