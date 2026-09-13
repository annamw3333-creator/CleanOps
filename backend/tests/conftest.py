import os
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")

def _read_env_file(path: Path) -> None:
    global BASE_URL
    if BASE_URL or not path.exists():
        return
    for line in path.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("EXPO_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

if not BASE_URL:
    here = Path(__file__).resolve()
    _read_env_file(here.parents[2] / "frontend" / ".env")
    _read_env_file(Path("/app/frontend/.env"))

BASE_URL = (BASE_URL or "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_url():
    return API


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
