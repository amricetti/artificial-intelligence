const db = require('../database');
const weatherAgent = require('./weatherAgent');

/**
 * Agente de Convocação e Lembrete Amigável (Joga10-AI)
 */
function gerarMensagemConvocacao(participants = [], partidaId = null) {
  const dados = db.obterPresencasPartida(partidaId);
  const dataExtenso = weatherAgent.getProximaTercaFormatada();

  // Coleta nomes e números de quem JÁ se manifestou na partida
  const manifestados = new Set();

  [
    ...dados.confirmadosLinha,
    ...dados.confirmadosGoleiro,
    ...dados.goleirosExternos,
    ...dados.listaEspera,
    ...dados.duvidas,
    ...dados.desistencias
  ].forEach(p => {
    if (p.push_name) manifestados.add(p.push_name.toLowerCase());
    if (p.nome_jogador) manifestados.add(p.nome_jogador.toLowerCase());
  });

  const ausentesJids = [];
  const ausentesTags = [];

  for (const part of participants) {
    const jid = part.id;
    const numLimpo = jid.split('@')[0];

    // Verifica se a pessoa já respondeu
    const jaRespondeu = Array.from(manifestados).some(nome => 
      nome.includes(numLimpo)
    );

    if (!jaRespondeu) {
      ausentesJids.push(jid);
      ausentesTags.push(`@${numLimpo}`);
    }
  }

  let msg = `⚽ *JOGA10-AI: HORA DA CONVOCAÇÃO!* 📣\n\n`;
  msg += `Fala atletas! A nossa peleja de *${dataExtenso} às 19:30hrs* está sendo organizada! 🏃‍♂️💨\n\n`;

  if (ausentesTags.length === 0) {
    msg += `🎉 *Sensacional! Todo mundo do grupo já respondeu a chamada!*\n\n`;
  } else {
    msg += `👀 *Ainda não responderam a chamada (${ausentesTags.length}):*\n`;
    msg += `${ausentesTags.join('  ')}\n\n`;
    msg += `Bora confirmar a presença ou avisar se não vai para fecharmos os times! 🔥\n`;
  }

  msg += `------------------------------------\n`;
  msg += `💡 _Responda com "Vou", "Vou de goleiro" ou "Tô fora"._`;

  return {
    texto: msg,
    mentions: ausentesJids
  };
}

module.exports = {
  gerarMensagemConvocacao
};
