import JournalClient from "@/components/JournalClient";
import { seedIfEmpty } from "@/lib/seed";
import { getAccounts, getJournalEntries, getRecentTrades } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await seedIfEmpty();
  const sp = await searchParams;
  const accs = await getAccounts();
  const requested = Number(sp.account);
  const account = accs.find((a) => a.id === requested) ?? accs[0];
  if (!account) return <div className="grid min-h-screen place-items-center">No accounts.</div>;

  const [entries, trades] = await Promise.all([
    getJournalEntries(account.id, 150),
    getRecentTrades(account.id, 120),
  ]);

  const lite = accs.map((a) => ({
    id: a.id,
    login: a.login,
    propFirm: a.propFirm,
    platform: a.platform,
    accountType: a.accountType,
  }));

  const serEntries = entries.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));
  const serTrades = trades.map((t) => ({
    id: t.id,
    ticket: t.ticket,
    symbol: t.symbol,
    type: t.type,
    profit: t.profit,
    strategy: t.strategy,
    closedAt: t.closedAt.toISOString(),
  }));

  return (
    <JournalClient
      accounts={lite}
      activeAccountId={account.id}
      currency={account.currency}
      initialEntries={serEntries}
      trades={serTrades}
    />
  );
}
