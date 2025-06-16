const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

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
        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
          {
            messaging_product: 'whatsapp',
            to: "5492914414797", // Confirmá que esté bien formateado, ej: "5492914414797"
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
