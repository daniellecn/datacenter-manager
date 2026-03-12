"""Initial schema — all tables, indexes, and constraints.

Revision ID: 0001
Revises:
Create Date: 2026-03-10 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. users ─────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("username", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="read_only"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_username", "users", ["username"])

    # ── 2. datacenters ────────────────────────────────────────────────────────
    op.create_table(
        "datacenters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("total_power_kw", sa.Numeric(10, 2), nullable=True),
        sa.Column("total_cooling_kw", sa.Numeric(10, 2), nullable=True),
        sa.Column("pue", sa.Numeric(4, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_datacenters"),
    )

    # ── 3. vlans ──────────────────────────────────────────────────────────────
    op.create_table(
        "vlans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vlan_id", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_vlans"),
        sa.UniqueConstraint("vlan_id", name="uq_vlans_vlan_id"),
    )

    # ── 4. san_fabrics ────────────────────────────────────────────────────────
    op.create_table(
        "san_fabrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("fabric_type", sa.String(20), nullable=False),
        sa.Column("speed_gbps", sa.Integer(), nullable=True),
        sa.Column("wwn", sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_san_fabrics"),
    )

    # ── 5. rooms ──────────────────────────────────────────────────────────────
    op.create_table(
        "rooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("datacenter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("floor", sa.SmallInteger(), nullable=True),
        sa.Column("cooling_type", sa.String(20), nullable=True),
        sa.Column("raised_floor", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("width_m", sa.Numeric(8, 2), nullable=True),
        sa.Column("depth_m", sa.Numeric(8, 2), nullable=True),
        sa.Column("height_m", sa.Numeric(8, 2), nullable=True),
        sa.Column("max_power_kw", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["datacenter_id"],
            ["datacenters.id"],
            name="fk_rooms_datacenter_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rooms"),
    )
    op.create_index("ix_rooms_datacenter_id", "rooms", ["datacenter_id"])

    # ── 6. racks ──────────────────────────────────────────────────────────────
    op.create_table(
        "racks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("row", sa.String(20), nullable=True),
        sa.Column("column", sa.String(20), nullable=True),
        sa.Column("total_u", sa.SmallInteger(), nullable=False, server_default="42"),
        sa.Column("max_power_w", sa.Integer(), nullable=True),
        sa.Column("max_weight_kg", sa.Numeric(8, 2), nullable=True),
        sa.Column("airflow_direction", sa.String(20), nullable=True),
        sa.Column("power_feed_count", sa.SmallInteger(), nullable=False, server_default="2"),
        sa.Column("manufacturer", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("serial_number", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["rooms.id"],
            name="fk_racks_room_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_racks"),
    )
    op.create_index("ix_racks_room_id", "racks", ["room_id"])

    # ── 7. ip_networks ────────────────────────────────────────────────────────
    op.create_table(
        "ip_networks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cidr", postgresql.CIDR(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("gateway", postgresql.INET(), nullable=True),
        sa.Column("vlan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("purpose", sa.String(20), nullable=True),
        sa.Column("dhcp_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("dhcp_range_start", postgresql.INET(), nullable=True),
        sa.Column("dhcp_range_end", postgresql.INET(), nullable=True),
        sa.Column(
            "dns_servers",
            postgresql.ARRAY(postgresql.INET()),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["vlan_id"],
            ["vlans.id"],
            name="fk_ip_networks_vlan_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ip_networks"),
    )
    op.create_index("ix_ip_networks_vlan_id", "ip_networks", ["vlan_id"])

    # ── 8. devices ────────────────────────────────────────────────────────────
    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rack_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("device_type", sa.String(30), nullable=False),
        sa.Column("manufacturer", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("part_number", sa.String(255), nullable=True),
        sa.Column("serial_number", sa.String(255), nullable=True),
        sa.Column("asset_tag", sa.String(100), nullable=True),
        sa.Column("rack_unit_start", sa.SmallInteger(), nullable=True),
        sa.Column("rack_unit_size", sa.SmallInteger(), nullable=True),
        sa.Column("face", sa.String(10), nullable=True),
        sa.Column("power_rated_w", sa.Integer(), nullable=True),
        sa.Column("power_actual_w", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Numeric(8, 2), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("management_ip", postgresql.INET(), nullable=True),
        sa.Column("management_protocol", sa.String(10), nullable=True),
        sa.Column("snmp_community", sa.String(500), nullable=True),
        sa.Column("snmp_version", sa.String(5), nullable=True),
        sa.Column("ssh_username", sa.String(100), nullable=True),
        sa.Column("ssh_password_enc", sa.String(500), nullable=True),
        sa.Column("ssh_key_enc", sa.Text(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("warranty_expiry", sa.Date(), nullable=True),
        sa.Column("end_of_support_date", sa.Date(), nullable=True),
        sa.Column("end_of_life_date", sa.Date(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("custom_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["rack_id"],
            ["racks.id"],
            name="fk_devices_rack_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_devices"),
    )
    op.create_index("ix_devices_rack_id", "devices", ["rack_id"])
    op.create_index("ix_devices_device_type", "devices", ["device_type"])
    op.create_index("ix_devices_status", "devices", ["status"])
    op.create_index("ix_devices_serial_number", "devices", ["serial_number"])
    op.create_index("ix_devices_asset_tag", "devices", ["asset_tag"])
    op.create_index("ix_devices_warranty_expiry", "devices", ["warranty_expiry"])
    op.create_index("ix_devices_end_of_support_date", "devices", ["end_of_support_date"])
    op.create_index("ix_devices_end_of_life_date", "devices", ["end_of_life_date"])

    # ── 9. device_servers ─────────────────────────────────────────────────────
    op.create_table(
        "device_servers",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("form_factor", sa.String(10), nullable=True),
        sa.Column("blade_chassis_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("blade_slot", sa.SmallInteger(), nullable=True),
        sa.Column("cpu_model", sa.String(255), nullable=True),
        sa.Column("cpu_socket_count", sa.SmallInteger(), nullable=True),
        sa.Column("cpu_cores_per_socket", sa.SmallInteger(), nullable=True),
        sa.Column("cpu_threads_per_core", sa.SmallInteger(), nullable=True),
        sa.Column("ram_gb", sa.Integer(), nullable=True),
        sa.Column("ram_max_gb", sa.Integer(), nullable=True),
        sa.Column("ram_slots_total", sa.SmallInteger(), nullable=True),
        sa.Column("ram_slots_used", sa.SmallInteger(), nullable=True),
        sa.Column(
            "storage_drives",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("nic_count", sa.SmallInteger(), nullable=True),
        sa.Column("hba_count", sa.SmallInteger(), nullable=True),
        sa.Column("bios_version", sa.String(100), nullable=True),
        sa.Column("bmc_firmware_version", sa.String(100), nullable=True),
        sa.Column("xclarity_uuid", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_device_servers_device_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["blade_chassis_id"],
            ["devices.id"],
            name="fk_device_servers_blade_chassis_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("device_id", name="pk_device_servers"),
    )
    op.create_index("ix_device_servers_xclarity_uuid", "device_servers", ["xclarity_uuid"])

    # ── 10. device_network ────────────────────────────────────────────────────
    op.create_table(
        "device_network",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("os_type", sa.String(50), nullable=True),
        sa.Column("os_version", sa.String(100), nullable=True),
        sa.Column("port_count", sa.Integer(), nullable=True),
        sa.Column("uplink_port_count", sa.Integer(), nullable=True),
        sa.Column("management_vlan", sa.SmallInteger(), nullable=True),
        sa.Column("spanning_tree_mode", sa.String(10), nullable=True),
        sa.Column("spanning_tree_priority", sa.Integer(), nullable=True),
        sa.Column("stacking_enabled", sa.Boolean(), nullable=True),
        sa.Column("stack_member_id", sa.SmallInteger(), nullable=True),
        sa.Column("snmp_sysoid", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_device_network_device_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("device_id", name="pk_device_network"),
    )

    # ── 11. device_pdu ────────────────────────────────────────────────────────
    op.create_table(
        "device_pdu",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("outlet_count", sa.SmallInteger(), nullable=True),
        sa.Column("outlet_type", sa.String(30), nullable=True),
        sa.Column("input_voltage", sa.SmallInteger(), nullable=True),
        sa.Column("input_current_max_a", sa.Numeric(6, 2), nullable=True),
        sa.Column("is_metered", sa.Boolean(), nullable=True),
        sa.Column("is_switched", sa.Boolean(), nullable=True),
        sa.Column("current_load_w", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_device_pdu_device_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("device_id", name="pk_device_pdu"),
    )

    # ── 12. licenses ──────────────────────────────────────────────────────────
    op.create_table(
        "licenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("vendor", sa.String(255), nullable=True),
        sa.Column("license_key_enc", sa.Text(), nullable=True),
        sa.Column("license_type", sa.String(20), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("cost_usd", sa.Numeric(12, 2), nullable=True),
        sa.Column("renewal_reminder_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_licenses_device_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_licenses"),
    )
    op.create_index("ix_licenses_device_id", "licenses", ["device_id"])
    op.create_index("ix_licenses_expiry_date", "licenses", ["expiry_date"])

    # ── 13. lag_groups ────────────────────────────────────────────────────────
    op.create_table(
        "lag_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("combined_speed_mbps", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_lag_groups_device_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lag_groups"),
    )
    op.create_index("ix_lag_groups_device_id", "lag_groups", ["device_id"])

    # ── 14. network_interfaces ────────────────────────────────────────────────
    op.create_table(
        "network_interfaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("media_type", sa.String(20), nullable=False),
        sa.Column("speed_mbps", sa.Integer(), nullable=True),
        sa.Column("mac_address", postgresql.MACADDR(), nullable=True),
        sa.Column("wwn", sa.String(50), nullable=True),
        sa.Column("is_management", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_uplink", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("duplex", sa.String(10), nullable=True),
        sa.Column("mtu", sa.SmallInteger(), nullable=True),
        sa.Column("status", sa.String(15), nullable=False, server_default="unknown"),
        sa.Column("last_polled_status", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_network_interfaces_device_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_network_interfaces"),
    )
    op.create_index("ix_network_interfaces_device_id", "network_interfaces", ["device_id"])

    # ── 15. network_links ─────────────────────────────────────────────────────
    op.create_table(
        "network_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_interface_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_interface_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("link_type", sa.String(20), nullable=False),
        sa.Column("speed_mbps", sa.Integer(), nullable=True),
        sa.Column("cable_label", sa.String(100), nullable=True),
        sa.Column("cable_color", sa.String(30), nullable=True),
        sa.Column("lag_group_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("patch_panel_port_a", sa.String(50), nullable=True),
        sa.Column("patch_panel_port_b", sa.String(50), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["source_interface_id"],
            ["network_interfaces.id"],
            name="fk_network_links_source_interface_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_interface_id"],
            ["network_interfaces.id"],
            name="fk_network_links_target_interface_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lag_group_id"],
            ["lag_groups.id"],
            name="fk_network_links_lag_group_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_network_links"),
    )
    op.create_index(
        "ix_network_links_source_interface_id", "network_links", ["source_interface_id"]
    )
    op.create_index(
        "ix_network_links_target_interface_id", "network_links", ["target_interface_id"]
    )
    op.create_index("ix_network_links_lag_group_id", "network_links", ["lag_group_id"])

    # ── 16. virtualization_clusters ───────────────────────────────────────────
    op.create_table(
        "virtualization_clusters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False),
        sa.Column("management_url", sa.String(500), nullable=True),
        sa.Column("management_username", sa.String(100), nullable=True),
        sa.Column("management_password_enc", sa.String(500), nullable=True),
        sa.Column(
            "platform_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("ha_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("drs_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("total_vcpu", sa.Integer(), nullable=True),
        sa.Column("total_ram_gb", sa.Integer(), nullable=True),
        sa.Column("total_storage_tb", sa.Numeric(12, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_virtualization_clusters"),
    )
    op.create_index(
        "ix_virtualization_clusters_platform", "virtualization_clusters", ["platform"]
    )

    # ── 17. virtualization_hosts ──────────────────────────────────────────────
    op.create_table(
        "virtualization_hosts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cluster_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform_version", sa.String(100), nullable=True),
        sa.Column("platform_uuid", sa.String(255), nullable=True),
        sa.Column(
            "platform_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("vcpu_allocated", sa.Integer(), nullable=True),
        sa.Column("ram_allocated_gb", sa.Integer(), nullable=True),
        sa.Column("is_in_maintenance", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_virtualization_hosts_device_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["cluster_id"],
            ["virtualization_clusters.id"],
            name="fk_virtualization_hosts_cluster_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_virtualization_hosts"),
    )
    op.create_index("ix_virtualization_hosts_device_id", "virtualization_hosts", ["device_id"])
    op.create_index(
        "ix_virtualization_hosts_cluster_id", "virtualization_hosts", ["cluster_id"]
    )
    op.create_index(
        "ix_virtualization_hosts_platform_uuid", "virtualization_hosts", ["platform_uuid"]
    )

    # ── 18. virtual_machines ──────────────────────────────────────────────────
    op.create_table(
        "virtual_machines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("platform_vm_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(15), nullable=False, server_default="stopped"),
        sa.Column("os_type", sa.String(15), nullable=True),
        sa.Column("os_version", sa.String(100), nullable=True),
        sa.Column("vcpu_count", sa.Integer(), nullable=True),
        sa.Column("ram_gb", sa.Integer(), nullable=True),
        sa.Column("storage_gb", sa.Integer(), nullable=True),
        sa.Column("tools_version", sa.String(50), nullable=True),
        sa.Column("is_template", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("snapshot_count", sa.SmallInteger(), nullable=True),
        sa.Column(
            "platform_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["host_id"],
            ["virtualization_hosts.id"],
            name="fk_virtual_machines_host_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_virtual_machines"),
    )
    op.create_index("ix_virtual_machines_host_id", "virtual_machines", ["host_id"])
    op.create_index("ix_virtual_machines_platform_vm_id", "virtual_machines", ["platform_vm_id"])
    op.create_index("ix_virtual_machines_status", "virtual_machines", ["status"])

    # ── 19. datastores ────────────────────────────────────────────────────────
    op.create_table(
        "datastores",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cluster_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("datastore_type", sa.String(10), nullable=False),
        sa.Column("total_gb", sa.Integer(), nullable=True),
        sa.Column("free_gb", sa.Integer(), nullable=True),
        sa.Column("san_fabric_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("platform_name", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["cluster_id"],
            ["virtualization_clusters.id"],
            name="fk_datastores_cluster_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["san_fabric_id"],
            ["san_fabrics.id"],
            name="fk_datastores_san_fabric_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_datastores"),
    )
    op.create_index("ix_datastores_cluster_id", "datastores", ["cluster_id"])
    op.create_index("ix_datastores_san_fabric_id", "datastores", ["san_fabric_id"])

    # ── 20. ip_addresses ──────────────────────────────────────────────────────
    op.create_table(
        "ip_addresses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("address", postgresql.INET(), nullable=False),
        sa.Column("subnet_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("interface_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("vm_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fqdn", sa.String(255), nullable=True),
        sa.Column("assignment_type", sa.String(10), nullable=False, server_default="static"),
        sa.Column("status", sa.String(15), nullable=False, server_default="in_use"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["subnet_id"],
            ["ip_networks.id"],
            name="fk_ip_addresses_subnet_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name="fk_ip_addresses_device_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["interface_id"],
            ["network_interfaces.id"],
            name="fk_ip_addresses_interface_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["vm_id"],
            ["virtual_machines.id"],
            name="fk_ip_addresses_vm_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ip_addresses"),
        sa.UniqueConstraint("address", name="uq_ip_addresses_address"),
    )
    op.create_index("ix_ip_addresses_address", "ip_addresses", ["address"])
    op.create_index("ix_ip_addresses_subnet_id", "ip_addresses", ["subnet_id"])
    op.create_index("ix_ip_addresses_device_id", "ip_addresses", ["device_id"])
    op.create_index("ix_ip_addresses_interface_id", "ip_addresses", ["interface_id"])
    op.create_index("ix_ip_addresses_vm_id", "ip_addresses", ["vm_id"])
    op.create_index("ix_ip_addresses_status", "ip_addresses", ["status"])

    # ── 21. integrations ──────────────────────────────────────────────────────
    op.create_table(
        "integrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("integration_type", sa.String(20), nullable=False),
        sa.Column("host", sa.String(500), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column(
            "credentials_enc",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "extra_config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "polling_interval_sec", sa.Integer(), nullable=False, server_default="3600"
        ),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="disabled"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_integrations"),
    )
    op.create_index("ix_integrations_integration_type", "integrations", ["integration_type"])

    # ── 22. sync_logs ─────────────────────────────────────────────────────────
    op.create_table(
        "sync_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("integration_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(10), nullable=True),
        sa.Column("items_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("items_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("items_unchanged", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "errors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"],
            ["integrations.id"],
            name="fk_sync_logs_integration_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sync_logs"),
    )
    op.create_index("ix_sync_logs_integration_id", "sync_logs", ["integration_id"])

    # ── 23. audit_logs ────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(50), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("diff", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_audit_logs_user_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_logs"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    # Composite index for per-entity history queries
    op.create_index(
        "ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"]
    )
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])


def downgrade() -> None:
    # Drop in reverse FK-dependency order
    op.drop_table("audit_logs")
    op.drop_table("sync_logs")
    op.drop_table("integrations")
    op.drop_table("ip_addresses")
    op.drop_table("datastores")
    op.drop_table("virtual_machines")
    op.drop_table("virtualization_hosts")
    op.drop_table("virtualization_clusters")
    op.drop_table("network_links")
    op.drop_table("network_interfaces")
    op.drop_table("lag_groups")
    op.drop_table("licenses")
    op.drop_table("device_pdu")
    op.drop_table("device_network")
    op.drop_table("device_servers")
    op.drop_table("devices")
    op.drop_table("ip_networks")
    op.drop_table("racks")
    op.drop_table("rooms")
    op.drop_table("san_fabrics")
    op.drop_table("vlans")
    op.drop_table("datacenters")
    op.drop_table("users")
