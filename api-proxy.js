// Cloudflare Worker proxy for dashboard AI calls
const SYSTEM_PROMPT = `You are an expert computational biologist assisting with TCGA PDAC gene expression, age/sex differential expression, and survival analysis. Ground responses only in provided context; if data is missing, say so. Be concise.`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/chat') {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    try {
      const body = await request.json();
      const reply = await handleChat(body, env);
      return jsonResponse({ reply });
    } catch (err) {
      console.error('Worker error', err);
      return jsonResponse({ reply: 'AI service error.' }, 500);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

async function handleChat(body, env) {
  if (!env.AI_API_KEY) throw new Error('Missing AI_API_KEY');
  const task = body.task || 'chat';
  const userMessage = body.user_message || 'Assist with the dashboard.';
  const contextText = body.context ? JSON.stringify(body.context).slice(0, 12000) : '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(task, userMessage, contextText, body) }
  ];

  // Try Groq first, then fallback to Fireworks, Together
  const providers = [
    () => callGroq(messages, env.AI_API_KEY),
    () => callFireworks(messages, env.AI_API_KEY),
    () => callTogether(messages, env.AI_API_KEY)
  ];

  for (const call of providers) {
    try {
      const resp = await call();
      if (resp) return resp;
    } catch (err) {
      console.error('Provider failed', err);
    }
  }
  throw new Error('All providers failed');
}

function buildPrompt(task, userMessage, contextText, body) {
  const taskLine = `Task: ${task}`;
  const base = `${taskLine}\nUser message: ${userMessage}`;
  const ctx = contextText ? `\nContext: ${contextText}` : '';
  const genes = body.genes ? `\nGenes: ${JSON.stringify(body.genes).slice(0, 2000)}` : '';
  return `${base}${genes}${ctx}`;
}

async function callGroq(messages, apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.2,
      max_tokens: 800
    })
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

async function callFireworks(messages, apiKey) {
  const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      messages,
      temperature: 0.2,
      max_tokens: 800
    })
  });
  if (!res.ok) throw new Error(`Fireworks HTTP ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

async function callTogether(messages, apiKey) {
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'meta-llama/Meta-Llama-3-8B-Instruct-Turbo',
      messages,
      temperature: 0.2,
      max_tokens: 800
    })
  });
  if (!res.ok) throw new Error(`Together HTTP ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}
