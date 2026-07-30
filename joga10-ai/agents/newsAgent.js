const https = require('https');
const db = require('../database');
const { executarComTelemetriaLangChain } = require('../llmFactory');
const { registrarMetricaSRE } = require('../sreTelemetry');

/**
 * Coleta notícias reais de futebol em tempo real via RSS do Google News
 */
async function buscarNoticiasRSS(termoBusca) {
  const fetchRSS = (queryStr) => {
    const query = encodeURIComponent(queryStr);
    const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

    return new Promise((resolve) => {
      https.get(url, (res) => {
        let xmlData = '';
        res.on('data', chunk => xmlData += chunk);
        res.on('end', () => {
          try {
            const items = [];
            const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/gi;

            let match;
            while ((match = itemRegex.exec(xmlData)) !== null && items.length < 5) {
              let title = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, '$1').replace(/<\/?title>/gi, '').trim();
              const link = match[2].trim();
              const pubDate = match[3].trim();

              if (title && !title.toLowerCase().includes('google notícias')) {
                items.push({ title, link, pubDate });
              }
            }

            resolve(items);
          } catch (e) {
            resolve([]);
          }
        });
      }).on('error', () => {
        resolve([]);
      });
    });
  };

  // Busca notícias das últimas 48h (when:2d)
  let resultados = await fetchRSS(`${termoBusca} futebol when:2d`);
  if (resultados.length === 0) {
    // Fallback para os últimos 7 dias (when:7d)
    resultados = await fetchRSS(`${termoBusca} futebol when:7d`);
  }
  if (resultados.length === 0) {
    // Fallback para busca geral
    resultados = await fetchRSS(`${termoBusca} futebol`);
  }

  return resultados;
}

/**
 * Agente de Notícias RAG (Retrieval-Augmented Generation)
 * Busca notícias reais na internet e sintetiza via LangChain LLM no tom boleiro
 */
async function processarNoticiasFutebolRAG(textoMensagem, nomeRemetente) {
  const currentBotName = db.getBotName();
  const startTime = Date.now();

  // Identifica o clube ou termo de busca
  let termoBusca = 'futebol brasileiro';
  const textoClean = textoMensagem.trim().toLowerCase();

  if (textoClean.includes('paraná') || textoClean.includes('parana')) {
    termoBusca = 'Paraná Clube';
  } else if (textoClean.includes('coritiba') || textoClean.includes('coxa')) {
    termoBusca = 'Coritiba';
  } else if (textoClean.includes('athletico') || textoClean.includes('atletico pr') || textoClean.includes('furacão')) {
    termoBusca = 'Athletico Paranaense';
  } else if (textoClean.includes('flamengo')) {
    termoBusca = 'Flamengo';
  } else if (textoClean.includes('palmeiras')) {
    termoBusca = 'Palmeiras';
  } else if (textoClean.includes('corinthians')) {
    termoBusca = 'Corinthians';
  } else if (textoClean.includes('são paulo') || textoClean.includes('sao paulo')) {
    termoBusca = 'São Paulo FC';
  } else if (textoClean.includes('champions') || textoClean.includes('champions league')) {
    termoBusca = 'Champions League';
  } else {
    // Extrai o que veio após "notícias do" ou "notícia sobre"
    const matchTermo = textoClean.match(/(?:notícias|noticia|notícias do|notícia sobre|sobre)\s+(.+)/i);
    if (matchTermo && matchTermo[1].length > 2) {
      termoBusca = matchTermo[1].replace(/["'?!.]/g, '').trim();
    }
  }

  // 1. Retrieval: Busca notícias REAIS em tempo real na internet
  console.log(`🌐 [RAG Search] Buscando notícias em tempo real sobre "${termoBusca}"...`);
  const noticiasReais = await buscarNoticiasRSS(termoBusca);

  if (noticiasReais.length === 0) {
    const endTime = Date.now();
    registrarMetricaSRE({
      provider: 'web-search-rss',
      model: 'google-news-rss',
      agentName: 'Agente Notícias RAG',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: endTime - startTime,
      ttftMs: endTime - startTime,
      status: 'fallback',
      errorMessage: 'Sem notícias encontradas',
      userName: nomeRemetente
    });

    return {
      sucesso: true,
      mensagem: `⚽ *[${currentBotName.toUpperCase()} - RAG NOTÍCIAS]* 🌐\n\n` +
        `Fala, meu camisa 10 *${nomeRemetente}*! Busquei nos portais em tempo real sobre *${termoBusca}*, mas não encontrei manchetes novas nas últimas horas. Pergunta sobre outro clube ou pelada que eu trago no peito!`
    };
  }

  // 2. Formata o contexto RAG para o LangChain LLM
  let contextoRAG = `Notícias REAIS coletadas da internet neste momento sobre "${termoBusca}":\n`;
  noticiasReais.forEach((n, idx) => {
    contextoRAG += `${idx + 1}. ${n.title}\n`;
  });

  const systemPrompt = `
=== 1. OVERVIEW ===
Você é o Agente de Notícias RAG (Retrieval-Augmented Generation) do "${currentBotName}". Sua missão é transformar manchetes e dados esportivos coletados em tempo real na internet em um boletim vibrante e informativo no estilo boleiro para grupos de futebol.

=== 2. CONTEXT ===
- Clube / Tema Solicitado: "${termoBusca}"
- Remetente: "${nomeRemetente}"
- Fonte dos Dados: Google News RSS Search Engine em Tempo Real
- Contexto RAG Coletado:
${contextoRAG}

=== 3. INSTRUCTIONS & SCOPE BOUNDARIES ===
1. RIGOR DE DADOS (RAG): Baseie-se ESTRITAMENTE nas notícias e manchetes reais fornecidas no contexto acima.
2. PROIBIÇÃO DE HALLUCINATION: NUNCA invente notícias falsas, contratações fictícias ou dados não presentes no contexto.
3. ESTILO BOLEIRO: Sintetize as informações em formato boleiro envolvente (ex: "Fala meu camisa 10", "últimas do tático", "bomba no mercado").

=== 4. TOOLS & DATA SOURCES ===
- Web Search Engine: Google News RSS Fetcher (buscarNoticiasRSS)
- Provider LLM: LangChain Chain Execution

=== 5. EXAMPLES ===
Input: Notícias sobre Paraná Clube
Output: "Fala meu camisa 10 Alan! O Paraná Clube fechou com mais dois reforços pra Copa Paraná e definiu Matheus Barônio como novo goleiro do elenco!"

=== 6. STANDARD OPERATING PROCEDURE (SOP) ===
Passo 1: Ler todas as manchetes no contexto RAG fornecido.
Passo 2: Extrair os pontos principais (reforços, partidas, comissão técnica, decisões do clube).
Passo 3: Redigir o resumo no campo "resposta_boleira" usando formatação em tópicos amigáveis.
Passo 4: Manter o tom entusiasmado e factual.

=== 7. FINAL NOTES & FALLBACK GUARDRAILS ===
- Se o contexto trouxer poucas manchetes, apresente com clareza o que foi retornado sem enrolação.
`;

  const userPrompt = `Remetente: ${nomeRemetente}\nSolicitação: Notícias em tempo real sobre ${termoBusca}`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      resposta_boleira: {
        type: "STRING",
        description: "Notícias reais formatadas no estilo boleiro vibrante"
      },
      acoes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            tipo: { type: "STRING" },
            nome: { type: "STRING" }
          },
          required: ["tipo", "nome"]
        }
      }
    },
    required: ["resposta_boleira", "acoes"]
  };

  try {
    const resultado = await executarComTelemetriaLangChain({
      systemPrompt,
      userPrompt,
      responseSchema,
      agentName: 'Agente Notícias RAG (LangChain)',
      userName: nomeRemetente
    });

    let msgFinal = `🌐 *[NOTÍCIAS EM TEMPO REAL - ${termoBusca.toUpperCase()}]* ⚽\n`;
    msgFinal += `------------------------------------\n\n`;
    msgFinal += `${resultado.dados.resposta_boleira || 'Confira as últimas manchetes coletadas:'}\n\n`;
    msgFinal += `📰 *Fontes consultadas em tempo real:*\n`;
    noticiasReais.slice(0, 3).forEach((n) => {
      msgFinal += `  • _${n.title}_\n`;
    });

    return {
      sucesso: true,
      mensagem: msgFinal
    };
  } catch (err) {
    console.error("❌ Erro ao sintetizar RAG de notícias:", err.message);

    // Fallback direto exibindo as notícias reais se a IA falhar
    let msgFallback = `🌐 *[NOTÍCIAS EM TEMPO REAL - ${termoBusca.toUpperCase()}]* ⚽\n`;
    msgFallback += `------------------------------------\n`;
    msgFallback += `Fala meu camisa 10 *${nomeRemetente}*! Aqui estão as últimas manchetes reais coletadas direto dos portais:\n\n`;
    noticiasReais.forEach((n, idx) => {
      msgFallback += `${idx + 1}. 📰 *${n.title}*\n`;
    });
    msgFallback += `\n------------------------------------\n`;
    msgFallback += `💡 _Notícias atualizadas diretamente via RAG Search Engine._`;

    return {
      sucesso: true,
      mensagem: msgFallback
    };
  }
}

module.exports = {
  buscarNoticiasRSS,
  processarNoticiasFutebolRAG
};
