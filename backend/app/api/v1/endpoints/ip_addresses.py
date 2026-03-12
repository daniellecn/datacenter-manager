"""
IP Addresses — Phase 6

Route order matters: static paths before parameterised {id}.

GET    /ip-addresses/available         list unassigned IPs in a subnet (?subnet_id=)
POST   /ip-addresses/scan              async ping sweep, returns job_id
GET    /ip-addresses/scan/{job_id}     poll scan job status/results
GET    /ip-addresses                   list (filter: subnet_id, status, device_id)
POST   /ip-addresses                   create
GET    /ip-addresses/{id}              get one
PUT    /ip-addresses/{id}              update
DELETE /ip-addresses/{id}              delete
"""
import asyncio
import ipaddress
import platform
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.ip_address import crud_ip_address
from app.crud.ip_network import crud_ip_network
from app.models.enums import AuditAction, IPStatus
from app.models.ip_address import IPAddress
from app.schemas.ip_address import IPAddressCreate, IPAddressRead, IPAddressUpdate

router = APIRouter()

# ─── In-memory scan job store ─────────────────────────────────────────────────
# Jobs are kept for up to 1 hour after completion then superseded on next GC call.
_scan_jobs: dict[str, dict[str, Any]] = {}
_MAX_HOSTS_PER_SCAN = 1024  # refuse /8, /16 — insane scan times


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    subnet_id: Optional[uuid.UUID] = None
    cidr: Optional[str] = None
    timeout_seconds: int = 1
    max_parallel: int = 64


class ScanJobResponse(BaseModel):
    job_id: str
    status: str  # queued | running | completed | failed
    cidr: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_hosts: int = 0
    alive_count: int = 0
    discovered: list[dict] = []
    error: Optional[str] = None


class AvailableIPResponse(BaseModel):
    subnet_id: uuid.UUID
    cidr: str
    available: list[str]
    total_available: int


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _to_dict(obj: IPAddressRead) -> dict:
    return obj.model_dump(mode="json")


async def _ping(ip: str, timeout: int) -> bool:
    """Return True if the host responds to a single ping."""
    if platform.system() == "Windows":
        args = ["ping", "-n", "1", "-w", str(timeout * 1000), str(ip)]
    else:
        args = ["ping", "-c", "1", "-W", str(timeout), str(ip)]
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=timeout + 1)
        return proc.returncode == 0
    except (asyncio.TimeoutError, OSError):
        return False


async def _run_scan(
    job_id: str,
    cidr: str,
    subnet_id: Optional[uuid.UUID],
    timeout: int,
    max_parallel: int,
) -> None:
    """Background task: ping-sweep the CIDR and update ip_address records."""
    job = _scan_jobs[job_id]
    job["status"] = "running"
    job["started_at"] = datetime.now(timezone.utc)

    try:
        network = ipaddress.ip_network(cidr, strict=False)
        hosts = list(network.hosts())
        job["total_hosts"] = len(hosts)

        sem = asyncio.Semaphore(max_parallel)

        async def probe(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> dict:
            async with sem:
                alive = await _ping(str(ip), timeout)
            return {"address": str(ip), "alive": alive}

        results = await asyncio.gather(*[probe(h) for h in hosts])

        alive_results = [r for r in results if r["alive"]]
        job["alive_count"] = len(alive_results)
        job["discovered"] = alive_results

        # Persist discovered IPs to the database
        async with AsyncSessionLocal() as db:
            for r in alive_results:
                existing = await crud_ip_address.get_by_address(db, r["address"])
                is_new = existing is None
                await crud_ip_address.upsert_seen(db, address=r["address"], subnet_id=subnet_id)
                r["is_new"] = is_new

        job["status"] = "completed"
        job["completed_at"] = datetime.now(timezone.utc)

    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)
        job["completed_at"] = datetime.now(timezone.utc)


# ─── GET /ip-addresses/available ─────────────────────────────────────────────
# MUST be declared before /{id} to avoid routing conflict

@router.get("/available", response_model=AvailableIPResponse)
async def get_available_ips(
    _: ActiveUser,
    subnet_id: uuid.UUID = Query(..., description="UUID of the ip_networks row"),
    db: AsyncSession = Depends(get_db),
) -> AvailableIPResponse:
    """
    Return IP addresses in the subnet that are not yet assigned or are
    marked as available.  Limited to /22 (1022 hosts) to keep response times
    sensible.
    """
    subnet = await crud_ip_network.get(db, subnet_id)
    if subnet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"IP network {subnet_id} not found.",
        )

    try:
        network = ipaddress.ip_network(str(subnet.cidr), strict=False)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid CIDR stored in network: {exc}",
        )

    # Get all IPs already in the database for this subnet
    assigned_strs = await crud_ip_address.get_assigned_in_subnet(db, subnet_id)
    # IPs with status=available should still appear in the available list
    result = await db.execute(
        select(IPAddress.address).where(
            IPAddress.subnet_id == subnet_id,
            IPAddress.status == IPStatus.available,
        )
    )
    available_in_db = {row[0] for row in result.all()}

    assigned_set = set(assigned_strs) - available_in_db

    available = [
        str(h) for h in network.hosts()
        if str(h) not in assigned_set
    ]

    return AvailableIPResponse(
        subnet_id=subnet_id,
        cidr=str(subnet.cidr),
        available=available[:1000],  # cap at 1000 in response
        total_available=len(available),
    )


# ─── POST /ip-addresses/scan ──────────────────────────────────────────────────

@router.post("/scan", response_model=ScanJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def scan_subnet(
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    _: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> ScanJobResponse:
    """
    Kick off an async ping sweep.  Returns a job_id immediately.
    Poll GET /ip-addresses/scan/{job_id} for results.
    """
    cidr: Optional[str] = body.cidr
    subnet_id = body.subnet_id

    if cidr is None and subnet_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either subnet_id or cidr.",
        )

    if cidr is None and subnet_id is not None:
        subnet = await crud_ip_network.get(db, subnet_id)
        if subnet is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"IP network {subnet_id} not found.",
            )
        cidr = str(subnet.cidr)

    try:
        network = ipaddress.ip_network(cidr, strict=False)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid CIDR: {exc}",
        )

    host_count = network.num_addresses - 2
    if host_count > _MAX_HOSTS_PER_SCAN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Network too large: {host_count} hosts. Maximum is {_MAX_HOSTS_PER_SCAN}. Use a /22 or smaller.",
        )

    job_id = str(uuid.uuid4())
    _scan_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "cidr": cidr,
        "subnet_id": subnet_id,
        "started_at": None,
        "completed_at": None,
        "total_hosts": 0,
        "alive_count": 0,
        "discovered": [],
        "error": None,
    }

    background_tasks.add_task(
        _run_scan,
        job_id,
        cidr,
        subnet_id,
        body.timeout_seconds,
        body.max_parallel,
    )

    return ScanJobResponse(job_id=job_id, status="queued", cidr=cidr)


# ─── GET /ip-addresses/scan/{job_id} ─────────────────────────────────────────

@router.get("/scan/{job_id}", response_model=ScanJobResponse)
async def get_scan_job(
    job_id: str,
    _: ActiveUser,
) -> ScanJobResponse:
    job = _scan_jobs.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan job {job_id} not found.",
        )
    return ScanJobResponse(**job)


# ─── GET /ip-addresses ────────────────────────────────────────────────────────

@router.get("", response_model=Page[IPAddressRead])
async def list_ip_addresses(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    subnet_id: Optional[uuid.UUID] = Query(default=None),
    addr_status: Optional[IPStatus] = Query(default=None, alias="status"),
    device_id: Optional[uuid.UUID] = Query(default=None),
) -> Page[IPAddressRead]:
    filters = []
    if subnet_id is not None:
        filters.append(IPAddress.subnet_id == subnet_id)
    if addr_status is not None:
        filters.append(IPAddress.status == addr_status)
    if device_id is not None:
        filters.append(IPAddress.device_id == device_id)

    items, total = await crud_ip_address.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create([IPAddressRead.model_validate(i) for i in items], total, pagination)


# ─── POST /ip-addresses ───────────────────────────────────────────────────────

@router.post("", response_model=IPAddressRead, status_code=status.HTTP_201_CREATED)
async def create_ip_address(
    body: IPAddressCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> IPAddressRead:
    existing = await crud_ip_address.get_by_address(db, body.address)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"IP address {body.address} already exists.",
        )
    obj = await crud_ip_address.create(db, obj_in=body)
    read = IPAddressRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="ip_address",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(read)},
    )
    return read


# ─── GET /ip-addresses/{id} ───────────────────────────────────────────────────

@router.get("/{id}", response_model=IPAddressRead)
async def get_ip_address(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> IPAddressRead:
    obj = await crud_ip_address.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"IP address {id} not found."
        )
    return IPAddressRead.model_validate(obj)


# ─── PUT /ip-addresses/{id} ───────────────────────────────────────────────────

@router.put("/{id}", response_model=IPAddressRead)
async def update_ip_address(
    id: uuid.UUID,
    body: IPAddressUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> IPAddressRead:
    obj = await crud_ip_address.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"IP address {id} not found."
        )

    if body.address and body.address != obj.address:
        clash = await crud_ip_address.get_by_address(db, body.address)
        if clash and clash.id != id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"IP address {body.address} already exists.",
            )

    before = _to_dict(IPAddressRead.model_validate(obj))
    updated = await crud_ip_address.update(db, db_obj=obj, obj_in=body)
    after = _to_dict(IPAddressRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="ip_address",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return IPAddressRead.model_validate(updated)


# ─── DELETE /ip-addresses/{id} ────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ip_address(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_ip_address.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"IP address {id} not found."
        )

    before = _to_dict(IPAddressRead.model_validate(obj))
    await crud_ip_address.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="ip_address",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )
