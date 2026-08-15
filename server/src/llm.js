import 'dotenv/config';

export const llmConfigured = () => Boolean(process.env.OPENAI_API_KEY);

/**
 * Единая точка вызова LLM (замена integrations.Core.InvokeLLM).
 * Если ключ не настроен — возвращает null, вызывающий код использует эвристику.
 */
export async function invokeLLM({ prompt, response_json_schema: schema }) {
  if (!llmConfigured()) return null;

  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Ты возвращаешь только валидный JSON без пояснений.' +
          (schema ? ' JSON должен соответствовать схеме: ' + JSON.stringify(schema) : ''),
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`LLM error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
