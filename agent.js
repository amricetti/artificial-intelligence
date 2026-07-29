require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({});

const BOT_NAME = process.env.BOT_NAME || 'Joga10';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    resposta_boleira: {
      type: Type.STRING,
      nullable: true,
      description: "Frase curta e divertida no estilo boleiragem/resenha de futebol para responder ao remetente (ex: 'Fala meu camisa 10! Nome adicionado no tático!')"
    },
    transcricao_audio: {
      type: Type.STRING,
      nullable: true,
      description: "Transcrição fiel do áudio se a mensagem for um áudio/voz"
    },
    acoes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tipo: {
            type: Type.STRING,
            description: "Ação identificada: ADICIONAR_LINHA, ADICIONAR_GOLEIRO, ADICIONAR_ESPERA, REMOVER, DUVIDA, SOLICITAR_LISTA, DEFINIR_MENSALISTA, NOVA_PARTIDA, IGNORAR"
          },
          nome: {
            type: Type.STRING,
            description: "Nome do jogador citado ou do próprio remetente"
          },
          tipo_jogador: {
            type: Type.STRING,
            description: "'linha' ou 'goleiro'"
          },
          convidado_por: {
            type: Type.STRING,
            nullable: true,
            description: "Nome do remetente se ele estiver adicionando um terceiro/convidado"
          },
          motivo: {
            type: Type.STRING,
            nullable: true,
            description: "Motivo de desistência/dúvida/ausência citado"
          }
        },
        required: ["tipo", "nome"]
      }
    }
  },
  required: ["acoes"]
};

/**
 * Extração de intenções via regras/regex caso a API do Gemini esteja fora do ar ou com Cota Excedida (429)
 */
function extrairAcoesPorRegras(textoMensagem, nomeRemetente) {
  const t = textoMensagem.trim().toLowerCase();
  const botNameLower = (process.env.BOT_NAME || 'joga10').toLowerCase();

  // Verifica se citou o nome do bot
  const citouBot = t.includes(botNameLower) || t.includes('bot') || t.includes('professor');
  let respostaBoleira = null;

  if (citouBot) {
    respostaBoleira = `Fala, meu camisa 10 *${nomeRemetente}*! Fala com o *${BOT_NAME}* que o passe é de primeira! ⚽🔥`;
  }

  // Saudações Reativas no Estilo Boleiragem
  if (t.includes('bom dia') || t.includes('bom-dia')) {
    return {
      resposta_boleira: `Bom dia, meu camisa 10 *${nomeRemetente}*! Sol nasceu na grande área, dia de aquecer as canelas e preparar o físico pra pelada! ☕⚽🔥`,
      acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }]
    };
  }

  if (t.includes('boa tarde') || t.includes('boa-tarde')) {
    return {
      resposta_boleira: `Boa tarde, boleirada! Meio de campo dominado por *${nomeRemetente}*, sol estalando no gramado! Quem já tá com a chuteira no porta-malas? ☀️⚽🔥`,
      acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }]
    };
  }

  if (t.includes('boa noite') || t.includes('boa-noite')) {
    return {
      resposta_boleira: `Boa noite, rapaziada! Apita o juiz com *${nomeRemetente}* na área, hora do descanso do guerreiro! Amanhã o treino tático continua! 🌙⚽🔥`,
      acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }]
    };
  }

  if (t.includes('salve') || t.includes('fala rapaziada') || t.includes('fala boleirada') || t.includes('fala grupo')) {
    return {
      resposta_boleira: `Salve salve, meu craque *${nomeRemetente}*! Presença de espírito de campeão no grupo! Toca a bola que o jogo tá valendo! ⚽🔥`,
      acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }]
    };
  }

  if (t.includes('!lista') || t.includes('!presenca') || t.includes('!presença') || t === 'lista' || t.includes('manda a lista') || t.includes('como ta a lista') || t.includes('como tá a lista') || t.includes('ver a lista')) {
    return { 
      resposta_boleira: respostaBoleira || `Guia do jogo na mão, *${nomeRemetente}*! Segue a escalação da pelada:`,
      acoes: [{ tipo: 'SOLICITAR_LISTA', nome: nomeRemetente }] 
    };
  }

  if (t.includes('!novapartida') || t.includes('!limparlista') || t.includes('nova partida')) {
    return { 
      resposta_boleira: `Zera o placar! Nova partida no tático pelo *${BOT_NAME}*! 🆕⚽`,
      acoes: [{ tipo: 'NOVA_PARTIDA', nome: nomeRemetente }] 
    };
  }

  if (t.includes('vou de goleiro') || t.includes('tô no gol') || t.includes('to no gol') || t.includes('goleirada')) {
    return { 
      resposta_boleira: `Boa, paredão *${nomeRemetente}*! Luvas a postas! 🧤⚽`,
      acoes: [{ tipo: 'ADICIONAR_GOLEIRO', nome: nomeRemetente }] 
    };
  }

  if (t.includes('tô fora') || t.includes('to fora') || t.includes('não vou') || t.includes('nao vou') || t.includes('cancela meu nome') || t.includes('hoje não dá') || t.includes('hoje nao da')) {
    return { 
      resposta_boleira: `Que chinelagem, *${nomeRemetente}*! Mas beleza, tirando do quadro tático. 🚑`,
      acoes: [{ tipo: 'REMOVER', nome: nomeRemetente }] 
    };
  }

  if (t.includes('vou') || t.includes('tô dentro') || t.includes('to dentro') || t.includes('bota eu') || t.includes('confirma') || t === '+1') {
    return { 
      resposta_boleira: `Boa, *${nomeRemetente}*! Confirmado na súmula, agora é só fazer o gol! ⚽🔥`,
      acoes: [{ tipo: 'ADICIONAR_LINHA', nome: nomeRemetente }] 
    };
  }

  if (t.includes('talvez') || t.includes('duvida') || t.includes('dúvida') || t.includes('aviso')) {
    return { 
      resposta_boleira: `Ficou na dúvida, *${nomeRemetente}*? Não vai pipocar hein! ⏱️`,
      acoes: [{ tipo: 'DUVIDA', nome: nomeRemetente }] 
    };
  }

  return { resposta_boleira: respostaBoleira, acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }] };
}

const db = require('./database');
const { executarComTelemetriaLangChain } = require('./llmFactory');
const { registrarMetricaSRE } = require('./sreTelemetry');

async function processarMensagemComIA(textoMensagem, nomeRemetente) {
  const currentBotName = db.getBotName();
  const systemPrompt = `
Você é o "${currentBotName}", o assistente de inteligência artificial especialista e boleiro dos grupos de futebol no WhatsApp!
Sua linguagem é cheia de gírias autênticas do futebol brasileiro (ex: "fala meu camisa 10", "bagre", "craque", "jogou onde?", "tá no tático", "brabo", "chama que é gol", "chinelinho", "passe de calcanhar").

REGRAS DE ESCOPO E SEGURANÇA (EXCLUSIVO FUTEBOL):
1. VOCÊ É 100% LIMITADO AO MUNDO DO FUTEBOL E ORGANIZAÇÃO DA PELADA.
2. Saudações Reativas ("bom dia", "boa tarde", "boa noite", "salve", "fala rapaziada"): Responda OBRIGATORIAMENTE no campo "resposta_boleira" com uma saudação futebolística animada, cheia de gírias de futebol!
3. Se a mensagem for sobre notícias de futebol, curiosidades, pelada, escalação, times, regras do jogo ou resenha esportiva: Responda no campo "resposta_boleira" com entusiasmo, informações atualizadas e resenha boleira!
4. Se a mensagem for sobre assuntos FORA do futebol (ex: receitas de cozinha, política, matemática, finanças gerais, física, etc.), recuse educadamente e de forma bem-humorada no campo "resposta_boleira" (ex: "Calma aí meu camisa 10 ${nomeRemetente}! Aqui na arena do ${currentBotName} a gente só joga FUTEBOL! Manda uma pergunta sobre a bola ou sobre a pelada que eu te mando no peito!").
5. Sempre que o remetente citar seu nome ("${currentBotName}", "bot", "professor") ou pedir uma notícia ("manda uma notícia sobre futebol", "notícias do futebol"), responda de forma envolvente no campo "resposta_boleira".

Diretrizes de extração de presenças:
- Se disser "vou", "tô dentro", "bota eu", "confirma", "+1", a ação é "ADICIONAR_LINHA".
- Se disser que vai no gol / goleiro, a ação é "ADICIONAR_GOLEIRO".
- Se citar convidados (ex: "coloca o Paulo", "adiciona o Pedrinho"), crie uma ação para CADA pessoa com tipo "ADICIONAR_LINHA" ou "ADICIONAR_GOLEIRO", colocando "nome" como o nome do convidado e "convidado_por" como "${nomeRemetente}".
- Se indicar desistência ("tô fora", "não vou", "cancela"), a ação é "REMOVER".
- Se perguntar sobre a lista ("manda a lista", "como tá a lista", "!lista"), a ação é "SOLICITAR_LISTA".
`;

  const userPrompt = `Remetente: ${nomeRemetente}\nMensagem: ${textoMensagem}`;

  try {
    const resultado = await executarComTelemetriaLangChain({
      systemPrompt,
      userPrompt,
      responseSchema,
      agentName: 'Concierge Principal (LangChain)',
      userName: nomeRemetente
    });

    return resultado.dados;
  } catch (error) {
    console.error("⚠️ [LangChain/LLM Error - Usando Fallback por Regras]:", error.message || error);
    
    registrarMetricaSRE({
      provider: process.env.LLM_PROVIDER || 'google-genai',
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      agentName: 'Concierge Fallback Regras',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 10,
      ttftMs: 10,
      status: 'fallback',
      errorMessage: error.message,
      userName: nomeRemetente
    });

    return extrairAcoesPorRegras(textoMensagem, nomeRemetente);
  }
}

/**
 * Processa mensagens de ÁUDIO via Visão Computacional/Multimodal do Gemini IA
 * Transcreve o áudio e extrai as ações solicitadas pelo jogador.
 */
async function processarAudioComIA(audioBuffer, mimeType, nomeRemetente) {
  const currentBotName = process.env.BOT_NAME || 'Joga10';
  const base64Audio = audioBuffer.toString('base64');
  const cleanMime = mimeType ? mimeType.split(';')[0] : 'audio/ogg';
  const startTime = Date.now();

  const systemPrompt = `
Você é o "${currentBotName}", o assistente agêntico mais resenha e boleiro de grupos de futebol no WhatsApp!
Sua missão é ouvir o áudio do remetente ("${nomeRemetente}"), transcrevê-lo com precisão no campo "transcricao_audio" e extrair todas as intenções de futebol (ex: adicionar jogadores citados, goleiros, desistências ou pedido de lista).

Regras de Áudio:
1. Preencha "transcricao_audio" com o texto exato falado no áudio.
2. Em "resposta_boleira", envie uma resposta curta e engraçada em estilo boleiro (ex: "Ouvido e anotado, meu camisa 10! Coloquei o Paulo na súmula!").
3. Se o áudio falar algo como "adiciona o Paulo" ou "coloca o Bruno e o Pedrinho", crie as ações "ADICIONAR_LINHA" para CADA nome citado, preenchendo "convidado_por" com "${nomeRemetente}".
`;

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: base64Audio
          }
        },
        {
          text: `Ouça o áudio do jogador "${nomeRemetente}". Transcreva o áudio e identifique todas as intenções e nomes citados para a lista de futebol.`
        }
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2
      }
    });

    const endTime = Date.now();
    const latencyMs = endTime - startTime;
    const usage = response.usageMetadata || {};

    registrarMetricaSRE({
      provider: 'google-genai',
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      agentName: 'Concierge Áudio (Voz)',
      promptTokens: usage.promptTokenCount || 500,
      completionTokens: usage.candidatesTokenCount || 150,
      latencyMs: latencyMs,
      ttftMs: Math.round(latencyMs * 0.5),
      status: 'success',
      userName: nomeRemetente
    });

    if (!response || !response.text) {
      return { 
        transcricao_audio: "Não foi possível transcrever o áudio.",
        resposta_boleira: `Fala *${nomeRemetente}*, não consegui entender bem esse áudio, manda em texto meu craque! 🎙️`,
        acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }] 
      };
    }

    return JSON.parse(response.text);
  } catch (error) {
    const endTime = Date.now();
    console.error("❌ [Gemini Audio Error]:", error.message || error);
    
    registrarMetricaSRE({
      provider: 'google-genai',
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      agentName: 'Concierge Áudio (Voz)',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: endTime - startTime,
      ttftMs: endTime - startTime,
      status: 'error',
      errorMessage: error.message,
      userName: nomeRemetente
    });

    return { 
      transcricao_audio: null,
      resposta_boleira: `Fala *${nomeRemetente}*, deu uma canelada aqui ao ouvir o áudio! Manda em texto pra eu escalá-lo! ⚽`,
      acoes: [{ tipo: 'IGNORAR', nome: nomeRemetente }] 
    };
  }
}

module.exports = {
  processarMensagemComIA,
  processarAudioComIA
};

