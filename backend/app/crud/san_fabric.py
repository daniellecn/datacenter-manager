from app.crud.base import CRUDBase
from app.models.san_fabric import SANFabric
from app.schemas.san_fabric import SANFabricCreate, SANFabricUpdate

crud_san_fabric = CRUDBase[SANFabric, SANFabricCreate, SANFabricUpdate](SANFabric)
