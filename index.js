const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ✅ Formatea correctamente el número destinatario
function formatPhoneNumber(number) {
  if (number.startsWith('549') && number.length === 13) {
    const codigoArea = number.slice(3, 6);
    const resto = number.slice(6);
    return `54${codigoArea}15${resto}`;
  }
  return number;
}

// 📌 Verifica si el mensaje contiene medidas válidas
function calcularPresupuesto(texto) {
  const match = texto.match(/(\d+)[\s*x×X\-]+(\d+)/);
  if (!match) return null;
  const ancho = parseInt(match[1]);
  const alto = parseInt(match[2]);
  if (isNaN(ancho) || isNaN(alto)) return null;
  const precio = ancho * alto * 80000;
  return `✅ El precio estimado de la cortina es $${precio.toLocaleString("es-AR")}.`;
}

// 📌 Webhook de verificación
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📥 Recepción de mensajes
app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const message = entry?.changes?.[0]?.value?.messages?.[0];

  if (message && message.text) {
    const from = message.from;
    const msgBody = message.text.body;
    const to = formatPhoneNumber(from);

    console.log("📨 Mensaje:", msgBody);

    let reply;

    // 🧮 Detectar medidas tipo "2x2", "2 x 2", "2X2"
    const match = msgBody.match(/(\d+(?:[.,]\d+)?)[\s*x×X\-]+(\d+(?:[.,]\d+)?)/);
    if (match) {
      const ancho = parseFloat(match[1].replace(',', '.'));
      const alto = parseFloat(match[2].replace(',', '.'));
      const precio = Math.round(ancho * alto * 80000);
      reply = `🧾 El precio estimado de tu cortina es $${precio.toLocaleString("es-AR")}.`;
    } else {
      // 🤖 Respuesta de IA si no son medidas
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 100,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `
Sos JUBOT, un asistente virtual simpático de la empresa Diseño Interior, ubicada en Zelarrayán 376, Bahía Blanca.
Respondé solo sobre cortinas, presupuestos, showroom, horarios o consultas de productos.
Si te preguntan cómo te llamás, decí que sos JUBOT.
Respondé en menos de 40 palabras.
            `.trim()
          },
          { role: 'user', content: msgBody }
        ]
      });

      reply = aiResponse.choices[0].message.content;
    }

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: reply }
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          }
        }
      );
      console.log("✅ Mensaje enviado");
    } catch (err) {
      console.error("❌ Error al enviar:", err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

// 🚀 Start
app.listen(3001, () => {
  console.log('🟢 JUBOT está escuchando en http://localhost:3001');
});
