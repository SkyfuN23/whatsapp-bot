// 📁 archivo: app.js

const express = require('express');
const fs = require('fs');
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

// 📌 Guarda una consulta derivada en inbox.json
function guardarDerivacion(data) {
  const path = './inbox.json';
  let historial = [];
  try {
    if (fs.existsSync(path)) {
      historial = JSON.parse(fs.readFileSync(path));
    }
  } catch (err) {
    console.error('❌ Error al leer inbox.json:', err);
  }

  historial.push(data);

  try {
    fs.writeFileSync(path, JSON.stringify(historial, null, 2));
    console.log('📝 Consulta guardada en inbox.json');
  } catch (err) {
    console.error('❌ Error al escribir inbox.json:', err);
  }
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

    console.log("📨 Mensaje recibido:", msgBody);

    let reply;

    const quiereAsesor = /asesor|humano|persona|hablar con alguien|me atiende/i.test(msgBody.toLowerCase());

    if (quiereAsesor) {
      reply = "Derivo tu consulta a una persona del equipo. En breve se contactará con vos 😊";

      const derivado = {
        numero: from,
        mensaje: msgBody,
        fecha: new Date().toISOString()
      };
      guardarDerivacion(derivado);

      console.log("🆘 DERIVACIÓN A ASESOR", derivado);
    } else {
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 120,
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

Si la pregunta no tiene respuesta en esta información, respondé:
"Derivo tu consulta a una persona del equipo. En breve se contactará con vos 😊"

Respondé de forma clara, amable, profesional y en menos de 60 palabras cuando sea posible.
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
      console.log("✅ Respuesta enviada a:", to);
    } catch (err) {
      console.error("❌ Error al enviar:", err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

// 📤 Ver consultas derivadas desde el navegador
app.get('/inbox', (req, res) => {
  const path = './inbox.json';

  try {
    const data = fs.readFileSync(path);
    const lista = JSON.parse(data);

    let html = `
      <html>
        <head>
          <title>Consultas derivadas</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #f8f8f8; }
            h1 { color: #222; }
            .card { background: #fff; border-radius: 8px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .card p { margin: 5px 0; }
            .small { color: gray; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <h1>📥 Consultas derivadas</h1>
    `;

    if (lista.length === 0) {
      html += `<p>No hay mensajes pendientes 😊</p>`;
    } else {
      lista.reverse().forEach((item, i) => {
        html += `
          <div class="card">
            <p><strong>#${i + 1}</strong></p>
            <p><strong>Número:</strong> ${item.numero}</p>
            <p><strong>Mensaje:</strong> ${item.mensaje}</p>
            <p class="small">🕒 ${new Date(item.fecha).toLocaleString()}</p>
          </div>
        `;
      });
    }

    html += `</body></html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('Error al leer inbox.json');
  }
});


// 🚀 Start
app.listen(3001, () => {
  console.log('🟢 BOT activo en http://localhost:3001');
});
