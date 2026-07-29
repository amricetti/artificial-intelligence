require('dotenv').config();
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const { orquestrarMensagem, orquestrarAudio } = require('./agents/orchestrator');
const { obterPrevisaoProximaTerca } = require('./agents/weatherAgent');
const { analisarComprovantePix } = require('./agents/visionAgent');
const { gerarMensagemConvocacao } = require('./agents/calloutAgent');
const db = require('./database');

const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || '';
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || '';
const MAX_JOGADORES_LINHA = parseInt(process.env.MAX_JOGADORES_LINHA || '14', 10);
const BOT_NAME = process.env.BOT_NAME || 'Joga10';

let sock = null;

async function iniciarBotWhatsApp() {
  const authFolder = path.join(__dirname, 'auth_info_baileys');
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n===================================================`);
  console.log(`⚽ JOGA10-AI (Multi-Agentes): Conectando WhatsApp...`);
  console.log(`===================================================\n`);

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Escaneie o QR Code abaixo com seu WhatsApp para conectar:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão fechada. Motivo: ${reason}`);

      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔄 Reconectando em 5 segundos...');
        setTimeout(iniciarBotWhatsApp, 5000);
      } else {
        console.log('❌ Sessão encerrada. Apague a pasta "auth_info_baileys" e execute novamente para escanear o QR Code.');
      }
    } else if (connection === 'open') {
      console.log('✅ Conectado com sucesso ao WhatsApp!');
      console.log(`🎯 Grupo Alvo no .env: ID="${TARGET_GROUP_ID || 'Não definido'}", Nome="${TARGET_GROUP_NAME || 'Não definido'}"`);
      console.log('---------------------------------------------------\n');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      try {
        if (!msg.message) continue;

        const isImage = !!msg.message.imageMessage;
        const isAudio = !!msg.message.audioMessage || !!msg.message.pttMessage;
        const texto = 
          msg.message.conversation || 
          msg.message.extendedTextMessage?.text || 
          msg.message.imageMessage?.caption || '';

        if (!isImage && !isAudio && !texto.trim()) continue;

        // Evita loops com respostas enviadas pela própria conta
        if (msg.key.fromMe && (texto.startsWith('⚽') || texto.startsWith('🆕') || texto.startsWith('💡') || texto.startsWith('🏁') || texto.startsWith('💰') || texto.startsWith('🧤') || texto.startsWith('🌟') || texto.startsWith('🧾') || texto.startsWith('🎙️'))) {
          continue;
        }

        const remoteJid = msg.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');

        if (!isGroup) continue;

        let metadataGrupo = null;
        try {
          metadataGrupo = await sock.groupMetadata(remoteJid);
        } catch (err) {}

        const nomeGrupo = metadataGrupo ? metadataGrupo.subject : 'Grupo WhatsApp';

        // Filtro de Grupo Especificado no .env
        if (TARGET_GROUP_ID && remoteJid !== TARGET_GROUP_ID) continue;
        if (TARGET_GROUP_NAME && (!metadataGrupo || !nomeGrupo.toLowerCase().includes(TARGET_GROUP_NAME.toLowerCase()))) continue;

        const pushName = msg.pushName || msg.key.participant || 'Jogador';
        const msgId = msg.key.id;

        // ------------------------------------------------------------------
        // Processamento de Áudio / Voz (Transcrever e Executar com IA Multimodal)
        // ------------------------------------------------------------------
        if (isAudio) {
          console.log(`\n🎙️ [${nomeGrupo}] ${pushName} enviou um áudio. Transcrevendo e processando com IA...`);
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            const mimeType = msg.message.audioMessage?.mimetype || msg.message.pttMessage?.mimetype || 'audio/ogg';

            const resultadoAudio = await orquestrarAudio(buffer, mimeType, pushName);
            console.log(`🎧 Áudio transcrevido: "${resultadoAudio.transcricaoAudio || 'Sem transcrição'}"`);

            let msgRespostaAudio = '';
            if (resultadoAudio.transcricaoAudio) {
              msgRespostaAudio += `🎙️ *[Áudio de ${pushName}]:* _"${resultadoAudio.transcricaoAudio}"_\n\n`;
            }
            if (resultadoAudio.respostaBoleira) {
              msgRespostaAudio += `${resultadoAudio.respostaBoleira}\n\n`;
            }

            if (resultadoAudio.houveAlteracao) {
              const climaInfo = resultadoAudio.climaInfo || await obterPrevisaoProximaTerca();
              const mensagemLista = db.formatarMensagemLista(null, MAX_JOGADORES_LINHA, climaInfo);
              msgRespostaAudio += mensagemLista;
            }

            if (msgRespostaAudio.trim()) {
              await sock.sendMessage(remoteJid, { text: msgRespostaAudio.trim() }, { quoted: msg });
            }
            continue;
          } catch (errAudio) {
            console.error("❌ Erro ao processar mensagem de áudio:", errAudio.message || errAudio);
          }
        }

        // ------------------------------------------------------------------
        // Processamento de Imagem (Comprovante PIX via Visão Computacional Gemini)
        // ------------------------------------------------------------------
        if (isImage) {
          console.log(`\n🖼️ [${nomeGrupo}] ${pushName} enviou uma imagem. Analisando comprovante PIX...`);
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';

            const resultadoVisao = await analisarComprovantePix(buffer, mimeType);
            console.log(`👁️ Resultado Visão Gemini:`, resultadoVisao);

            if (resultadoVisao.eComprovantePix && resultadoVisao.valor > 0) {
              const valor = resultadoVisao.valor;
              const resto = valor % 27;
              const ehMultiploExato = resto < 1.0 || (27 - resto) < 1.0;

              if (!ehMultiploExato) {
                let msgDiferente = `⚠️ *ATENÇÃO - VALOR DIFERENTE DE R$ 27,00* ⚽\n`;
                msgDiferente += `------------------------------------\n`;
                msgDiferente += `👤 *Enviado por:* ${pushName}\n`;
                msgDiferente += `💵 *Valor do comprovante:* R$ ${valor.toFixed(2)}\n\n`;
                msgDiferente += `Por favor, *@${pushName}*, responda a esta mensagem indicando a quais jogadores este valor se refere para darmos a baixa corretamente no sistema!`;
                
                await sock.sendMessage(remoteJid, { text: msgDiferente }, { quoted: msg });
                continue;
              }

              const baixa = db.darBaixaInteligentePix(null, pushName, valor);

              let msgResposta = `🧾 *COMPROVANTE DE PIX VERIFICADO POR IA!* ⚽\n`;
              msgResposta += `------------------------------------\n`;
              msgResposta += `👤 *Enviado por:* ${pushName}\n`;
              msgResposta += `💵 *Valor identificado:* R$ ${valor.toFixed(2)}\n`;

              if (baixa.jogadoresBaixados.length > 0) {
                msgResposta += `✅ *Baixa realizada para (${baixa.jogadoresBaixados.length} cota/s):*\n`;
                baixa.jogadoresBaixados.forEach(j => {
                  msgResposta += `   • *${j}* (Pago)\n`;
                });
              } else {
                msgResposta += `⚠️ *Aviso:* Valor recebido, mas não havia pendências abertas no nome de ${pushName}.\n`;
              }

              msgResposta += `------------------------------------`;
              await sock.sendMessage(remoteJid, { text: msgResposta }, { quoted: msg });
              continue;
            }
          } catch (errImg) {
            console.error("❌ Erro ao processar imagem de comprovante:", errImg.message || errImg);
          }
        }

        console.log(`\n📩 [${nomeGrupo}] ${pushName}: "${texto}"`);

        // 1. Comandos Rápidos de Teclado
        const textoLower = texto.trim().toLowerCase();
        const comandoLimpo = textoLower.replace(/["'?!.,;:“”‘’]/g, '').trim();

        if (textoLower === '!lista' || textoLower === '!presenca' || textoLower === '!presença' || comandoLimpo === '!lista' || comandoLimpo === 'lista' || comandoLimpo === '!presenca' || comandoLimpo === '!presença') {
          const climaInfo = await obterPrevisaoProximaTerca();
          const mensagemLista = db.formatarMensagemLista(null, MAX_JOGADORES_LINHA, climaInfo);
          await sock.sendMessage(remoteJid, { text: mensagemLista }, { quoted: msg });
          continue;
        }

        if (textoLower === '!agentes' || textoLower === '!listaagentes' || textoLower === '!lista de agentes' || textoLower === '!lista dos agentes' || comandoLimpo === '!agentes') {
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
          await sock.sendMessage(remoteJid, { text: ajuda }, { quoted: msg });
          continue;
        }

        if (comandoLimpo === '!sre' || comandoLimpo === '!metrics' || comandoLimpo === '!dash' || comandoLimpo === '!telemetria') {
          const ownerName = process.env.OWNER_NAME || 'Alan';
          const ehDono = pushName.toLowerCase().includes(ownerName.toLowerCase());

          if (!ehDono) {
            await sock.sendMessage(remoteJid, { 
              text: `⛔ *ACESSO NEGADO:* O painel de estatísticas SRE, latência e custos por token é restrito ao Engenheiro SRE / Dono do bot (*${ownerName}*).` 
            }, { quoted: msg });
            continue;
          }

          const { gerarDashboardSRE } = require('./sreTelemetry');
          const dashboard = gerarDashboardSRE(pushName);
          await sock.sendMessage(remoteJid, { text: dashboard }, { quoted: msg });
          continue;
        }

        if (textoLower === '!convocar' || textoLower === '!lembrete' || textoLower === '!chamar' || textoLower === '!convocacao') {
          const participantes = metadataGrupo ? metadataGrupo.participants : [];
          const convocacao = gerarMensagemConvocacao(participantes);
          
          await sock.sendMessage(remoteJid, { 
            text: convocacao.texto,
            mentions: convocacao.mentions
          }, { quoted: msg });
          continue;
        }

        if (textoLower === '!novapartida' || textoLower === '!limparlista') {
          db.novaPartida();
          await sock.sendMessage(remoteJid, { 
            text: `🆕 *Nova partida iniciada com sucesso!* Lista e presenças zeradas para a próxima terça-feira.` 
          }, { quoted: msg });
          continue;
        }

        if (textoLower === '!ajuda' || textoLower === '!help') {
          const ajuda = `⚽ *Joga10-AI - Sistema Multi-Agentes de Futebol*\n\n` +
            `🤖 *Agentes disponíveis:*\n` +
            `1. *Concierge de Presença:* Diga "Vou", "Tô dentro", "Vou de goleiro", "Coloca o Bruno" ou "Tô fora".\n` +
            `2. *Agente do Tempo (Clima):* Diga "!clima" para ver a previsão da próxima terça às 19:30.\n` +
            `3. *Agente de Goleiros:* Diga "Goleiro contratado Marcos" para confirmar goleiro de app externo.\n` +
            `4. *Agente Financeiro & PIX:*\n` +
            `   • Envie *"acabamos de jogar"* ao fim da partida para disparar cobrança dos avulsos (R$ 27) via PIX.\n` +
            `   • Envie \`!pago [Nome]\` para dar baixa em um pagamento.\n` +
            `   • Envie \`!mensalista [Nome]\` para definir mensalista (R$ 81).\n` +
            `   • Envie \`!pix\` ou \`!pagamentos\` para ver o relatório financeiro.`;
          await sock.sendMessage(remoteJid, { text: ajuda }, { quoted: msg });
          continue;
        }

        // 2. Processamento Multi-Agente
        const resultadoOrquestrador = await orquestrarMensagem(texto, pushName);
        console.log(`🤖 Agente Responsável: [${resultadoOrquestrador.agente}]`);

        // Se o sub-agente gerou uma resposta direta (ex: Financeiro, Goleiro ou Clima), envia
        if (resultadoOrquestrador.respostaDireta) {
          db.registrarMensagemProcessada(msgId, pushName, texto, { agente: resultadoOrquestrador.agente });
          await sock.sendMessage(remoteJid, { text: resultadoOrquestrador.respostaDireta }, { quoted: msg });
          continue;
        }

        // Se o Concierge Principal alterou presenças, envia a lista formatada atualizada (com toque de boleiragem se houver)
        if (resultadoOrquestrador.houveAlteracao) {
          db.registrarMensagemProcessada(msgId, pushName, texto, resultadoOrquestrador.acoesExtraidas);
          const climaInfo = resultadoOrquestrador.climaInfo || await obterPrevisaoProximaTerca();
          let mensagemLista = db.formatarMensagemLista(null, MAX_JOGADORES_LINHA, climaInfo);
          if (resultadoOrquestrador.respostaBoleira) {
            mensagemLista = `${resultadoOrquestrador.respostaBoleira}\n\n${mensagemLista}`;
          }
          await sock.sendMessage(remoteJid, { text: mensagemLista }, { quoted: msg });
        }
      } catch (errLoop) {
        console.error("⚠️ [WhatsApp Error]:", errLoop.message || errLoop);
      }
    }
  });
}

module.exports = {
  iniciarBotWhatsApp
};
