from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from database import get_db
from models import User
from auth_utils import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin,
)

router = APIRouter(prefix="/api/auth", tags=["Autentikasi"])


# ─── Schemas ──────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = "user"

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/auth/login
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse, summary="Login pengguna")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Autentikasi username & password, kembalikan JWT token."""
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Username atau password salah")

    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(id=user.id, username=user.username, role=user.role),
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/auth/me
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserResponse, summary="Cek user yang sedang login")
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, username=current_user.username, role=current_user.role)


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/auth/register  (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/register", response_model=UserResponse, summary="Daftarkan user baru (admin only)")
def register(body: RegisterRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Hanya admin yang bisa membuat akun baru."""
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Username '{body.username}' sudah digunakan")

    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role harus 'admin' atau 'user'")

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserResponse(id=new_user.id, username=new_user.username, role=new_user.role)


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/auth/users  (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/users", response_model=List[UserResponse], summary="Daftar semua user (admin only)")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id).all()
    return [UserResponse(id=u.id, username=u.username, role=u.role) for u in users]


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /api/auth/users/{user_id}  (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.delete("/users/{user_id}", summary="Hapus user (admin only)")
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    db.delete(user)
    db.commit()
    return {"detail": f"User '{user.username}' berhasil dihapus"}
