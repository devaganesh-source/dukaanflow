
"""Media upload tests never contact Google."""

import base64

import pytest
from fastapi.testclient import TestClient

from app.auth import require_retailer
from app.main import app
from app import media_orders


URL = "/api/text-orders/transcribe-media"


def request(
    kind="photo",
    mime="image/png",
    data=None,
):
    if data is None:
        data = (
            b"\x89PNG\r\n\x1a\n"
            + b"x" * 48
        )

    return {
        "kind": kind,
        "mime_type": mime,
        "data_base64": base64.b64encode(
            data
        ).decode(),
    }


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv(
        "TEXT_ORDER_AI_ENABLED",
        "true",
    )

    monkeypatch.setenv(
        "GEMINI_API_KEY",
        "fake-test-key",
    )

    app.dependency_overrides[
        require_retailer
    ] = lambda: object()

    try:
        with TestClient(app) as instance:
            yield instance
    finally:
        app.dependency_overrides.clear()


def test_photo_transcript_needs_review(
    client,
    monkeypatch,
):
    monkeypatch.setattr(
        media_orders,
        "extract_transcript",
        lambda *args: "5 peti biscuit",
    )

    response = client.post(
        URL,
        json=request(),
    )

    assert response.status_code == 200

    assert response.json() == {
        "kind": "photo",
        "transcript": "5 peti biscuit",
        "source": "gemini",
        "confirmation_required": True,
    }

    assert (
        response.headers["cache-control"]
        == "private, no-store"
    )


def test_voice_transcript_needs_review(
    client,
    monkeypatch,
):
    def fake(*args):
        assert args[0] == "voice"
        return "2 peti washing powder"

    monkeypatch.setattr(
        media_orders,
        "extract_transcript",
        fake,
    )

    response = client.post(
        URL,
        json=request(
            "voice",
            "audio/webm",
            b"x" * 48,
        ),
    )

    assert response.status_code == 200

    assert (
        response.json()["transcript"]
        == "2 peti washing powder"
    )


@pytest.mark.parametrize(
    "payload",
    [
        request(
            kind="photo",
            mime="audio/webm",
        ),
        request(
            kind="voice",
            mime="image/png",
        ),
        request(
            data=b"BAD!" * 12,
        ),
        {
            "kind": "photo",
            "mime_type": "image/png",
            "data_base64": "not-base64",
        },
        {
            "kind": "photo",
            "mime_type": "image/png",
            "data_base64": "",
        },
        {
            "kind": "video",
            "mime_type": "image/png",
            "data_base64": "QUFBQQ==",
        },
        dict(
            **request(),
            extra="unexpected",
        ),
    ],
)
def test_rejects_bad_media(client, payload):
    response = client.post(
        URL,
        json=payload,
    )

    assert response.status_code in (
        413,
        422,
    )


def test_rejects_oversized_media(client):
    payload = request(
        data=(
            b"\x89PNG\r\n\x1a\n"
            + b"x" * (3 * 1024 * 1024)
        ),
    )

    assert (
        client.post(
            URL,
            json=payload,
        ).status_code
        in (413, 422)
    )


def test_missing_gemini_configuration(
    client,
    monkeypatch,
):
    monkeypatch.delenv(
        "GEMINI_API_KEY"
    )

    assert (
        client.post(
            URL,
            json=request(),
        ).status_code
        == 503
    )

    monkeypatch.setenv(
        "GEMINI_API_KEY",
        "test",
    )

    monkeypatch.setenv(
        "TEXT_ORDER_AI_ENABLED",
        "false",
    )

    assert (
        client.post(
            URL,
            json=request(),
        ).status_code
        == 503
    )


def test_upstream_failure_is_safe(
    client,
    monkeypatch,
):
    def unavailable(*args):
        raise ValueError(
            "bad secret stack detail"
        )

    monkeypatch.setattr(
        media_orders,
        "extract_transcript",
        unavailable,
    )

    response = client.post(
        URL,
        json=request(),
    )

    assert response.status_code == 503

    assert "secret" not in response.text


def test_login_is_required(client):
    app.dependency_overrides.pop(
        require_retailer
    )

    assert (
        client.post(
            URL,
            json=request(),
        ).status_code
        == 401
    )


def test_request_cannot_transcribe_and_place_order(
    client,
    monkeypatch,
):
    monkeypatch.setattr(
        media_orders,
        "extract_transcript",
        lambda *args: "1 peti tea",
    )

    response = client.post(
        URL,
        json=request(),
    )

    assert "order_id" not in response.json()
    assert "selected_sku" not in response.json()
