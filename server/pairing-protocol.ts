import { notificationBody } from './device-notification.ts';
import { parsePairing } from '../shared/pairing.ts';
export const AUTH_ORIGIN = 'https://companion-rust.facepunch.com';
export const authBridgeScript = `if (location.origin === '${AUTH_ORIGIN}' && window.top === window) {
  window.ReactNativeWebView = { postMessage(message) { window.elrustyAuth(String(message)); } };
}`;
export function authFromBinding(origin: string, defaultContext: boolean, payload: unknown) {
  if (
    origin !== AUTH_ORIGIN ||
    !defaultContext ||
    typeof payload !== 'string' ||
    payload.length > 16000
  )
    return null;
  try {
    const auth = JSON.parse(payload);
    return typeof auth.Token === 'string' && auth.Token.length > 0 && auth.Token.length < 4000
      ? auth.Token
      : null;
  } catch {
    return null;
  }
}
export function serverNotification(data: any) {
  const decoded = notificationBody(data);
  if (decoded?.type && decoded.type !== 'server') return null;
  // push-receiver emits a decrypted FCM stanza with appData name/value entries.
  let body: unknown = data?.body;
  if (Array.isArray(data?.appData)) body = data.appData.find((v: any) => v.key === 'body')?.value;
  if (typeof body === 'object' && body) body = JSON.stringify(body);
  if (typeof body !== 'string' || body.length > 32000) return null;
  try {
    return parsePairing(body);
  } catch {
    return null;
  }
}
