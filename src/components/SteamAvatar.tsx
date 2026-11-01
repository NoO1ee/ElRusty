import { useEffect, useState } from 'react';
export function SteamAvatar({
  steamId,
  name,
  online,
}: {
  steamId: string;
  name: string;
  online: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [steamId]);
  return (
    <span className={'live-avatar ' + (online ? 'success' : '')}>
      {failed ? (
        name.slice(0, 1).toUpperCase()
      ) : (
        <img
          src={'/api/live/team/avatar/' + steamId}
          alt={'Steam-bild för ' + name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
