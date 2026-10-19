"""Freezer Watch web app.

The dashboard replays the February 2019 freeze. Sign-in is a signed session
cookie. Demo accounts are seeded below; set SESSION_SECRET before any shared
deploy. Role checks match freezerWatch/metadata.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from access import AccessError, can_see_freezers, decide, dollars_for, money

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "web" / "dist"
SEED = ROOT / "seed"
DATA = ROOT.parent / "data"
ORIGIN = datetime(2019, 1, 20, 0, 0)
COOKIE = "fw_session"
MAX_AGE = 60 * 60 * 12
SECRET = os.environ.get("SESSION_SECRET", "freezer-watch-dev-secret").encode()

# Seeded demo accounts for the three metadata roles. Not a production directory.
PASSWORDS = {
    "officer": "capitol-2019",
    "labmgr-chemistry": "babcock-2019",
    "viewer": "lakeshore",
}

USERS = {
    "officer": {
        "id": "officer",
        "name": "Facilities Officer",
        "role": "FacilitiesOfficer",
        "buildingId": None,
    },
    "labmgr-chemistry": {
        "id": "labmgr-chemistry",
        "name": "Chemistry Lab Manager",
        "role": "LabManager",
        "buildingId": "chemistry",
    },
    "viewer": {
        "id": "viewer",
        "name": "Viewer",
        "role": "Viewer",
        "buildingId": None,
    },
}

ALIASES = {
    "officer": "officer",
    "officer@wisc.edu": "officer",
    "labmgr-chemistry": "labmgr-chemistry",
    "chemistry@wisc.edu": "labmgr-chemistry",
    "viewer": "viewer",
    "viewer@wisc.edu": "viewer",
}

ACCOUNTS = Path(__file__).resolve().parent / "accounts.json"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_accounts_lock = threading.Lock()


def _save_accounts() -> None:
    rows = [user for user in USERS.values() if user.get("passwordHash")]
    ACCOUNTS.write_text(json.dumps({"users": rows}, indent=2), encoding="utf-8")


def _remember(row: dict) -> None:
    USERS[row["id"]] = row
    ALIASES[row["email"]] = row["id"]


def load_accounts() -> None:
    if not ACCOUNTS.is_file():
        return
    payload = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    for row in payload.get("users", []):
        if row.get("id") and row["id"] not in USERS:
            _remember(row)


load_accounts()

JUMPS = {
    "deepFreeze": "2019-01-30T09:00",
    "outage": "2019-02-02T09:00",
    "thaw": "2019-02-03T12:00",
}


def iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M")


def parse_ts(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M")


def level_text(level: str) -> str:
    return {"green": "GREEN", "yellow": "YELLOW", "red": "RED"}[level]


def temp_text(value: float) -> str:
    return f"{value:.1f}°C"


class AppState:
    def __init__(self) -> None:
        payload = json.loads((SEED / "replay.json").read_text(encoding="utf-8"))
        self.scores = {}
        for row in payload["riskScores"]:
            self.scores[(row["building"], row["timestamp"])] = row
        self.plans = payload["plans"]
        self.summary = payload["summary"]
        packed = np.load(SEED / "temps.npz")
        self.temps = packed["temps"]
        self.order = [str(item) for item in packed["order"].tolist()]
        self.order_index = {fid: index for index, fid in enumerate(self.order)}
        self.buildings = {}
        self.freezers = []
        self._load_tables()
        self.weather = {}
        self._load_weather()

    def _load_tables(self) -> None:
        import csv

        with (DATA / "buildings.csv").open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                self.buildings[row["building_id"]] = row
        with (DATA / "freezers.csv").open(encoding="utf-8") as handle:
            self.freezers = list(csv.DictReader(handle))
        with (DATA / "validation_2019.csv").open(encoding="utf-8") as handle:
            damage = {row["building_id"]: row for row in csv.DictReader(handle)}
        for building_id, row in self.buildings.items():
            hit = damage.get(building_id)
            row["damaged2019"] = "true" if hit else "unknown"
            row["damageType"] = hit["damage_type"] if hit else ""
            row["damageSource"] = "Wisconsin State Journal" if hit else ""
            row["damageSourceUrl"] = (
                "https://madison.com/wsj/news/local/education/university/"
                "flooding-damages-uw-madison-s-vilas-hall-and-chemistry-building/"
                "article_eb933384-3461-5cf5-a10c-92e71eb36689.html"
                if hit
                else ""
            )

    def _load_weather(self) -> None:
        import csv

        with (DATA / "weather_hourly.csv").open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                self.weather[row["timestamp"]] = {
                    "tempF": float(row["temp_f"]),
                    "precipIn": float(row["precip_in"]),
                }

    def visible_plans(self, at: str) -> list[dict]:
        visible = [
            plan
            for plan in self.plans
            if plan["status"] == "pending" and plan["createdAt"] <= at
        ]
        visible.sort(
            key=lambda plan: (
                -float(self.scores[(plan["building"], plan["createdAt"])]["dollarsAtRisk"]),
                -int(plan["maxIrreplaceability"]),
                plan["building"],
                plan["createdAt"],
            )
        )
        return visible

    def pins(self, at: str) -> list[dict]:
        rows = []
        for building_id, building in self.buildings.items():
            score = self.scores.get((building_id, at))
            if score is None:
                continue
            rows.append(
                {
                    "id": building_id,
                    "name": building["name"],
                    "latitude": float(building["latitude"]),
                    "longitude": float(building["longitude"]),
                    "level": score["level"],
                    "levelText": level_text(score["level"]),
                    "score": score["score"],
                }
            )
        rows.sort(key=lambda row: (-row["score"], row["name"]))
        return rows

    def decided_plans(self) -> list[dict]:
        rows = [plan for plan in self.plans if plan["status"] in ("approved", "rejected")]
        rows.sort(key=lambda plan: str(plan.get("decidedAt") or ""), reverse=True)
        decided = []
        for plan in rows[:8]:
            when = plan.get("decidedAt")
            if isinstance(when, datetime):
                when = when.strftime("%Y-%m-%d %H:%M")
            decided.append(
                {
                    "id": plan["id"],
                    "buildingName": self.buildings[plan["building"]]["name"],
                    "status": plan["status"],
                    "decidedBy": plan.get("decidedBy") or "",
                    "decidedAt": when or "",
                }
            )
        return decided

    def detail(self, user: dict, building_id: str, at: str) -> dict | None:
        building = self.buildings.get(building_id)
        score = self.scores.get((building_id, at))
        if building is None or score is None:
            return None
        owned = [row for row in self.freezers if row["building_id"] == building_id]
        flagged = set(score["flaggedFreezers"])
        if not owned:
            freezers = []
            message = "No freezers in this building"
        elif not can_see_freezers(user, building_id):
            freezers = []
            message = "No freezers you can view"
        else:
            message = None
            freezers = []
            for row in owned:
                latest = self.latest_median(row["freezer_id"], at)
                freezers.append(
                    {
                        "id": row["freezer_id"],
                        "lab": row["lab_label"],
                        "temp": None if latest is None else temp_text(latest),
                        "value": money(float(row["value_usd"])),
                        "flagged": row["freezer_id"] in flagged,
                    }
                )
        return {
            "id": building_id,
            "name": building["name"],
            "score": score["score"],
            "level": score["level"],
            "levelText": level_text(score["level"]),
            "reasons": score["reasons"],
            "dollars": dollars_for(user, float(score["dollarsAtRisk"])),
            "onGenerator": building["on_generator"].strip().lower() == "true",
            "yearBuilt": int(building["year_built"]),
            "damaged2019": building["damaged2019"],
            "damageType": building["damageType"],
            "damageSource": building["damageSource"],
            "damageSourceUrl": building["damageSourceUrl"],
            "freezers": freezers,
            "freezerMessage": message,
        }

    def latest_median(self, freezer_id: str, at: str) -> float | None:
        end = int((parse_ts(at) - ORIGIN).total_seconds() // 60)
        start = end - 59
        if start < 0 or end >= self.temps.shape[1]:
            return None
        index = self.order_index[freezer_id]
        return float(np.median(self.temps[index, start : end + 1]))

    def series(self, user: dict, freezer_id: str, at: str) -> dict:
        freezer = next((row for row in self.freezers if row["freezer_id"] == freezer_id), None)
        if freezer is None or not can_see_freezers(user, freezer["building_id"]):
            return {"freezerId": freezer_id, "points": []}
        end = int((parse_ts(at) - ORIGIN).total_seconds() // 60)
        start = max(0, end - 48 * 60)
        index = self.order_index[freezer_id]
        points = []
        for minute in range(start, end + 1):
            points.append(
                {
                    "t": iso(ORIGIN + timedelta(minutes=minute)),
                    "c": round(float(self.temps[index, minute]), 2),
                }
            )
        return {"freezerId": freezer_id, "points": points}

    def state(self, user: dict, at: str, building_id: str | None) -> dict:
        pin_rows = self.pins(at)
        if building_id not in self.buildings:
            building_id = pin_rows[0]["id"] if pin_rows else None
        red = sum(1 for pin in pin_rows if pin["level"] == "red")
        dollars = 0.0
        for pin in pin_rows:
            dollars += float(self.scores[(pin["id"], at)]["dollarsAtRisk"])
        plans = []
        for index, plan in enumerate(self.visible_plans(at), start=1):
            score = self.scores[(plan["building"], plan["createdAt"])]
            steps = []
            for text, cites in zip(plan["steps"], plan["citations"]):
                steps.append({"text": text, "citations": [c for c in cites.split("|") if c]})
            plans.append(
                {
                    "id": plan["id"],
                    "rank": index,
                    "buildingId": plan["building"],
                    "buildingName": self.buildings[plan["building"]]["name"],
                    "dollars": dollars_for(user, float(score["dollarsAtRisk"])),
                    "steps": steps,
                }
            )
        weather = self.weather.get(at, {"tempF": None, "precipIn": None})
        return {
            "at": at,
            "user": public_user(user),
            "weather": weather,
            "summary": {
                "red": red,
                "dollars": dollars_for(user, dollars),
                "pending": len(plans),
            },
            "buildings": pin_rows,
            "selectedId": building_id,
            "detail": None if building_id is None else self.detail(user, building_id, at),
            "plans": plans,
            "decided": self.decided_plans(),
            "jumps": JUMPS,
            "firstRed": self.summary["firstRed"],
        }

    def act(self, user: dict, plan_id: str, status: str) -> dict:
        plan = next((item for item in self.plans if item["id"] == plan_id), None)
        if plan is None:
            raise KeyError(plan_id)
        decide(plan, user, status, datetime.now().replace(microsecond=0))
        return {"id": plan["id"], "status": plan["status"], "decidedBy": plan["decidedBy"]}


ROLE_LABELS = {
    "FacilitiesOfficer": "Facilities Officer",
    "LabManager": "Lab Manager",
    "Viewer": "Viewer",
}


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "role": user["role"],
        "roleLabel": ROLE_LABELS.get(user["role"], user["role"]),
        "canDecide": user["role"] == "FacilitiesOfficer",
    }


def issue_token(user_id: str) -> str:
    exp = int(time.time()) + MAX_AGE
    body = f"{user_id}|{exp}"
    sig = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}|{sig}"


def read_token(token: str | None) -> str | None:
    if not token or token.count("|") < 2:
        return None
    body, sig = token.rsplit("|", 1)
    user_id, exp = body.rsplit("|", 1)
    if user_id not in USERS:
        return None
    expected = hmac.new(SECRET, f"{user_id}|{exp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        if int(exp) < time.time():
            return None
    except ValueError:
        return None
    return user_id


def password_ok(user_id: str, password: str) -> bool:
    user = USERS[user_id]
    stored = user.get("passwordHash")
    if stored:
        given = hashlib.sha256(f"{user['salt']}:{password}".encode()).hexdigest()
        return hmac.compare_digest(stored, given)
    expected = hashlib.sha256(PASSWORDS[user_id].encode()).digest()
    given = hashlib.sha256(password.encode()).digest()
    return hmac.compare_digest(expected, given)


def current_user(request: Request) -> dict | None:
    user_id = read_token(request.cookies.get(COOKIE))
    if user_id is None:
        return None
    return USERS[user_id]


def signed_in(user: dict) -> JSONResponse:
    response = JSONResponse({"ok": True, "user": public_user(user)})
    response.set_cookie(
        COOKIE,
        issue_token(user["id"]),
        max_age=MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
        secure=os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes"),
    )
    return response


async def read_body(request: Request) -> dict | None:
    try:
        body = await request.json()
    except Exception:
        return None
    if not isinstance(body, dict):
        return None
    return body


APP = AppState()
app = FastAPI(title="IceBreaker")


@app.middleware("http")
async def no_store(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/assets"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/me")
def me(request: Request):
    user = current_user(request)
    if user is None:
        return JSONResponse({"error": "sign in required"}, status_code=401)
    return public_user(user)


@app.post("/api/login")
async def login(request: Request):
    body = await read_body(request)
    if body is None:
        return JSONResponse({"error": "bad json"}, status_code=400)
    name = str(body.get("username") or body.get("userId") or "").strip().lower()
    user_id = ALIASES.get(name)
    password = str(body.get("password") or "")
    if user_id is None or not password_ok(user_id, password):
        return JSONResponse({"error": "unknown user or password"}, status_code=401)
    return signed_in(USERS[user_id])


@app.post("/api/register")
async def register(request: Request):
    body = await read_body(request)
    if body is None:
        return JSONResponse({"error": "bad json"}, status_code=400)
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not EMAIL.match(email):
        return JSONResponse({"error": "Enter a valid email"}, status_code=400)
    if len(password) < 8:
        return JSONResponse({"error": "Use at least 8 characters"}, status_code=400)
    with _accounts_lock:
        if email in ALIASES or email in USERS:
            return JSONResponse({"error": "An account with that email already exists"}, status_code=409)
        salt = secrets.token_hex(16)
        row = {
            "id": email,
            "email": email,
            "name": email,
            "role": "Viewer",
            "buildingId": None,
            "salt": salt,
            "passwordHash": hashlib.sha256(f"{salt}:{password}".encode()).hexdigest(),
        }
        _remember(row)
        _save_accounts()
    return signed_in(USERS[email])


@app.post("/api/logout")
def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE, path="/")
    return response


@app.get("/api/state")
def state(request: Request, at: str = "2019-01-25T00:00", building: str | None = None):
    user = current_user(request)
    if user is None:
        return JSONResponse({"error": "sign in required"}, status_code=401)
    try:
        parse_ts(at)
    except ValueError:
        return JSONResponse({"error": "bad hour"}, status_code=400)
    return APP.state(user, at, building)


@app.get("/api/series")
def series(request: Request, freezer: str = "", at: str = ""):
    user = current_user(request)
    if user is None:
        return JSONResponse({"error": "sign in required"}, status_code=401)
    return APP.series(user, freezer, at)


@app.post("/api/approve")
@app.post("/api/reject")
async def decide_plan(request: Request):
    user = current_user(request)
    if user is None:
        return JSONResponse({"error": "sign in required"}, status_code=401)
    body = await read_body(request)
    if body is None:
        return JSONResponse({"error": "bad json"}, status_code=400)
    status = "approved" if request.url.path == "/api/approve" else "rejected"
    try:
        result = APP.act(user, str(body.get("planId") or ""), status)
    except AccessError as exc:
        return JSONResponse({"error": str(exc)}, status_code=403)
    except KeyError:
        return JSONResponse({"error": "unknown plan"}, status_code=404)
    return result


def _ui(path: str):
    root = DIST.resolve()
    index = root / "index.html"
    if not index.is_file():
        return JSONResponse({"error": "ui not built"}, status_code=503)
    if path:
        candidate = (root / path).resolve()
        if candidate.is_file() and (candidate == root or root in candidate.parents):
            return FileResponse(candidate)
    return FileResponse(index)


@app.get("/")
def home():
    return _ui("")


@app.get("/{full_path:path}")
def frontend(full_path: str):
    return _ui(full_path)


def main() -> None:
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8765"))
    if os.environ.get("SESSION_SECRET") is None:
        print("SESSION_SECRET is unset; using the dev secret", flush=True)
    print(f"IceBreaker http://{host}:{port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
