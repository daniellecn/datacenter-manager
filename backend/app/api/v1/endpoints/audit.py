from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.core.security import AdminUser
from app.crud.audit_log import crud_audit_log
from app.schemas.audit_log import AuditLogRead

router = APIRouter()

# Whitelist of valid entity types — prevents information disclosure via
# arbitrary entity_type values and ensures query predicates are safe.
_VALID_ENTITY_TYPES = frozenset({
    "user", "device", "rack", "room", "datacenter", "corridor",
    "license", "network_interface", "network_link", "lag_group",
    "vlan", "ip_network", "ip_address", "san_fabric",
    "virt_cluster", "virt_host", "virtual_machine", "datastore",
    "integration",
})


@router.get("", response_model=Page[AuditLogRead])
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
    pagination: PageParams = Depends(),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
):
    """Return paginated audit log. Admin role required."""
    if entity_type is not None and entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid entity_type. Must be one of: {sorted(_VALID_ENTITY_TYPES)}",
        )

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
    _: AdminUser = None,
    pagination: PageParams = Depends(),
):
    """Return audit log entries for a specific entity. Admin role required."""
    if entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid entity_type. Must be one of: {sorted(_VALID_ENTITY_TYPES)}",
        )

    items, total = await crud_audit_log.get_by_entity(
        db, entity_type, entity_id,
        skip=pagination.offset, limit=pagination.size,
    )
    return Page.create([AuditLogRead.model_validate(i) for i in items], total, pagination)
