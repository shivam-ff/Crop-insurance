import os
import time
from dataclasses import dataclass, asdict

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for

load_dotenv()

APP_TITLE = "AI + IoT Based Decentralized Crop Insurance System for Indian Farmers"
THEME_COLOR = "#2e7d32"


def predict_risk(rainfall_mm: float) -> str:
    """Very simple rule-based risk logic."""
    if rainfall_mm < 20:
        return "HIGH"
    if 20 <= rainfall_mm <= 60:
        return "MEDIUM"
    return "LOW"


def now_ts() -> int:
    return int(time.time())


@dataclass
class Policy:
    active: bool = False
    plan_id: str = ""
    plan_name: str = ""
    premium_inr: int = 0
    payout_inr: int = 5000
    farmer_address: str = ""
    created_at: int = 0
    location_lat: float | None = None
    location_lon: float | None = None
    last_rainfall_mm: float = 0.0
    last_temperature_c: float = 0.0
    last_risk: str = "—"
    paid_out: bool = False
    last_tx: str = ""


# In-memory demo users (no DB)
USERS: dict[str, dict] = {}  # phone -> {name, phone, password}

# In-memory per-user policy + logs
STATE: dict[str, dict] = {}  # phone -> {"policy": Policy, "logs": [str]}


def ensure_state(phone: str) -> dict:
    if phone not in STATE:
        STATE[phone] = {"policy": Policy(), "logs": []}
    return STATE[phone]


def log(phone: str, msg: str) -> None:
    st = ensure_state(phone)
    st["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    del st["logs"][:-120]


def demo_or_blockchain_payout(_to_address: str) -> tuple[bool, str]:
    """
    Sepolia optional, but demo MUST work without it.
    We return MOCK always (web3.py removed for Windows simplicity).
    """
    # We still return a reference id for UI/logs.
    return False, f"TXN-{now_ts()}"


app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET", "demo-secret-change-me")


def current_phone() -> str | None:
    return session.get("phone")


def require_login():
    if not current_phone():
        return redirect(url_for("login_page"))
    return None


@app.get("/")
def home():
    return redirect(url_for("dashboard_page") if current_phone() else url_for("login_page"))


@app.get("/login")
def login_page():
    return render_template("login.html", title=APP_TITLE, theme=THEME_COLOR, error="")


@app.post("/login")
def login_post():
    phone = str(request.form.get("phone", "")).strip()
    password = str(request.form.get("password", "")).strip()
    user = USERS.get(phone)
    if not user or user.get("password") != password:
        return render_template("login.html", title=APP_TITLE, theme=THEME_COLOR, error="Invalid phone or password"), 401
    session["phone"] = phone
    return redirect(url_for("dashboard_page"))


@app.get("/signup")
def signup_page():
    return render_template("signup.html", title=APP_TITLE, theme=THEME_COLOR, error="")


@app.post("/signup")
def signup_post():
    name = str(request.form.get("name", "")).strip()
    phone = str(request.form.get("phone", "")).strip()
    password = str(request.form.get("password", "")).strip()
    if not name:
        return render_template("signup.html", title=APP_TITLE, theme=THEME_COLOR, error="Enter name"), 400
    if not phone or len(phone) < 8:
        return render_template("signup.html", title=APP_TITLE, theme=THEME_COLOR, error="Enter valid phone"), 400
    if not password or len(password) < 4:
        return render_template("signup.html", title=APP_TITLE, theme=THEME_COLOR, error="Password too short"), 400
    if phone in USERS:
        return render_template("signup.html", title=APP_TITLE, theme=THEME_COLOR, error="Phone already registered"), 400
    USERS[phone] = {"name": name, "phone": phone, "password": password}
    ensure_state(phone)
    session["phone"] = phone
    return redirect(url_for("dashboard_page"))


@app.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))


@app.get("/dashboard")
def dashboard_page():
    r = require_login()
    if r:
        return r
    phone = current_phone()
    user = USERS.get(phone, {})
    return render_template("dashboard.html", title=APP_TITLE, theme=THEME_COLOR, user=user)


@app.get("/api/status")
def api_status():
    phone = current_phone()
    if not phone:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    st = ensure_state(phone)
    return jsonify(
        {
            "ok": True,
            "user": {"name": USERS.get(phone, {}).get("name", ""), "phone": phone},
            "policy": asdict(st["policy"]),
            "logs": st["logs"],
        }
    )

@app.post("/api/location")
def api_location():
    phone = current_phone()
    if not phone:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    data = request.get_json(force=True) or {}
    lat = data.get("lat")
    lon = data.get("lon")
    st = ensure_state(phone)
    p: Policy = st["policy"]
    p.location_lat = float(lat) if lat is not None else None
    p.location_lon = float(lon) if lon is not None else None
    log(phone, f"Farm location detected: {p.location_lat}, {p.location_lon}")
    return jsonify({"ok": True, "policy": asdict(p), "logs": st["logs"]})


@app.post("/api/buy_policy")
def api_buy_policy():
    phone = current_phone()
    if not phone:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    data = request.get_json(force=True) or {}
    plan_id = str(data.get("planId", "")).strip()
    farmer_address = str(data.get("farmerAddress", "")).strip()

    plans = {
        "basic": {"name": "Basic Plan", "price": 499},
        "standard": {"name": "Standard Plan", "price": 999},
        "premium": {"name": "Premium Plan", "price": 1999},
    }
    if plan_id not in plans:
        return jsonify({"ok": False, "error": "Select a valid plan"}), 400

    st = ensure_state(phone)
    p: Policy = st["policy"]
    p.active = True
    p.plan_id = plan_id
    p.plan_name = plans[plan_id]["name"]
    p.premium_inr = plans[plan_id]["price"]
    p.farmer_address = farmer_address
    p.created_at = now_ts()
    p.paid_out = False
    p.last_tx = ""
    p.last_risk = "—"

    log(phone, "Buying policy (पॉलिसी खरीद रहे हैं)...")
    log(phone, f"Plan selected: {p.plan_name} (₹{p.premium_inr})")
    log(phone, "Payment Successful ✅")
    log(phone, "Policy Active ✅")

    return jsonify({"ok": True, "policy": asdict(p), "logs": st["logs"]})


@app.post("/api/evaluate")
def api_evaluate():
    phone = current_phone()
    if not phone:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    st = ensure_state(phone)
    p: Policy = st["policy"]
    if not p.active:
        return jsonify({"ok": False, "error": "Buy a policy first"}), 400

    data = request.get_json(force=True) or {}
    rainfall = float(data.get("rainfallMm", 0))
    temperature = float(data.get("temperatureC", 0))
    auto_mode = bool(data.get("autoMode", False))

    log(phone, "Fetching IoT data... (IoT डेटा आ रहा है)")
    log(phone, f"Rainfall (बारिश): {rainfall:.0f} mm")
    log(phone, f"Temperature (तापमान): {temperature:.0f} °C")

    risk = predict_risk(rainfall)
    p.last_rainfall_mm = rainfall
    p.last_temperature_c = temperature
    p.last_risk = risk

    log(phone, f"Risk (जोखिम स्तर): {risk}")

    message = ""
    paid = False
    tx_hash = ""

    if risk == "HIGH":
        if p.paid_out:
            message = "Claim already paid."
            log(phone, "Claim already paid earlier.")
        else:
            log(phone, "Triggering payout... (भुगतान शुरू)")
            ok, tx = demo_or_blockchain_payout(p.farmer_address)
            tx_hash = tx
            message = "Claim Approved – ₹5000 credited"
            log(phone, "Payment Successful ✅")
            log(phone, f"Transaction Ref: {tx_hash}")
            p.paid_out = True
            p.last_tx = tx_hash
            paid = True
    else:
        message = "No Claim Needed"
        log(phone, "No claim needed (अभी क्लेम नहीं).")
        if auto_mode:
            log(phone, "Auto mode monitoring continues...")

    return jsonify(
        {
            "ok": True,
            "risk": risk,
            "statusMessage": message,
            "paid": paid,
            "txHash": tx_hash,
            "policy": asdict(p),
            "logs": st["logs"],
        }
    )


if __name__ == "__main__":
    # Preload a default user for quick local run (not shown in UI).
    if "9999999999" not in USERS:
        USERS["9999999999"] = {"name": "Ramesh Kumar", "phone": "9999999999", "password": "demo"}
        ensure_state("9999999999")
    app.run(host="127.0.0.1", port=5000, debug=True)

