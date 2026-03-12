"""
Topology Service — Phase 6/9

Maintains an in-process NetworkX graph built from the network_links table.
The graph connects devices (nodes) via physical/logical links (edges).

Cache strategy (CLAUDE.md specification):
- Module-level `_graph` + `_dirty` flag + `asyncio.Lock`.
- `mark_dirty()` is called by the links endpoint on every create/update/delete.
- On the next path request, if dirty, the graph is rebuilt and the flag cleared.
- Each worker process maintains its own graph copy — acceptable because topology
  writes are infrequent.

Public API:
  mark_dirty()
  get_path(db, from_device_id, to_device_id) → PathResult
"""
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Optional

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network_interface import NetworkInterface
from app.models.network_link import NetworkLink
from app.models.enums import LinkStatus


# ─── Cache state ──────────────────────────────────────────────────────────────

_graph: nx.Graph = nx.Graph()
_dirty: bool = True
_lock: asyncio.Lock = asyncio.Lock()


def mark_dirty() -> None:
    """Signal that the graph must be rebuilt on the next request."""
    global _dirty
    _dirty = True


# ─── Graph rebuild ────────────────────────────────────────────────────────────

async def _rebuild(db: AsyncSession) -> None:
    """Query all active network_links and rebuild the in-process graph."""
    global _graph, _dirty

    src_if = aliased(NetworkInterface, name="src_if")
    tgt_if = aliased(NetworkInterface, name="tgt_if")

    rows = (
        await db.execute(
            select(
                NetworkLink.id.label("link_id"),
                src_if.device_id.label("src_device_id"),
                tgt_if.device_id.label("tgt_device_id"),
                NetworkLink.link_type,
                NetworkLink.speed_mbps,
                NetworkLink.status,
            )
            .join(src_if, NetworkLink.source_interface_id == src_if.id)
            .join(tgt_if, NetworkLink.target_interface_id == tgt_if.id)
            .where(NetworkLink.status != LinkStatus.inactive)
        )
    ).all()

    g: nx.Graph = nx.Graph()
    for row in rows:
        src = str(row.src_device_id)
        tgt = str(row.tgt_device_id)
        if src == tgt:
            continue  # skip self-loops (same device both ends)
        g.add_edge(
            src,
            tgt,
            link_id=str(row.link_id),
            link_type=row.link_type,
            speed_mbps=row.speed_mbps,
            status=row.status,
        )

    _graph = g
    _dirty = False


# ─── Public API ───────────────────────────────────────────────────────────────

@dataclass
class PathResult:
    from_device_id: uuid.UUID
    to_device_id: uuid.UUID
    hop_count: int
    path_device_ids: list[uuid.UUID]
    reachable: bool
    edges: list[dict] = field(default_factory=list)


async def get_path(
    db: AsyncSession,
    from_device_id: uuid.UUID,
    to_device_id: uuid.UUID,
) -> PathResult:
    """
    Return the shortest hop path between two devices.

    Raises networkx.NetworkXNoPath if no path exists.
    Raises networkx.NodeNotFound if either device is not in the graph.
    """
    async with _lock:
        if _dirty:
            await _rebuild(db)

    src = str(from_device_id)
    tgt = str(to_device_id)

    if src == tgt:
        return PathResult(
            from_device_id=from_device_id,
            to_device_id=to_device_id,
            hop_count=0,
            path_device_ids=[from_device_id],
            reachable=True,
        )

    try:
        path_nodes: list[str] = nx.shortest_path(_graph, source=src, target=tgt)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return PathResult(
            from_device_id=from_device_id,
            to_device_id=to_device_id,
            hop_count=-1,
            path_device_ids=[],
            reachable=False,
        )

    # Collect edge data for each hop
    edges: list[dict] = []
    for i in range(len(path_nodes) - 1):
        edge_data = _graph.get_edge_data(path_nodes[i], path_nodes[i + 1]) or {}
        edges.append(
            {
                "from_device_id": path_nodes[i],
                "to_device_id": path_nodes[i + 1],
                "link_id": edge_data.get("link_id"),
                "link_type": edge_data.get("link_type"),
                "speed_mbps": edge_data.get("speed_mbps"),
            }
        )

    return PathResult(
        from_device_id=from_device_id,
        to_device_id=to_device_id,
        hop_count=len(path_nodes) - 1,
        path_device_ids=[uuid.UUID(n) for n in path_nodes],
        reachable=True,
        edges=edges,
    )
