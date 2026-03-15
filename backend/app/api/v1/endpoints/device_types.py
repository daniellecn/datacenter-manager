"""
Device Types — user-maintainable catalogue of device type slugs.

GET    /device-types              list all (any authenticated user)
POST   /device-types              create custom type (admin only)
GET    /device-types/{id}         get one (any authenticated user)
PUT    /device-types/{id}         update label/color/icon_key/sort_order (admin only)
DELETE /device-types/{id}         delete custom type (admin only; blocked if builtin or in use)
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import ActiveUser, AdminUser
from app.crud.device_type import crud_device_type
from app.schemas.device_type import DeviceTypeCreate, DeviceTypeRead, DeviceTypeUpdate
from fastapi import HTTPException

router = APIRouter()


@router.get("", response_model=list[DeviceTypeRead])
async def list_device_types(
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> list[DeviceTypeRead]:
    items = await crud_device_type.get_all_ordered(db)
    return items


@router.post("", response_model=DeviceTypeRead, status_code=201)
async def create_device_type(
    body: DeviceTypeCreate,
    _current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceTypeRead:
    existing = await crud_device_type.get_by_name(db, body.name)
    if existing:
        raise ConflictError(f"Device type '{body.name}' already exists.")
    obj = await crud_device_type.create(db, obj_in=body)
    return obj


@router.get("/{device_type_id}", response_model=DeviceTypeRead)
async def get_device_type(
    device_type_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceTypeRead:
    obj = await crud_device_type.get(db, device_type_id)
    if not obj:
        raise NotFoundError("DeviceType", str(device_type_id))
    return obj


@router.put("/{device_type_id}", response_model=DeviceTypeRead)
async def update_device_type(
    device_type_id: uuid.UUID,
    body: DeviceTypeUpdate,
    _current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceTypeRead:
    obj = await crud_device_type.get(db, device_type_id)
    if not obj:
        raise NotFoundError("DeviceType", str(device_type_id))
    obj = await crud_device_type.update(db, db_obj=obj, obj_in=body)
    return obj


@router.delete("/{device_type_id}", status_code=204)
async def delete_device_type(
    device_type_id: uuid.UUID,
    _current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_device_type.get(db, device_type_id)
    if not obj:
        raise NotFoundError("DeviceType", str(device_type_id))
    if obj.is_builtin:
        raise HTTPException(status_code=409, detail="Built-in device types cannot be deleted.")
    if await crud_device_type.is_name_in_use(db, obj.name):
        raise HTTPException(
            status_code=409,
            detail=f"Device type '{obj.name}' is in use by one or more devices and cannot be deleted.",
        )
    await crud_device_type.delete(db, id=device_type_id)
