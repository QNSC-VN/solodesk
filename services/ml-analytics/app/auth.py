"""
Same pre-shared-secret, constant-time-compared mechanism as backend-api's
InternalServiceGuard — the 2nd consumer of that mechanism (1st:
connector-hub -> backend-api). Deliberately narrow: gates every route in
this service (there is no per-user JWT path here at all — this whole
service is only ever called service-to-service, from inside an
agent-orchestrator Temporal Activity, never directly by a browser).
"""

import hmac

from fastapi import Header, HTTPException, status

from app.config import settings


async def require_internal_service_token(x_internal_service_token: str | None = Header(default=None)) -> None:
    if x_internal_service_token is None or not hmac.compare_digest(x_internal_service_token, settings.internal_service_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing or incorrect X-Internal-Service-Token header.")
