require('dotenv').config();
const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({});

const receiptSchema = {
  type: Type.OBJECT,
  properties: {
    eComprovantePix: {
      type: Type.BOOLEAN,
      description: "True se a imagem for um comprovante de transferência bancária ou PIX autêntico"
    },
    valor: {
      type: Type.NUMBER,
      description: "Valor numérico da transferência em Reais (ex: 27.00, 54.00, 81.00)"
    },
    nomePagador: {
      type: Type.STRING,
      description: "Nome de quem realizou o pagamento citado no comprovante"
    },
    nomeDestinatario: {
      type: Type.STRING,
      description: "Nome de quem recebeu o PIX se visível"
    },
    dataHora: {
      type: Type.STRING,
      description: "Data e hora da transação se visíveis"
    }
  },
  required: ["eComprovantePix", "valor"]
};

/**
 * Analisa a imagem do comprovante PIX via Visão Computacional do Gemini IA
 */
async function analisarComprovantePix(imageBuffer, mimeType = 'image/jpeg') {
  const base64Image = imageBuffer.toString('base64');

  const systemPrompt = `
=== 1. OVERVIEW ===
Você é o Agente Especialista de Visão Computacional Financeira. Sua função é auditar e validar prints/fotos de comprovantes bancários de PIX enviados no grupo do futebol.

=== 2. CONTEXT ===
- Tipo de Mídia: Imagem / Buffer Base64
- Modelo de Visão: Gemini Multimodal Vision API
- Finalidade: Validação automatizada de pagamento de cotas de futebol (avulso R$ 27 / mensalista R$ 81).

=== 3. INSTRUCTIONS & SCOPE BOUNDARIES ===
1. Inspeção OCR: Verifique a autenticidade do documento enviado.
2. Identificação de Valores: Extraia o valor numérico exato em BRL.
3. Extração de Entidades: Extraia o nome do pagador, destinatário e data/hora.
4. Se a imagem não for um comprovante financeiro, defina "eComprovantePix": false.

=== 4. TOOLS & SCHEMA OUTPUT ===
Retorne estritamente o JSON definido pelo schema:
- eComprovantePix (boolean)
- valor (number)
- nomePagador (string)
- nomeDestinatario (string)
- dataHora (string)

=== 5. EXAMPLES ===
Exemplo: Print do Banco Inter indicando "Transferência PIX Realizada - R$ 27,00 para Alan Ricetti".
JSON Output: {"eComprovantePix": true, "valor": 27.00, "nomePagador": "João Silva", "nomeDestinatario": "Alan Ricetti"}

=== 6. STANDARD OPERATING PROCEDURE (SOP) ===
Passo 1: Verificar se há logotipo de instituição financeira ou palavras-chave PIX/Transferência.
Passo 2: Localizar a linha do valor monetário "R$ XX,XX" e converter para número float.
Passo 3: Localizar o nome do pagador (origem).
Passo 4: Retornar o JSON validado.

=== 7. FINAL NOTES & FALLBACK GUARDRAILS ===
- Não confunda o valor do saldo bancário com o valor efetivo da transferência PIX.
`;

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        {
          text: "Analise se este é um comprovante de PIX válido e extraia o valor exato transferido, nome do pagador e data."
        }
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
        temperature: 0.1
      }
    });

    if (!response || !response.text) {
      return { eComprovantePix: false, valor: 0 };
    }

    return JSON.parse(response.text);
  } catch (error) {
    console.error("❌ [Gemini Vision Error]:", error.message || error);
    return { eComprovantePix: false, valor: 0, erro: error.message };
  }
}

module.exports = {
  analisarComprovantePix
};
