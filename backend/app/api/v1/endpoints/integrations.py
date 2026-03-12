import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.core.security import ActiveUser, AdminUser
from app.crud.integration import crud_integration
from app.schemas.integration import IntegrationCreate, IntegrationRead, IntegrationUpdate, SyncLogRead

router = APIRouter()


@router.get("", response_model=Page[IntegrationRead])
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
    pagination: PageParams = Depends(),
):
    items, total = await crud_integration.get_multi(db, skip=pagination.offset, limit=pagination.size)
    return Page.create([IntegrationRead.model_validate(i) for i in items], total, pagination)


@router.post("", response_model=IntegrationRead, status_code=status.HTTP_201_CREATED)
async def create_integration(
    body: IntegrationCreate,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    obj = await crud_integration.create(db, obj_in=body)
    return IntegrationRead.model_validate(obj)


@router.get("/{integration_id}", response_model=IntegrationRead)
async def get_integration(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationRead.model_validate(obj)


@router.put("/{integration_id}", response_model=IntegrationRead)
async def update_integration(
    integration_id: uuid.UUID,
    body: IntegrationUpdate,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    obj = await crud_integration.update(db, db_obj=obj, obj_in=body)
    return IntegrationRead.model_validate(obj)


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    await crud_integration.remove(db, id=integration_id)


@router.get("/{integration_id}/logs", response_model=list[SyncLogRead])
async def get_integration_logs(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    logs = await crud_integration.get_sync_logs(db, integration_id=integration_id)
    return [SyncLogRead.model_validate(log) for log in logs]


@router.post("/{integration_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
):
    """Trigger an immediate sync. Phase 8 will wire real logic."""
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"status": "queued", "integration_id": str(integration_id), "message": "Sync triggered (Phase 8)"}


@router.post("/{integration_id}/test", status_code=status.HTTP_200_OK)
async def test_integration(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ActiveUser = None,
):
    """Test connectivity. Phase 8 will wire real logic."""
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"status": "not_implemented", "message": "Connectivity test available in Phase 8"}
