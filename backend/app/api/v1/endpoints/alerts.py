"""
Alerts endpoints — Phase 9

GET  /alerts                 — paginated list; filter by severity/type/entity/acknowledged
GET  /alerts/summary         — unacknowledged counts by severity (dashboard widget)
GET  /alerts/{id}            — single alert
POST /alerts                 — create alert (operator+)
PATCH /alerts/{id}           — update message / severity (operator+)
POST /alerts/{id}/acknowledge— mark acknowledged (operator+)
DELETE /alerts/{id}          — hard-delete (admin only)
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ActiveUser, AdminUser, OperatorUser
from app.crud.alert import crud_alert
from app.models.enums import AlertSeverity, AlertType
from app.schemas.alert import AlertCreate, AlertRead

router = APIRouter()


# ─── Additional schemas ───────────────────────────────────────────────────────

class AlertUpdate(BaseModel):
    severity: Optional[AlertSeverity] = None
    message: Optional[str] = None


class AlertSummary(BaseModel):
    critical: int = 0
    warning: int = 0
    info: int = 0
    total: int = 0


class AlertListResponse(BaseModel):
    items: list[AlertRead]
    total: int
    page: int
    size: int


# ─── GET /alerts/summary  (must be before /{id}) ─────────────────────────────

@router.get("/summary", response_model=AlertSummary)
async def get_alerts_summary(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> AlertSummary:
    """Return unacknowledged alert counts by severity — used by the dashboard widget."""
    counts = await crud_alert.count_by_severity(db)
    critical = counts.get(AlertSeverity.critical, 0)
    warning = counts.get(AlertSeverity.warning, 0)
    info = counts.get(AlertSeverity.info, 0)
    return AlertSummary(
        critical=critical,
        warning=warning,
        info=info,
        total=critical + warning + info,
    )


# ─── GET /alerts ──────────────────────────────────────────────────────────────

@router.get("", response_model=AlertListResponse)
async def list_alerts(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    severity: Optional[AlertSeverity] = Query(None),
    alert_type: Optional[AlertType] = Query(None),
    entity_type: Optional[str] = Query(None),
    acknowledged: Optional[bool] = Query(
        None, description="true=acknowledged only, false=unacknowledged only"
    ),
) -> AlertListResponse:
    skip = (page - 1) * size
    items, total = await crud_alert.get_multi(
        db,
        skip=skip,
        limit=size,
        severity=severity,
        alert_type=alert_type,
        entity_type=entity_type,
        acknowledged=acknowledged,
    )
    return AlertListResponse(
        items=[AlertRead.model_validate(a) for a in items],
        total=total,
        page=page,
        size=size,
    )


# ─── POST /alerts ─────────────────────────────────────────────────────────────

@router.post("", response_model=AlertRead, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: AlertCreate,
    _: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> AlertRead:
    obj = await crud_alert.upsert(
        db,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        alert_type=payload.alert_type,
        severity=payload.severity,
        message=payload.message,
    )
    return AlertRead.model_validate(obj)


# ─── GET /alerts/{id} ─────────────────────────────────────────────────────────

@router.get("/{alert_id}", response_model=AlertRead)
async def get_alert(
    alert_id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> AlertRead:
    obj = await crud_alert.get(db, alert_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    return AlertRead.model_validate(obj)


# ─── PATCH /alerts/{id} ───────────────────────────────────────────────────────

@router.patch("/{alert_id}", response_model=AlertRead)
async def update_alert(
    alert_id: uuid.UUID,
    payload: AlertUpdate,
    _: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> AlertRead:
    obj = await crud_alert.get(db, alert_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    if payload.severity is not None:
        obj.severity = payload.severity
    if payload.message is not None:
        obj.message = payload.message
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return AlertRead.model_validate(obj)


# ─── POST /alerts/{id}/acknowledge ───────────────────────────────────────────

@router.post("/{alert_id}/acknowledge", response_model=AlertRead)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> AlertRead:
    obj = await crud_alert.acknowledge(
        db, id=alert_id, acknowledged_by=current_user.username
    )
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    return AlertRead.model_validate(obj)


# ─── DELETE /alerts/{id} ──────────────────────────────────────────────────────

@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: uuid.UUID,
    _: AdminUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_alert.get(db, alert_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    await db.delete(obj)
    await db.commit()
