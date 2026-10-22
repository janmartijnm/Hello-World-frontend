// The parts of NetBox's API objects that the explorer uses

export interface Ref {
  id: number;
  display: string;
  url?: string;
  display_url?: string;
  name?: string;
  slug?: string;
}

export type Choice =
  | {
      value: string;
      label: string;
    }
  | string;

export interface Tag extends Ref {
  color: string;
}

export interface Base {
  id: number;
  display: string;
  display_url: string;
  url: string;
  custom_fields?: Record<string, unknown>;
  tags?: Tag[];
  description?: string;
  comments?: string;
  created?: string;
  last_updated?: string;
}

export interface Site extends Base {
  name: string;
  slug: string;
  status: Choice;
  region: Ref | null;
  group: Ref | null;
  tenant: Ref | null;
  facility: string;
  time_zone: string | null;
  physical_address: string;
  shipping_address: string;
  latitude: number | null;
  longitude: number | null;
  device_count?: number;
}

export interface Device extends Base {
  name: string | null;
  status: Choice;
  site: Ref;
  location: Ref | null;
  rack: Ref | null;
  position: number | null;
  role: Ref;
  device_type: Ref & { manufacturer: Ref; model: string };
  platform: Ref | null;
  tenant: Ref | null;
  serial: string;
  asset_tag: string | null;
  primary_ip4: Ref | null;
  primary_ip6: Ref | null;
  oob_ip: Ref | null;
  interface_count?: number;
}

export interface Interface extends Base {
  name: string;
  device: Ref;
  label: string;
  type: Choice;
  enabled: boolean;
  mgmt_only: boolean;
  mtu: number | null;
  speed: number | null;
  mode: Choice | null;
  untagged_vlan: Ref | null;
  vrf: Ref | null;
  link_peers: (Ref & { device?: Ref })[];
  connected_endpoints: (Ref & { device?: Ref })[] | null;
  cable: Ref | null;
  primary_mac_address: Ref | null;
}

export interface IPAddress extends Base {
  address: string;
  status: Choice;
  dns_name: string;
  vrf: Ref | null;
  assigned_object_type: string | null;
  assigned_object_id: number | null;
}

export interface Service extends Base {
  service_id: string;
  name: string;
  type: Ref;
  level: (Ref & { availability_target?: string | null }) | null;
  status: Choice;
  tenant: Ref | null;
  download_speed: number | null;
  upload_speed: number | null;
  availability: string | null;
  effective_availability: string | null;
  order_date: string | null;
  activation_date: string | null;
  contract_start: string | null;
  contract_end: string | null;
  decommission_date: string | null;
  device: Ref | null;
  interface: (Ref & { device: Ref }) | null;
  virtual_machines: number[];
  circuits: number[];
  prefixes: number[];
  vlans: number[];
  vrfs: number[];
  l2vpns: number[];
}

export interface ServiceLevel extends Base {
  name: string;
  color: string;
  availability_target: string | null;
  response_time: number | null;
  restore_time: number | null;
  support_hours: string;
}

export interface ServiceType extends Base {
  name: string;
  color: string;
}

export interface Asset extends Base {
  name: string;
  serial: string;
  asset_tag: string | null;
  status: Choice;
  kind: Choice;
  role: Ref | null;
  device_type: (Ref & { manufacturer: Ref }) | null;
  module_type: (Ref & { manufacturer: Ref }) | null;
  inventoryitem_type: (Ref & { manufacturer: Ref }) | null;
  rack_type: (Ref & { manufacturer: Ref }) | null;
  device: Ref | null;
  module: (Ref & { device?: Ref }) | null;
  inventoryitem: (Ref & { device?: Ref }) | null;
  rack: Ref | null;
  tenant: Ref | null;
  owning_tenant: Ref | null;
  owner: Ref | null;
  storage_location: (Ref & { site?: Ref }) | null;
  delivery: (Ref & { date?: string | null }) | null;
  purchase: (Ref & { supplier?: Ref; date?: string | null }) | null;
  warranty_start: string | null;
  warranty_end: string | null;
}
