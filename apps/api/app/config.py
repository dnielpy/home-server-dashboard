from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    bluetti_api_url: str = "http://localhost:3001"
    homenet_api_url: str = "http://localhost:3011"
    localtube_api_url: str = "http://localhost:8000"
    localtube_service_token: str | None = None
    # The agent that runs on the server itself and updates the projects (apps/agent)
    agent_url: str = "http://localhost:3022"
    # The Nano's current speed takes up to 5 seconds to read
    upstream_timeout_seconds: float = 8
    # Where Sender keeps the packages until they are downloaded; a folder on the external disk in production
    sender_dir: str = "./data/sender"


@lru_cache
def get_settings() -> Settings:
    return Settings()
