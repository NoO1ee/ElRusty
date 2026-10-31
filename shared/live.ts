export type DeviceType = 'switch' | 'alarm' | 'storage';
export interface Profile {
  id: string;
  name: string;
  host: string;
  port: number;
  playerId: string;
  useProxy: boolean;
}
export interface Device {
  id: string;
  profileId: string;
  entityId: number;
  name: string;
  group: string;
  type: DeviceType;
}
export interface Mode {
  id: string;
  profileId: string;
  name: string;
  values: { deviceId: string; value: boolean }[];
}
export interface Member {
  steamId: string;
  name: string;
  isOnline: boolean;
  isAlive: boolean;
}
export interface Entity {
  type: DeviceType;
  value: boolean;
  items?: { itemId: number; quantity: number }[];
}
export interface DeviceState extends Entity {
  updatedAt: number;
}
export interface Activity {
  id: string;
  at: number;
  profileId: string;
  kind: 'alarm' | 'info' | 'error';
  text: string;
}
export interface DiscordConfig {
  guildId: string;
  channelId: string;
  userIds: string[];
  roleIds: string[];
}
export interface LiveSnapshot {
  pairing?: PairingStatus;
  profiles: Profile[];
  activeProfileId: string | null;
  devices: Device[];
  modes: Mode[];
  connection: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  connectionError: string;
  team: Member[];
  teamUpdatedAt: number | null;
  states: Record<string, DeviceState>;
  verified: string[];
  pending: string[];
  activity: Activity[];
  discord: DiscordConfig & { hasToken: boolean; status: string };
}
export interface CommandResult {
  deviceId: string;
  name: string;
  ok: boolean;
  error?: string;
}

export interface PairingStatus {
  status: 'idle' | 'registering' | 'registered' | 'listening' | 'error';
  message: string;
  hasRegistration: boolean;
  running: boolean;
  candidates: { id: string; name: string; host: string; port: number; expiresAt: number }[];
}
