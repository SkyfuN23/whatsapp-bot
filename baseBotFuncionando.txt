const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ✅ Función para corregir el número de teléfono (elimina el "9" después de "54")
function formatPhoneNumber(number) {
  if (number.startsWith('549') && number.length === 13) {
    const codigoArea = number.slice(3, 6);     // "291"
    const resto = number.slice(6);             // "4414797"
    return `54${codigoArea}15${resto}`;        // "54291154414797"
  }
  return number;
}


// RUTA PARA VERIFICAR WEBHOOK
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado');
    res.status(200).send(`${challenge}`);
  } else {
    res.sendStatus(403);
  }
});

// RUTA PARA ESCUCHAR MENSAJES
app.post('/webhook', async (req, res) => {
  console.log("✅ Recibido webhook:", JSON.stringify(req.body, null, 2));

  const entry = req.body.entry?.[0];
  const message = entry?.changes?.[0]?.value?.messages?.[0];

  if (message && message.text) {
    const from = message.from;
    const msgBody = message.text.body.toLowerCase();

    console.log("📨 Mensaje recibido de:", from);
    console.log("📝 Contenido:", msgBody);

    if (msgBody.includes('hola')) {
      try {
        const to = formatPhoneNumber(from);

        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
          {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: {
              body: `👋 BIENVENIDO SELECCIONE ALGUNA DE LAS OPCIONES:\n1️⃣ CONTACTAR ASESOR\n2️⃣ SABER HORARIOS\n3️⃣ SABER UBICACIONES`
            }
          },
          {
            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            }
          }
        );

        console.log("✅ Mensaje enviado:", response.data);
      } catch (error) {
        console.error("❌ Error al enviar mensaje:");
        console.error(error.response?.data || error.message);
      }
    }
  }

  res.sendStatus(200);
});

app.listen(3001, () => {
  console.log('Bot escuchando en http://localhost:3001');
});