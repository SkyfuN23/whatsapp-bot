// 📁 archivo: index.js

const express = require('express');
const fs = require('fs');
const axios = require('axios');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

  // Evitar duplicados
  if (!historial.find(e => e.numero === data.numero)) {
    historial.push(data);
  }

  try {
    fs.writeFileSync(path, JSON.stringify(historial, null, 2));
    console.log('📝 Consulta guardada en inbox.json');
  } catch (err) {
    console.error('❌ Error al escribir inbox.json:', err);
  }
}

function estaDerivado(numero) {
  try {
    const data = JSON.parse(fs.readFileSync('./inbox.json'));
    return data.some(e => e.numero === numero);
  } catch {
    return false;
  }
}

function eliminarDerivado(numero) {
  try {
    const data = JSON.parse(fs.readFileSync('./inbox.json'));
    const actualizado = data.filter(e => e.numero !== numero);
    fs.writeFileSync('./inbox.json', JSON.stringify(actualizado, null, 2));
    return true;
  } catch {
    return false;
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

    // 👉 Si está en lista de asesoría, no usar IA
    if (estaDerivado(from)) {
      console.log("⏸️ Usuario derivado, IA desactivada para:", from);
      return res.sendStatus(200);
    }

    const quiereAsesor = /asesor|humano|persona|hablar con alguien|me atiende/i.test(msgBody.toLowerCase());

    if (quiereAsesor) {
      reply = "Derivo tu consulta a una persona del equipo. En breve se contactará con vos 😊";

      guardarDerivacion({
        numero: from,
        mensaje: msgBody,
        fecha: new Date().toISOString()
      });
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

      if (reply.toLowerCase().includes("derivo tu consulta a una persona")) {
        guardarDerivacion({ numero: from, mensaje: msgBody, fecha: new Date().toISOString() });
        console.log("🆘 DERIVACIÓN A ASESOR (por IA)");
      }
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

// 📤 Ver y responder consultas derivadas desde navegador
app.get('/panel', (req, res) => {
  const data = fs.existsSync('./inbox.json') ? JSON.parse(fs.readFileSync('./inbox.json')) : [];

  let html = `
    <html><head><title>Panel</title></head><body>
    <h2>📥 Consultas derivadas</h2>
    <form method="POST" action="/responder">
  `;

  data.forEach((item, i) => {
    html += `
      <div style="border:1px solid #ccc; padding:10px; margin:10px">
        <p><strong>${item.numero}</strong></p>
        <p>${item.mensaje}</p>
        <textarea name="mensaje" rows="2" cols="40" placeholder="Escribir respuesta..."></textarea>
        <input type="hidden" name="numero" value="${item.numero}" />
        <button type="submit">Responder</button>
        <button formaction="/liberar" formmethod="POST" name="numero" value="${item.numero}" style="margin-left:10px">Cerrar chat</button>
      </div>
    `;
  });

  html += `</form></body></html>`;
  res.send(html);
});

app.post('/responder', async (req, res) => {
  const { numero, mensaje } = req.body;
  const to = formatPhoneNumber(numero);
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: mensaje }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        }
      }
    );
    console.log("📨 Respuesta manual enviada a:", to);
  } catch (err) {
    console.error("❌ Error al enviar manual:", err.response?.data || err.message);
  }
  res.redirect('/panel');
});

app.post('/liberar', (req, res) => {
  const numero = req.body.numero;
  const ok = eliminarDerivado(numero);
  console.log(ok ? "🟢 Chat cerrado para:" : "⚠️ No se encontró número:", numero);
  res.redirect('/panel');
});

// 🚀 Start
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🟢 BOT activo en http://localhost:${PORT}`);
});