import { db } from "@/db";
import {
  accounts,
  positions,
  trades,
  equitySnapshots,
  dailyStats,
  alerts,
} from "@/db/schema";
import { sql } from "drizzle-orm";

// Deterministic PRNG so seeded data is stable across renders
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYMBOLS = [
  { s: "EURUSD", base: 1.0854, vol: 0.0012 },
  { s: "GBPUSD", base: 1.2712, vol: 0.0016 },
  { s: "USDJPY", base: 155.42, vol: 0.35 },
  { s: "AUDUSD", base: 0.6612, vol: 0.0011 },
  { s: "USDCAD", base: 1.3688, vol: 0.0013 },
  { s: "XAUUSD", base: 2342.5, vol: 6.2 },
  { s: "USDCHF", base: 0.9012, vol: 0.001 },
  { s: "NZDUSD", base: 0.6088, vol: 0.0012 },
];

const STRATS = ["London Breakout EA", "Trend Rider v3", "Scalper Pro", "Manual", "News Fader"];

export async function isSeeded() {
  const r = await db.execute<{ c: number }>(sql`select count(*)::int as c from accounts`);
  return (r.rows[0]?.c ?? 0) > 0;
}

export async function seedIfEmpty() {
  if (await isSeeded()) return { seeded: false };

  const now = new Date();
  const rand = mulberry32(1337);

  // ------- Accounts -------
  const acctDefs = [
    {
      login: "500123456",
      broker: "FundedNext Markets",
      server: "FundedNext-Server01",
      platform: "MT5",
      propFirm: "FundedNext",
      phase: "Phase 1",
      initialBalance: 100000,
      profitTargetPct: 8,
      dailyLossLimitPct: 5,
      maxLossLimitPct: 10,
      leverage: 100,
    },
    {
      login: "412778901",
      broker: "FTMO",
      server: "FTMO-Demo",
      platform: "MT4",
      propFirm: "FTMO",
      phase: "Phase 2",
      initialBalance: 200000,
      profitTargetPct: 5,
      dailyLossLimitPct: 5,
      maxLossLimitPct: 10,
      leverage: 100,
    },
    {
      login: "9007731",
      broker: "The5ers",
      server: "The5ers-Live",
      platform: "MT5",
      propFirm: "The5ers",
      phase: "Funded",
      initialBalance: 50000,
      profitTargetPct: 6,
      dailyLossLimitPct: 4,
      maxLossLimitPct: 8,
      leverage: 30,
    },
  ];

  const accountIds: number[] = [];

  for (const def of acctDefs) {
    // Build an equity curve for the last 30 days
    const days = 30;
    const startBalance = def.initialBalance;
    let balance = startBalance;
    let equity = startBalance;
    let peak = startBalance;
    // Bias: account 0 profitable, account 1 in drawdown, account 2 modest gains
    const bias =
      def.propFirm === "FundedNext" ? 60 : def.propFirm === "FTMO" ? -80 : 30;

    type Snap = { at: Date; bal: number; eq: number; dd: number };
    const snaps: Snap[] = [];
    type Daily = {
      day: string;
      start: number;
      end: number;
      high: number;
      low: number;
      pnl: number;
      dd: number;
      trades: number;
      wins: number;
      losses: number;
      volume: number;
    };
    const daily: Daily[] = [];

    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - d);
      dayStart.setHours(0, 0, 0, 0);

      const dayOpening = balance;
      let dayHigh = balance;
      let dayLow = balance;
      let dayTrades = 0;
      let wins = 0;
      let losses = 0;
      let volume = 0;

      // Weekends: fewer/no trades
      const dow = dayStart.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const perDaySnaps = isWeekend ? 4 : 12;

      for (let t = 0; t < perDaySnaps; t++) {
        const hour = Math.floor((t / perDaySnaps) * 24);
        const at = new Date(dayStart);
        at.setHours(hour, Math.floor(rand() * 59));

        // Simulated P/L tick
        const drift = (rand() - 0.5) * (def.initialBalance * 0.0015);
        const shock = isWeekend ? 0 : (rand() - 0.5) * (def.initialBalance * 0.002);
        const trend = (bias / 100) * (def.initialBalance * 0.00025);
        const change = drift + shock + trend;
        equity += change;
        // occasionally realize into balance
        if (rand() < 0.35 && !isWeekend) {
          const realized = change;
          balance += realized;
          dayTrades += 1;
          volume += +(rand() * 1.5 + 0.05).toFixed(2);
          if (realized >= 0) wins += 1;
          else losses += 1;
        }
        peak = Math.max(peak, equity);
        dayHigh = Math.max(dayHigh, equity);
        dayLow = Math.min(dayLow, equity);
        const dd = ((peak - equity) / peak) * 100;
        snaps.push({ at, bal: balance, eq: equity, dd });
      }

      const dayPnl = balance - dayOpening;
      const dayDd = ((dayOpening - dayLow) / dayOpening) * 100;
      daily.push({
        day: dayStart.toISOString().slice(0, 10),
        start: dayOpening,
        end: balance,
        high: dayHigh,
        low: dayLow,
        pnl: dayPnl,
        dd: Math.max(0, dayDd),
        trades: dayTrades,
        wins,
        losses,
        volume,
      });
    }

    // Set current live values
    const finalEquity = equity;
    const finalBalance = balance;
    const usedMargin = Math.round(def.initialBalance * 0.08 * 100) / 100;
    const freeMargin = finalEquity - usedMargin;
    const marginLevel = usedMargin > 0 ? (finalEquity / usedMargin) * 100 : 0;

    const inserted = await db
      .insert(accounts)
      .values({
        login: def.login,
        broker: def.broker,
        server: def.server,
        platform: def.platform,
        propFirm: def.propFirm,
        phase: def.phase,
        currency: "USD",
        leverage: def.leverage,
        initialBalance: String(def.initialBalance),
        balance: finalBalance.toFixed(2),
        equity: finalEquity.toFixed(2),
        margin: usedMargin.toFixed(2),
        freeMargin: freeMargin.toFixed(2),
        marginLevel: marginLevel.toFixed(2),
        profitTargetPct: String(def.profitTargetPct),
        dailyLossLimitPct: String(def.dailyLossLimitPct),
        maxLossLimitPct: String(def.maxLossLimitPct),
        minTradingDays: 5,
        tradingDaysCompleted: daily.filter((d) => d.trades > 0).length,
        accountType: def.propFirm === "The5ers" ? "live" : "demo",
      })
      .returning({ id: accounts.id });
    const accountId = inserted[0].id;
    accountIds.push(accountId);

    // Insert equity snapshots
    for (const s of snaps) {
      await db.insert(equitySnapshots).values({
        accountId,
        balance: s.bal.toFixed(2),
        equity: s.eq.toFixed(2),
        drawdownPct: s.dd.toFixed(4),
        takenAt: s.at,
      });
    }

    // Insert daily stats
    for (const d of daily) {
      await db.insert(dailyStats).values({
        accountId,
        day: d.day,
        startingBalance: d.start.toFixed(2),
        endingBalance: d.end.toFixed(2),
        highestEquity: d.high.toFixed(2),
        lowestEquity: d.low.toFixed(2),
        pnl: d.pnl.toFixed(2),
        dailyDrawdownPct: d.dd.toFixed(4),
        tradesCount: d.trades,
        wins: d.wins,
        losses: d.losses,
        volumeTraded: d.volume.toFixed(2),
        breachedDailyLimit: d.dd > def.dailyLossLimitPct,
      });
    }

    // Open positions (a few)
    const openCount = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < openCount; i++) {
      const sym = SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
      const type = rand() < 0.5 ? "BUY" : "SELL";
      const volume = +(rand() * 1.2 + 0.05).toFixed(2);
      const openPrice = +(sym.base + (rand() - 0.5) * sym.vol * 2).toFixed(5);
      const currentPrice = +(openPrice + (rand() - 0.5) * sym.vol).toFixed(5);
      const dir = type === "BUY" ? 1 : -1;
      // Pip value approximation
      const pipMult = sym.s === "USDJPY" ? 1000 : sym.s === "XAUUSD" ? 100 : 100000;
      const profit = +(((currentPrice - openPrice) * dir * volume * pipMult) / 10).toFixed(2);
      const openedAt = new Date(now.getTime() - Math.floor(rand() * 8 * 3600 * 1000));
      await db.insert(positions).values({
        accountId,
        ticket: String(200000 + Math.floor(rand() * 800000)),
        symbol: sym.s,
        type,
        volume: volume.toFixed(2),
        openPrice: openPrice.toFixed(5),
        currentPrice: currentPrice.toFixed(5),
        sl: (openPrice - dir * sym.vol * 3).toFixed(5),
        tp: (openPrice + dir * sym.vol * 5).toFixed(5),
        swap: ((rand() - 0.7) * 3).toFixed(2),
        commission: (-volume * 3.5).toFixed(2),
        profit: profit.toFixed(2),
        magicNumber: Math.floor(rand() * 999999),
        comment: STRATS[Math.floor(rand() * STRATS.length)],
        openedAt,
      });
    }

    // Closed trades history
    const tradeCount = 40 + Math.floor(rand() * 30);
    for (let i = 0; i < tradeCount; i++) {
      const sym = SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
      const type = rand() < 0.5 ? "BUY" : "SELL";
      const volume = +(rand() * 1.5 + 0.05).toFixed(2);
      const openPrice = +(sym.base + (rand() - 0.5) * sym.vol * 2).toFixed(5);
      const winBias = bias > 0 ? 0.6 : bias < 0 ? 0.42 : 0.52;
      const win = rand() < winBias;
      const move = (win ? 1 : -1) * sym.vol * (rand() * 2 + 0.5);
      const dir = type === "BUY" ? 1 : -1;
      const closePrice = +(openPrice + move * dir).toFixed(5);
      const pipMult = sym.s === "USDJPY" ? 1000 : sym.s === "XAUUSD" ? 100 : 100000;
      const profit = +(((closePrice - openPrice) * dir * volume * pipMult) / 10).toFixed(2);
      const openedAt = new Date(now.getTime() - Math.floor(rand() * 30 * 24 * 3600 * 1000));
      const closedAt = new Date(openedAt.getTime() + Math.floor(rand() * 8 * 3600 * 1000));
      await db.insert(trades).values({
        accountId,
        ticket: String(100000 + i + accountId * 1000),
        symbol: sym.s,
        type,
        volume: volume.toFixed(2),
        openPrice: openPrice.toFixed(5),
        closePrice: closePrice.toFixed(5),
        sl: (openPrice - dir * sym.vol * 3).toFixed(5),
        tp: (openPrice + dir * sym.vol * 5).toFixed(5),
        swap: ((rand() - 0.7) * 2).toFixed(2),
        commission: (-volume * 3.5).toFixed(2),
        profit: profit.toFixed(2),
        magicNumber: Math.floor(rand() * 999999),
        strategy: STRATS[Math.floor(rand() * STRATS.length)],
        openedAt,
        closedAt,
      });
    }

    // A few alerts
    await db.insert(alerts).values([
      {
        accountId,
        severity: "info",
        ruleType: "custom",
        message: `Account ${def.login} synchronized with ${def.platform} bridge.`,
      },
      {
        accountId,
        severity: bias < 0 ? "warn" : "info",
        ruleType: "daily_loss",
        message:
          bias < 0
            ? "Daily loss reached 62% of limit — reduce lot size."
            : "Daily P/L within safe band.",
      },
    ]);
  }

  return { seeded: true, accountIds };
}
