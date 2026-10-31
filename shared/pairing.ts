export function parsePairing(raw: string) {
  let p = JSON.parse(raw);
  if (p?.body) p = typeof p.body === 'string' ? JSON.parse(p.body) : p.body;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Ogiltig parningsfil.');
  if (typeof p.playerId !== 'string' || !/^\d{17}$/.test(p.playerId))
    throw new Error('playerId måste vara SteamID64 som en textsträng, inte ett avrundat JSON-tal.');
  if (
    !['number', 'string'].includes(typeof p.port) ||
    !['number', 'string'].includes(typeof p.playerToken)
  )
    throw new Error('Port och token måste vara tal.');
  const port = Number(p.port),
    token = Number(p.playerToken);
  if (
    typeof p.ip !== 'string' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    p.playerToken === undefined ||
    p.playerToken === '' ||
    !Number.isInteger(token) ||
    token < -2147483648 ||
    token > 2147483647
  )
    throw new Error('Parningen behöver ip, port, playerId och playerToken.');
  return {
    name: typeof p.name === 'string' ? p.name : 'Min Rust-server',
    host: p.ip,
    port,
    playerId: p.playerId,
    playerToken: String(token),
    useProxy: false,
  };
}
