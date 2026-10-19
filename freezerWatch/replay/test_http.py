"""HTTP checks for roles. Approves Vilas only, so Chemistry stays pending."""

import json
import urllib.request

BASE = "http://127.0.0.1:8765"

PASSWORDS = {
    "officer": "capitol-2019",
    "labmgr-chemistry": "babcock-2019",
    "viewer": "lakeshore",
}


def call(method, path, body=None, cookie=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(BASE + path, data=data, method=method)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    if cookie:
        request.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw.startswith("{") or raw.startswith("[") else raw
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def login(user_id):
    data = json.dumps({"username": user_id, "password": PASSWORDS[user_id]}).encode("utf-8")
    request = urllib.request.Request(BASE + "/api/login", data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request) as response:
        assert response.status == 200
        cookie = response.headers["Set-Cookie"].split(";", 1)[0]
    assert cookie.startswith("fw_session=")
    return cookie


status, health = call("GET", "/api/health")
assert status == 200 and health["ok"] is True
status, locked = call("GET", "/api/state?at=2019-02-02T09:00")
assert status == 401 and locked["error"] == "sign in required"
status, bad = call("POST", "/api/login", {"username": "officer", "password": "nope"})
assert status == 401 and bad["error"] == "unknown user or password"
print("auth OK")


viewer = login("viewer")
status, state = call("GET", "/api/state?at=2019-02-02T09:00&building=chemistry", cookie=viewer)
assert status == 200
assert state["detail"]["freezers"] == []
assert state["detail"]["freezerMessage"] == "No freezers you can view"
assert state["detail"]["dollars"] == "over $1M"
assert state["user"]["canDecide"] is False
status, denied = call("POST", "/api/approve", {"planId": "plan~chemistry~2019-02-02T09:00"}, viewer)
assert status == 403 and denied["error"] == "access denied"
print("viewer OK", state["summary"]["dollars"])

lab = login("labmgr-chemistry")
status, bock = call("GET", "/api/series?freezer=bock-03&at=2019-02-02T09:00", cookie=lab)
assert status == 200 and bock["points"] == []
status, detail = call("GET", "/api/state?at=2019-02-02T09:00&building=bock", cookie=lab)
assert detail["detail"]["freezers"] == []
status, own = call("GET", "/api/state?at=2019-02-02T09:00&building=chemistry", cookie=lab)
assert len(own["detail"]["freezers"]) == 8
status, denied = call("POST", "/api/approve", {"planId": "plan~chemistry~2019-02-02T09:00"}, lab)
assert status == 403
print("lab manager OK")

officer = login("officer")
status, before = call("GET", "/api/state?at=2019-02-02T09:00&building=chemistry", cookie=officer)
vilas = next(plan for plan in before["plans"] if plan["buildingId"] == "vilas")
status, result = call("POST", "/api/approve", {"planId": vilas["id"]}, officer)
assert status == 200 and result["status"] == "approved" and result["decidedBy"] == "officer"
status, after = call("GET", "/api/state?at=2019-02-02T09:00&building=chemistry", cookie=officer)
assert all(plan["buildingId"] != "vilas" for plan in after["plans"])
assert any(plan["buildingId"] == "chemistry" for plan in after["plans"])
status, again = call("POST", "/api/approve", {"planId": vilas["id"]}, officer)
assert status == 403 and again["error"] == "already decided"
print("officer approval OK")
