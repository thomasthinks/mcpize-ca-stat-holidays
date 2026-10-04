#!/bin/bash
# MCP Protocol Smoke Test for ca-stat-holidays
# Usage: start the server first (npm run dev / node dist/index.js), then: bash test-mcp.sh

BASE_URL="${MCP_URL:-http://localhost:8080}"
MCP_ENDPOINT="$BASE_URL/mcp"
HEALTH_ENDPOINT="$BASE_URL/health"
PASSED=0
FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; PASSED=$((PASSED + 1)); }
fail() { echo -e "${RED}FAIL${NC} $1: $2"; FAILED=$((FAILED + 1)); }

echo "Testing MCP server at $BASE_URL"
echo "================================"

echo ""
echo "--- Health Check ---"
HEALTH=$(curl -sf "$HEALTH_ENDPOINT" 2>/dev/null) || true
if echo "$HEALTH" | grep -q "healthy"; then
  pass "GET /health returns healthy"
else
  fail "GET /health" "Expected 'healthy' in response, got: $HEALTH"
fi

echo ""
echo "--- MCP Initialize ---"
INIT_RESPONSE=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "smoke-test", "version": "1.0" }
    }
  }' 2>/dev/null) || true

if echo "$INIT_RESPONSE" | grep -q '"result"'; then
  pass "initialize returns result"
else
  fail "initialize" "No 'result' in response: $INIT_RESPONSE"
fi

echo ""
echo "--- List Tools ---"
TOOLS_RESPONSE=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' 2>/dev/null) || true

if echo "$TOOLS_RESPONSE" | grep -q '"tools"'; then
  pass "tools/list returns tools array"
  TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['result']['tools']))" 2>/dev/null || echo "?")
  echo "     Found $TOOL_COUNT tool(s)"
else
  fail "tools/list" "No 'tools' in response: $TOOLS_RESPONSE"
fi

EXPECTED_TOOLS=("is_holiday" "holidays_in_year" "add_business_days" "next_business_day")
for TOOL in "${EXPECTED_TOOLS[@]}"; do
  if echo "$TOOLS_RESPONSE" | grep -q "\"$TOOL\""; then
    pass "Tool '$TOOL' is registered"
  else
    fail "Tool '$TOOL'" "Not found in tools/list response"
  fi
done

call_tool() {
  local id="$1" name="$2" args="$3"
  curl -sf -X POST "$MCP_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\": \"2.0\", \"id\": $id, \"method\": \"tools/call\", \"params\": {\"name\": \"$name\", \"arguments\": $args}}" \
    2>/dev/null || true
}

check_call() {
  local label="$1" response="$2" expect="$3"
  if echo "$response" | grep -q '"content"' && echo "$response" | grep -q "$expect"; then
    pass "$label"
  else
    fail "$label" "Expected '$expect' in: $(echo "$response" | head -c 300)"
  fi
}

echo ""
echo "--- is_holiday: Canada Day 2026, ON ---"
R=$(call_tool 3 "is_holiday" '{"date": "2026-07-01", "jurisdiction": "ON"}')
check_call "is_holiday returns Canada Day" "$R" '"name":"Canada Day"'

echo ""
echo "--- is_holiday: Feb 16 2026, QC (not a holiday) ---"
R=$(call_tool 4 "is_holiday" '{"date": "2026-02-16", "jurisdiction": "QC"}')
check_call "is_holiday QC Feb 16 is false" "$R" '"is_holiday":false'

echo ""
echo "--- is_holiday: invalid jurisdiction -> graceful error ---"
R=$(call_tool 5 "is_holiday" '{"date": "2026-07-01", "jurisdiction": "XX"}')
if echo "$R" | grep -q '"isError":true' && echo "$R" | grep -q "Unknown jurisdiction"; then
  pass "invalid jurisdiction returns isError with friendly message"
else
  fail "invalid jurisdiction" "Expected isError + 'Unknown jurisdiction' in: $(echo "$R" | head -c 300)"
fi

echo ""
echo "--- holidays_in_year: ON 2026 ---"
R=$(call_tool 6 "holidays_in_year" '{"year": 2026, "jurisdiction": "ON"}')
check_call "holidays_in_year returns 9 statutory days" "$R" '"count":9'

echo ""
echo "--- add_business_days: 2026-07-03 +1 ON -> 2026-07-06 ---"
R=$(call_tool 7 "add_business_days" '{"date": "2026-07-03", "n": 1, "jurisdiction": "ON"}')
check_call "add_business_days Friday +1 = Monday" "$R" '"result_date":"2026-07-06"'

echo ""
echo "--- next_business_day: Christmas 2026 ON -> 2026-12-29 ---"
R=$(call_tool 8 "next_business_day" '{"date": "2026-12-25", "jurisdiction": "ON"}')
check_call "next_business_day after Christmas = Dec 29" "$R" '"next_business_day":"2026-12-29"'

echo ""
echo "--- Ping ---"
PING_RESPONSE=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 9,
    "method": "ping",
    "params": {}
  }' 2>/dev/null) || true

if echo "$PING_RESPONSE" | grep -q '"result"'; then
  pass "ping returns result"
else
  fail "ping" "No 'result' in response: $PING_RESPONSE"
fi

echo ""
echo "================================"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
