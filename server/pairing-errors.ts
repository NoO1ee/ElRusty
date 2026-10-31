export type PairingStep = 'fcm' | 'expo' | 'browser' | 'companion' | 'save' | 'listen';
export interface PairingFailure {
  step?: PairingStep;
  httpStatus?: number;
  fileCode?: string;
}
const steps = new Set<PairingStep>(['fcm', 'expo', 'browser', 'companion', 'save', 'listen']);
const fileCodes = new Set(['EACCES', 'EPERM', 'ENOSPC', 'EROFS', 'EBUSY']);
export function safeFailure(step: PairingStep, error: unknown): PairingFailure {
  const e = error as { response?: { status?: unknown }; code?: unknown } | null;
  const status = e?.response?.status,
    code = e?.code;
  return {
    step,
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
      ? { httpStatus: status }
      : {}),
    ...(typeof code === 'string' && fileCodes.has(code) ? { fileCode: code } : {}),
  };
}
export function pairingFailureMessage(raw: PairingFailure, action: 'register' | 'listen') {
  const step = steps.has(raw.step as PairingStep) ? raw.step : undefined;
  const messages: Record<PairingStep, string> = {
    fcm: 'Registreringen hos FCM misslyckades. Kontrollera internet och försök igen.',
    expo: 'Det gick inte att hämta anslutningsuppgifter från Expo. Försök igen.',
    browser:
      'Inloggningssvaret från Steam/Facepunch kunde inte tas emot. Försök igen och låt inloggningsfönstret vara öppet tills steget är klart.',
    companion: 'Inloggningen mottogs, men Rust+ kunde inte slutföra registreringen. Försök igen.',
    save: 'Inloggningen mottogs, men registreringen kunde inte sparas lokalt. Kontrollera skrivbehörighet och ledigt diskutrymme.',
    listen: 'Kunde inte lyssna på Rust+. Kontrollera anslutningen eller registrera på nytt.',
  };
  let message = step
    ? messages[step]
    : action === 'register'
      ? 'Registreringen misslyckades. Försök igen.'
      : messages.listen;
  if (
    typeof raw.httpStatus === 'number' &&
    Number.isInteger(raw.httpStatus) &&
    raw.httpStatus >= 400 &&
    raw.httpStatus <= 599
  )
    message += ` (HTTP ${raw.httpStatus})`;
  if (typeof raw.fileCode === 'string' && fileCodes.has(raw.fileCode))
    message += ` (${raw.fileCode})`;
  if (action === 'register') message += ' Tidigare registrering behålls.';
  return message;
}
