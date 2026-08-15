import express from 'express';
import { authRequired } from '../middleware.js';
import { invokeLLM, llmConfigured } from '../llm.js';
import { httpError, wrap } from '../http.js';

const router = express.Router();

// Замена integrations.Core.InvokeLLM
router.post(
  '/invoke',
  authRequired,
  wrap(async (req, res) => {
    if (!llmConfigured()) throw httpError(501, 'LLM не настроен (OPENAI_API_KEY)');
    const { prompt, response_json_schema: schema } = req.body || {};
    if (!prompt) throw httpError(400, 'prompt обязателен');
    const result = await invokeLLM({ prompt, response_json_schema: schema });
    res.json(result ?? {});
  })
);

export default router;
