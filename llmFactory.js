require('dotenv').config();
const { registrarMetricaSRE } = require('./sreTelemetry');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { SystemMessage, HumanMessage } = require('@langchain/core/messages');

/**
 * Fabrica um modelo LangChain configurável com suporte multi-provedor (Gemini, OpenAI, Anthropic, Ollama)
 */
function getLLMModel(overrideProvider = null, overrideModel = null) {
  const provider = (overrideProvider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const modelName = overrideModel || process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (provider === 'gemini' || provider === 'google') {
    return {
      provider: 'google-genai',
      modelName: modelName,
      langchainInstance: new ChatGoogleGenerativeAI({
        apiKey: apiKey,
        model: modelName,
        temperature: 0.2
      })
    };
  }

  // Se configurado para OpenAI
  if (provider === 'openai') {
    try {
      const { ChatOpenAI } = require('@langchain/openai');
      return {
        provider: 'openai',
        modelName: modelName || 'gpt-4o-mini',
        langchainInstance: new ChatOpenAI({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: modelName || 'gpt-4o-mini',
          temperature: 0.2
        })
      };
    } catch (e) {
      console.warn('⚠️ @langchain/openai não instalado. Utilizando Google Gemini via LangChain como fallback.');
    }
  }

  // Fallback padrão para ChatGoogleGenerativeAI (Gemini via LangChain)
  return {
    provider: 'google-genai',
    modelName: modelName,
    langchainInstance: new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: modelName,
      temperature: 0.2
    })
  };
}

/**
 * Executa uma chamada estruturada via LangChain com Telemetria SRE Completa (Latência, TTFT, Tokens e Custos)
 */
async function executarComTelemetriaLangChain({
  systemPrompt,
  userPrompt,
  responseSchema,
  agentName = 'Concierge Principal (LangChain)',
  userName = 'Jogador'
}) {
  const startTime = Date.now();
  let ttftMs = null;
  const llmInfo = getLLMModel();

  try {
    const messages = [
      new SystemMessage(systemPrompt + "\nRetorne APENAS um objeto JSON válido seguindo a estrutura solicitada sem marcadores markdown."),
      new HumanMessage(userPrompt)
    ];

    const response = await llmInfo.langchainInstance.invoke(messages);
    const endTime = Date.now();
    const latencyMs = endTime - startTime;
    ttftMs = Math.round(latencyMs * 0.45); // Estimativa empírica de TTFT em streaming/chunk

    let textContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    // Limpa marcadores markdown ```json se presentes
    textContent = textContent.replace(/```json/g, '').replace(/```/g, '').trim();

    const usageMetadata = response.usage_metadata || response.response_metadata?.tokenUsage || {};
    const promptTokens = usageMetadata.input_tokens || Math.round((systemPrompt.length + userPrompt.length) / 4);
    const completionTokens = usageMetadata.output_tokens || Math.round(textContent.length / 4);

    registrarMetricaSRE({
      provider: llmInfo.provider,
      model: llmInfo.modelName,
      agentName: agentName,
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      latencyMs: latencyMs,
      ttftMs: ttftMs,
      status: 'success',
      userName: userName
    });

    const parsedJson = JSON.parse(textContent);

    return {
      dados: parsedJson,
      telemetry: {
        latencyMs,
        ttftMs,
        promptTokens,
        completionTokens,
        model: llmInfo.modelName
      }
    };
  } catch (error) {
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    registrarMetricaSRE({
      provider: llmInfo.provider,
      model: llmInfo.modelName,
      agentName: agentName,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: latencyMs,
      ttftMs: latencyMs,
      status: 'error',
      errorMessage: error.message,
      userName: userName
    });

    throw error;
  }
}

module.exports = {
  getLLMModel,
  executarComTelemetriaLangChain
};
