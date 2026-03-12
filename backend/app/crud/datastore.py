import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.datastore import Datastore
from app.schemas.datastore import DatastoreCreate, DatastoreUpdate


class CRUDDatastore(CRUDBase[Datastore, DatastoreCreate, DatastoreUpdate]):
    async def get_by_cluster(
        self, db: AsyncSession, cluster_id: uuid.UUID, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[Datastore], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[Datastore.cluster_id == cluster_id],
        )


crud_datastore = CRUDDatastore(Datastore)
