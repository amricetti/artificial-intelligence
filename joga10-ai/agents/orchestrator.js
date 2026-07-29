const weatherAgent = require('./weatherAgent');
const goalkeeperAgent = require('./goalkeeperAgent');
const financeAgent = require('./financeAgent');
const newsAgent = require('./newsAgent');
const conciergeAgent = require('../agent');
const db = require('../database');

/**
 * Orquestrador Multi-Agente
 * Roteia as mensagens do grupo para o agente especialista correspondente.
 */
async function orquestrarMensagem(textoMensagem, nomeRemetente) {
  const textoClean = textoMensagem.trim().toLowerCase();

  // 1. Tenta rotear para o Agente Financeiro & PIX
  const resFinanceiro = financeAgent.processarFinanceiro(textoMensagem, nomeRemetente);
  if (resFinanceiro.sucesso) {
    return {
      agente: 'Financeiro',
      respostaDireta: resFinanceiro.mensagem,
      houveAlteracao: true
    };
  }

  // 2. Tenta rotear para o Agente de Goleiros Externos
  const resGoleiro = goalkeeperAgent.processarComandoGoleiro(textoMensagem, nomeRemetente);
  if (resGoleiro.sucesso) {
    return {
      agente: 'Goleiros',
      respostaDireta: resGoleiro.mensagem,
      houveAlteracao: true
    };
  }

  // 3. Tenta rotear para o Agente de Clima / Tempo
  if (textoClean === '!clima' || textoClean.includes('previsão do tempo') || textoClean.includes('vai chover')) {
    const infoClima = await weatherAgent.obterPrevisaoProximaTerca();
    return {
      agente: 'Clima',
      respostaDireta: `🌤️ *PREVISÃO DO TEMPO DO FUTEBOL* ⚽\n\n${infoClima}`,
      houveAlteracao: true
    };
  }

  // 3.5. RAG de Notícias de Futebol em Tempo Real na Internet (Paraná Clube, Coritiba, Flamengo, etc)
  if (textoClean.includes('notícia') || textoClean.includes('noticia') || textoClean.includes('notícias') || textoClean.includes('noticias') || textoClean.includes('últimas do') || textoClean.includes('ultimas do')) {
    const resNoticias = await newsAgent.processarNoticiasFutebolRAG(textoMensagem, nomeRemetente);
    if (resNoticias.sucesso) {
      return {
        agente: 'Agente de Notícias RAG (Tempo Real)',
        respostaDireta: resNoticias.mensagem,
        houveAlteracao: true
      };
    }
  }

  // 4. Roteamento Direto para Lista de Mensalistas (!mensalistas, lista dos mensalistas, quem são os mensalistas)
  const comandoLimpo = textoClean.replace(/["'?:;:“”‘’]/g, '').trim();
  if (comandoLimpo === '!mensalistas' || comandoLimpo === 'mensalistas' || comandoLimpo === '!listamensalistas' || comandoLimpo === '!lista de mensalistas' || textoClean.includes('lista dos mensalistas') || textoClean.includes('lista de mensalistas') || textoClean.includes('quem sao os mensalistas') || textoClean.includes('quem são os mensalistas') || textoClean.includes('quem e mensalista') || textoClean.includes('quem é mensalista')) {
    const relatorioMensalistas = db.formatarRelatorioMensalistas();
    return {
      agente: 'Concierge Financeiro & Mensalistas',
      respostaDireta: relatorioMensalistas,
      houveAlteracao: true
    };
  }

  // 4.1 Comando para Limpar / Zerar a Lista de Mensalistas (!limparmensalistas)
  if (comandoLimpo === '!limparmensalistas' || comandoLimpo === '!resetarmensalistas' || comandoLimpo === '!limpar mensalistas' || comandoLimpo === '!zerarmensalistas') {
    db.limparMensalistas();
    return {
      agente: 'Concierge Financeiro & Mensalistas',
      respostaDireta: `🗑️ *QUADRO DE MENSALISTAS ZERADO!*\n\nTodos os mensalistas foram removidos do cadastro mensal com sucesso.`,
      houveAlteracao: true
    };
  }

  // 4.2 Comando para Remover Mensalista Específico (!removermensalista Pedro / !avulso Pedro)
  const matchRemoverMensalista = textoClean.match(/^(?:!removermensalista|!avulso)\s+(.+)/i);
  if (matchRemoverMensalista) {
    const nomeAlvo = matchRemoverMensalista[1].trim();
    db.removerMensalista(nomeAlvo);
    return {
      agente: 'Concierge Financeiro & Mensalistas',
      respostaDireta: `❌ *MENSALISTA REMOVIDO!*\n\n*${nomeAlvo}* foi alterado(a) no sistema para a categoria *AVULSO*.`,
      houveAlteracao: true
    };
  }

  // 4.5. Roteamento Direto para Lista de Presença da Partida (!lista, !presenca, etc.)
  if (comandoLimpo === '!lista' || comandoLimpo === 'lista' || comandoLimpo === '!presenca' || comandoLimpo === '!presença' || comandoLimpo === 'presenca' || comandoLimpo === 'presença' || textoClean.includes('manda a lista') || textoClean.includes('como tá a lista') || textoClean.includes('ver a lista')) {
    const climaInfo = await weatherAgent.obterPrevisaoProximaTerca();
    const maxLinha = parseInt(process.env.MAX_JOGADORES_LINHA || '14', 10);
    const mensagemLista = db.formatarMensagemLista(null, maxLinha, climaInfo);
    return {
      agente: 'Concierge Principal',
      respostaDireta: mensagemLista,
      houveAlteracao: true
    };
  }

  // 5. Roteamento para Lista de Agentes (!agentes / !listaagentes / !lista de agentes)
  if (comandoLimpo === '!agentes' || comandoLimpo === 'agentes' || comandoLimpo === '!listaagentes' || comandoLimpo === '!lista de agentes' || comandoLimpo === '!lista dos agentes') {
    const ajuda = `⚽ *Joga10-AI - Sistema Multi-Agentes de Futebol*\n\n` +
      `🤖 *Agentes disponíveis:*\n` +
      `1. *Concierge de Presença:* Diga "Vou", "Tô dentro", "Vou de goleiro", "Coloca o Bruno" ou "Tô fora".\n` +
      `2. *Agente do Tempo (Clima):* Diga "!clima" para ver a previsão da próxima terça às 19:30.\n` +
      `3. *Agente de Goleiros:* Diga "Goleiro contratado Marcos" para confirmar goleiro de app externo.\n` +
      `4. *Agente Financeiro & PIX:*\n` +
      `   • Envie *"acabamos de jogar"* ao fim da partida para disparar cobrança dos avulsos (R$ 27) via PIX.\n` +
      `   • Envie \`!pago [Nome]\` para dar baixa em um pagamento.\n` +
      `   • Envie \`!mensalista [Nome]\` para definir mensalista (R$ 81).\n` +
      `   • Envie \`!pix\` ou \`!pagamentos\` para ver o relatório financeiro.\n` +
      `5. *Engenharia SRE & Dashboard:* Envie \`!sre\` ou \`!metrics\` (Restrito ao Alan).`;
    return {
      agente: 'Orquestrador',
      respostaDireta: ajuda,
      houveAlteracao: true
    };
  }

  // 6. Comando para Definir / Trocar o Nome do Bot (!nome Zurg / !setname Zurg)
  const matchNome = textoClean.match(/^(?:!nome|!setname)\s+(.+)/i);
  if (matchNome) {
    const novoNome = db.setBotName(matchNome[1].trim());
    return {
      agente: 'Orquestrador',
      respostaDireta: `🤖 *NOME DO ASSISTENTE ATUALIZADO!*\n\nAgora me chamo *${novoNome}*! Pode me chamar no grupo por *${novoNome}* para pedir notícias ou organizar a pelada! ⚽🔥`,
      houveAlteracao: true
    };
  }

  // 7. Comando de Engenharia SRE & Dashboard de Métricas (Restrito ao Dono - Alan)
  if (comandoLimpo === '!sre' || comandoLimpo === 'sre' || comandoLimpo === '!metrics' || comandoLimpo === 'metrics' || comandoLimpo === '!dash' || comandoLimpo === 'dash' || comandoLimpo === '!telemetria') {
    const ownerName = process.env.OWNER_NAME || 'Alan';
    const ehDono = nomeRemetente.toLowerCase().includes(ownerName.toLowerCase());

    if (!ehDono) {
      return {
        agente: 'SRE Security Guard',
        respostaDireta: `⛔ *ACESSO NEGADO:* O painel de estatísticas SRE, latência e custos por token é restrito ao Engenheiro SRE / Dono do bot (*${ownerName}*).`,
        houveAlteracao: true
      };
    }

    const { gerarDashboardSRE } = require('../sreTelemetry');
    const dashboard = gerarDashboardSRE(nomeRemetente);
    return {
      agente: 'Engenharia SRE & Telemetria',
      respostaDireta: dashboard,
      houveAlteracao: true
    };
  }

  // 8. Se não for comando específico dos sub-agentes, aciona o Concierge Principal (LangChain IA)
  const resultadoIA = await conciergeAgent.processarMensagemComIA(textoMensagem, nomeRemetente);
  
  let houveAlteracao = false;

  const acoesList = resultadoIA.acoes || [];
  for (const acao of acoesList) {
    const nomeAlvo = acao.nome || nomeRemetente;

    switch (acao.tipo) {
      case 'ADICIONAR_LINHA':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'linha', 
          status: 'confirmado',
          convidadoPor: acao.convidado_por
        });
        houveAlteracao = true;
        break;

      case 'ADICIONAR_GOLEIRO':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'goleiro', 
          status: 'confirmado',
          convidadoPor: acao.convidado_por
        });
        houveAlteracao = true;
        break;

      case 'ADICIONAR_ESPERA':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'linha', 
          status: 'espera',
          convidadoPor: acao.convidado_por
        });
        houveAlteracao = true;
        break;

      case 'REMOVER':
        db.removerPresenca(null, nomeAlvo, acao.motivo);
        houveAlteracao = true;
        break;

      case 'DUVIDA':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'linha', 
          status: 'duvida',
          motivo: acao.motivo
        });
        houveAlteracao = true;
        break;

      case 'DEFINIR_MENSALISTA':
        db.setCategoriaJogador(nomeAlvo, 'mensalista');
        return {
          agente: 'Concierge Principal',
          respostaDireta: `🌟 *CADASTRO ATUALIZADO!*\n\n*${nomeAlvo}* foi cadastrado(a) no sistema como *MENSALISTA* (R$ 81,00/mês).`
        };

      case 'SOLICITAR_LISTA_MENSALISTAS':
        return {
          agente: 'Concierge Financeiro & Mensalistas',
          respostaDireta: db.formatarRelatorioMensalistas(),
          houveAlteracao: true
        };

      case 'SOLICITAR_LISTA':
        houveAlteracao = true;
        break;

      case 'NOVA_PARTIDA':
        db.novaPartida();
        houveAlteracao = true;
        break;

      case 'IGNORAR':
      default:
        break;
    }
  }

  // Se o Concierge Principal realizou alterações, busca a previsão do tempo para enriquecer a lista
  let infoClima = null;
  if (houveAlteracao) {
    infoClima = await weatherAgent.obterPrevisaoProximaTerca();
    return {
      agente: 'Concierge Principal',
      houveAlteracao,
      climaInfo: infoClima,
      respostaBoleira: resultadoIA.resposta_boleira,
      acoesExtraidas: resultadoIA.acoes
    };
  }

  // Se NÃO houve alteração de presenças, mas a IA gerou resposta_boleira (notícia de futebol, saudação pelo nome ou recusa de assunto fora de futebol)
  if (resultadoIA.resposta_boleira) {
    return {
      agente: 'Concierge Futebol (IA)',
      respostaDireta: resultadoIA.resposta_boleira,
      houveAlteracao: true
    };
  }

  return {
    agente: 'Concierge Principal',
    houveAlteracao,
    climaInfo: null,
    acoesExtraidas: resultadoIA.acoes
  };
}

/**
 * Orquestra mensagens recebidas via ÁUDIO (Voz)
 */
async function orquestrarAudio(audioBuffer, mimeType, nomeRemetente) {
  const resultadoIA = await conciergeAgent.processarAudioComIA(audioBuffer, mimeType, nomeRemetente);

  let houveAlteracao = false;

  for (const acao of resultadoIA.acoes) {
    const nomeAlvo = acao.nome || nomeRemetente;

    switch (acao.tipo) {
      case 'ADICIONAR_LINHA':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'linha', 
          status: 'confirmado',
          convidadoPor: acao.convidado_por
        });
        houveAlteracao = true;
        break;

      case 'ADICIONAR_GOLEIRO':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'goleiro', 
          status: 'confirmado',
          convidadoPor: acao.convidado_por
        });
        houveAlteracao = true;
        break;

      case 'ADICIONAR_ESPERA':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'linha', 
          status: 'espera',
          convidadoPor: acao.convidado_por
        });
        houveAlteracao = true;
        break;

      case 'REMOVER':
        db.removerPresenca(null, nomeAlvo, acao.motivo);
        houveAlteracao = true;
        break;

      case 'DUVIDA':
        db.salvarPresenca({ 
          nome: nomeAlvo, 
          pushName: nomeRemetente, 
          tipoJogador: 'linha', 
          status: 'duvida',
          motivo: acao.motivo
        });
        houveAlteracao = true;
        break;

      case 'SOLICITAR_LISTA':
        houveAlteracao = true;
        break;

      case 'NOVA_PARTIDA':
        db.novaPartida();
        houveAlteracao = true;
        break;

      case 'IGNORAR':
      default:
        break;
    }
  }

  let infoClima = null;
  if (houveAlteracao) {
    infoClima = await weatherAgent.obterPrevisaoProximaTerca();
  }

  return {
    agente: 'Concierge Áudio (IA)',
    houveAlteracao,
    climaInfo: infoClima,
    transcricaoAudio: resultadoIA.transcricao_audio,
    respostaBoleira: resultadoIA.resposta_boleira,
    acoesExtraidas: resultadoIA.acoes
  };
}

module.exports = {
  orquestrarMensagem,
  orquestrarAudio
};
