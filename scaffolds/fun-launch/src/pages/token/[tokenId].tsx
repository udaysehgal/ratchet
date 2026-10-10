import Head from 'next/head';
import { useRouter } from 'next/router';
import Page from '@/components/ui/Page/Page';
import { TokenView } from '@/components/Ratchet/TokenView';

export default function TokenPage() {
  const router = useRouter();
  const mint = typeof router.query.tokenId === 'string' ? router.query.tokenId : undefined;
  return (
    <Page>
      <Head>
        <title>Token - Ratchet</title>
      </Head>
      {mint && <TokenView mint={mint} />}
    </Page>
  );
}
