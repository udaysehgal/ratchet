import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { z } from 'zod';
import Header from '../components/Header';

import { useForm } from '@tanstack/react-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { Keypair, Transaction } from '@solana/web3.js';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { signSubmitConfirm } from '@/lib/walletTx';
import { PRESETS, type PresetId } from '@/presets';
import { PresetPreview } from '@/components/Ratchet/PresetPreview';
import { ProgressBar } from '@/components/Ratchet/ProgressBar';
import { cn } from '@/lib/utils';

// Define the schema for form validation
const poolSchema = z.object({
  tokenName: z.string().min(3, 'Token name must be at least 3 characters'),
  tokenSymbol: z.string().min(1, 'Token symbol is required'),
  tokenLogo: z.instanceof(File, { message: 'Token logo is required' }).optional(),
  website: z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal('')),
  twitter: z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal('')),
  presetId: z.enum(['anti-sniper', 'fair-raise']),
});

const inputClassName =
  'w-full rounded-xl border border-neutral-750 bg-background/60 p-3 text-sm text-foreground placeholder:text-neutral-500 transition-colors focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40';

interface FormValues {
  tokenName: string;
  tokenSymbol: string;
  tokenLogo: File | undefined;
  website?: string;
  twitter?: string;
  presetId: PresetId;
}

export default function CreatePool() {
  const { publicKey, signTransaction } = useWallet();
  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);

  const [isLoading, setIsLoading] = useState(false);
  const [poolCreated, setPoolCreated] = useState(false);
  const [createdMint, setCreatedMint] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      tokenName: '',
      tokenSymbol: '',
      tokenLogo: undefined,
      website: '',
      twitter: '',
      presetId: 'anti-sniper',
    } as FormValues,
    onSubmit: async ({ value }) => {
      try {
        setIsLoading(true);
        const { tokenLogo } = value;
        if (!tokenLogo) {
          toast.error('Token logo is required');
          return;
        }

        if (!publicKey || !signTransaction) {
          toast.error('Wallet not connected');
          return;
        }

        const reader = new FileReader();

        // Convert file to base64
        const base64File = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(tokenLogo);
        });

        const keyPair = Keypair.generate();

        // Step 1: Upload to R2 and get transaction
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokenLogo: base64File,
            mint: keyPair.publicKey.toBase58(),
            tokenName: value.tokenName,
            tokenSymbol: value.tokenSymbol,
            userWallet: address,
            presetId: value.presetId,
          }),
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error);
        }

        const { poolTx } = await uploadResponse.json();
        const transaction = Transaction.from(Buffer.from(poolTx, 'base64'));

        // Step 2: fresh blockhash, mint keypair co-signs, wallet signs, submit via our proxy
        await signSubmitConfirm(transaction, signTransaction, [keyPair]);
        const success = true;
        if (success) {
          toast.success('Pool created successfully');
          setCreatedMint(keyPair.publicKey.toBase58());
          setPoolCreated(true);
        }
      } catch (error) {
        console.error('Error creating pool:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to create pool');
      } finally {
        setIsLoading(false);
      }
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = poolSchema.safeParse(value);
        if (!result.success) {
          return result.error.formErrors.fieldErrors;
        }
        return undefined;
      },
    },
  });

  return (
    <>
      <Head>
        <title>Launch a token - Ratchet</title>
        <meta
          name="description"
          content="Launch a token on Meteora DBC with a Ratchet preset. Graduates to DAMM v2; team unlocks go to DLMM."
        />
      </Head>

      <div className="min-h-screen text-foreground">
        <Header />

        <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
          <div className="mb-8 flex flex-col gap-3 md:mb-10">
            <span className="eyebrow text-primary">Meteora DBC · DAMM v2 · DLMM</span>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
              Launch a token <span className="text-glow">that ratchets.</span>
            </h1>
            <p className="max-w-2xl text-neutral-400 md:text-lg">
              Pick a preset and you&apos;re live on a Meteora bonding curve in one signature. Every
              launch graduates to a locked, fee-compounding DAMM v2 pool.
            </p>
          </div>

          {poolCreated && !isLoading ? (
            <PoolCreationSuccess mint={createdMint} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
            >
              <div className="flex flex-col gap-6">
                <Step n="01" title="Choose a launch preset" hint="Read live from the preset's on-chain DBC config.">
                  <form.Field name="presetId">
                    {(field) => (
                      <div role="radiogroup" className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {PRESETS.map((preset) => {
                          const selected = field.state.value === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => field.handleChange(preset.id)}
                              className={cn(
                                'group relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-all',
                                selected
                                  ? 'border-primary/70 bg-primary/10 '
                                  : 'border-neutral-750 hover:-translate-y-0.5 hover:border-neutral-600'
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={cn(
                                    'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                                    selected
                                      ? 'bg-primary text-white'
                                      : 'bg-neutral-850 text-neutral-400'
                                  )}
                                >
                                  <span className={cn('iconify h-5 w-5', PRESET_ICONS[preset.id])} />
                                </span>
                                <span
                                  className={cn(
                                    'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
                                    selected ? 'border-primary bg-primary text-white' : 'border-neutral-700'
                                  )}
                                >
                                  {selected && <span className="iconify ph--check-bold h-3 w-3" />}
                                </span>
                              </div>
                              <div>
                                <div className="text-lg font-bold">{preset.name}</div>
                                <p className="text-sm text-neutral-400">{preset.tagline}</p>
                              </div>
                              <ul className="space-y-1.5 text-xs text-neutral-400">
                                {preset.points.map((point) => (
                                  <li key={point} className="flex gap-2">
                                    <span className="iconify ph--check-circle-fill mt-px h-3.5 w-3.5 shrink-0 text-primary" />
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </form.Field>
                  <form.Subscribe selector={(state) => state.values.presetId}>
                    {(presetId) => (
                      <div className="mt-2 rounded-xl border border-neutral-850 bg-background/40 p-4">
                        <PresetPreview presetId={presetId} />
                      </div>
                    )}
                  </form.Subscribe>
                </Step>

                <Step n="02" title="Token details">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_200px]">
                    <div className="flex flex-col gap-4">
                      <Field label="Token name" htmlFor="tokenName" required>
                        <form.Field name="tokenName">
                          {(field) => (
                            <input
                              id="tokenName"
                              name={field.name}
                              type="text"
                              className={cn(inputClassName, 'text-base')}
                              placeholder="e.g. Virtual Coin"
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              required
                              minLength={3}
                            />
                          )}
                        </form.Field>
                      </Field>
                      <Field label="Symbol" htmlFor="tokenSymbol" required>
                        <form.Field name="tokenSymbol">
                          {(field) => (
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500">
                                $
                              </span>
                              <input
                                id="tokenSymbol"
                                name={field.name}
                                type="text"
                                className={cn(inputClassName, 'pl-7 font-mono text-base uppercase')}
                                placeholder="VRTL"
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                                required
                                maxLength={10}
                              />
                            </div>
                          )}
                        </form.Field>
                      </Field>
                    </div>

                    <Field label="Logo" htmlFor="tokenLogo" required>
                      <form.Field name="tokenLogo">
                        {(field) => (
                          <LogoDrop file={field.state.value} onChange={(f) => field.handleChange(f)} />
                        )}
                      </form.Field>
                    </Field>
                  </div>
                </Step>

                <Step n="03" title="Socials" hint="Optional.">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Website" htmlFor="website" icon="ph--globe-bold">
                      <form.Field name="website">
                        {(field) => (
                          <input
                            id="website"
                            name={field.name}
                            type="url"
                            className={inputClassName}
                            placeholder="https://yourwebsite.com"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        )}
                      </form.Field>
                    </Field>
                    <Field label="X / Twitter" htmlFor="twitter" icon="ph--x-logo-bold">
                      <form.Field name="twitter">
                        {(field) => (
                          <input
                            id="twitter"
                            name={field.name}
                            type="url"
                            className={inputClassName}
                            placeholder="https://x.com/yourhandle"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        )}
                      </form.Field>
                    </Field>
                  </div>
                </Step>
              </div>

              <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
                <form.Subscribe selector={(state) => state.values}>
                  {(values) => <LivePreview values={values} />}
                </form.Subscribe>

                {form.state.errors && form.state.errors.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-rose/40 bg-rose/10 p-4">
                    {form.state.errors.map((error, index) =>
                      Object.entries(error || {}).map(([, value]) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="iconify mt-0.5 h-4 w-4 shrink-0 text-rose ph--warning-circle-bold" />
                          <p className="text-sm text-rose">
                            {Array.isArray(value)
                              ? value.map((v: any) => v.message || v).join(', ')
                              : typeof value === 'string'
                                ? value
                                : String(value)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <SubmitButton isSubmitting={isLoading} />
                <p className="text-center text-xs text-neutral-500">
                  One wallet signature. You&apos;re the creator and earn a share of every trade.
                </p>
              </aside>
            </form>
          )}
        </main>
      </div>
    </>
  );
}

const PRESET_ICONS: Record<PresetId, string> = {
  'anti-sniper': 'ph--shield-check-bold',
  'fair-raise': 'ph--scales-bold',
};

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/30">
          {n}
        </span>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {hint && <p className="text-sm text-neutral-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  icon,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-medium text-neutral-300">
        {icon && <span className={cn('iconify h-4 w-4 text-neutral-500', icon)} />}
        {label}
        {required && <span className="text-primary">*</span>}
      </label>
      {children}
    </div>
  );
}

function useObjectUrl(file: File | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function LogoDrop({ file, onChange }: { file: File | undefined; onChange: (f: File) => void }) {
  const url = useObjectUrl(file);
  const [dragging, setDragging] = useState(false);
  return (
    <label
      htmlFor="tokenLogo"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
      className={cn(
        'group relative flex aspect-square w-full max-w-[200px] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors',
        dragging ? 'border-primary bg-primary/10' : 'border-neutral-750 hover:border-primary/60'
      )}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 bg-background/80 py-1.5 text-xs font-medium opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            Change
          </span>
        </>
      ) : (
        <>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="iconify ph--image-square-bold h-5 w-5" />
          </span>
          <span className="text-sm font-medium">Drop or browse</span>
          <span className="px-3 text-[11px] text-neutral-500">PNG, JPG, GIF, WebP · 2MB</span>
        </>
      )}
      <input
        type="file"
        id="tokenLogo"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
    </label>
  );
}

function LivePreview({ values }: { values: FormValues }) {
  const url = useObjectUrl(values.tokenLogo);
  const preset = PRESETS.find((p) => p.id === values.presetId);
  const symbol = values.tokenSymbol || 'TICKER';
  return (
    <div className="panel panel-glow flex flex-col gap-4 p-5">
      <span className="eyebrow">Live preview</span>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/25 to-neutral-900 font-mono font-bold text-primary ring-1 ring-primary/30">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            symbol.slice(0, 2)
          )}
        </div>
        <div className="min-w-0">
          <div className={cn('truncate text-xl font-bold', !values.tokenSymbol && 'text-neutral-600')}>
            ${symbol}
          </div>
          <div className={cn('truncate text-sm', values.tokenName ? 'text-neutral-400' : 'text-neutral-600')}>
            {values.tokenName || 'Token name'}
          </div>
        </div>
      </div>
      <ProgressBar value={0.02} />
      <div className="flex items-center justify-between text-xs">
        <span className="num text-neutral-400">0 SOL raised</span>
        {preset && (
          <span className="rounded-full border border-neutral-750 px-2 py-0.5 text-neutral-400">
            {preset.name}
          </span>
        )}
      </div>
      <ol className="flex flex-col gap-2 border-t border-neutral-850 pt-4 text-xs text-neutral-400">
        {[
          ['ph--chart-line-up-bold', 'Trades on a Meteora DBC curve'],
          ['ph--lock-key-bold', 'Graduates to DAMM v2, LP locked forever'],
          ['ph--stairs-bold', 'Team unlocks sell on DLMM at ≥1.25×'],
        ].map(([icon, text]) => (
          <li key={text} className="flex items-center gap-2">
            <span className={cn('iconify h-4 w-4 text-primary', icon)} />
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}

const SubmitButton = ({ isSubmitting }: { isSubmitting: boolean }) => {
  const { publicKey } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();

  if (!publicKey) {
    return (
      <Button type="button" size="lg" className="w-full" onClick={() => setShowModal(true)}>
        <span className="iconify ph--wallet-bold h-5 w-5" />
        Connect wallet to launch
      </Button>
    );
  }

  return (
    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
      {isSubmitting ? (
        <>
          <span className="iconify ph--spinner h-5 w-5 animate-spin" />
          Launching…
        </>
      ) : (
        <>
          <span className="iconify ph--rocket-launch-bold h-5 w-5" />
          Launch token
        </>
      )}
    </Button>
  );
};

const PoolCreationSuccess = ({ mint }: { mint: string | null }) => {
  return (
    <div className="panel panel-glow relative mx-auto max-w-2xl overflow-hidden p-8 text-center sm:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-primary/30 blur-3xl"
      />
      <div className="relative mb-6 inline-flex rounded-full bg-primary p-4 text-white ">
        <span className="iconify ph--rocket-launch-fill h-10 w-10" />
      </div>
      <h2 className="relative mb-3 text-3xl font-bold tracking-tight md:text-4xl">
        Your token is <span className="text-glow">live.</span>
      </h2>
      <p className="relative mx-auto mb-8 max-w-lg text-neutral-400">
        It&apos;s trading on its Meteora DBC curve now. Share the token page: once it raises enough
        to graduate, it moves to a locked DAMM v2 pool and your team allocation starts vesting.
      </p>
      <div className="relative flex flex-col justify-center gap-3 sm:flex-row">
        {mint && (
          <Link href={`/token/${mint}`} className={buttonVariants({ size: 'lg' })}>
            View your token
            <span className="iconify ph--arrow-right-bold h-4 w-4" />
          </Link>
        )}
        <Link href="/" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
          All launches
        </Link>
        <button
          onClick={() => window.location.reload()}
          className={buttonVariants({ size: 'lg', variant: 'ghost' })}
        >
          Launch another
        </button>
      </div>
    </div>
  );
};
