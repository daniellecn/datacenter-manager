"""
Physical layer — Licenses

GET    /licenses/expiring  expiring licenses (?days=90) — NOTE: must be before /{id} route
GET    /licenses           paginated list
POST   /licenses           create
GET    /licenses/{id}      single
PUT    /licenses/{id}      update
DELETE /licenses/{id}      delete
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.license import crud_license
from app.models.enums import AuditAction, LicenseType
from app.models.license import License
from app.schemas.license import LicenseCreate, LicenseRead, LicenseUpdate

router = APIRouter()

_SENSITIVE_SUFFIXES = ("_enc", "_password", "_key", "_secret")


def _to_dict(obj: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for attr in sa_inspect(type(obj)).mapper.column_attrs:
        key = attr.key
        if any(key.endswith(s) for s in _SENSITIVE_SUFFIXES):
            continue
        val = getattr(obj, key)
        if isinstance(val, (datetime, date)):
            result[key] = val.isoformat()
        elif isinstance(val, uuid.UUID):
            result[key] = str(val)
        elif isinstance(val, Decimal):
            result[key] = float(val)
        else:
            result[key] = val
    return result


# ─── Expiring (before /{id} to avoid route shadowing) ─────────────────────────

@router.get("/expiring", response_model=Page[LicenseRead])
async def list_expiring_licenses(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    days: int = Query(90, ge=1, le=3650, description="Licenses expiring within this many days"),
    db: AsyncSession = Depends(get_db),
) -> Page[LicenseRead]:
    """Return non-null expiry licenses expiring within the given number of days, soonest first."""
    cutoff = (datetime.now(timezone.utc) + timedelta(days=days)).date()
    today = datetime.now(timezone.utc).date()
    items, total = await crud_license.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=[
            License.expiry_date.is_not(None),
            License.expiry_date >= today,
            License.expiry_date <= cutoff,
        ],
        order_by=License.expiry_date.asc(),
    )
    return Page.create(items, total, pagination)


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=Page[LicenseRead])
async def list_licenses(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    device_id: uuid.UUID | None = Query(None),
    license_type: LicenseType | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Page[LicenseRead]:
    filters = []
    if device_id:
        filters.append(License.device_id == device_id)
    if license_type:
        filters.append(License.license_type == license_type)
    items, total = await crud_license.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create(items, total, pagination)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=LicenseRead, status_code=201)
async def create_license(
    body: LicenseCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> LicenseRead:
    obj = await crud_license.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="license",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(obj)},
    )
    return obj


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{license_id}", response_model=LicenseRead)
async def get_license(
    license_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> LicenseRead:
    obj = await crud_license.get(db, license_id)
    if not obj:
        raise NotFoundError("License", str(license_id))
    return obj


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{license_id}", response_model=LicenseRead)
async def update_license(
    license_id: uuid.UUID,
    body: LicenseUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> LicenseRead:
    obj = await crud_license.get(db, license_id)
    if not obj:
        raise NotFoundError("License", str(license_id))
    before = _to_dict(obj)
    obj = await crud_license.update(db, db_obj=obj, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="license",
        entity_id=str(obj.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )
    return obj


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{license_id}", status_code=204)
async def delete_license(
    license_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_license.get(db, license_id)
    if not obj:
        raise NotFoundError("License", str(license_id))
    before = _to_dict(obj)
    await crud_license.delete(db, id=license_id)
    await crud_audit_log.create(
        db,
        entity_type="license",
        entity_id=str(license_id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )
