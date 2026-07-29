import os
import sys
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import List, Optional

# Garante suporte a UTF-8 no terminal Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Carrega as variáveis de ambiente
load_dotenv()

app = Flask(__name__)

# Inicializa o cliente do Gemini (pega a GEMINI_API_KEY automaticamente do .env)
client = genai.Client()

# ------------------------------------------------------------------
# 1. Esquema de Saída da IA (JSON Estruturado)
# ------------------------------------------------------------------
class AcaoJogador(BaseModel):
    tipo: str = Field(
        ..., 
        description="Ação identificada: ADICIONAR_LINHA, ADICIONAR_ESPERA, REMOVER, DUVIDA, IGNORAR"
    )
    nome: str = Field(..., description="Nome do jogador citado ou do próprio remetente")
    tipo_jogador: str = Field(default="linha", description="'linha' ou 'goleiro'")
    convidado_por: Optional[str] = Field(default=None, description="Nome de quem está levando o convidado, se houver")
    motivo: Optional[str] = Field(default=None, description="Motivo de desistência/dúvida caso citado")

class ResultadoPelada(BaseModel):
    acoes: List[AcaoJogador]

# ------------------------------------------------------------------
# 2. Chamada para o Gemini (gemini-2.5-flash)
# ------------------------------------------------------------------
def processar_mensagem_com_ia(texto_mensagem: str, nome_remetente: str) -> ResultadoPelada:
    system_prompt = f"""
    Você é o assistente inteligente de agendamento do futebol ("Pelada.AI").
    Sua missão é extrair intenções de presença/desistência de mensagens no grupo.

    Regras:
    1. Se o remetente disser apenas "vou", "tô dentro", "confirma", o nome deve ser "{nome_remetente}".
    2. Se ele citar terceiros (ex: "coloca o Bruno e o irmão dele"), crie uma ação para cada pessoa.
    3. Identifique se o jogador é GOLEIRO (ex: "vou de goleiro", "tenho um goleiro").
    4. Se for apenas conversa paralela, zoeira ou meme sem relação com a lista, use o tipo "IGNORAR".
    """

    user_prompt = f"Remetente: {nome_remetente}\nMensagem: {texto_mensagem}"

    # Faz a chamada forçando a saída no formato da classe Pydantic
    response = client.models.generate_content(
        model='gemini-flash-latest',
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=ResultadoPelada,
            temperature=0.1
        ),
    )

    # Converte o JSON retornado pelo Gemini para o objeto Pydantic
    return ResultadoPelada.model_validate_json(response.text)

# ------------------------------------------------------------------
# 3. Rota Webhook (Recebe do WhatsApp)
# ------------------------------------------------------------------
@app.route("/webhook", methods=["POST"])
def webhook_whatsapp():
    payload = request.get_json()

    if not payload:
        return jsonify({"status": "error", "message": "Payload vazio"}), 400

    data = payload.get("data", {})
    
    texto_mensagem = (
        data.get("message", {}).get("conversation") or 
        data.get("message", {}).get("extendedTextMessage", {}).get("text")
    )
    
    nome_remetente = data.get("pushName", "Jogador Desconhecido")

    if not texto_mensagem:
        return jsonify({"status": "ignored", "reason": "Mensagem sem texto"}), 200

    print(f"\n📩 [WhatsApp] {nome_remetente}: \"{texto_mensagem}\"")

    try:
        # Envia para o Gemini
        resultado = processar_mensagem_com_ia(texto_mensagem, nome_remetente)
        dados_json = resultado.model_dump()

        print("🤖 [JSON Extraído pelo Gemini]:")
        print(dados_json)

        return jsonify({"status": "success", "data": dados_json}), 200

    except Exception as e:
        print(f"❌ Erro no Gemini: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    porta = int(os.getenv("PORT", 5000))
    print(f"🚀 Servidor do Futebol rodando com Gemini na porta {porta}...")
    app.run(port=porta, debug=True)