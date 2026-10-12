import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#0A0A0B" />
        <meta name="description" content="Launches on Meteora where the team can only sell into strength. Team unlocks are held by a program and sold only above 1.25× the graduation price." />
        <meta property="og:site_name" content="Ratchet" />
        <meta property="og:title" content="Ratchet: team tokens that only sell into strength" />
        <meta property="og:description" content="98% of claimed team tokens on Meteora DBC left the team wallet. Ratchet holds unlocks in a vault that sells only above 1.25× graduation." />
        <meta property="og:image" content="https://www.useratchet.xyz/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://www.useratchet.xyz/og.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* Jupiter Plugin, see https://dev.jup.ag/docs/tool-kits/plugin */}
        <script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
