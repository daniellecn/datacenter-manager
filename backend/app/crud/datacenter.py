from app.crud.base import CRUDBase
from app.models.datacenter import DataCenter
from app.schemas.datacenter import DataCenterCreate, DataCenterUpdate

crud_datacenter = CRUDBase[DataCenter, DataCenterCreate, DataCenterUpdate](DataCenter)
