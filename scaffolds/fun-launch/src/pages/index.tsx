import Head from 'next/head';
import Page from '@/components/ui/Page/Page';
import { LaunchBoard } from '@/components/Ratchet/LaunchBoard';

export default function Index() {
  return (
    <Page>
      <Head>
        <title>Ratchet</title>
      </Head>
      <LaunchBoard />
    </Page>
  );
}
