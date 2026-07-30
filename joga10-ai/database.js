const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'futebol.db');
const db = new Database(dbPath);

// Habilita WAL mode para alta performance e concorrência
db.pragma('journal_mode = WAL');

// Inicialização de tabelas expandida para Multi-Agentes
db.exec(`
  CREATE TABLE IF NOT EXISTS partidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT,
    local TEXT DEFAULT 'Quadra Principal',
    status TEXT DEFAULT 'ativa', -- 'ativa', 'encerrada', 'finalizada_jogada'
    criada_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jogadores_cadastro (
    nome TEXT PRIMARY KEY,
    categoria TEXT DEFAULT 'avulso', -- 'mensalista' ou 'avulso'
    chave_pix TEXT,
    cadastrado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS presencas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id INTEGER NOT NULL,
    nome_jogador TEXT NOT NULL,
    push_name TEXT,
    tipo_jogador TEXT DEFAULT 'linha', -- 'linha', 'goleiro', 'goleiro_externo'
    status TEXT DEFAULT 'confirmado', -- 'confirmado', 'espera', 'desistiu', 'duvida'
    convidado_por TEXT,
    motivo TEXT,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(partida_id) REFERENCES partidas(id),
    UNIQUE(partida_id, nome_jogador)
  );

  CREATE TABLE IF NOT EXISTS pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id INTEGER NOT NULL,
    nome_jogador TEXT NOT NULL,
    categoria TEXT DEFAULT 'avulso', -- 'mensalista' ou 'avulso'
    valor REAL NOT NULL,
    status TEXT DEFAULT 'pendente', -- 'pendente', 'pago'
    pago_em DATETIME,
    FOREIGN KEY(partida_id) REFERENCES partidas(id),
    UNIQUE(partida_id, nome_jogador)
  );

  CREATE TABLE IF NOT EXISTS goleiros_externos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id INTEGER NOT NULL,
    nome_goleiro TEXT NOT NULL,
    app_origem TEXT DEFAULT 'App Externo (Goleiro de Aluguel)',
    status TEXT DEFAULT 'contratado', -- 'contratado', 'cancelado'
    valor REAL DEFAULT 30.0,
    contratado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(partida_id) REFERENCES partidas(id)
  );

  CREATE TABLE IF NOT EXISTS mensagens_processadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mensagem_id TEXT UNIQUE,
    remetente TEXT,
    texto TEXT,
    acoes_json TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sre_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    latency_ms INTEGER NOT NULL,
    ttft_ms INTEGER,
    status TEXT NOT NULL,
    error_message TEXT,
    user_name TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

/**
 * Obtém e altera o nome dinâmico do assistente/bot
 */
function getBotName() {
  try {
    const row = db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'BOT_NAME'`).get();
    if (row && row.valor) return row.valor;
  } catch (err) {}
  return process.env.BOT_NAME || 'Joga10';
}

function setBotName(novoNome) {
  const nomeFormatado = novoNome.trim();
  db.prepare(`
    INSERT INTO configuracoes (chave, valor)
    VALUES ('BOT_NAME', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(nomeFormatado);
  process.env.BOT_NAME = nomeFormatado;
  return nomeFormatado;
}

/**
 * Obtém o ID da partida ativa atual ou cria uma nova.
 */
function getPartidaAtivaId() {
  const row = db.prepare(`SELECT id FROM partidas WHERE status = 'ativa' ORDER BY id DESC LIMIT 1`).get();
  if (row) return row.id;

  const info = db.prepare(`INSERT INTO partidas (data) VALUES (date('now'))`).run();
  return info.lastInsertRowid;
}

/**
 * Define ou obtém categoria do jogador ('mensalista' ou 'avulso').
 */
function setCategoriaJogador(nome, categoria = 'avulso') {
  const nomeFormatado = nome.trim();
  const cat = categoria.toLowerCase() === 'mensalista' ? 'mensalista' : 'avulso';
  
  db.prepare(`
    INSERT INTO jogadores_cadastro (nome, categoria)
    VALUES (?, ?)
    ON CONFLICT(nome) DO UPDATE SET categoria = excluded.categoria
  `).run(nomeFormatado, cat);
}

function getCategoriaJogador(nome) {
  const row = db.prepare(`SELECT categoria FROM jogadores_cadastro WHERE LOWER(nome) = LOWER(?)`).get(nome.trim());
  return row ? row.categoria : 'avulso';
}

function obterListaMensalistas() {
  return db.prepare(`SELECT * FROM jogadores_cadastro WHERE categoria = 'mensalista' ORDER BY nome ASC`).all();
}

function limparMensalistas() {
  db.prepare(`UPDATE jogadores_cadastro SET categoria = 'avulso' WHERE categoria = 'mensalista'`).run();
}

function removerMensalista(nome) {
  const nomeFormatado = nome.trim();
  db.prepare(`UPDATE jogadores_cadastro SET categoria = 'avulso' WHERE LOWER(nome) = LOWER(?)`).run(nomeFormatado);
}

function formatarRelatorioMensalistas(mesReferencia) {
  const mensalistas = obterListaMensalistas();
  const valorMensal = parseFloat(process.env.VALOR_MENSAL || '81.0');

  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const hoje = new Date();
  const mesAtualNome = mesReferencia || `${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`;

  let msg = `🌟 *JOGA10 - QUADRO OFICIAL DE MENSALISTAS* 🌟\n`;
  msg += `------------------------------------\n`;
  msg += `📅 *Mês de Referência:* ${mesAtualNome}\n`;
  msg += `💰 *Cota Mensal:* R$ ${valorMensal.toFixed(2)}/mês\n\n`;

  if (mensalistas.length === 0) {
    msg += `⚠️ *Nenhum mensalista cadastrado no sistema ainda.*\n\n`;
    msg += `💡 *Para cadastrar um mensalista, envie:* \`!mensalista [Nome]\` (ex: \`!mensalista Alan\`)\n`;
  } else {
    msg += `👑 *Mensalistas Cadastrados (Total: ${mensalistas.length}):*\n`;
    mensalistas.forEach((m, idx) => {
      msg += `  ${idx + 1}. 🌟 *${m.nome}* _[Mensalista Ativo]_\n`;
    });
    msg += `\n------------------------------------\n`;
    msg += `💡 _Para cadastrar novos mensalistas, envie "!mensalista [Nome]" ou solicite ao assistente._`;
  }

  return msg;
}

/**
 * Registra ou atualiza o status de presença de um jogador.
 */
function salvarPresenca({ partidaId, nome, pushName, tipoJogador = 'linha', status = 'confirmado', convidadoPor = null, motivo = null }) {
  const pId = partidaId || getPartidaAtivaId();
  const nomeFormatado = nome.trim();

  // Garante que o jogador está cadastrado
  if (!getCategoriaJogador(nomeFormatado)) {
    setCategoriaJogador(nomeFormatado, 'avulso');
  }

  // Limite rígido de no máximo 12 jogadores de linha (10 titulares + 2 reservas)
  if (tipoJogador === 'linha' && status === 'confirmado') {
    const confirmadosAtuais = db.prepare(`
      SELECT COUNT(*) as total FROM presencas 
      WHERE partida_id = ? AND tipo_jogador = 'linha' AND status = 'confirmado' AND LOWER(nome_jogador) != LOWER(?)
    `).get(pId, nomeFormatado);

    if (confirmadosAtuais && confirmadosAtuais.total >= 12) {
      status = 'lotado'; // Excedeu os 12 de linha (10 titulares + 2 reservas)
    }
  }

  const stmt = db.prepare(`
    INSERT INTO presencas (partida_id, nome_jogador, push_name, tipo_jogador, status, convidado_por, motivo, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(partida_id, nome_jogador) DO UPDATE SET
      tipo_jogador = excluded.tipo_jogador,
      status = excluded.status,
      convidado_por = COALESCE(excluded.convidado_por, presencas.convidado_por),
      motivo = COALESCE(excluded.motivo, presencas.motivo),
      atualizado_em = CURRENT_TIMESTAMP
  `);

  stmt.run(pId, nomeFormatado, pushName, tipoJogador, status, convidadoPor, motivo);
}

/**
 * Marca jogador como desistente.
 */
function removerPresenca(partidaId, nome, motivo = null) {
  const pId = partidaId || getPartidaAtivaId();
  const nomeFormatado = nome.trim();

  const stmt = db.prepare(`
    UPDATE presencas 
    SET status = 'desistiu', motivo = ?, atualizado_em = CURRENT_TIMESTAMP
    WHERE partida_id = ? AND LOWER(nome_jogador) = LOWER(?)
  `);

  const res = stmt.run(motivo, pId, nomeFormatado);
  
  if (res.changes === 0) {
    salvarPresenca({ partidaId: pId, nome: nomeFormatado, status: 'desistiu', motivo });
  }
}

/**
 * Registra contratação de goleiro externo (App Goleiro de Aluguel).
 */
function registrarGoleiroExterno(partidaId, nomeGoleiro, appOrigem = 'App Externo') {
  const pId = partidaId || getPartidaAtivaId();
  const nomeFormatado = nomeGoleiro.trim();

  db.prepare(`
    INSERT INTO goleiros_externos (partida_id, nome_goleiro, app_origem, status)
    VALUES (?, ?, ?, 'contratado')
  `).run(pId, nomeFormatado, appOrigem);

  // Também registra na lista de presença como goleiro_externo
  salvarPresenca({
    partidaId: pId,
    nome: `${nomeFormatado} 📱(App)`,
    tipoJogador: 'goleiro_externo',
    status: 'confirmado'
  });
}

function obterGoleirosExternos(partidaId) {
  const pId = partidaId || getPartidaAtivaId();
  return db.prepare(`SELECT * FROM goleiros_externos WHERE partida_id = ? AND status = 'contratado'`).all(pId);
}

/**
 * Processamento Financeiro pós-jogo.
 */
function gerarCobrancasPosJogo(partidaId, faltantesNomes = [], valorAvulso = 27.0, valorMensal = 81.0) {
  const pId = partidaId || getPartidaAtivaId();

  // Obtém presenças confirmadas da partida
  const presencas = db.prepare(`
    SELECT nome_jogador, tipo_jogador 
    FROM presencas 
    WHERE partida_id = ? AND status = 'confirmado'
  `).all(pId);

  const faltantesLower = faltantesNomes.map(n => n.toLowerCase().trim());
  const cobrancas = [];

  for (const p of presencas) {
    const nome = p.nome_jogador;
    // Ignora goleiros externos pagos
    if (p.tipo_jogador === 'goleiro_externo') continue;

    const faltou = faltantesLower.some(f => nome.toLowerCase().includes(f));
    if (faltou) continue; // Não cobra quem faltou no jogo

    const categoria = getCategoriaJogador(nome);
    const valor = categoria === 'mensalista' ? valorMensal : valorAvulso;

    db.prepare(`
      INSERT INTO pagamentos (partida_id, nome_jogador, categoria, valor, status)
      VALUES (?, ?, ?, ?, 'pendente')
      ON CONFLICT(partida_id, nome_jogador) DO UPDATE SET
        categoria = excluded.categoria,
        valor = excluded.valor
    `).run(pId, nome, categoria, valor);

    cobrancas.push({
      nome,
      categoria,
      valor,
      status: 'pendente'
    });
  }

  return cobrancas;
}

function marcarPagamentoPago(partidaId, nomeJogador) {
  const pId = partidaId || getPartidaAtivaId();
  const stmt = db.prepare(`
    UPDATE pagamentos
    SET status = 'pago', pago_em = CURRENT_TIMESTAMP
    WHERE partida_id = ? AND LOWER(nome_jogador) LIKE LOWER(?)
  `);
  return stmt.run(pId, `%${nomeJogador.trim()}%`);
}

/**
 * Realiza baixa inteligente no PIX calculando a quantidade de cotas pagas (R$ 27 / R$ 54 / R$ 81).
 */
function darBaixaInteligentePix(partidaId, nomeRemetente, valorPago, valorAvulso = 27.0) {
  const pId = partidaId || getPartidaAtivaId();
  const remetenteClean = nomeRemetente.trim();

  const jogadoresBaixados = [];
  let valorRestante = valorPago;

  // 1. Busca primeiro o pagamento pendente do próprio remetente (ex: Clayton)
  const pendenteProprio = db.prepare(`
    SELECT * FROM pagamentos 
    WHERE partida_id = ? AND status = 'pendente' AND LOWER(nome_jogador) LIKE LOWER(?)
    LIMIT 1
  `).get(pId, `%${remetenteClean}%`);

  if (pendenteProprio) {
    db.prepare(`UPDATE pagamentos SET status = 'pago', pago_em = CURRENT_TIMESTAMP WHERE id = ?`).run(pendenteProprio.id);
    jogadoresBaixados.push(pendenteProprio.nome_jogador);
    valorRestante -= pendenteProprio.valor;
  }

  // 2. Se sobrou valor (ex: enviou R$ 54 e sobrou R$ 27), busca convidados levados pelo remetente ou dependentes
  if (valorRestante >= (valorAvulso - 1)) {
    // Busca convidados de Clayton na tabela de presenças
    const convidados = db.prepare(`
      SELECT presencas.nome_jogador 
      FROM presencas
      JOIN pagamentos ON pagamentos.nome_jogador = presencas.nome_jogador AND pagamentos.partida_id = presencas.partida_id
      WHERE presencas.partida_id = ? 
        AND pagamentos.status = 'pendente' 
        AND (LOWER(presencas.convidado_por) LIKE LOWER(?) OR LOWER(presencas.nome_jogador) LIKE LOWER(?))
    `).all(pId, `%${remetenteClean}%`, `%pai%`);

    for (const c of convidados) {
      if (valorRestante < (valorAvulso - 1)) break;
      db.prepare(`
        UPDATE pagamentos SET status = 'pago', pago_em = CURRENT_TIMESTAMP 
        WHERE partida_id = ? AND nome_jogador = ?
      `).run(pId, c.nome_jogador);

      jogadoresBaixados.push(c.nome_jogador);
      valorRestante -= valorAvulso;
    }
  }

  // 3. Se ainda houver valor excedente e houver outros avulsos pendentes, dá baixa no próximo pendente
  if (valorRestante >= (valorAvulso - 1)) {
    const proximosPendentes = db.prepare(`
      SELECT * FROM pagamentos 
      WHERE partida_id = ? AND status = 'pendente'
      LIMIT 2
    `).all(pId);

    for (const p of proximosPendentes) {
      if (valorRestante < (valorAvulso - 1)) break;
      if (!jogadoresBaixados.includes(p.nome_jogador)) {
        db.prepare(`UPDATE pagamentos SET status = 'pago', pago_em = CURRENT_TIMESTAMP WHERE id = ?`).run(p.id);
        jogadoresBaixados.push(p.nome_jogador);
        valorRestante -= valorAvulso;
      }
    }
  }

  return {
    jogadoresBaixados,
    valorSobrando: valorRestante
  };
}

function obterRelatorioPagamentos(partidaId) {
  const pId = partidaId || getPartidaAtivaId();
  return db.prepare(`SELECT * FROM pagamentos WHERE partida_id = ?`).all(pId);
}

/**
 * Obtém todas as presenças da partida ativa.
 */
function obterPresencasPartida(partidaId) {
  const pId = partidaId || getPartidaAtivaId();
  const rows = db.prepare(`
    SELECT nome_jogador, push_name, tipo_jogador, status, convidado_por, motivo, atualizado_em
    FROM presencas
    WHERE partida_id = ?
    ORDER BY id ASC
  `).all(pId);

  const confirmadosLinha = [];
  const confirmadosGoleiro = [];
  const goleirosExternos = [];
  const listaEspera = [];
  const duvidas = [];
  const desistencias = [];

  for (const row of rows) {
    if (row.status === 'confirmado') {
      if (row.tipo_jogador === 'goleiro_externo') {
        goleirosExternos.push(row);
      } else if (row.tipo_jogador === 'goleiro') {
        confirmadosGoleiro.push(row);
      } else {
        confirmadosLinha.push(row);
      }
    } else if (row.status === 'espera') {
      listaEspera.push(row);
    } else if (row.status === 'duvida') {
      duvidas.push(row);
    } else if (row.status === 'desistiu') {
      desistencias.push(row);
    }
  }

  return {
    partidaId: pId,
    confirmadosLinha,
    confirmadosGoleiro,
    goleirosExternos,
    listaEspera,
    duvidas,
    desistencias,
    totalConfirmados: confirmadosLinha.length + confirmadosGoleiro.length + goleirosExternos.length
  };
}

/**
 * Gera mensagem formatada da lista no layout oficial (Time 1, Time 2, Máx 2 Reservas e Fora)
 */
function formatarMensagemLista(partidaId, limiteLinha = 10, climaInfo = null) {
  const weatherAgent = require('./agents/weatherAgent');
  const dados = obterPresencasPartida(partidaId);
  const dataExtenso = weatherAgent.getProximaTercaFormatada();

  let msg = `⚽ *JOGA10-AI - LISTA DE PRESENÇA* ⚽\n\n`;
  msg += `📅 *Data:* ${dataExtenso}\n`;
  msg += `🕢 *Horário:* 19:30hrs\n`;
  msg += `📍 *Endereço:* Av. Sen. Salgado Filho, 1690 - Guabirotuba, Curitiba - PR, 81510-000\n`;
  if (climaInfo) {
    msg += `🌤️ *Clima:* ${climaInfo}\n`;
  }
  msg += `\n`;

  // Goleiros disponíveis
  const todosGoleiros = [...dados.confirmadosGoleiro, ...dados.goleirosExternos];
  const gol1 = todosGoleiros[0] ? `${todosGoleiros[0].nome_jogador}${todosGoleiros[0].tipo_jogador === 'goleiro_externo' ? ' ✅(App)' : ''}` : '';
  const gol2 = todosGoleiros[1] ? `${todosGoleiros[1].nome_jogador}${todosGoleiros[1].tipo_jogador === 'goleiro_externo' ? ' ✅(App)' : ''}` : '';

  // Jogadores de Linha (Time 1: 0..4, Time 2: 5..9)
  const linha1 = dados.confirmadosLinha.slice(0, 5);
  const linha2 = dados.confirmadosLinha.slice(5, 10);
  
  // Reservas (Máximo 2)
  const reservas = dados.confirmadosLinha.slice(10, 12);

  // 🔴 TIME 1
  msg += `🟥 *Time 1 – Goleiro + Jogadores*\n`;
  msg += `G - 🧤 ${gol1}\n`;
  for (let i = 0; i < 5; i++) {
    const p = linha1[i];
    if (p) {
      const conv = p.convidado_por ? ` (convidado de ${p.convidado_por})` : '';
      msg += `${i + 1}. ${p.nome_jogador}${conv}\n`;
    } else {
      msg += `${i + 1}.\n`;
    }
  }
  msg += `\n`;

  // 🔵 TIME 2
  msg += `🟦 *Time 2 – Goleiro + Jogadores*\n`;
  msg += `G - 🧤 ${gol2}\n`;
  for (let i = 0; i < 5; i++) {
    const p = linha2[i];
    if (p) {
      const conv = p.convidado_por ? ` (convidado de ${p.convidado_por})` : '';
      msg += `${i + 1}. ${p.nome_jogador}${conv}\n`;
    } else {
      msg += `${i + 1}.\n`;
    }
  }
  msg += `\n`;

  // 🔁 RESERVAS (Máximo 2)
  msg += `🔁 *Reservas:*\n`;
  for (let i = 0; i < 2; i++) {
    const r = reservas[i];
    if (r) {
      msg += `${i + 1} - ${r.nome_jogador}\n`;
    } else {
      msg += `${i + 1} - \n`;
    }
  }
  msg += `\n`;

  // ❌ FORA
  msg += `❌ *Fora:*\n`;
  if (dados.desistencias.length === 0) {
    msg += `_(Ninguém fora por enquanto)_\n`;
  } else {
    dados.desistencias.forEach((p, idx) => {
      const mot = p.motivo ? ` 🚑 (${p.motivo})` : '';
      msg += `${idx + 1} - ${p.nome_jogador}${mot}\n`;
    });
  }

  return msg;
}

/**
 * Encerra a partida atual e inicia uma nova zerando todas as presenças.
 */
function novaPartida() {
  const pId = getPartidaAtivaId();
  db.prepare(`UPDATE partidas SET status = 'encerrada' WHERE id = ?`).run(pId);
  db.prepare(`DELETE FROM presencas WHERE partida_id = ?`).run(pId);
  db.prepare(`DELETE FROM goleiros_externos WHERE partida_id = ?`).run(pId);
  
  const novoId = getPartidaAtivaId();
  db.prepare(`DELETE FROM presencas WHERE partida_id = ?`).run(novoId);
  db.prepare(`DELETE FROM goleiros_externos WHERE partida_id = ?`).run(novoId);
  return novoId;
}

/**
 * Limpa completamente a lista de presença da partida ativa.
 */
function limparPresencasPartida(partidaId) {
  const pId = partidaId || getPartidaAtivaId();
  db.prepare(`DELETE FROM presencas WHERE partida_id = ?`).run(pId);
  db.prepare(`DELETE FROM goleiros_externos WHERE partida_id = ?`).run(pId);
}

/**
 * Registra histórico de mensagens processadas.
 */
function registrarMensagemProcessada(mensagemId, remetente, texto, acoes) {
  if (!mensagemId) return;
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO mensagens_processadas (mensagem_id, remetente, texto, acoes_json)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(mensagemId, remetente, texto, JSON.stringify(acoes));
  } catch (err) {
    console.error('Erro ao registrar histórico:', err.message);
  }
}

module.exports = {
  db,
  getPartidaAtivaId,
  setCategoriaJogador,
  getCategoriaJogador,
  obterListaMensalistas,
  salvarPresenca,
  removerPresenca,
  registrarGoleiroExterno,
  obterGoleirosExternos,
  gerarCobrancasPosJogo,
  marcarPagamentoPago,
  darBaixaInteligentePix,
  obterRelatorioPagamentos,
  obterPresencasPartida,
  formatarMensagemLista,
  novaPartida,
  limparPresencasPartida,
  registrarMensagemProcessada,
  getBotName,
  setBotName,
  formatarRelatorioMensalistas,
  limparMensalistas,
  removerMensalista
};
