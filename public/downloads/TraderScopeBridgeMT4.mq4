//+------------------------------------------------------------------+
//|                                     TraderScopeBridgeMT4.mq4     |
//|  Pushes live account + order data from MetaTrader 4 to the       |
//|  TraderScope dashboard (POST /api/ingest every N seconds).       |
//|  Works on DEMO and LIVE accounts of ANY broker.                  |
//|                                                                  |
//|  Setup:                                                          |
//|  1) Copy to MQL4/Experts/TraderScopeBridgeMT4.mq4, compile (F7). |
//|  2) Tools > Options > Expert Advisors > allow WebRequest for     |
//|     your dashboard base URL.                                     |
//|  3) Enable "AutoTrading" and attach to any chart.                |
//+------------------------------------------------------------------+
#property copyright "TraderScope"
#property version   "1.00"
#property strict

input string IngestUrl       = "https://your-domain/api/ingest"; // Dashboard ingest endpoint
input string IngestSecret    = "propdesk_bridge_9f2e7a1c4d";     // Must match INGEST_SECRET in .env
input int    PushSeconds     = 3;    // Push every N seconds
input bool   IncludeHistory  = true; // Send recently closed orders
input int    HistoryLookback = 120;  // seconds

string JsonEscape(const string s)
{
  string out = s;
  StringReplace(out, "\\", "\\\\");
  StringReplace(out, "\"", "\\\"");
  return out;
}

int OnInit()
{
  EventSetTimer(PushSeconds);
  PushData();
  return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() { /* timer pushes */ }
void OnTimer() { PushData(); }

void PushData()
{
  string body = BuildBody();
  char data[], result[];
  uchar chars[];
  StringToCharArray(body, chars, 0, WHOLE_ARRAY, CP_UTF8);
  ArrayResize(data, ArraySize(chars) - 1);
  ArrayCopy(data, chars, 0, 0, ArraySize(chars) - 1);

  string headers =
    "Authorization: Bearer " + IngestSecret + "\r\n" +
    "Content-Type: application/json\r\n";

  ResetLastError();
  string resultHeaders;
  int res = WebRequest("POST", IngestUrl, headers, 5000, data, result, resultHeaders);
  if (res == -1)
    Print("TraderScopeBridge: WebRequest failed err=", GetLastError(),
          " — add ", IngestUrl, " under Tools > Options > Expert Advisors.");
}

string TypeStr(const int t)
{
  return (t == OP_BUY) ? "BUY" : "SELL";
}

string BuildBody()
{
  double bal    = AccountBalance();
  double eq     = AccountEquity();
  double margin = AccountMargin();
  double fm     = AccountFreeMargin();
  double ml     = (margin > 0) ? (eq / margin) * 100.0 : 0;

  string acc = StringFormat(
    "\"login\":\"%d\",\"broker\":\"%s\",\"server\":\"%s\",\"platform\":\"MT4\","
    "\"accountType\":\"%s\",\"currency\":\"%s\",\"leverage\":%d,"
    "\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,"
    "\"marginLevel\":%.2f",
    AccountNumber(),
    JsonEscape(AccountCompany()),
    JsonEscape(AccountServer()),
    (IsDemo() ? "demo" : "live"),
    AccountCurrency(),
    AccountLeverage(),
    bal, eq, margin, fm, ml);

  // --- Open orders ---
  string pos = "";
  for (int i = 0; i < OrdersTotal(); i++) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
    if (OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
    if (StringLen(pos) > 0) pos += ",";
    pos += StringFormat(
      "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
      "\"openPrice\":%.*f,\"currentPrice\":%.*f,\"sl\":%.*f,\"tp\":%.*f,"
      "\"swap\":%.2f,\"commission\":%.2f,\"profit\":%.2f,"
      "\"magicNumber\":%d,\"comment\":\"%s\",\"openedAt\":\"%s\"}",
      OrderTicket(), OrderSymbol(), TypeStr(OrderType()), OrderLots(),
      MarketInfo(OrderSymbol(), MODE_DIGITS), OrderOpenPrice(),
      MarketInfo(OrderSymbol(), MODE_DIGITS),
        (OrderType() == OP_BUY ? MarketInfo(OrderSymbol(), MODE_BID)
                               : MarketInfo(OrderSymbol(), MODE_ASK)),
      MarketInfo(OrderSymbol(), MODE_DIGITS), OrderStopLoss(),
      MarketInfo(OrderSymbol(), MODE_DIGITS), OrderTakeProfit(),
      OrderSwap(), OrderCommission(), OrderProfit(),
      OrderMagicNumber(), JsonEscape(OrderComment()),
      TimeToString(OrderOpenTime(), TIME_DATE | TIME_SECONDS));
  }

  // --- Recently closed orders ---
  string closed = "";
  if (IncludeHistory)
  {
    string tjson = "";
    datetime cutoff = TimeCurrent() - HistoryLookback;
    for (int i = 0; i < OrdersHistoryTotal(); i++)
    {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if (OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      if (OrderCloseTime() < cutoff) continue;
      if (StringLen(tjson) > 0) tjson += ",";
      tjson += StringFormat(
        "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
        "\"openPrice\":%.*f,\"closePrice\":%.*f,\"profit\":%.2f,"
        "\"openedAt\":\"%s\",\"closedAt\":\"%s\",\"strategy\":\"%s\"}",
        OrderTicket(), OrderSymbol(), TypeStr(OrderType()), OrderLots(),
        MarketInfo(OrderSymbol(), MODE_DIGITS), OrderOpenPrice(),
        MarketInfo(OrderSymbol(), MODE_DIGITS), OrderClosePrice(),
        OrderProfit() + OrderSwap() + OrderCommission(),
        TimeToString(OrderOpenTime(), TIME_DATE | TIME_SECONDS),
        TimeToString(OrderCloseTime(), TIME_DATE | TIME_SECONDS),
        JsonEscape(OrderComment()));
    }
    if (StringLen(tjson) > 0) closed = ",\"trades\":[" + tjson + "]";
  }

  return "{\"account\":{" + acc + "},\"positions\":[" + pos + "]" + closed +
         ",\"source\":\"TraderScopeBridgeMT4.mq4\"}";
}
//+------------------------------------------------------------------+
