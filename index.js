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

const INBOX_FILE = './inbox.json';
const CHAT_FILE = './conversaciones.json';

function formatPhoneNumber(number) {
  number = String(number);
  if (number.startsWith('549') && number.length === 13) {
    return '54' + number.slice(3);
  }
  return number;
}

function guardarDerivacion(data) {
  let historial = [];
  if (fs.existsSync(INBOX_FILE)) {
    historial = JSON.parse(fs.readFileSync(INBOX_FILE));
  }
  if (!historial.find(e => e.numero === data.numero)) {
    historial.push(data);
    fs.writeFileSync(INBOX_FILE, JSON.stringify(historial, null, 2));
  }
  guardarMensaje(data.numero, 'usuario', data.mensaje);
}

function guardarMensaje(numero, remitente, texto) {
  let chats = {};
  if (fs.existsSync(CHAT_FILE)) {
    chats = JSON.parse(fs.readFileSync(CHAT_FILE));
  }
  if (!chats[numero]) chats[numero] = [];
  chats[numero].push({ remitente, texto, hora: new Date().toLocaleTimeString() });
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
}

function estaDerivado(numero) {
  try {
    const data = JSON.parse(fs.readFileSync(INBOX_FILE));
    return data.some(e => e.numero === numero);
  } catch {
    return false;
  }
}

function eliminarDerivado(numero) {
  try {
    const data = JSON.parse(fs.readFileSync(INBOX_FILE));
    const actualizado = data.filter(e => e.numero !== numero);
    fs.writeFileSync(INBOX_FILE, JSON.stringify(actualizado, null, 2));
    let chats = {};
    if (fs.existsSync(CHAT_FILE)) {
      chats = JSON.parse(fs.readFileSync(CHAT_FILE));
      delete chats[numero];
      fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2));
    }
    return true;
  } catch {
    return false;
  }
}

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

app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const message = entry?.changes?.[0]?.value?.messages?.[0];

  if (message && message.text) {
    const from = message.from;
    const to = formatPhoneNumber(from);
    const msgBody = message.text.body;

    console.log("📨 Mensaje recibido:", msgBody);

    let reply;

    if (estaDerivado(from)) {
      guardarMensaje(from, 'usuario', msgBody);
      console.log("⏸️ Usuario derivado, IA desactivada para:", from);
      return res.sendStatus(200);
    }

    const quiereAsesor = /asesor|humano|persona|hablar con alguien|me atiende/i.test(msgBody.toLowerCase());

    if (quiereAsesor) {
      reply = "Derivo tu consulta a una persona del equipo. En breve se contactará con vos 😊";
      guardarDerivacion({ numero: from, mensaje: msgBody, fecha: new Date().toISOString() });
    } else {
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 120,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Sos un asistente virtual del Consultorio 11 de Abril, ubicado en 11 de abril 130, Bahía Blanca.
Tu tarea es responder preguntas de pacientes sobre estudios, horarios, precios y cómo consultar resultados.
Debés responder únicamente con la siguiente información:

- 📍 Dirección: 11 de abril 130 (Bahía Blanca)
- ⏰ Horario: lunes a viernes de 9 a 19 hs
- 📋 No se necesita turno. Se atiende por orden de llegada.
- 🌐 Resultados online: www.11deabril.com
  - Ingreso: con el DNI como usuario y contraseña (a menos que ya la haya cambiado)

🧾 Estudios realizados y precios:
- Panorámica dental: $20.000
- Tórax frente y perfil (o "f y p"): $15.000
- Tórax solo frente (o "frente" o "f"): $10.000
- Tórax solo perfil (o "perfil" o "p"): $9.000
- Columna: $7.000

Si la pregunta no tiene respuesta en esta información, respondé:
"Derivo tu consulta a una persona del equipo. En breve se contactará con vos 😊"

Respondé de forma clara, amable, profesional y en menos de 60 palabras cuando sea posible.`.trim()
          },
          { role: 'user', content: msgBody }
        ]
      });

      reply = aiResponse.choices[0].message.content;

      if (reply.toLowerCase().includes("derivo tu consulta a una persona")) {
        guardarDerivacion({ numero: from, mensaje: msgBody, fecha: new Date().toISOString() });
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

app.get('/panel', (req, res) => {
  const data = fs.existsSync(INBOX_FILE) ? JSON.parse(fs.readFileSync(INBOX_FILE)) : [];
  const chats = fs.existsSync(CHAT_FILE) ? JSON.parse(fs.readFileSync(CHAT_FILE)) : {};

  let html = `<html><head><title>Panel</title></head><body><h2>📥 Consultas derivadas</h2><form method="POST" action="/responder">`;

  data.forEach((item) => {
    html += `<div style="border:1px solid #ccc; padding:10px; margin:10px">
      <p><strong>${item.numero}</strong></p>`;

    const historial = chats[item.numero] || [];
    historial.forEach(msg => {
      html += `<p><b>${msg.remitente}:</b> ${msg.texto} <i>${msg.hora}</i></p>`;
    });

    html += `
      <textarea name="mensaje" rows="2" cols="40" placeholder="Escribir respuesta..."></textarea>
      <input type="hidden" name="numero" value="${item.numero}" />
      <button type="submit">Responder</button>
      <button formaction="/liberar" formmethod="POST" name="numero" value="${item.numero}" style="margin-left:10px">Cerrar chat</button>
    </div>`;
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
    guardarMensaje(numero, 'asesor', mensaje);
    console.log("📨 Respuesta manual enviada a:", to);
  } catch (err) {
    console.error("❌ Error al enviar manual:", err.response?.data || err.message);
  }
  res.redirect('/panel');
});

app.post('/liberar', async (req, res) => {
  const numero = String(req.body.numero);
  const to = formatPhoneNumber(numero);

  try {
    // Enviar mensaje de cierre
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: 'EL CHAT HA FINALIZADO' }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    // Guardar el mensaje de cierre en el historial
    guardarMensaje(numero, 'asesor', 'EL CHAT HA FINALIZADO');
    console.log("📴 Mensaje de cierre enviado a:", to);
    
    // Eliminar el usuario derivado (esto prende la IA de nuevo y quita el chat del panel)
    const ok = eliminarDerivado(numero);
    console.log(ok ? "🟢 Chat cerrado para:" : "⚠️ No se encontró número:", numero);
    
  } catch (err) {
    console.error("❌ Error al enviar mensaje de cierre:", err.response?.data || err.message);
  }

  res.redirect('/panel');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🟢 BOT activo en http://localhost:${PORT}`);
});