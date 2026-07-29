const db = require('../database');

/**
 * Agente especialista em Gestão de Goleiros Externos (App de Aluguel)
 */
function processarComandoGoleiro(texto, nomeRemetente) {
  const textoClean = texto.trim().toLowerCase();

  // Padrões de comando para confirmação de goleiro externo contratado
  const regexGoleiro = /(?:!goleiro|goleiro contratado|contratei (?:o )?goleiro|confirmar goleiro)\s*(.+)?/i;
  const match = textoClean.match(regexGoleiro);

  if (match) {
    let nomeGoleiro = match[1] ? match[1].trim() : 'Goleiro do App';
    
    // Limpa pontuações finais
    nomeGoleiro = nomeGoleiro.replace(/[.!]/g, '');

    if (!nomeGoleiro || nomeGoleiro.length < 2) {
      nomeGoleiro = `Goleiro (App)`;
    }

    db.registrarGoleiroExterno(null, nomeGoleiro, 'App Goleiro de Aluguel');

    return {
      sucesso: true,
      mensagem: `🧤 *GOLEIRO EXTERNO CONFIRMADO!*\n\n✅ O goleiro *${nomeGoleiro}* foi registrado via App com sucesso e adicionado à lista!`
    };
  }

  return { sucesso: false };
}

module.exports = {
  processarComandoGoleiro
};
