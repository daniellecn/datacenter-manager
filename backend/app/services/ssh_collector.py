# SSH Collector Service — Phase 8
#
# Connects to network devices via SSH using Netmiko (multi-vendor).
# Supported OS types: cisco_ios, cisco_nxos, arista_eos, juniper_junos, fortinet.
# Collects: version, interfaces, CDP/LLDP neighbors, ARP table.
# Credential resolution: device-level SSH creds → integration default.


class SSHCollectorService:
    """Execute show commands via Netmiko and normalize output."""
    pass
