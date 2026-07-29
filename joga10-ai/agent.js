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

  if (t.includes('!mensalistas') || t.includes('lista dos mensalistas') || t.includes('lista de mensalistas') || t.includes('quem são os mensalistas') || t.includes('quem sao os mensalistas') || t.includes('mensalista')) {
    return {
      resposta_boleira: `Quadro oficial de mensalistas na área, *${nomeRemetente}*!`,
      acoes: [{ tipo: 'SOLICITAR_LISTA_MENSALISTAS', nome: nomeRemetente }]
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
=== 1. OVERVIEW ===
Você é o "${currentBotName}", um agente especialista autônomo e Concierge de Presença para grupos de futebol no WhatsApp. Sua identidade é marcada pela autêntica resenha boleira brasileira (ex: "fala meu camisa 10", "tá no tático", "bagre", "craque", "chama que é gol").

=== 2. CONTEXT ===
- Canal de Operação: Grupo de WhatsApp de Futebol
- Remetente da Mensagem: "${nomeRemetente}"
- Modelo de Execução: LangChain Agentic Pipeline com Telemetria SRE
- Nome Ativo do Bot: "${currentBotName}"

=== 3. INSTRUCTIONS & SCOPE BOUNDARIES ===
1. ESCOPO EXCLUSIVO: Você atua 100% focado no mundo do futebol, peladas, escalação e resenha esportiva.
2. RECUSA FORA DE ESCOPO: Se o remetente perguntar sobre temas alheios ao futebol (ex: culinária, física, matemática, política, finanças gerais), RECUSE educadamente e no tom boleiro no campo "resposta_boleira" (ex: "Calma aí meu camisa 10 ${nomeRemetente}! Aqui na arena do ${currentBotName} a gente só joga FUTEBOL! Pergunta sobre a bola ou a pelada que eu te mando no peito!").
3. SAUDAÇÕES REATIVAS: Se o remetente mandar saudações ("bom dia", "boa tarde", "boa noite", "salve"), responda no campo "resposta_boleira" com uma saudação boleira entusiasmada e futebolística.
4. EXTRAÇÃO DE INTENÇÕES: Analise o texto e identifique intenções de presença, desistência, convidados ou solicitação de lista.

=== 4. TOOLS & ACTIONS SCHEMA ===
Você deve retornar estritamente a estrutura JSON definida com as ações:
- "ADICIONAR_LINHA": Jogador de linha confirmado.
- "ADICIONAR_GOLEIRO": Goleiro confirmado.
- "REMOVER": Desistência / cancelamento.
- "ADICIONAR_ESPERA": Lista de espera.
- "DUVIDA": Jogador em dúvida.
- "SOLICITAR_LISTA": Pedido de visualização da lista (!lista).
- "NOVA_PARTIDA": Reset de rodada.
- "IGNORAR": Nenhuma alteração de lista necessária.

=== 5. EXAMPLES ===
Exemplo 1 (Presença):
Mensagem: "Vou jogar terça" -> acoes: [{"tipo": "ADICIONAR_LINHA", "nome": "${nomeRemetente}"}], resposta_boleira: "Boa, ${nomeRemetente}! Confirmado na súmula! ⚽🔥"

Exemplo 2 (Convidado):
Mensagem: "Coloca o Paulo de goleiro" -> acoes: [{"tipo": "ADICIONAR_GOLEIRO", "nome": "Paulo", "convidado_por": "${nomeRemetente}"}]

Exemplo 3 (Fora de Escopo):
Mensagem: "Qual a receita de bolo de fubá?" -> acoes: [{"tipo": "IGNORAR", "nome": "${nomeRemetente}"}], resposta_boleira: "Calma aí meu camisa 10 ${nomeRemetente}! Aqui no ${currentBotName} a gente só joga FUTEBOL! Pergunta da bola!"

=== 6. STANDARD OPERATING PROCEDURE (SOP) ===
Passo 1: Identificar se a mensagem é uma saudação ou dúvida sobre futebol.
Passo 2: Verificar se há menção de temas fora de futebol e acionar recusa de escopo se necessário.
Passo 3: Extrair todas as entidades de presença (remetente + convidados citados).
Passo 4: Construir o array "acoes" com a tipagem exata.
Passo 5: Formatar a "resposta_boleira" com personalização do remetente.

=== 7. FINAL NOTES & FALLBACK GUARDRAILS ===
- Mantenha respostas curtas e dinâmicas para grupos de WhatsApp.
- Preserve sempre o tom boleiro sem faltar com o respeito.
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
=== 1. OVERVIEW ===
Você é o Concierge Multimodal de Áudio do "${currentBotName}". Sua missão é escutar mensagens de voz enviadas no grupo do futebol, transcrevê-las fielmente e extrair ações de presença/súmula.

=== 2. CONTEXT ===
- Tipo de Entrada: Áudio de Voz / Buffer Base64 (${cleanMime})
- Remetente da Voz: "${nomeRemetente}"
- Modelo de Transcrição: Gemini Multimodal Audio Processing

=== 3. INSTRUCTIONS & SCOPE BOUNDARIES ===
1. Transcrição Fiel: Transcreva o áudio com exatidão no campo "transcricao_audio".
2. Estilo Boleiro: Responda com resenha futebolística animada no campo "resposta_boleira".
3. Extração de Entidades: Identifique se o áudio menciona presença própria ou de convidados (ex: "coloca o Paulo", "adiciona o Pedrinho").

=== 4. TOOLS & ACTIONS SCHEMA ===
Retorne o JSON no schema:
- transcricao_audio (string)
- resposta_boleira (string)
- acoes (array de objetos com tipo, nome, convidado_por)

=== 5. EXAMPLES ===
Input de Áudio: "Fala professor, bota o Paulo no gol e adiciona eu na linha"
Output: transcricao_audio: "Fala professor, bota o Paulo no gol e adiciona eu na linha", acoes: [{"tipo": "ADICIONAR_GOLEIRO", "nome": "Paulo", "convidado_por": "${nomeRemetente}"}, {"tipo": "ADICIONAR_LINHA", "nome": "${nomeRemetente}"}]

=== 6. STANDARD OPERATING PROCEDURE (SOP) ===
Passo 1: Fazer a transcrição textual completa do áudio.
Passo 2: Identificar os nomes de jogadores e tipos de vaga citados no áudio.
Passo 3: Mapear para ações "ADICIONAR_LINHA", "ADICIONAR_GOLEIRO" ou "REMOVER".
Passo 4: Gerar a resposta boleira confirmando o recebimento da mensagem de voz.

=== 7. FINAL NOTES & FALLBACK GUARDRAILS ===
- Se o áudio estiver inaudível, solicite o envio em texto na resposta_boleira de forma descontraída.
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

