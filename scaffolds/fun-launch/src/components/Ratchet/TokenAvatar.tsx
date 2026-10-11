import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/** Token logo from its Metaplex metadata JSON, falling back to a symbol monogram. */
export function TokenAvatar({
  uri,
  symbol,
  className,
}: {
  uri: string;
  symbol: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const { data: image } = useQuery(
    ['token-image', uri],
    async () => {
      const res = await fetch(uri);
      const json = (await res.json()) as { image?: string };
      return json.image ?? null;
    },
    { enabled: !!uri, staleTime: Infinity, cacheTime: Infinity, retry: false }
  );

  return (
    <div
      className={cn(
        'relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 to-neutral-900 font-mono text-sm font-bold text-primary ring-1 ring-primary/30',
        className
      )}
    >
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        symbol.slice(0, 2).toUpperCase()
      )}
    </div>
  );
}
