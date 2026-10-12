import '@/styles/globals.css';
import { Adapter, UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import type { AppProps } from 'next/app';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NETWORK } from '@/presets';
import { useWindowWidthListener } from '@/lib/device';

function AppProviders({ Component, pageProps }: AppProps) {
  const { resolvedTheme } = useTheme();

  const wallets: Adapter[] = useMemo(() => {
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter()].filter(
      (item) => item && item.name && item.icon
    ) as Adapter[];
  }, []);

  const queryClient = useMemo(() => new QueryClient(), []);

  useWindowWidthListener();

  const walletTheme = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <UnifiedWalletProvider
        wallets={wallets}
        config={{
          env: NETWORK === 'mainnet' ? 'mainnet-beta' : 'devnet',
          autoConnect: true,
          metadata: {
            name: 'Ratchet',
            description: 'Launches on Meteora where the team can only sell into strength',
            url: 'https://www.useratchet.xyz',
            iconUrls: ['https://www.useratchet.xyz/icon-512.png'],
          },
          // notificationCallback: WalletNotification,
          theme: walletTheme,
          lang: 'en',
        }}
      >
        <Toaster theme={walletTheme} richColors closeButton />
        <Component {...pageProps} />
      </UnifiedWalletProvider>
    </QueryClientProvider>
  );
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <AppProviders {...props} />
    </ThemeProvider>
  );
}
