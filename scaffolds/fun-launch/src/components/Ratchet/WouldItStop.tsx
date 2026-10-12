import data from '@/data/counterfactual.json';

const EVIDENCE = 'https://github.com/udaysehgal/ratchet/blob/main/docs/evidence/unlock-counterfactual.json';
const SCRIPT = 'https://github.com/udaysehgal/ratchet/blob/main/scaffolds/fun-launch/scripts/unlock-counterfactual.ts';

/** The unlock study, run against the vault's rules: would a Ratchet vault have refused those sales? */
export function WouldItStop() {
  const n = data.teamsWithPricedSales;
  const below = data.teamsWithAnySaleBelowFloor;
  const overCap = data.teamsOverDailyCap;
  const median = data.medianTeamSaleRatio;

  const stats = [
    { value: `${below} of ${n}`, label: 'teams sold unlocked tokens below 1.25× the graduation price' },
    { value: `${data.maxSaleRatio.toFixed(2)}×`, label: `the best price any of their ${data.salesPriced} sales got, against a 1.25× floor` },
    { value: `${median.toFixed(2)}×`, label: 'the graduation price, at the typical team’s typical sale' },
    { value: `${overCap} of ${n}`, label: 'teams sold more than 10% of their unlock in a single day' },
  ];

  return (
    <section className="flex flex-col gap-12">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <h2 className="display text-3xl leading-tight md:text-[2.75rem]">Would Ratchet have stopped them?</h2>
        <div className="flex flex-col gap-4 text-lg leading-relaxed text-neutral-300">
          <p>
            We took an evenly spaced sample of the teams that emptied their unlocks and priced every DEX sale
            against that token’s graduation price, straight from mainnet. Then we asked the vault’s two rules:
            never below 1.25×, never more than 10% a day.
          </p>
          <p className="text-foreground">
            {below === n ? 'Every one' : `${below} of ${n}`} of those teams made sales a Ratchet vault would have
            refused. None of their {data.salesPriced} sales got even the graduation price.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-2 border-t border-neutral-850 pt-5">
            <span className="display text-4xl md:text-5xl">{s.value}</span>
            <span className="text-sm leading-relaxed text-neutral-400">{s.label}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-500">
        Sample of {data.teamsChecked} teams (every {data.sample.everyNthTeam}th of those that moved 90%+ of their
        claimed unlocks); {n} had DEX sales we could price.{' '}
        <a href={EVIDENCE} className="text-neutral-300 underline-offset-4 hover:underline">
          Every sale and transaction
        </a>{' '}
        ·{' '}
        <a href={SCRIPT} className="text-neutral-300 underline-offset-4 hover:underline">
          the script
        </a>
      </p>
    </section>
  );
}
