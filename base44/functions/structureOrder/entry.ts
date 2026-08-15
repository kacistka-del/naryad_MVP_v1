const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await db.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const description = (body?.description || '').toString().trim();
    if (!description || description.length < 5) {
      return Response.json({ error: 'Описание слишком короткое' }, { status: 400 });
    }

    const categories = await db.asServiceRole.entities.Category.list();
    const catList = categories
      .filter(c => !c.isArchived)
      .map(c => `${c.code} — ${c.name}`)
      .join('\n');

    const prompt = [
      'Ты — ассистент сервиса бытовых заказов «НАРЯД».',
      'На основе описания задачи предложи структуру наряда.',
      'Доступные категории (используй поле code как categoryId):',
      catList,
      '',
      `Описание задачи: "${description}"`,
      '',
      'Верни JSON со следующими полями:',
      'categoryId — code подходящей категории из списка выше;',
      'specialties — массив строк (узкие специализации);',
      'estimatedComplexity — low | medium | high;',
      'estimatedCost — объект { min, max, currency:"RUB" };',
      'estimatedDurationDays — число дней;',
      'clarifyingQuestions — массив уточняющих вопросов на русском;',
      'confidence — число от 0 до 1.',
      'Не выдумывай категории, не вошедшие в список.'
    ].join('\n');

    const schema = {
      type: 'object',
      properties: {
        categoryId: { type: 'string' },
        specialties: { type: 'array', items: { type: 'string' } },
        estimatedComplexity: { type: 'string', enum: ['low', 'medium', 'high'] },
        estimatedCost: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
            currency: { type: 'string' }
          }
        },
        estimatedDurationDays: { type: 'number' },
        clarifyingQuestions: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' }
      }
    };

    const result = await db.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema
    });

    return Response.json({ suggestion: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}