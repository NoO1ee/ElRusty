import { useState } from 'react';
import { Box } from 'lucide-react';
import { byItem } from '../data/items';
export function ItemImage({ item, className = '' }: { item: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = byItem[item]?.image;
  return failed || !src ? (
    <Box className={'item-image placeholder ' + className} aria-label="Bild saknas" />
  ) : (
    <img
      className={'item-image ' + className}
      src={src}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
