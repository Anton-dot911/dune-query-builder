// netlify/functions/dune-query.js
// Executes a saved Dune query by ID and polls for results.

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DUNE = 'https://api.dune.com/api/v1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const jsonH  = { ...CORS, 'Content-Type': 'application/json' };
  const apiKey = process.env.DUNE_API_KEY?.trim();

  if (!apiKey) {
    return {
      statusCode: 200, headers: jsonH,
      body: JSON.stringify({
        status: 'no_api_key',
        message: 'DUNE_API_KEY не налаштований.',
        hint: 'Отримайте ключ на dune.com/settings/api та додайте в Netlify → Site settings → Environment variables'
      })
    };
  }

  let query_id, parameters;
  try {
    const body = JSON.parse(event.body || '{}');
    query_id   = String(body.query_id || '').trim();
    parameters = body.parameters || {};
    if (!query_id) throw new Error('query_id required');
  } catch (e) {
    return { statusCode: 400, headers: jsonH, body: JSON.stringify({ error: String(e) }) };
  }

  try {
    // Step 1: Execute query
    const execRes = await fetch(`${DUNE}/query/${query_id}/execute`, {
      method: 'POST',
      headers: { 'X-Dune-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_parameters: parameters })
    });

    if (!execRes.ok) {
      const err = await execRes.json().catch(() => ({}));
      return {
        statusCode: execRes.status, headers: jsonH,
        body: JSON.stringify({ error: err?.error || `Dune API error ${execRes.status}. Перевірте що Query ID правильний та публічний.` })
      };
    }

    const { execution_id } = await execRes.json();

    // Step 2: Poll for results — max 12 attempts × 4s = ~48s
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 4000));

      const resultRes = await fetch(`${DUNE}/execution/${execution_id}/results`, {
        headers: { 'X-Dune-Api-Key': apiKey }
      });

      if (!resultRes.ok) continue;
      const data = await resultRes.json();

      if (data.state === 'QUERY_STATE_COMPLETED') {
        return {
          statusCode: 200, headers: jsonH,
          body: JSON.stringify({
            status:       'completed',
            query_id,
            execution_id,
            rows:         data.result?.rows         || [],
            columns:      data.result?.metadata?.column_names || [],
            row_count:    data.result?.metadata?.row_count    || 0,
            exec_ms:      data.result?.metadata?.execution_time_millis || 0,
          })
        };
      }

      if (data.state === 'QUERY_STATE_FAILED') {
        return { statusCode: 400, headers: jsonH, body: JSON.stringify({ error: 'Query execution failed', detail: data }) };
      }
      // PENDING / EXECUTING — continue polling
    }

    return {
      statusCode: 202, headers: jsonH,
      body: JSON.stringify({ status: 'timeout', execution_id, message: 'Query виконується більше 48с. Спробуйте ще раз або перевірте результати на dune.com' })
    };

  } catch (err) {
    return { statusCode: 500, headers: jsonH, body: JSON.stringify({ error: String(err) }) };
  }
};
