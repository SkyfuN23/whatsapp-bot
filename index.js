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

// ✅ Formatea correctamente el número destinatario (elimina el "9")
function formatPhoneNumber(number) {
  if (number.startsWith('549') && number.length === 13) {
    return '54' + number.slice(3);
  }
  return number;
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
    const to = formatPhoneNumber(from);
    const msgBody = message.text.body;

    console.log("📨 Mensaje:", msgBody);

    let reply;

    // 🤖 Respuesta de IA genérica
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      max_tokens: 100,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
        content: `
Sos un asistente virtual del Consultorio 11 de Abril, ubicado en 11 de abril 130, Bahía Blanca.
Tu tarea es responder preguntas de pacientes sobre estudios, horarios, precios y cómo consultar resultados.
Debés responder únicamente con la siguiente información:

- 📍 Dirección: 11 de abril 130 (Bahía Blanca)
- ⏰ Horario: lunes a viernes de 9 a 19 hs
- 📋 No se necesita turno. Se atiende por orden de llegada.
- 🌐 Resultados online: www.11deabril.com
  - Ingreso: con el DNI como usuario y contraseña (a menos que ya la haya cambiado)
  
🧾 Estudios realizados y precios:
- Panorámica dental: $20.000
- Tórax frente y perfil (o “f y p”): $15.000
- Tórax solo frente (o “frente” o “f”): $10.000
- Tórax solo perfil (o “perfil” o “p”): $9.000
- Columna: $7.000

Si la pregunta no tiene respuesta en esta información, respondé con amabilidad que debe acercarse al consultorio para más información.

Respondé de forma clara, amable, profesional y en menos de 60 palabras cuando sea posible.
`.trim()
        },
        { role: 'user', content: msgBody }
      ]
    });

    reply = aiResponse.choices[0].message.content;

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
      console.log("✅ Mensaje enviado a:", to);
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
