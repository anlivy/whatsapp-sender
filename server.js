const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const qrcode = require('qrcode')
const pino = require('pino')

const app = express()
app.use(express.json())

const API_KEY = process.env.API_KEY || 'MinhaChave2026'
let sock = null
let qrBase64 = null
let connectionStatus = 'disconnected'

const authMiddleware = (req, res, next) => {
  const key = req.headers['apikey']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrBase64 = await qrcode.toDataURL(qr)
      connectionStatus = 'qr_ready'
      console.log('QR Code pronto!')
    }
    if (connection === 'close') {
      connectionStatus = 'disconnected'
      qrBase64 = null
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log('Conexao encerrada, codigo:', code, 'reconectando:', shouldReconnect)
      if (shouldReconnect) setTimeout(startWhatsApp, 5000)
    }
    if (connection === 'open') {
      connectionStatus = 'connected'
      qrBase64 = null
      console.log('WhatsApp conectado!')
    }
  })
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', connection: connectionStatus, version: '1.0.0' })
})

app.get('/qr', (req, res) => {
  const key = req.query.key
  if (key !== API_KEY) return res.status(401).send('Unauthorized')
  if (connectionStatus === 'connected') {
    return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:green">✅ WhatsApp Conectado!</h2></body></html>')
  }
  const img = qrBase64 ? `<img src="${qrBase64}" style="width:300px;height:300px"/>` : '<p>Aguardando QR code... atualize em 5 segundos</p>'
  res.send(`<html><head><meta http-equiv="refresh" content="10"/></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Escaneie o QR Code</h2>${img}<p style="color:gray">Atualiza automaticamente a cada 10 segundos</p></body></html>`)
})

app.get('/qrcode', authMiddleware, (req, res) => {
  if (connectionStatus === 'connected') {
    return res.json({ status: 'connected', message: 'WhatsApp ja esta conectado' })
  }
  if (!qrBase64) {
    return res.json({ status: 'aguardando', message: 'Aguarde alguns segundos e tente novamente' })
  }
  res.json({ status: 'qr_ready', qrcode: qrBase64 })
})

app.post('/send', authMiddleware, async (req, res) => {
  const { number, text } = req.body
  if (!number || !text) {
    return res.status(400).json({ error: 'Campos number e text sao obrigatorios' })
  }
  if (!sock || connectionStatus !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp nao conectado. Escaneie o QR code primeiro.' })
  }
  try {
    const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`
    await sock.sendMessage(jid, { text })
    res.json({ success: true, number, status: 'sent' })
  } catch (err) {
    console.error('Erro ao enviar:', err)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
  startWhatsApp()
})
