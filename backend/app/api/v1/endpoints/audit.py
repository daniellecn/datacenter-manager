from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.core.security import ActiveUser
from app.crud.audit_log import crud_audit_log
from app.schemas.audit_log import AuditLogRead

router = APIRouter()


@router.get("", response_model=Page[AuditLogRead])
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
    pagination: PageParams = Depends(),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
):
    """Return paginated audit log, optionally filtered by entity."""
    if entity_type and entity_id:
        items, total = await crud_audit_log.get_by_entity(
            db, entity_type, entity_id,
            skip=pagination.offset, limit=pagination.size,
        )
    else:
        items, total = await crud_audit_log.get_multi(
            db, skip=pagination.offset, limit=pagination.size,
        )
    return Page.create([AuditLogRead.model_validate(i) for i in items], total, pagination)


@router.get("/{entity_type}/{entity_id}", response_model=Page[AuditLogRead])
async def list_audit_logs_for_entity(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
    pagination: PageParams = Depends(),
):
    """Return audit log entries for a specific entity."""
    items, total = await crud_audit_log.get_by_entity(
        db, entity_type, entity_id,
        skip=pagination.offset, limit=pagination.size,
    )
    return Page.create([AuditLogRead.model_validate(i) for i in items], total, pagination)
