const db = require('../database');
const weatherAgent = require('./weatherAgent');
const { registrarMetricaSRE } = require('../sreTelemetry');

/**
 * Agente Especialista em Segurança, Guardrail & Reconciliação de Listas Copiadas
 * 
 * Arquitetura de Guardrail:
 * 1. NENHUM sub-agente responde diretamente ao usuário.
 * 2. O Orquestrador Supervisor coleta os dados dos sub-agentes e submete ao Guardrail.
 * 3. O Guardrail audita Prompt Injection, previne alterações manuais por Copiar/Colar e garante a resposta justa.
 */

/**
 * Detecta se a mensagem enviada pelo usuário é uma lista copiada e colada manualmente
 */
function ehListaCopiadaEColada(textoMensagem) {
  if (!textoMensagem || typeof textoMensagem !== 'string') return false;
  const t = textoMensagem.trim();
  const linhas = t.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let contagemLinhasNumeradas = 0;
  for (const linha of linhas) {
    if (/^(?:\d+|\*|\-|\•)/.test(linha) && /[a-zA-Z]/i.test(linha)) {
      contagemLinhasNumeradas++;
    }
  }

  const temPalavraLista = /lista|escalação|escalacao|confirma|presença|pelada|titulares|reservas/i.test(t);
  return contagemLinhasNumeradas >= 3 || (temPalavraLista && contagemLinhasNumeradas >= 2);
}

function extrairNomesDeListaCopiada(textoMensagem) {
  const linhas = textoMensagem.split('\n');
  const nomesExtraidos = [];

  for (const linha of linhas) {
    const l = linha.trim();
    const limpo = l.replace(/^(?:\d+[\s\.\-\)]*|[•\-*]\s*)/, '').trim();
    if (limpo) {
      let nome = limpo.replace(/🧤|🚑|⏱️|🌟|👑|⚽/g, '').trim();
      nome = nome.split(/\(|\-|\–/)[0].trim();
      if (nome.length >= 2 && !/^(lista|confirmados|goleiros|linha|espera|desistencias|desistências|futebol|pelada)/i.test(nome.toLowerCase())) {
        nomesExtraidos.push(nome);
      }
    }
  }

  return nomesExtraidos;
}

/**
 * Reconcilia a lista copiada e colada pelo usuário com o banco de dados SQLite oficial
 */
async function processarListaCopiadaGuardrail(textoMensagem, nomeRemetente) {
  const startTime = Date.now();
  console.log(`🛡️ [Guardrail Agent] Detectada tentativa de 'Copiar e Colar' por "${nomeRemetente}". Reconciliando com o Banco de Dados...`);

  const nomesExtraidos = extrairNomesDeListaCopiada(textoMensagem);

  if (nomesExtraidos.length > 0) {
    // Reconcilia cada nome extraído no SQLite da partida ativa
    nomesExtraidos.forEach(nome => {
      db.salvarPresenca({
        nome: nome,
        pushName: nomeRemetente,
        tipoJogador: 'linha',
        status: 'confirmado',
        convidadoPor: nomeRemetente
      });
    });
  }

  // Obtém a previsão do tempo e formata a lista OFICIAL do banco de dados
  const climaInfo = await weatherAgent.obterPrevisaoProximaTerca();
  const maxLinha = parseInt(process.env.MAX_JOGADORES_LINHA || '14', 10);
  const mensagemListaOficial = db.formatarMensagemLista(null, maxLinha, climaInfo);

  const endTime = Date.now();
  registrarMetricaSRE({
    provider: 'guardrail-engine',
    model: 'copiar-colar-reconciler',
    agentName: 'Guardrail & Anti-Tampering Agent',
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: endTime - startTime,
    ttftMs: endTime - startTime,
    status: 'success',
    userName: nomeRemetente
  });

  let respostaFinal = `🛡️ *[GUARDRAIL DE SEGURANÇA - RECONCILIAÇÃO AUTOMÁTICA]* 🛡️\n`;
  respostaFinal += `------------------------------------\n`;
  respostaFinal += `⚠️ *Aviso:* Detectamos que você copiou e colou a lista manualmente, *${nomeRemetente}*.\n`;
  respostaFinal += `✅ Ajustamos os nomes citados e sincronizamos com o **Banco de Dados Oficial** para evitar alterações indevidas!\n\n`;
  respostaFinal += mensagemListaOficial;

  return {
    interceptado: true,
    respostaDireta: respostaFinal
  };
}

/**
 * Auditia e sanitiza a resposta final gerada pelos sub-agentes antes de enviar ao WhatsApp
 * Previne Prompt Injection, vazamento de tokens de sistema ou formatação incorreta.
 */
function auditarESanitizarResposta(respostaCandidata, textoOriginal, nomeRemetente) {
  if (!respostaCandidata || typeof respostaCandidata !== 'string') {
    return respostaCandidata;
  }

  let respostaSanitizada = respostaCandidata;

  // 1. Anti-Prompt Injection Filter: Remove tentativas de injetar comandos de sistema
  const padroesSuspeitos = [
    /system\s*instruction/gi,
    /ignore\s*previous\s*instructions/gi,
    /delete\s*from\s*presencas/gi,
    /drop\s*table/gi,
    /<script[\s\S]*?>/gi
  ];

  padroesSuspeitos.forEach(regex => {
    if (regex.test(textoOriginal)) {
      console.warn(`⚠️ [Guardrail Security Warning] Tentativa de Prompt Injection detectada de "${nomeRemetente}"!`);
      respostaSanitizada = `⛔ *[SEGURANÇA GUARDRAIL]* Comando ou instrução não permitida detectada. A operação foi bloqueada.`;
    }
  });

  // 2. Limpeza de artefatos de código brutos ou JSON não formatados
  respostaSanitizada = respostaSanitizada.replace(/```json/gi, '').replace(/```/g, '').trim();

  return respostaSanitizada;
}

module.exports = {
  ehListaCopiadaEColada,
  processarListaCopiadaGuardrail,
  auditarESanitizarResposta
};
