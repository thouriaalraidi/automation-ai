
from __future__ import annotations

import json
import logging
import os
import webbrowser

from contextlib import asynccontextmanager
from pathlib import Path
from threading import Timer
from typing import Literal

import uvicorn

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from project_last import ask_chat

from auth_store import (
    oauth,
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    DAILY_LIMIT,
    initialize_database,
    upsert_google_user,
    find_user,
    is_admin,
    remaining_today,
    record_successful_request,
    admin_statistics,
)


# ==========================================
# إعدادات المشروع
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

SESSION_SECRET = os.getenv("SESSION_SECRET", "")
PRODUCTION = os.getenv("APP_ENV", "development") == "production"
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")

logger = logging.getLogger("automation_ai")

if len(SESSION_SECRET) < 32:
    raise RuntimeError(
        "SESSION_SECRET must contain at least 32 random characters."
    )


# ==========================================
# تهيئة قاعدة بيانات Neon
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


# ==========================================
# إنشاء السيرفر وحماية الجلسات
# ==========================================

app = FastAPI(
    title="Automation AI",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="automation_session",
    same_site="lax",
    https_only=PRODUCTION,
    max_age=7 * 24 * 60 * 60,
)


# ==========================================
# التحقق من المستخدم
# ==========================================

def require_user(request: Request) -> dict:
    user = find_user(request.session.get("user_id"))

    if not user:
        raise HTTPException(
            status_code=401,
            detail="يرجى تسجيل الدخول أولًا."
        )

    return user


# ==========================================
# الصفحة الرئيسية
# ==========================================

@app.get("/")
def home(request: Request):

    user = find_user(request.session.get("user_id"))

    if not user:
        return RedirectResponse(
            url="/login",
            status_code=303
        )

    return FileResponse(
        BASE_DIR / "index.html",
        headers={"Cache-Control": "no-store"}
    )


# ==========================================
# صفحة تسجيل الدخول
# ==========================================

@app.get("/login")
def login_page(request: Request):

    user = find_user(request.session.get("user_id"))

    if user:
        return RedirectResponse(
            url="/",
            status_code=303
        )

    return FileResponse(
        BASE_DIR / "login.html",
        headers={"Cache-Control": "no-store"}
    )


# ==========================================
# بدء تسجيل الدخول باستخدام Google
# ==========================================

@app.get("/auth/google")
async def google_login(request: Request):

    if not OAUTH_CLIENT_ID or not OAUTH_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured."
        )

    redirect_uri = (
        f"{PUBLIC_BASE_URL}/auth/google/callback"
        if PUBLIC_BASE_URL
        else str(request.url_for("google_callback"))
    )

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri
    )


# ==========================================
# استقبال بيانات المستخدم من Google
# ==========================================

@app.get(
    "/auth/google/callback",
    name="google_callback"
)
async def google_callback(request: Request):

    try:
        token = await oauth.google.authorize_access_token(request)

        profile = token.get("userinfo") or {}

        if (
            profile.get("email_verified") is not True
            or not profile.get("sub")
            or not profile.get("email")
        ):
            return RedirectResponse(
                url="/login?error=unverified",
                status_code=303
            )

        user = upsert_google_user(profile)

    except Exception as error:

        logger.warning(
            "Google login failed: %s",
            type(error).__name__
        )

        return RedirectResponse(
            url="/login?error=login",
            status_code=303
        )

    request.session.clear()
    request.session["user_id"] = user["id"]

    return RedirectResponse(
        url="/",
        status_code=303
    )


# ==========================================
# تسجيل الخروج
# ==========================================

@app.post("/logout")
def logout(request: Request):

    request.session.clear()

    return RedirectResponse(
        url="/login",
        status_code=303
    )


# ==========================================
# بيانات المستخدم الحالي
# ==========================================

@app.get("/api/auth/me")
def current_user(request: Request):

    user = require_user(request)

    return {
        "name": user["name"],
        "email": user["email"],
        "is_admin": is_admin(user),
        "daily_limit": DAILY_LIMIT,
        "remaining_today": remaining_today(user["id"]),
    }


# ==========================================
# تعريف هوية الحساب للواجهة
# ==========================================

@app.get("/api/auth/bootstrap.js")
def browser_identity(request: Request):

    user = require_user(request)

    script = (
        "window.AUTOMATION_USER_ID = "
        + json.dumps(user["google_sub"])
        + ";\n"
        + "window.AUTOMATION_IS_ADMIN = "
        + json.dumps(is_admin(user))
        + ";\n"
    )

    return Response(
        content=script,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"}
    )


# ==========================================
# لوحة إدارة المستخدمين
# ==========================================

@app.get("/admin")
def admin_page(request: Request):

    user = require_user(request)

    if not is_admin(user):
        raise HTTPException(
            status_code=403,
            detail="غير مصرح بالدخول."
        )

    return FileResponse(
        BASE_DIR / "admin.html",
        headers={"Cache-Control": "no-store"}
    )


# ==========================================
# إحصائيات المستخدمين
# ==========================================

@app.get("/api/admin/stats")
def dashboard_statistics(request: Request):

    user = require_user(request)

    if not is_admin(user):
        raise HTTPException(
            status_code=403,
            detail="غير مصرح بالدخول."
        )

    return admin_statistics()


# ==========================================
# ملفات الواجهة
# ==========================================

@app.get("/style.css")
def style():

    return FileResponse(
        BASE_DIR / "style.css",
        headers={"Cache-Control": "no-store"}
    )


@app.get("/script.js")
def script():

    return FileResponse(
        BASE_DIR / "script.js",
        headers={"Cache-Control": "no-store"}
    )


# ==========================================
# التحقق من بيانات السؤال والمحادثة
# ==========================================

class HistoryItem(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(max_length=50000)


class Question(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[HistoryItem] = Field(
        default_factory=list,
        max_length=1000
    )


# ==========================================
# إرسال السؤال إلى Gemini
# ==========================================

@app.post("/chat")
def ask(request: Request, question: Question):

    # التأكد من تسجيل الدخول
    user = require_user(request)

    # التأكد من الحد اليومي للطلبات
    if remaining_today(user["id"]) <= 0:
        raise HTTPException(
            status_code=429,
            detail="انتهى الحد اليومي للطلبات."
        )

    try:
        # نرسل آخر 40 رسالة للحفاظ على الأداء
        history = [
            item.model_dump()
            for item in question.history[-40:]
        ]

        answer = ask_chat(
            question.message,
            history
        )

        if (
            not isinstance(answer, str)
            or not answer.strip()
            or answer.strip() == "حدث خطأ أثناء الاتصال بـ Gemini."
        ):
            raise ValueError("No usable Gemini response")

    except Exception as error:

        # لا نطبع أسئلة المستخدمين أو إجاباتهم
        logger.warning(
            "Gemini request failed: %s",
            type(error).__name__
        )

        raise HTTPException(
            status_code=502,
            detail="تعذر الاتصال بـ Gemini."
        ) from None

    # تسجيل عدد الطلبات الناجحة فقط
    record_successful_request(user["id"])

    return {
        "answer": answer
    }


# ==========================================
# تشغيل السيرفر
# ==========================================

if __name__ == "__main__":

    if not PRODUCTION:
        Timer(
            1,
            lambda: webbrowser.open(
                "http://127.0.0.1:8002/login"
            )
        ).start()

    uvicorn.run(
        app,
        host="0.0.0.0" if PRODUCTION else "127.0.0.1",
        port=int(os.getenv("PORT", "8002"))
    )
