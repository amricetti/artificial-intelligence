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
Você é o Agente Financeiro com Visão Computacional especialista em auditar comprovantes de PIX de um grupo de futebol.
Sua função é analisar a foto/print do comprovante fornecida e extrair o valor exato pago e os dados da transação.
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
