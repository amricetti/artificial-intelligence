const db = require('../database');

const VALOR_AVULSO = parseFloat(process.env.VALOR_AVULSO || '27.0');
const VALOR_MENSAL = parseFloat(process.env.VALOR_MENSAL || '81.0');
const CHAVE_PIX = process.env.CHAVE_PIX || 'pix@joga10.ai (Banco Joga10 AI / Cel: 11 99999-8888)';

/**
 * Agente especialista em Controle Financeiro, Mensalidades e Cobrança via PIX
 */
function processarFinanceiro(texto, nomeRemetente) {
  const textoClean = texto.trim().toLowerCase();

  // 1. Comando de Fim de Jogo ("acabamos de jogar e todos vieram" / "faltou o X")
  if (textoClean.includes('acabamos de jogar') || textoClean.includes('fim de jogo') || textoClean.includes('jogo acabou')) {
    let faltantes = [];

    // Extrai nomes de faltantes se mencionado "faltou o Bruno e o Pedro"
    if (textoClean.includes('faltou') || textoClean.includes('falto')) {
      const parteFalta = textoClean.split(/faltou|falto/i)[1] || '';
      faltantes = parteFalta
        .replace(/e/g, ',')
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 1);
    }

    const cobrancas = db.gerarCobrancasPosJogo(null, faltantes, VALOR_AVULSO, VALOR_MENSAL);
    const avulsosParaPagar = cobrancas.filter(c => c.categoria === 'avulso');

    let msg = `🏁 *FIM DE JOGO! COBRANÇA DE PRESENÇAS* ⚽\n`;
    msg += `------------------------------------\n\n`;

    if (avulsosParaPagar.length === 0) {
      msg += `🎉 *Todos os participantes eram mensalistas ou não há avulsos pendentes!*\n\n`;
    } else {
      msg += `💰 *CHAVE PIX PARA JOGADORES AVULSOS (R$ ${VALOR_AVULSO.toFixed(2)})*\n`;
      msg += `🔑 *Chave PIX:* \`${CHAVE_PIX}\`\n\n`;
      msg += `📋 *Avulsos a pagar:*\n`;

      avulsosParaPagar.forEach((item, idx) => {
        msg += `   ${idx + 1}. *${item.nome}*: R$ ${VALOR_AVULSO.toFixed(2)} ⏳ _[Pendente]_\n`;
      });
      msg += `\n`;
    }

    msg += `🌟 *Mensalistas (R$ ${VALOR_MENSAL.toFixed(2)}/mês):* Mensalidade controlada separadamente.\n`;
    msg += `------------------------------------\n`;
    msg += `💡 _Envie "!pago [Nome]" para confirmar o recebimento do PIX._`;

    return { sucesso: true, mensagem: msg };
  }

  // 2. Comando para marcar pagamento efetuado ("!pago Bruno" / "paguei Bruno")
  const regexPago = /(?:!pago|paguei)\s+(.+)/i;
  const matchPago = textoClean.match(regexPago);
  if (matchPago) {
    const nomeJogador = matchPago[1].trim();
    db.marcarPagamentoPago(null, nomeJogador);
    return {
      sucesso: true,
      mensagem: `✅ *PAGAMENTO CONFIRMADO!*\n\nO pagamento de *${nomeJogador}* foi registrado no sistema como PAGO.`
    };
  }

  // 3. Comando para definir jogador como Mensalista ("!mensalista Bruno")
  const regexMensalista = /!mensalista\s+(.+)/i;
  const matchMensalista = textoClean.match(regexMensalista);
  if (matchMensalista) {
    const nomeJogador = matchMensalista[1].trim();
    db.setCategoriaJogador(nomeJogador, 'mensalista');
    return {
      sucesso: true,
      mensagem: `🌟 *CADASTRO ATUALIZADO!*\n\n*${nomeJogador}* agora é um jogador *MENSALISTA* (R$ ${VALOR_MENSAL.toFixed(2)}/mês).`
    };
  }

  // 4. Comando para definir jogador como Avulso ("!avulso Bruno")
  const regexAvulso = /!avulso\s+(.+)/i;
  const matchAvulso = textoClean.match(regexAvulso);
  if (matchAvulso) {
    const nomeJogador = matchAvulso[1].trim();
    db.setCategoriaJogador(nomeJogador, 'avulso');
    return {
      sucesso: true,
      mensagem: `⚽ *CADASTRO ATUALIZADO!*\n\n*${nomeJogador}* agora é um jogador *AVULSO* (R$ ${VALOR_AVULSO.toFixed(2)} por jogo).`
    };
  }

  // 5. Comando para listar todos os mensalistas cadastrados ("!mensalistas")
  if (textoClean === '!mensalistas' || textoClean === '!listamensalistas') {
    const lista = db.obterListaMensalistas();
    let msg = `🌟 *LISTA DE JOGADORES MENSALISTAS* ⚽\n`;
    msg += `------------------------------------\n\n`;

    if (lista.length === 0) {
      msg += `_(Nenhum mensalista cadastrado no momento. Use "!mensalista [Nome]" para cadastrar)_\n\n`;
    } else {
      lista.forEach((item, idx) => {
        msg += `${idx + 1}. *${item.nome}* - R$ ${VALOR_MENSAL.toFixed(2)}/mês\n`;
      });
      msg += `\nTotal: ${lista.length} mensalista(s)\n`;
    }

    msg += `------------------------------------`;
    return { sucesso: true, mensagem: msg };
  }

  // 6. Comando para consultar relatório de pagamentos ("!pix" / "!pagamentos")
  if (textoClean === '!pix' || textoClean === '!pagamentos' || textoClean === '!cobranca') {
    const relatorio = db.obterRelatorioPagamentos();

    let msg = `💰 *RELATÓRIO FINANCEIRO DA PARTIDA* ⚽\n`;
    msg += `🔑 *Chave PIX:* \`${CHAVE_PIX}\`\n`;
    msg += `------------------------------------\n\n`;

    if (relatorio.length === 0) {
      msg += `_(Nenhum jogo finalizado ainda nesta rodada. Ao fim do jogo envie: "acabamos de jogar")_\n\n`;
    } else {
      relatorio.forEach(item => {
        const statusIcon = item.status === 'pago' ? '✅ [PAGO]' : '⏳ [PENDENTE]';
        msg += `• *${item.nome_jogador}* (${item.categoria.toUpperCase()}): R$ ${item.valor.toFixed(2)} - ${statusIcon}\n`;
      });
      msg += `\n`;
    }

    msg += `------------------------------------\n`;
    msg += `💡 _Utilize "!pago [Nome]" para dar baixa no PIX._`;
    return { sucesso: true, mensagem: msg };
  }

  return { sucesso: false };
}

module.exports = {
  processarFinanceiro
};
