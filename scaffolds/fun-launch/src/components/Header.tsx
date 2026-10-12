import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Link from 'next/link';
import { Button } from './ui/button';
import { CreatePoolButton } from './CreatePoolButton';
import { ThemeToggle } from './ThemeToggle';
import { useMemo } from 'react';
import { shortenAddress } from '@/lib/utils';

export const Header = () => {
  const { setShowModal } = useUnifiedWalletContext();

  const { disconnect, publicKey } = useWallet();
  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);

  const handleConnectWallet = () => {
    setShowModal(true);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-900 bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 w-full items-center justify-between gap-2 px-3 md:h-16 md:px-4">
        {/* Logo Section */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary">
            <span className="iconify h-6 w-6 ph--arrow-fat-lines-up-fill" />
          </span>
          <span className="truncate whitespace-nowrap text-base font-semibold uppercase tracking-[0.08em] md:text-lg">
            Ratchet
          </span>
          <span className="hidden rounded-md border border-neutral-750 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-500 sm:inline">
            on Meteora
          </span>
        </Link>

        {/* Navigation and Actions */}
        <div className="flex items-center gap-1.5 md:gap-3">
          <Link
            href="/try"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-primary hover:text-foreground md:block"
          >
            Try the vault
          </Link>
          <Link
            href="/unlocks"
            className="hidden rounded-lg px-3 py-2 text-sm text-neutral-300 hover:text-foreground md:block"
          >
            Unlocks
          </Link>
          <Link
            href="/vault"
            className="hidden rounded-lg px-3 py-2 text-sm text-neutral-300 hover:text-foreground md:block"
          >
            Vault
          </Link>
          <Link
            href="/check"
            className="hidden rounded-lg px-3 py-2 text-sm text-neutral-300 hover:text-foreground sm:block"
          >
            Check a token
          </Link>
          {address && (
            <Link
              href="/earnings"
              className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:text-foreground"
            >
              Earnings
            </Link>
          )}
          <CreatePoolButton />
          {address ? (
            <Button variant="secondary" onClick={() => disconnect()}>
              <span className="iconify h-4 w-4 ph--wallet-bold" />
              {shortenAddress(address)}
            </Button>
          ) : (
            <Button
              onClick={() => {
                handleConnectWallet();
              }}
            >
              <span className="hidden md:block">Connect Wallet</span>
              <span className="block md:hidden">Connect</span>
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
