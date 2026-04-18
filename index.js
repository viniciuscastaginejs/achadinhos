const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────
// Coloque aqui o nome EXATO dos seus grupos (como aparece no WhatsApp)
const GRUPO_FONTE = "links";        // grupo onde as pessoas postam
const GRUPO_DESTINO = "Achadinhos"; // grupo principal que recebe

// Anti-duplicata: ignora mensagens com o mesmo ID nos últimos N ms
const JANELA_DEDUP_MS = 5000;
// ─────────────────────────────────────────────────────────────────

const processados = new Set();

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
  restartOnAuthFail: true,
  qrMaxRetries: 5,
});

client.on("qr", (qr) => {
  console.log("\n📱 Escaneie o QR Code abaixo com seu WhatsApp:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  console.log("✅ Bot conectado e pronto!\n");

  const chats = await client.getChats();
  const grupos = chats.filter((c) => c.isGroup);
  console.log("📋 Grupos encontrados:");
  grupos.forEach((g) => console.log(`   - "${g.name}"`));
  console.log(`\n👀 Monitorando: "${GRUPO_FONTE}" → "${GRUPO_DESTINO}"\n`);
});

client.on("disconnected", (reason) => {
  console.log("⚠️  Bot desconectado:", reason);
  console.log("🔄 Reiniciando em 10 segundos...");
  setTimeout(() => client.initialize(), 10000);
});

client.on("auth_failure", (msg) => {
  console.error("❌ Falha de autenticação:", msg);
  console.log("🗑️  Limpe a pasta .wwebjs_auth e reinicie para gerar novo QR.");
});

client.on("message_create", async (msg) => {
  if (msg.fromMe) return;

  try {
    const chat = await msg.getChat();
    if (!chat.isGroup || chat.name !== GRUPO_FONTE) return;

    if (processados.has(msg.id._serialized)) return;
    processados.add(msg.id._serialized);
    setTimeout(() => processados.delete(msg.id._serialized), JANELA_DEDUP_MS);

    const chats = await client.getChats();
    const grupoDestino = chats.find((c) => c.isGroup && c.name === GRUPO_DESTINO);

    if (!grupoDestino) {
      console.error(`❌ Grupo destino "${GRUPO_DESTINO}" não encontrado!`);
      return;
    }

    const texto = msg.body || "";
    const remetente = msg._data?.notifyName || msg.author || "Desconhecido";
    console.log(`📨 Nova mensagem de ${remetente}: ${texto.slice(0, 60)}`);

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (!media) {
          if (texto) await grupoDestino.sendMessage(texto);
          return;
        }
        await grupoDestino.sendMessage(media, { caption: texto || "" });
        console.log(`✅ Mídia encaminhada (${media.mimetype})`);
      } catch (errMedia) {
        console.error("❌ Erro ao baixar mídia:", errMedia.message);
        if (texto) await grupoDestino.sendMessage(texto);
      }
      return;
    }

    if (texto.trim()) {
      await grupoDestino.sendMessage(texto);
      console.log(`✅ Texto encaminhado`);
    }
  } catch (err) {
    console.error("❌ Erro ao processar mensagem:", err.message);
  }
});

console.log("🚀 Iniciando bot WhatsApp Achadinhos...");
client.initialize();
