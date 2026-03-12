# SNMP Collector Service — Phase 8
#
# Polls network devices via SNMP v2c / v3 using pysnmp.
# Collects: sysDescr, sysName, sysUpTime, ifTable (interfaces + status + speed),
#           entPhysicalTable (hardware inventory).
# Maps results to device_network + network_interfaces schema.


class SNMPService:
    """Walk MIBs on network devices and normalize results."""
    pass
