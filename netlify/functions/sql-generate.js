// netlify/functions/sql-generate.js
// Generates DuneSQL from natural language using Claude.
// Narrow, precise prompt — SQL generation only.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-20250514';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── DuneSQL system prompt ─────────────────────────────────────
const SYSTEM = `You are a DuneSQL expert. Your ONLY job is to generate correct DuneSQL queries.

## CRITICAL SYNTAX RULES

### 1. Addresses — ALWAYS varbinary, NEVER quoted strings
CORRECT: WHERE taker     = 0xda905450166c6574cee0cd276b898f62d7368ee9
WRONG:   WHERE taker     = '0xda905450166c6574cee0cd276b898f62d7368ee9'
CORRECT: AND contract_address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
WRONG:   AND contract_address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

### 2. Chain names — lowercase strings
CORRECT: WHERE blockchain = 'base'
CORRECT: WHERE blockchain = 'ethereum'
Available: 'base', 'ethereum', 'optimism', 'arbitrum', 'polygon', 'bnb', 'avalanche'

### 3. Time filter — ALWAYS include, use this exact syntax
CORRECT: WHERE block_time >= NOW() - INTERVAL '30' DAY
WRONG:   WHERE block_time >= NOW() - INTERVAL '30 days'
WRONG:   WHERE block_time >= DATEADD(day, -30, NOW())

### 4. LIMIT — ALWAYS include, max 100 for exploratory queries

### 5. Aggregator routers — exclude from wallet analysis
AND taker != 0x1111111254EEB25477B68fb85Ed929f73A960582  -- 1inch
AND taker != 0xDEF1C0ded9bec7F1a1670819833240f027b25EfF  -- 0x Protocol

## KEY TABLES

### dex.trades — all DEX swaps normalized
Columns: blockchain, block_time, project, version, taker, maker,
         token_bought_symbol, token_sold_symbol,
         token_bought_amount, token_sold_amount, amount_usd,
         token_bought_address, token_sold_address, tx_hash
Projects: 'uniswap', 'aerodrome', 'curve', 'balancer', 'sushiswap'

### prices.usd — token prices by minute
Columns: blockchain, contract_address, minute, price, decimals, symbol
Join: p.minute = DATE_TRUNC('minute', t.block_time)

### tokens.erc20 — token metadata
Columns: blockchain, contract_address, symbol, name, decimals

### erc20_base.evt_Transfer / erc20_ethereum.evt_Transfer
Columns: contract_address, "from", "to", value (raw), evt_block_time

### base.transactions / ethereum.transactions
Columns: hash, "from", "to", value, gas_used, gas_price, block_time, success

## OUTPUT FORMAT
Return ONLY valid JSON — no markdown, no backticks, no explanation outside JSON:
{
  "sql": "complete DuneSQL query here",
  "explanation": "short explanation in Ukrainian of what this query does",
  "tables": ["dex.trades", "prices.usd"]
}`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const jsonH  = { ...CORS, 'Content-Type': 'application/json' };

  if (!apiKey) {
    return {
      statusCode: 500, headers: jsonH,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY не налаштований. Додайте в Netlify → Site settings → Environment variables.' })
    };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body || '{}');
    prompt = body.prompt?.trim();
    if (!prompt || prompt.length < 5) throw new Error('prompt too short');
  } catch {
    return { statusCode: 400, headers: jsonH, body: JSON.stringify({ error: 'Введіть опис запиту (мінімум 5 символів)' }) };
  }

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1500,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: `Generate DuneSQL for: ${prompt}` }],
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        statusCode: res.status, headers: jsonH,
        body: JSON.stringify({ error: err?.error?.message || `Anthropic API error ${res.status}` })
      };
    }

    const data    = await res.json();
    const rawText = data?.content?.[0]?.text || '';

    // Strip markdown fences if present
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Claude returned plain SQL instead of JSON — wrap it
      parsed = { sql: rawText.trim(), explanation: 'Згенерований запит', tables: [] };
    }

    if (!parsed.sql) {
      return { statusCode: 500, headers: jsonH, body: JSON.stringify({ error: 'Модель не повернула SQL. Спробуй ще раз.' }) };
    }

    return {
      statusCode: 200, headers: jsonH,
      body: JSON.stringify({
        sql:         parsed.sql,
        explanation: parsed.explanation || '',
        tables:      parsed.tables || [],
      })
    };

  } catch (err) {
    return { statusCode: 500, headers: jsonH, body: JSON.stringify({ error: String(err) }) };
  }
};
