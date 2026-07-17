import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// Challenge phases per account (multi-level prop firm challenges)
export const phases = pgTable("phases", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  sequence: integer("sequence").notNull(), // 0-based order
  name: text("name").notNull(), // Phase 1 | Phase 2 | Funded
  status: text("status").notNull().default("locked"), // locked | active | passed | failed
  initialBalance: numeric("initial_balance", { precision: 18, scale: 2 }).notNull(),
  profitTargetPct: numeric("profit_target_pct", { precision: 6, scale: 2 }).notNull().default("8"),
  dailyLossLimitPct: numeric("daily_loss_limit_pct", { precision: 6, scale: 2 }).notNull().default("5"),
  maxLossLimitPct: numeric("max_loss_limit_pct", { precision: 6, scale: 2 }).notNull().default("10"),
  minTradingDays: integer("min_trading_days").notNull().default(5),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Trading journal entries, optionally linked to trades
export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  tradeId: integer("trade_id"), // optional link to trades.id
  ticket: text("ticket"),
  symbol: text("symbol"),
  title: text("title").notNull(),
  body: text("body"),
  tags: text("tags"), // comma separated e.g. "london,breakout,a-setup"
  mood: text("mood"), // confident | neutral | anxious | revenge | fomo
  rating: integer("rating").notNull().default(3), // 1..5 self grade
  result: text("result"), // win | loss | breakeven | open
  pnl: numeric("pnl", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Prop firm trading accounts (MT4/MT5 challenge accounts)
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  login: text("login").notNull().unique(), // MT login number
  broker: text("broker").notNull(),
  server: text("server").notNull(),
  platform: text("platform").notNull(), // MT4 | MT5
  propFirm: text("prop_firm").notNull(), // FundedNext, FTMO, etc.
  phase: text("phase").notNull(), // Phase 1 | Phase 2 | Funded
  currency: text("currency").notNull().default("USD"),
  leverage: integer("leverage").notNull().default(100),
  initialBalance: numeric("initial_balance", { precision: 18, scale: 2 }).notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
  equity: numeric("equity", { precision: 18, scale: 2 }).notNull(),
  margin: numeric("margin", { precision: 18, scale: 2 }).notNull().default("0"),
  freeMargin: numeric("free_margin", { precision: 18, scale: 2 }).notNull().default("0"),
  marginLevel: numeric("margin_level", { precision: 18, scale: 2 }).notNull().default("0"),
  // Prop firm compliance rules
  profitTargetPct: numeric("profit_target_pct", { precision: 6, scale: 2 }).notNull().default("8"),
  dailyLossLimitPct: numeric("daily_loss_limit_pct", { precision: 6, scale: 2 }).notNull().default("5"),
  maxLossLimitPct: numeric("max_loss_limit_pct", { precision: 6, scale: 2 }).notNull().default("10"),
  minTradingDays: integer("min_trading_days").notNull().default(5),
  tradingDaysCompleted: integer("trading_days_completed").notNull().default(0),
  status: text("status").notNull().default("active"), // active | breached | passed
  source: text("source").notNull().default("seed"), // seed | ea
  accountType: text("account_type").notNull().default("demo"), // demo | live
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Open positions on account
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  ticket: text("ticket").notNull(), // MT ticket #
  symbol: text("symbol").notNull(),
  type: text("type").notNull(), // BUY | SELL
  volume: numeric("volume", { precision: 12, scale: 2 }).notNull(),
  openPrice: numeric("open_price", { precision: 18, scale: 5 }).notNull(),
  currentPrice: numeric("current_price", { precision: 18, scale: 5 }).notNull(),
  sl: numeric("sl", { precision: 18, scale: 5 }),
  tp: numeric("tp", { precision: 18, scale: 5 }),
  swap: numeric("swap", { precision: 18, scale: 2 }).notNull().default("0"),
  commission: numeric("commission", { precision: 18, scale: 2 }).notNull().default("0"),
  profit: numeric("profit", { precision: 18, scale: 2 }).notNull().default("0"),
  magicNumber: integer("magic_number").default(0),
  comment: text("comment"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
});

// Closed trade history
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  ticket: text("ticket").notNull(),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(),
  volume: numeric("volume", { precision: 12, scale: 2 }).notNull(),
  openPrice: numeric("open_price", { precision: 18, scale: 5 }).notNull(),
  closePrice: numeric("close_price", { precision: 18, scale: 5 }).notNull(),
  sl: numeric("sl", { precision: 18, scale: 5 }),
  tp: numeric("tp", { precision: 18, scale: 5 }),
  swap: numeric("swap", { precision: 18, scale: 2 }).notNull().default("0"),
  commission: numeric("commission", { precision: 18, scale: 2 }).notNull().default("0"),
  profit: numeric("profit", { precision: 18, scale: 2 }).notNull(),
  magicNumber: integer("magic_number").default(0),
  strategy: text("strategy"), // EA name or "Manual"
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Snapshot of equity/balance for time-series chart
export const equitySnapshots = pgTable("equity_snapshots", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
  equity: numeric("equity", { precision: 18, scale: 2 }).notNull(),
  drawdownPct: numeric("drawdown_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily performance rollup (for compliance & analytics)
export const dailyStats = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD
  startingBalance: numeric("starting_balance", { precision: 18, scale: 2 }).notNull(),
  endingBalance: numeric("ending_balance", { precision: 18, scale: 2 }).notNull(),
  highestEquity: numeric("highest_equity", { precision: 18, scale: 2 }).notNull(),
  lowestEquity: numeric("lowest_equity", { precision: 18, scale: 2 }).notNull(),
  pnl: numeric("pnl", { precision: 18, scale: 2 }).notNull().default("0"),
  dailyDrawdownPct: numeric("daily_drawdown_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  tradesCount: integer("trades_count").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  volumeTraded: numeric("volume_traded", { precision: 18, scale: 2 }).notNull().default("0"),
  breachedDailyLimit: boolean("breached_daily_limit").notNull().default(false),
});

// Alerts / rule events
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  severity: text("severity").notNull(), // info | warn | critical
  ruleType: text("rule_type").notNull(), // daily_loss | max_loss | profit_target | margin | custom
  message: text("message").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
