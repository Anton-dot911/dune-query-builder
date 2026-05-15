// src/data/queries.ts
// Production-ready DuneSQL templates

export interface Query {
  id: string
  title: string
  description: string
  sql: string
  tags: string[]
}

export interface Category {
  id: string
  label: string
  icon: string
  queries: Query[]
}

export const CATEGORIES: Category[] = [
  {
    id: 'dex',
    label: 'DEX & Swaps',
    icon: '🔄',
    queries: [
      {
        id: 'aerodrome-top-traders',
        title: 'Aerodrome — Top Traders (Base)',
        description: 'Топ трейдери Aerodrome на Base за останні 30 днів',
        tags: ['aerodrome', 'base', 'traders'],
        sql: `-- Aerodrome top traders on Base (last 30 days)
SELECT
  taker,
  COUNT(*)                          AS trades,
  SUM(amount_usd)                   AS volume_usd,
  AVG(amount_usd)                   AS avg_trade_usd,
  MIN(block_time)                   AS first_trade,
  MAX(block_time)                   AS last_trade
FROM dex.trades
WHERE blockchain = 'base'
  AND project   = 'aerodrome'
  AND block_time >= NOW() - INTERVAL '30' DAY
  AND amount_usd BETWEEN 10 AND 5000000
  -- exclude known aggregator routers
  AND taker != 0x1111111254EEB25477B68fb85Ed929f73A960582
  AND taker != 0xDEF1C0ded9bec7F1a1670819833240f027b25EfF
GROUP BY 1
HAVING COUNT(*) BETWEEN 3 AND 2000
ORDER BY volume_usd DESC
LIMIT 50`
      },
      {
        id: 'dex-volume-by-protocol',
        title: 'DEX Volume by Protocol (Base)',
        description: 'Об\'єм торгів по протоколах на Base за 7 днів',
        tags: ['base', 'dex', 'volume'],
        sql: `-- DEX volume by protocol on Base (last 7 days)
SELECT
  project,
  COUNT(*)           AS trades,
  SUM(amount_usd)    AS volume_usd,
  COUNT(DISTINCT taker) AS unique_traders
FROM dex.trades
WHERE blockchain = 'base'
  AND block_time >= NOW() - INTERVAL '7' DAY
  AND amount_usd > 1
GROUP BY 1
ORDER BY volume_usd DESC
LIMIT 20`
      },
      {
        id: 'dex-volume-by-chain',
        title: 'DEX Volume by Chain',
        description: 'Загальний DEX об\'єм по всіх мережах за 7 днів',
        tags: ['multichain', 'dex', 'volume'],
        sql: `-- DEX volume by blockchain (last 7 days)
SELECT
  blockchain,
  COUNT(*)              AS trades,
  SUM(amount_usd)       AS volume_usd,
  COUNT(DISTINCT taker) AS unique_traders,
  AVG(amount_usd)       AS avg_trade_usd
FROM dex.trades
WHERE block_time >= NOW() - INTERVAL '7' DAY
  AND amount_usd > 1
GROUP BY 1
ORDER BY volume_usd DESC
LIMIT 15`
      },
      {
        id: 'largest-swaps',
        title: 'Largest Single Swaps (Base)',
        description: 'Найбільші одиночні свопи на Base за 24 год',
        tags: ['base', 'whales', 'swaps'],
        sql: `-- Largest single swaps on Base (last 24h)
SELECT
  block_time,
  taker,
  project,
  token_bought_symbol  AS bought,
  token_sold_symbol    AS sold,
  amount_usd,
  tx_hash
FROM dex.trades
WHERE blockchain = 'base'
  AND block_time >= NOW() - INTERVAL '24' HOUR
  AND amount_usd > 10000
ORDER BY amount_usd DESC
LIMIT 30`
      },
      {
        id: 'uniswap-v3-base',
        title: 'Uniswap V3 — Pool Activity (Base)',
        description: 'Активність пулів Uniswap V3 на Base',
        tags: ['uniswap', 'base', 'pools'],
        sql: `-- Uniswap V3 top pools on Base (last 7 days)
SELECT
  token_bought_symbol || '/' || token_sold_symbol AS pair,
  COUNT(*)        AS trades,
  SUM(amount_usd) AS volume_usd,
  COUNT(DISTINCT taker) AS unique_traders
FROM dex.trades
WHERE blockchain = 'base'
  AND project    = 'uniswap'
  AND version    = '3'
  AND block_time >= NOW() - INTERVAL '7' DAY
  AND amount_usd > 1
GROUP BY 1
ORDER BY volume_usd DESC
LIMIT 20`
      }
    ]
  },
  {
    id: 'wallet',
    label: 'Wallet Intel',
    icon: '🔍',
    queries: [
      {
        id: 'wallet-dex-activity',
        title: 'Wallet DEX Activity',
        description: 'Повна DEX активність конкретного гаманця',
        tags: ['wallet', 'dex', 'analysis'],
        sql: `-- Replace with target wallet address (varbinary — no quotes!)
-- Example: 0xda905450166c6574cee0cd276b898f62d7368ee9

SELECT
  DATE_TRUNC('day', block_time)    AS day,
  blockchain,
  project,
  token_bought_symbol              AS bought,
  token_sold_symbol                AS sold,
  token_bought_amount              AS bought_amount,
  token_sold_amount                AS sold_amount,
  amount_usd,
  tx_hash
FROM dex.trades
WHERE taker    = 0xda905450166c6574cee0cd276b898f62d7368ee9  -- ← REPLACE ADDRESS
  AND block_time >= NOW() - INTERVAL '90' DAY
ORDER BY block_time DESC
LIMIT 100`
      },
      {
        id: 'wallet-pnl',
        title: 'Wallet PnL on DEX',
        description: 'Приблизний P&L гаманця по свопах (Base)',
        tags: ['wallet', 'pnl', 'base'],
        sql: `-- Approximate DEX PnL for a wallet on Base
-- Positive = profit, Negative = loss (vs USD at trade time)

WITH swaps AS (
  SELECT
    token_bought_symbol   AS token,
    SUM(token_bought_amount * p_buy.price)  AS usd_in,
    SUM(token_sold_amount  * p_sell.price)  AS usd_out
  FROM dex.trades t
  LEFT JOIN prices.usd p_buy
    ON p_buy.blockchain = t.blockchain
   AND p_buy.contract_address = t.token_bought_address
   AND p_buy.minute = DATE_TRUNC('minute', t.block_time)
  LEFT JOIN prices.usd p_sell
    ON p_sell.blockchain = t.blockchain
   AND p_sell.contract_address = t.token_sold_address
   AND p_sell.minute = DATE_TRUNC('minute', t.block_time)
  WHERE t.taker = 0xda905450166c6574cee0cd276b898f62d7368ee9  -- ← REPLACE
    AND t.blockchain = 'base'
    AND t.block_time >= NOW() - INTERVAL '90' DAY
  GROUP BY 1
)
SELECT
  token,
  ROUND(usd_in  - usd_out, 2) AS pnl_usd,
  ROUND(usd_in,  2)           AS value_acquired_usd,
  ROUND(usd_out, 2)           AS value_spent_usd
FROM swaps
ORDER BY pnl_usd DESC`
      },
      {
        id: 'smart-money-aerodrome',
        title: 'Smart Money — Aerodrome Snipers',
        description: 'Гаманці з високим win-rate на Aerodrome',
        tags: ['smart-money', 'aerodrome', 'base'],
        sql: `-- Smart money wallets on Aerodrome (Base, 90 days)
-- Filters: human traders, consistent activity, large volume

SELECT
  taker,
  COUNT(*)                            AS total_trades,
  SUM(amount_usd)                     AS total_volume_usd,
  COUNT(DISTINCT DATE_TRUNC('day', block_time)) AS active_days,
  SUM(amount_usd) / COUNT(DISTINCT DATE_TRUNC('day', block_time)) AS avg_daily_volume,
  MIN(block_time)                     AS first_seen,
  MAX(block_time)                     AS last_seen
FROM dex.trades
WHERE blockchain = 'base'
  AND project = 'aerodrome'
  AND block_time >= NOW() - INTERVAL '90' DAY
  AND amount_usd BETWEEN 100 AND 500000
  AND taker != 0x1111111254EEB25477B68fb85Ed929f73A960582
  AND taker != 0xDEF1C0ded9bec7F1a1670819833240f027b25EfF
GROUP BY 1
HAVING
  COUNT(*) BETWEEN 10 AND 500
  AND COUNT(DISTINCT DATE_TRUNC('day', block_time)) >= 5
ORDER BY total_volume_usd DESC
LIMIT 50`
      }
    ]
  },
  {
    id: 'tokens',
    label: 'Token Analytics',
    icon: '🪙',
    queries: [
      {
        id: 'token-price-history',
        title: 'Token Price History',
        description: 'Погодинна ціна токену за останні 7 днів',
        tags: ['token', 'price', 'history'],
        sql: `-- Hourly token price (replace contract address)
SELECT
  DATE_TRUNC('hour', minute)  AS hour,
  AVG(price)                  AS price_usd,
  MIN(price)                  AS low_usd,
  MAX(price)                  AS high_usd
FROM prices.usd
WHERE blockchain       = 'base'
  AND contract_address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  -- ← USDC on Base
  AND minute >= NOW() - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 1 DESC
LIMIT 200`
      },
      {
        id: 'token-top-holders',
        title: 'Token Holder Concentration',
        description: 'Розподіл холдерів токену через transfers',
        tags: ['token', 'holders', 'concentration'],
        sql: `-- Token holder balances via transfer events
-- Replace chain and contract_address

WITH transfers AS (
  SELECT
    "to"   AS address,
    SUM(CAST(value AS DOUBLE) / 1e18) AS received
  FROM erc20_base.evt_Transfer
  WHERE contract_address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  -- ← token
  GROUP BY 1

  UNION ALL

  SELECT
    "from" AS address,
    -SUM(CAST(value AS DOUBLE) / 1e18) AS sent
  FROM erc20_base.evt_Transfer
  WHERE contract_address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  GROUP BY 1
)
SELECT
  address,
  SUM(received) AS balance
FROM transfers
WHERE address != 0x0000000000000000000000000000000000000000
GROUP BY 1
HAVING SUM(received) > 0
ORDER BY balance DESC
LIMIT 50`
      },
      {
        id: 'new-tokens-base',
        title: 'New Token Launches (Base)',
        description: 'Нові ERC20 токени на Base за останній тиждень',
        tags: ['base', 'tokens', 'new'],
        sql: `-- New ERC20 tokens deployed on Base (last 7 days)
SELECT
  contract_address,
  symbol,
  name,
  decimals,
  block_time AS deployed_at
FROM tokens.erc20
WHERE blockchain  = 'base'
  AND block_time >= NOW() - INTERVAL '7' DAY
ORDER BY block_time DESC
LIMIT 50`
      }
    ]
  },
  {
    id: 'defi',
    label: 'DeFi Protocols',
    icon: '🏦',
    queries: [
      {
        id: 'aerodrome-tvl-pools',
        title: 'Aerodrome — Pool Volumes',
        description: 'Об\'єм пулів Aerodrome по парах',
        tags: ['aerodrome', 'base', 'tvl'],
        sql: `-- Aerodrome pool volumes on Base (last 30 days)
SELECT
  token_bought_symbol || '/' || token_sold_symbol AS pair,
  COUNT(*)        AS swaps,
  SUM(amount_usd) AS volume_usd,
  COUNT(DISTINCT taker)  AS unique_traders,
  COUNT(DISTINCT DATE_TRUNC('day', block_time)) AS active_days
FROM dex.trades
WHERE blockchain = 'base'
  AND project    = 'aerodrome'
  AND block_time >= NOW() - INTERVAL '30' DAY
  AND amount_usd > 1
GROUP BY 1
ORDER BY volume_usd DESC
LIMIT 30`
      },
      {
        id: 'aave-borrows',
        title: 'Aave — Borrow Activity',
        description: 'Активність позик на Aave',
        tags: ['aave', 'lending', 'defi'],
        sql: `-- Aave borrow events (last 7 days)
-- Works on ethereum, polygon, arbitrum, optimism, base

SELECT
  DATE_TRUNC('day', evt_block_time) AS day,
  blockchain,
  symbol,
  COUNT(*)                          AS borrow_txs,
  SUM(CAST(amount AS DOUBLE) / POWER(10, decimals)) AS total_borrowed
FROM aave_v3.evt_Borrow b
LEFT JOIN tokens.erc20 t
  ON t.contract_address = b.reserve
 AND t.blockchain = b.blockchain
WHERE b.evt_block_time >= NOW() - INTERVAL '7' DAY
GROUP BY 1, 2, 3
ORDER BY day DESC, total_borrowed DESC
LIMIT 50`
      }
    ]
  },
  {
    id: 'chain',
    label: 'Chain Metrics',
    icon: '⛓️',
    queries: [
      {
        id: 'daily-active-addresses',
        title: 'Daily Active Addresses (Base)',
        description: 'Унікальні активні адреси на Base по днях',
        tags: ['base', 'activity', 'onchain'],
        sql: `-- Daily active addresses on Base (last 30 days)
SELECT
  DATE_TRUNC('day', block_time) AS day,
  COUNT(DISTINCT "from")        AS active_addresses,
  COUNT(*)                      AS transactions,
  SUM(gas_used * gas_price) / 1e18 AS total_gas_eth
FROM base.transactions
WHERE block_time >= NOW() - INTERVAL '30' DAY
  AND success = true
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30`
      },
      {
        id: 'cross-chain-bridge-volume',
        title: 'Bridge Volume (Base)',
        description: 'Об\'єм бриджів на Base за 7 днів',
        tags: ['base', 'bridge', 'crosschain'],
        sql: `-- Bridging activity to/from Base (last 7 days)
SELECT
  DATE_TRUNC('day', block_time) AS day,
  COUNT(*)        AS bridge_txs,
  SUM(amount_usd) AS volume_usd
FROM dex.trades
WHERE (blockchain = 'base' OR blockchain = 'ethereum')
  AND block_time >= NOW() - INTERVAL '7' DAY
  AND project IN ('across', 'stargate', 'hop', 'synapse', 'celer')
  AND amount_usd > 0
GROUP BY 1
ORDER BY 1 DESC`
      }
    ]
  }
]

export const ALL_QUERIES: Query[] = CATEGORIES.flatMap(c => c.queries)
