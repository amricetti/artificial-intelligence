const db = require('./database');

/**
 * Tabela de preços por 1.000.000 de tokens (em USD) para estimativa de custos SRE
 */
const TOKEN_PRICING = {
  // Google Gemini
  'gemini-3.5-flash-lite': { input: 0.075, output: 0.30 },
  'gemini-3.5-flash': { input: 0.15, output: 0.60 },
  'gemini-3.6-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },

  // OpenAI
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

  // Anthropic Claude
  'claude-3-5-haiku': { input: 0.80, output: 4.00 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },

  // Default Fallback
  'default': { input: 0.10, output: 0.40 }
};

/**
 * Cotação fixa estimada USD -> BRL para o relatório SRE
 */
const USD_TO_BRL = parseFloat(process.env.USD_TO_BRL || '5.65');

/**
 * Calcula o custo estimado em USD com base em prompt e completion tokens
 */
function calcularCustoEstimado(modelName, promptTokens, completionTokens) {
  const modelKey = (modelName || '').toLowerCase();
  const pricing = TOKEN_PRICING[modelKey] || TOKEN_PRICING['default'];

  const custoInput = (promptTokens / 1_000_000) * pricing.input;
  const custoOutput = (completionTokens / 1_000_000) * pricing.output;

  return custoInput + custoOutput;
}

/**
 * Registra uma métrica de execução no banco SQLite
 */
function registrarMetricaSRE({
  provider = 'gemini',
  model = 'gemini-3.5-flash-lite',
  agentName = 'Concierge Principal',
  promptTokens = 0,
  completionTokens = 0,
  latencyMs = 0,
  ttftMs = null,
  status = 'success',
  errorMessage = null,
  userName = 'Desconhecido'
}) {
  const totalTokens = promptTokens + completionTokens;
  const costUsd = calcularCustoEstimado(model, promptTokens, completionTokens);

  try {
    const stmt = db.db.prepare(`
      INSERT INTO sre_metrics (
        provider, model, agent_name, prompt_tokens, completion_tokens,
        total_tokens, cost_usd, latency_ms, ttft_ms, status, error_message, user_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      provider,
      model,
      agentName,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      latencyMs,
      ttftMs || latencyMs,
      status,
      errorMessage,
      userName
    );
  } catch (err) {
    console.error('❌ [SRE Telemetry Error]: Erro ao gravar métrica:', err.message);
  }
}

/**
 * Gera o Dashboard SRE completo com SLI, SLO, TTFT, Custo por Token e Estatísticas
 */
function gerarDashboardSRE(donoNome = 'Alan') {
  try {
    const totalReqRow = db.db.prepare(`SELECT COUNT(*) as total FROM sre_metrics`).get();
    const totalReq = totalReqRow ? totalReqRow.total : 0;

    if (totalReq === 0) {
      return `📊 *JOGA10-AI - SRE OBSERVAABILIDADE & MÉTRICAS* 🛠️\n` +
        `------------------------------------\n` +
        `ℹ️ *Status:* Nenhuma requisição registrada ainda.\n` +
        `💡 _Envie uma mensagem ou comando para o bot iniciar a coleta de métricas em tempo real!_`;
    }

    // Métricas de Sucesso e Erro (SLI / SLO)
    const successRow = db.db.prepare(`SELECT COUNT(*) as total FROM sre_metrics WHERE status = 'success'`).get();
    const successReq = successRow ? successRow.total : 0;
    const errorRow = db.db.prepare(`SELECT COUNT(*) as total FROM sre_metrics WHERE status = 'error'`).get();
    const errorReq = errorRow ? errorRow.total : 0;
    const fallbackRow = db.db.prepare(`SELECT COUNT(*) as total FROM sre_metrics WHERE status = 'fallback'`).get();
    const fallbackReq = fallbackRow ? fallbackRow.total : 0;

    const sliSucesso = ((successReq / totalReq) * 100).toFixed(1);
    const sloAlvo = 99.0;
    const sloStatus = parseFloat(sliSucesso) >= sloAlvo ? '✅ [DENTRO DO SLO]' : '⚠️ [FORA DO SLO]';

    // Métricas de Latência e TTFT
    const latencyStats = db.db.prepare(`
      SELECT 
        AVG(latency_ms) as avg_latency,
        AVG(ttft_ms) as avg_ttft,
        MAX(latency_ms) as max_latency,
        MIN(latency_ms) as min_latency
      FROM sre_metrics
    `).get();

    // P95 e Median (P50) Latency
    const latencies = db.db.prepare(`SELECT latency_ms FROM sre_metrics ORDER BY latency_ms ASC`).all().map(r => r.latency_ms);
    const p50Index = Math.floor(latencies.length * 0.5);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p50Latency = latencies[p50Index] || 0;
    const p95Latency = latencies[p95Index] || 0;

    // Métricas de Tokens e Custos
    const tokenStats = db.db.prepare(`
      SELECT 
        SUM(prompt_tokens) as total_prompt,
        SUM(completion_tokens) as total_completion,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost_usd
      FROM sre_metrics
    `).get();

    const totalPrompt = tokenStats.total_prompt || 0;
    const totalCompletion = tokenStats.total_completion || 0;
    const totalTokens = tokenStats.total_tokens || 0;
    const totalCostUsd = tokenStats.total_cost_usd || 0.0;
    const totalCostBrl = totalCostUsd * USD_TO_BRL;

    // Consumo nas últimas 24 horas
    const costTodayStats = db.db.prepare(`
      SELECT SUM(cost_usd) as cost_today, SUM(total_tokens) as tokens_today 
      FROM sre_metrics 
      WHERE timestamp >= datetime('now', '-1 day')
    `).get();

    const costTodayUsd = costTodayStats.cost_today || 0.0;
    const costTodayBrl = costTodayUsd * USD_TO_BRL;
    const tokensToday = costTodayStats.tokens_today || 0;

    // Provedores e Modelos Ativos
    const providerAtivo = process.env.LLM_PROVIDER || 'google-genai (LangChain)';
    const modeloAtivo = process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
    const botName = process.env.BOT_NAME || 'Joga10';

    // Agentes mais acionados
    const agentesStats = db.db.prepare(`
      SELECT agent_name, COUNT(*) as qtd, SUM(total_tokens) as tokens
      FROM sre_metrics
      GROUP BY agent_name
      ORDER BY qtd DESC
      LIMIT 5
    `).all();

    let dash = `📊 *${botName.toUpperCase()} - SRE OBSERVAABILIDADE & MÉTRICAS* 🛠️\n`;
    dash += `------------------------------------\n`;
    dash += `👑 *Engenheiro SRE / Dono:* ${donoNome}\n`;
    dash += `🟢 *Status da Arquitetura:* ONLINE (LangChain Agnostic)\n`;
    dash += `🤖 *Provedor Ativo:* \`${providerAtivo}\`\n`;
    dash += `⚙️ *Modelo Principal:* \`${modeloAtivo}\`\n\n`;

    dash += `🎯 *INDICADORES DE SERVIÇO (SLI / SLO)*\n`;
    dash += `  • *SLO Alvo:* ${sloAlvo.toFixed(1)}% de Disponibilidade\n`;
    dash += `  • *SLI Atual (Taxa Sucesso):* ${sliSucesso}% ${sloStatus}\n`;
    dash += `  • *Total de Requisições:* ${totalReq}\n`;
    dash += `  • *Sucesso:* ${successReq} | *Falhas/Fallbacks:* ${errorReq + fallbackReq}\n\n`;

    dash += `⏱️ *LATÊNCIA & TEMPO DE RESPOSTA (TTFT)*\n`;
    dash += `  • *Tempo Médio até 1º Token (TTFT):* ${Math.round(latencyStats.avg_ttft || 0)} ms\n`;
    dash += `  • *Latência P50 (Mediana):* ${p50Latency} ms\n`;
    dash += `  • *Latência P95 (Crítica):* ${p95Latency} ms\n`;
    dash += `  • *Latência Mín / Máx:* ${latencyStats.min_latency || 0} ms / ${latencyStats.max_latency || 0} ms\n\n`;

    dash += `💰 *TELEMETRIA DE TOKENS & CUSTOS (USD / BRL)*\n`;
    dash += `  • *Tokens Prompt (Entrada):* ${totalPrompt.toLocaleString('pt-BR')}\n`;
    dash += `  • *Tokens Completion (Saída):* ${totalCompletion.toLocaleString('pt-BR')}\n`;
    dash += `  • *Total Tokens Acumulados:* ${totalTokens.toLocaleString('pt-BR')}\n`;
    dash += `  • *Custo Hoje (Últimas 24h):* $ ${costTodayUsd.toFixed(4)} USD (~ R$ ${costTodayBrl.toFixed(2)})\n`;
    dash += `  • *Custo Total Geral:* $ ${totalCostUsd.toFixed(4)} USD (~ R$ ${totalCostBrl.toFixed(2)})\n\n`;

    dash += `🤖 *DESEMPENHO POR AGENTE DE IA*\n`;
    agentesStats.forEach((ag, idx) => {
      const tok = (ag.tokens || 0).toLocaleString('pt-BR');
      dash += `  ${idx + 1}. *${ag.agent_name}*: ${ag.qtd} chamada(s) (${tok} tokens)\n`;
    });

    dash += `------------------------------------\n`;
    dash += `💡 _Métricas capturadas via LangChain Telemetry Engine em tempo real._`;

    return dash;
  } catch (err) {
    console.error('❌ Erro ao gerar dashboard SRE:', err);
    return `❌ *Erro ao gerar estatísticas SRE:* ${err.message}`;
  }
}

module.exports = {
  registrarMetricaSRE,
  gerarDashboardSRE,
  calcularCustoEstimado,
  TOKEN_PRICING
};
