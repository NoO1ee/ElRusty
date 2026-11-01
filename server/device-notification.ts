import { isIP } from 'node:net';
import { plainText } from './chat.ts';
export interface EntityPairing {
  ip: string;
  port: number;
  playerId?: string;
  entityId: number;
  entityType: 1 | 2 | 3;
  entityName: string;
}
export function notificationBody(data: any): any | null {
  let body: unknown = data?.body;
  if (Array.isArray(data?.appData)) body = data.appData.find((v: any) => v.key === 'body')?.value;
  if (typeof body === 'object' && body) body = JSON.stringify(body);
  if (typeof body !== 'string' || body.length > 32000) return null;
  try {
    const b = JSON.parse(body);
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}
export function entityNotification(data: unknown): EntityPairing | null {
  const b = notificationBody(data);
  if (
    b?.type !== 'entity' ||
    typeof b.ip !== 'string' ||
    !isIP(b.ip) ||
    !['number', 'string'].includes(typeof b.port) ||
    !['number', 'string'].includes(typeof b.entityId) ||
    !['number', 'string'].includes(typeof b.entityType)
  )
    return null;
  const port = Number(b.port),
    id = Number(b.entityId),
    type = Number(b.entityType);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(id) ||
    id < 1 ||
    id > 4294967295 ||
    ![1, 2, 3].includes(type)
  )
    return null;
  if (b.playerId !== undefined && (typeof b.playerId !== 'string' || !/^\d{17}$/.test(b.playerId)))
    return null;
  const names = { 1: 'Smart Switch', 2: 'Smart Alarm', 3: 'Storage Monitor' };
  const name = typeof b.entityName === 'string' ? plainText(b.entityName, 60) : '';
  return {
    ip: b.ip,
    port,
    ...(b.playerId ? { playerId: b.playerId } : {}),
    entityId: id,
    entityType: type as 1 | 2 | 3,
    entityName: name || names[type as 1 | 2 | 3],
  };
}
