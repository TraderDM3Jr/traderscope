import RiskCalculator from "@/components/RiskCalculator";
import { seedIfEmpty } from "@/lib/seed";
import { getAccounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RiskCalculatorPage() {
  await seedIfEmpty();
  const accs = await getAccounts();
  const lite = accs.map((a) => ({
    id: a.id,
    login: a.login,
    propFirm: a.propFirm,
    platform: a.platform,
    accountType: a.accountType,
    equity: a.equity,
    dailyLossRemaining: null as number | null,
  }));
  return <RiskCalculator accounts={lite} />;
}
