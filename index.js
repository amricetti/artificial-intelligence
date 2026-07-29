require('dotenv').config();
const express = require('express');
const { processarMensagemComIA } = require('./agent');
const db = require('./database');
const { iniciarBotWhatsApp } = require('./whatsapp');

const app = express();
app.use(express.json());

// Rota de Teste e Status
app.get('/', (req, res) => {
  res.json({
    status: "online",
    sistema: "Joga10-AI - Agente de Futebol WhatsApp",
    partidaAtiva: db.getPartidaAtivaId()
  });
});

// Rota HTTP Webhook Opcional (para testes via Postman/cURL)
app.post('/webhook', async (req, res) => {
  const payload = req.body;

  if (!payload) {
    return res.status(400).json({ status: "error", message: "Payload vazio" });
  }

  const data = payload.data || payload;
  const textoMensagem = 
    data.message?.conversation || 
    data.message?.extendedTextMessage?.text ||
    data.texto;

  const nomeRemetente = data.pushName || data.remetente || "Jogador Desconhecido";

  if (!textoMensagem) {
    return res.status(200).json({ status: "ignored", reason: "Mensagem sem texto" });
  }

  console.log(`\n📩 [Webhook HTTP] ${nomeRemetente}: "${textoMensagem}"`);

  try {
    const resultado = await processarMensagemComIA(textoMensagem, nomeRemetente);

    for (const acao of resultado.acoes) {
      const nomeAlvo = acao.nome || nomeRemetente;

      if (acao.tipo === 'ADICIONAR_LINHA') {
        db.salvarPresenca({ nome: nomeAlvo, pushName: nomeRemetente, tipoJogador: 'linha', status: 'confirmado', convidadoPor: acao.convidado_por });
      } else if (acao.tipo === 'ADICIONAR_GOLEIRO') {
        db.salvarPresenca({ nome: nomeAlvo, pushName: nomeRemetente, tipoJogador: 'goleiro', status: 'confirmado', convidadoPor: acao.convidado_por });
      } else if (acao.tipo === 'REMOVER') {
        db.removerPresenca(null, nomeAlvo, acao.motivo);
      } else if (acao.tipo === 'DUVIDA') {
        db.salvarPresenca({ nome: nomeAlvo, pushName: nomeRemetente, tipoJogador: 'linha', status: 'duvida', motivo: acao.motivo });
      } else if (acao.tipo === 'NOVA_PARTIDA') {
        db.novaPartida();
      }
    }

    const mensagemFormatada = db.formatarMensagemLista();
    return res.status(200).json({ 
      status: "success", 
      data: resultado,
      listaFormatada: mensagemFormatada 
    });
  } catch (error) {
    console.error(`❌ Erro no processamento:`, error.message || error);
    return res.status(500).json({ status: "error", message: error.message || String(error) });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Express rodando na porta ${PORT}`);
  // Inicia o Bot do WhatsApp via Baileys
  iniciarBotWhatsApp();
});

