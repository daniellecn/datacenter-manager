"""
Dashboard endpoints — Phase 9

GET /dashboard/summary    — entity counts, alert counts
GET /dashboard/power      — power breakdown: datacenter → room → rack
GET /dashboard/capacity   — U space, IP utilization, VM-to-host ratios
GET /dashboard/alerts     — recent unacknowledged alerts for the dashboard widget
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ActiveUser
from app.crud.alert import crud_alert
from app.models.alert import Alert
from app.models.datacenter import DataCenter
from app.models.device import Device
from app.models.enums import (
    AlertSeverity,
    DeviceStatus,
    DeviceType,
    IPStatus,
    IntegrationStatus,
    RackStatus,
    VMStatus,
)
from app.models.integration import Integration
from app.models.ip_address import IPAddress
from app.models.ip_network import IPNetwork
from app.models.rack import Rack
from app.models.room import Room
from app.models.virtual_machine import VirtualMachine
from app.models.virt_host import VirtualizationHost
from app.schemas.alert import AlertRead

router = APIRouter()


# ─── Summary schemas ──────────────────────────────────────────────────────────

class DeviceTypeCounts(BaseModel):
    server: int = 0
    switch: int = 0
    router: int = 0
    firewall: int = 0
    storage: int = 0
    pdu: int = 0
    patch_panel: int = 0
    other: int = 0


class AlertCounts(BaseModel):
    critical: int = 0
    warning: int = 0
    info: int = 0
    total: int = 0


class IntegrationCounts(BaseModel):
    ok: int = 0
    error: int = 0
    warning: int = 0
    disabled: int = 0


class DashboardSummary(BaseModel):
    datacenters: int
    rooms: int
    racks: int
    devices_active: int
    devices_total: int
    devices_by_type: DeviceTypeCounts
    vms_total: int
    vms_running: int
    virt_hosts: int
    alerts: AlertCounts
    integrations: IntegrationCounts


# ─── Power schemas ────────────────────────────────────────────────────────────

class RackPowerSummary(BaseModel):
    rack_id: str
    rack_name: str
    max_power_w: Optional[int]
    power_actual_w: int
    power_rated_w: int
    utilization_pct: Optional[float]


class RoomPowerSummary(BaseModel):
    room_id: str
    room_name: str
    power_actual_w: int
    power_rated_w: int
    racks: list[RackPowerSummary]


class DatacenterPowerSummary(BaseModel):
    datacenter_id: str
    datacenter_name: str
    total_power_kw: Optional[float]
    power_actual_w: int
    power_rated_w: int
    utilization_pct: Optional[float]
    rooms: list[RoomPowerSummary]


class PowerDashboard(BaseModel):
    datacenters: list[DatacenterPowerSummary]
    grand_total_actual_w: int
    grand_total_rated_w: int


# ─── Capacity schemas ─────────────────────────────────────────────────────────

class RackCapacity(BaseModel):
    rack_id: str
    rack_name: str
    total_u: int
    used_u: int
    free_u: int
    utilization_pct: float


class USpaceCapacity(BaseModel):
    total_u: int
    used_u: int
    free_u: int
    utilization_pct: float
    racks: list[RackCapacity]


class IPUtilization(BaseModel):
    total_subnets: int
    total_assigned: int
    total_available: int


class VMHostRatio(BaseModel):
    total_hosts: int
    total_vms: int
    ratio: float


class CapacityDashboard(BaseModel):
    u_space: USpaceCapacity
    ip_utilization: IPUtilization
    vm_host_ratio: VMHostRatio


# ─── GET /dashboard/summary ───────────────────────────────────────────────────

@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    # Datacenter / room / rack counts
    dc_count = (await db.execute(select(func.count()).select_from(DataCenter))).scalar_one()
    room_count = (await db.execute(select(func.count()).select_from(Room))).scalar_one()
    rack_count = (
        await db.execute(
            select(func.count()).select_from(Rack)
            .where(Rack.status != RackStatus.decommissioned)
        )
    ).scalar_one()

    # Device counts
    dev_total = (await db.execute(select(func.count()).select_from(Device))).scalar_one()
    dev_active = (
        await db.execute(
            select(func.count()).select_from(Device).where(Device.status == DeviceStatus.active)
        )
    ).scalar_one()

    # Devices by type (active only)
    type_rows = (
        await db.execute(
            select(Device.device_type, func.count().label("cnt"))
            .where(Device.status != DeviceStatus.inactive)
            .group_by(Device.device_type)
        )
    ).all()
    type_counts: dict[str, int] = {row.device_type: row.cnt for row in type_rows}

    def _tc(t: DeviceType) -> int:
        return type_counts.get(t, 0)

    # VM / host counts
    vm_total = (await db.execute(select(func.count()).select_from(VirtualMachine))).scalar_one()
    vm_running = (
        await db.execute(
            select(func.count()).select_from(VirtualMachine)
            .where(VirtualMachine.status == VMStatus.running)
        )
    ).scalar_one()
    host_count = (
        await db.execute(select(func.count()).select_from(VirtualizationHost))
    ).scalar_one()

    # Alert counts (unacknowledged)
    alert_counts = await crud_alert.count_by_severity(db)
    crit = alert_counts.get(AlertSeverity.critical, 0)
    warn = alert_counts.get(AlertSeverity.warning, 0)
    info = alert_counts.get(AlertSeverity.info, 0)

    # Integration counts
    int_rows = (
        await db.execute(
            select(Integration.status, func.count().label("cnt"))
            .group_by(Integration.status)
        )
    ).all()
    int_counts: dict[str, int] = {row.status: row.cnt for row in int_rows}

    return DashboardSummary(
        datacenters=dc_count,
        rooms=room_count,
        racks=rack_count,
        devices_active=dev_active,
        devices_total=dev_total,
        devices_by_type=DeviceTypeCounts(
            server=_tc(DeviceType.server),
            switch=_tc(DeviceType.switch),
            router=_tc(DeviceType.router),
            firewall=_tc(DeviceType.firewall),
            storage=_tc(DeviceType.storage),
            pdu=_tc(DeviceType.pdu),
            patch_panel=_tc(DeviceType.patch_panel),
            other=sum(
                v for k, v in type_counts.items()
                if k not in {t.value for t in (
                    DeviceType.server, DeviceType.switch, DeviceType.router,
                    DeviceType.firewall, DeviceType.storage, DeviceType.pdu,
                    DeviceType.patch_panel,
                )}
            ),
        ),
        vms_total=vm_total,
        vms_running=vm_running,
        virt_hosts=host_count,
        alerts=AlertCounts(critical=crit, warning=warn, info=info, total=crit + warn + info),
        integrations=IntegrationCounts(
            ok=int_counts.get(IntegrationStatus.ok, 0),
            error=int_counts.get(IntegrationStatus.error, 0),
            warning=int_counts.get(IntegrationStatus.warning, 0),
            disabled=int_counts.get(IntegrationStatus.disabled, 0),
        ),
    )


# ─── GET /dashboard/power ─────────────────────────────────────────────────────

@router.get("/power", response_model=PowerDashboard)
async def dashboard_power(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> PowerDashboard:
    """Power breakdown hierarchically: datacenter → room → rack."""
    datacenters = list(
        (await db.execute(select(DataCenter).order_by(DataCenter.name))).scalars().all()
    )

    dc_summaries: list[DatacenterPowerSummary] = []
    grand_actual = 0
    grand_rated = 0

    for dc in datacenters:
        rooms = list(
            (
                await db.execute(
                    select(Room).where(Room.datacenter_id == dc.id).order_by(Room.name)
                )
            )
            .scalars()
            .all()
        )

        dc_actual = 0
        dc_rated = 0
        room_summaries: list[RoomPowerSummary] = []

        for room in rooms:
            racks = list(
                (
                    await db.execute(
                        select(Rack)
                        .where(
                            Rack.room_id == room.id,
                            Rack.status != RackStatus.decommissioned,
                        )
                        .order_by(Rack.name)
                    )
                )
                .scalars()
                .all()
            )

            room_actual = 0
            room_rated = 0
            rack_summaries: list[RackPowerSummary] = []

            for rack in racks:
                # Sum device power for this rack
                row = (
                    await db.execute(
                        select(
                            func.coalesce(func.sum(Device.power_actual_w), 0).label("actual"),
                            func.coalesce(func.sum(Device.power_rated_w), 0).label("rated"),
                        ).where(
                            Device.rack_id == rack.id,
                            Device.status != DeviceStatus.inactive,
                        )
                    )
                ).one()
                rack_actual = int(row.actual)
                rack_rated = int(row.rated)

                util: Optional[float] = None
                if rack.max_power_w and rack.max_power_w > 0:
                    effective = rack_actual if rack_actual > 0 else rack_rated
                    util = round(effective / rack.max_power_w * 100, 1)

                rack_summaries.append(
                    RackPowerSummary(
                        rack_id=str(rack.id),
                        rack_name=rack.name,
                        max_power_w=rack.max_power_w,
                        power_actual_w=rack_actual,
                        power_rated_w=rack_rated,
                        utilization_pct=util,
                    )
                )
                room_actual += rack_actual
                room_rated += rack_rated

            room_summaries.append(
                RoomPowerSummary(
                    room_id=str(room.id),
                    room_name=room.name,
                    power_actual_w=room_actual,
                    power_rated_w=room_rated,
                    racks=rack_summaries,
                )
            )
            dc_actual += room_actual
            dc_rated += room_rated

        dc_util: Optional[float] = None
        if dc.total_power_kw and float(dc.total_power_kw) > 0:
            dc_max_w = float(dc.total_power_kw) * 1000
            effective = dc_actual if dc_actual > 0 else dc_rated
            dc_util = round(effective / dc_max_w * 100, 1)

        dc_summaries.append(
            DatacenterPowerSummary(
                datacenter_id=str(dc.id),
                datacenter_name=dc.name,
                total_power_kw=float(dc.total_power_kw) if dc.total_power_kw else None,
                power_actual_w=dc_actual,
                power_rated_w=dc_rated,
                utilization_pct=dc_util,
                rooms=room_summaries,
            )
        )
        grand_actual += dc_actual
        grand_rated += dc_rated

    return PowerDashboard(
        datacenters=dc_summaries,
        grand_total_actual_w=grand_actual,
        grand_total_rated_w=grand_rated,
    )


# ─── GET /dashboard/capacity ──────────────────────────────────────────────────

@router.get("/capacity", response_model=CapacityDashboard)
async def dashboard_capacity(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> CapacityDashboard:
    """U space per rack, IP utilization, and VM-to-host ratio."""
    # ── U space ──────────────────────────────────────────────────────────────
    racks = list(
        (
            await db.execute(
                select(Rack).where(Rack.status != RackStatus.decommissioned)
            )
        )
        .scalars()
        .all()
    )

    rack_capacities: list[RackCapacity] = []
    total_u = 0
    used_u_total = 0

    for rack in racks:
        # Sum rack_unit_size for devices in this rack that have a position
        row = (
            await db.execute(
                select(
                    func.coalesce(func.sum(Device.rack_unit_size), 0).label("used")
                ).where(
                    Device.rack_id == rack.id,
                    Device.status != DeviceStatus.inactive,
                    Device.rack_unit_start.is_not(None),
                )
            )
        ).one()
        used = int(row.used)
        free = max(0, rack.total_u - used)
        util_pct = round(used / rack.total_u * 100, 1) if rack.total_u > 0 else 0.0

        rack_capacities.append(
            RackCapacity(
                rack_id=str(rack.id),
                rack_name=rack.name,
                total_u=rack.total_u,
                used_u=used,
                free_u=free,
                utilization_pct=util_pct,
            )
        )
        total_u += rack.total_u
        used_u_total += used

    free_u_total = max(0, total_u - used_u_total)
    overall_util = round(used_u_total / total_u * 100, 1) if total_u > 0 else 0.0

    # ── IP utilization ────────────────────────────────────────────────────────
    subnet_count = (
        await db.execute(select(func.count()).select_from(IPNetwork))
    ).scalar_one()
    assigned_ips = (
        await db.execute(
            select(func.count()).select_from(IPAddress)
            .where(IPAddress.status == IPStatus.in_use)
        )
    ).scalar_one()
    available_ips = (
        await db.execute(
            select(func.count()).select_from(IPAddress)
            .where(IPAddress.status == IPStatus.available)
        )
    ).scalar_one()

    # ── VM-to-host ratio ──────────────────────────────────────────────────────
    host_count = (
        await db.execute(select(func.count()).select_from(VirtualizationHost))
    ).scalar_one()
    vm_count = (
        await db.execute(select(func.count()).select_from(VirtualMachine))
    ).scalar_one()
    ratio = round(vm_count / host_count, 2) if host_count > 0 else 0.0

    return CapacityDashboard(
        u_space=USpaceCapacity(
            total_u=total_u,
            used_u=used_u_total,
            free_u=free_u_total,
            utilization_pct=overall_util,
            racks=rack_capacities,
        ),
        ip_utilization=IPUtilization(
            total_subnets=subnet_count,
            total_assigned=assigned_ips,
            total_available=available_ips,
        ),
        vm_host_ratio=VMHostRatio(
            total_hosts=host_count,
            total_vms=vm_count,
            ratio=ratio,
        ),
    )


# ─── GET /dashboard/alerts ────────────────────────────────────────────────────

@router.get("/alerts", response_model=list[AlertRead])
async def dashboard_alerts(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
) -> list[AlertRead]:
    """
    Recent unacknowledged alerts for the dashboard widget.
    Returns up to `limit` alerts ordered by severity (critical first) then created_at desc.
    """
    # Order: critical > warning > info, then newest first
    severity_order = case(
        (Alert.severity == AlertSeverity.critical, 0),
        (Alert.severity == AlertSeverity.warning, 1),
        else_=2,
    )
    result = await db.execute(
        select(Alert)
        .where(Alert.acknowledged_at.is_(None))
        .order_by(severity_order, Alert.created_at.desc())
        .limit(limit)
    )
    items = list(result.scalars().all())
    return [AlertRead.model_validate(a) for a in items]
