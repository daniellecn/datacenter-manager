"""
Users endpoints — admin-only user management

GET    /users           — list users (paginated)
GET    /users/{id}      — get user by ID
POST   /users           — create user
PATCH  /users/{id}      — update user (role, email, is_active, must_change_password)
POST   /users/{id}/reset-password — set a new password for a user
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PageParams, PaginationDep
from app.core.security import AdminUser
from app.crud.user import crud_user
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from fastapi import Depends
from pydantic import BaseModel, Field

router = APIRouter()


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8)


@router.get("", response_model=Page[UserRead])
async def list_users(
    pagination: PaginationDep,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> Page[UserRead]:
    total_result = await db.execute(select(func.count()).select_from(User))
    total = total_result.scalar_one()

    result = await db.execute(
        select(User).order_by(User.username).offset(pagination.offset).limit(pagination.size)
    )
    users = list(result.scalars().all())
    return Page.create(users, total, pagination)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> User:
    existing = await crud_user.get_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")
    return await crud_user.create(db, obj_in=body)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return await crud_user.update(db, db_obj=user, obj_in=body)


@router.post("/{user_id}/reset-password", response_model=UserRead)
async def reset_user_password(
    user_id: uuid.UUID,
    body: ResetPasswordRequest,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await crud_user.get(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return await crud_user.set_password(db, db_obj=user, new_password=body.new_password)
