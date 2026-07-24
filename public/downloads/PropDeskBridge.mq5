//+------------------------------------------------------------------+
//|                                       PropDeskBridge.mq5          |
//|  MT5 bridge for TraderScope: pushes live account/position data   |
//|  every few seconds, and auto-executes server-issued risk         |
//|  guardrails (trim worst trade / kill all) on breach.             |
//+------------------------------------------------------------------+
#property copyright "TraderScope"
#property version   "2.00"
#property strict
#property description "Pushes MT5 account data to TraderScope and auto-trims/kills on guardrail breach."

#include <Trade/Trade.mqh>

input string IngestUrl       = "https://your-domain/api/ingest";             // POST target
input string ProtectUrl      = "https://your-domain/api/protection-action";  // GET target (plain text)
input string IngestSecret    = "propdesk_bridge_9f2e7a1c4d";               // matches INGEST_SECRET
input int    PushSeconds     = 3;     // push interval (seconds)
input bool   IncludeHistory  = true;  // send recently closed deals
input int    HistoryLookback = 120;   // seconds of history to include
input int    DeviationPoints = 30;    // allowed slippage when closing (points)

CTrade trade;

//--- helpers
string JsonEscape(const string s)
{
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   return out;
}

string TypeToString(const int t) { return (t == POSITION_TYPE_BUY) ? "BUY" : "SELL"; }

//--- lifecycle
int OnInit()
{
   EventSetTimer(PushSeconds);
   PushData();
   CheckProtection();
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() {}
void OnTimer() { PushData(); CheckProtection(); }

//--- push the account snapshot to /api/ingest
void PushData()
{
   string body = BuildBody();
   char data[], result[];
   uchar chars[];
   StringToCharArray(body, chars, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, ArraySize(chars) - 1);
   ArrayCopy(data, chars, 0, 0, ArraySize(chars) - 1);

   string headers = "Authorization: Bearer " + IngestSecret + "\r\n" +
                    "Content-Type: application/json\r\n";
   string resultHeaders = "";
   ResetLastError();
   int res = WebRequest("POST", IngestUrl, headers, 5000, data, result, resultHeaders);
   if (res == -1)
      Print("PropDeskBridge: WebRequest failed err=", GetLastError(),
            " — whitelist ", IngestUrl, " in Tools > Options > Expert Advisors.");
}

//--- read the server's guardrail instruction (plain text) and act
void CheckProtection()
{
   string login = StringFormat("%I64d", AccountInfoInteger(ACCOUNT_LOGIN));
   string url = ProtectUrl + "?login=" + login;
   char data[1] = {0};
   char result[];
   string resultHeaders = "";
   ResetLastError();
   int res = WebRequest("GET", url, "", 5000, data, result, resultHeaders);
   if (res == -1) return; // network error; will retry next tick
   string action = CharArrayToString(result, 0, ArraySize(result), CP_UTF8);

   if (action == "KILL_ALL")
   {
      int n = PositionsTotal();
      for (int i = n - 1; i >= 0; i--)
      {
         ulong tk = PositionGetTicket(i);
         if (tk > 0) trade.PositionClose(tk, (ulong)DeviationPoints);
      }
      Print("PropDeskBridge: auto-kill executed");
   }
   else if (StringFind(action, "TRIM_WORST") >= 0)
   {
       string tok = StringSubstr(action, StringFind(action, " ") + 1);
       ulong tk = (ulong)StringToInteger(tok);
       if (tk > 0)
         if (trade.PositionClose(tk, (ulong)DeviationPoints))
            Print("PropDeskBridge: auto-trimmed ticket ", tk);
   }
}

//--- build the JSON body (positions + history)
string BuildBody()
{
   double bal    = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq     = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double fm     = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double ml     = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);

   string acc = StringFormat(
      "\"login\":\"%I64d\",\"broker\":\"%s\",\"server\":\"%s\",\"platform\":\"MT5\","
      "\"propFirm\":\"\",\"phase\":\"\",\"currency\":\"%s\",\"leverage\":%d,"
      "\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,",
      AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
      AccountInfoString(ACCOUNT_CURRENCY),
      (int)AccountInfoInteger(ACCOUNT_LEVERAGE),
      bal, eq, margin, fm);
   acc += StringFormat("\"marginLevel\":%.2f", ml);

   string pos = "";
   int total = PositionsTotal();
   for (int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if (!PositionSelectByTicket(ticket)) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      if (StringLen(pos) > 0) pos += ",";
      pos += StringFormat(
         "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
         "\"openPrice\":%.*f,\"currentPrice\":%.*f,\"sl\":%.*f,\"tp\":%.*f,"
         "\"swap\":%.2f,\"profit\":%.2f,\"magicNumber\":%I64d,"
         "\"comment\":\"%s\",\"openedAt\":\"%s\"}",
         ticket, sym,
         TypeToString((int)PositionGetInteger(POSITION_TYPE)),
         PositionGetDouble(POSITION_VOLUME),
         digits, PositionGetDouble(POSITION_PRICE_OPEN),
         digits, PositionGetDouble(POSITION_PRICE_CURRENT),
         digits, PositionGetDouble(POSITION_SL),
         digits, PositionGetDouble(POSITION_TP),
         PositionGetDouble(POSITION_SWAP),
         PositionGetDouble(POSITION_PROFIT),
         PositionGetInteger(POSITION_MAGIC),
         JsonEscape(PositionGetString(POSITION_COMMENT)),
         TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE|TIME_SECONDS));
   }

   string closed = "";
   if (IncludeHistory)
   {
      datetime from = TimeCurrent() - HistoryLookback;
      HistorySelect(from, TimeCurrent() + 60);
      int deals = HistoryDealsTotal();
      string tjson = "";
      for (int i = 0; i < deals; i++)
      {
         ulong dticket = HistoryDealGetTicket(i);
         if (HistoryDealGetInteger(dticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
         string sym = HistoryDealGetString(dticket, DEAL_SYMBOL);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         if (StringLen(tjson) > 0) tjson += ",";
         tjson += StringFormat(
            "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
            "\"openPrice\":%.*f,\"closePrice\":%.*f,\"profit\":%.2f,"
            "\"openedAt\":\"%s\",\"closedAt\":\"%s\",\"strategy\":\"%s\"}",
            dticket, sym,
            TypeToString((int)HistoryDealGetInteger(dticket, DEAL_TYPE)),
            HistoryDealGetDouble(dticket, DEAL_VOLUME),
            digits, HistoryDealGetDouble(dticket, DEAL_PRICE),
            digits, HistoryDealGetDouble(dticket, DEAL_PRICE),
            HistoryDealGetDouble(dticket, DEAL_PROFIT) + HistoryDealGetDouble(dticket, DEAL_SWAP)
                     + HistoryDealGetDouble(dticket, DEAL_COMMISSION),
            TimeToString((datetime)HistoryDealGetInteger(dticket, DEAL_TIME) - 60, TIME_DATE|TIME_SECONDS),
            TimeToString((datetime)HistoryDealGetInteger(dticket, DEAL_TIME), TIME_DATE|TIME_SECONDS),
            JsonEscape(HistoryDealGetString(dticket, DEAL_COMMENT)));
      }
      if (StringLen(tjson) > 0) closed = ",\"trades\":[" + tjson + "]";
   }

   return "{\"account\":{" + acc + "},\"positions\":[" + pos + "]" + closed +
          ",\"source\":\"PropDeskBridge.mq5\"}";
}
//+------------------------------------------------------------------+
