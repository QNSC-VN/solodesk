"""
Validated at boot, fail fast — same convention as the other 3 services'
env.schema.ts (pydantic-settings is the Python-ecosystem equivalent of
zod here). Every new env var goes here AND in .env.example AND (once CI
exists for this service — see CLAUDE.md's honest gap note) in CI.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 3003

    # The app's own runtime connection — must be solodesk_ml (SELECT-only
    # on sales.orders), never DATABASE_ADMIN_URL.
    database_url: str

    # Service-to-service auth — same shared secret as backend-api's/
    # connector-hub's INTERNAL_SERVICE_TOKEN.
    internal_service_token: str


settings = Settings()  # type: ignore[call-arg]  # pydantic-settings reads required fields from the environment
