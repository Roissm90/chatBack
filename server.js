require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");


const User = require("./models/User");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

// 🔌 Conectar MongoDB Atlas (reemplaza tu URI)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión:", err));

app.get("/", (req, res) => res.send("Servidor funcionando"));

// Usuarios conectados temporalmente
const usuarios = {};

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Unirse con username
  socket.on("join", async ({ username }) => {
    usuarios[socket.id] = username;

    // Buscar usuario en DB o crear si no existe
    let user = await User.findOne({ username });
    if (!user) {
      user = await User.create({ username, conversations: [] });
    }

    // Enviar historial completo al frontend
    console.log(`Historial de ${username}:`, user.conversations);
    socket.emit("historial", user.conversations);

    socket.broadcast.emit("user-joined", { username });
    io.emit("usuarios-conectados", Object.values(usuarios));
  });

  // Enviar mensaje
  socket.on("mensaje", async ({ toUser, text }) => {
    const fromUser = usuarios[socket.id];
    if (!fromUser) return;

    // Buscar usuarios
    const sender = await User.findOne({ username: fromUser });
    const receiver = await User.findOne({ username: toUser });

    if (!receiver) {
      console.log(`Usuario destino ${toUser} no encontrado`);
      return;
    }

    // Buscar o crear conversación en sender
    let conversationSender = sender.conversations.find(
      (c) => c.withUser === toUser
    );
    if (!conversationSender) {
      conversationSender = { withUser: toUser, messages: [] };
      sender.conversations.push(conversationSender);
    }

    // Buscar o crear conversación en receiver
    let conversationReceiver = receiver.conversations.find(
      (c) => c.withUser === fromUser
    );
    if (!conversationReceiver) {
      conversationReceiver = { withUser: fromUser, messages: [] };
      receiver.conversations.push(conversationReceiver);
    }

    const mensajeObj = {
      user: fromUser,
      text,
      timestamp: new Date(),
    };

    // Guardar mensaje en ambas conversaciones
    conversationSender.messages.push(mensajeObj);
    conversationReceiver.messages.push(mensajeObj);

    // Guardar cambios en DB
    await sender.save();
    await receiver.save();

    // Emitir mensaje a todos (temporal, luego se puede filtrar por conversación)
    io.emit("mensaje", mensajeObj);
    console.log(`[Mensaje] ${fromUser} -> ${toUser}: ${text}`);
  });

  // Desconectar
  socket.on("disconnect", () => {
    const username = usuarios[socket.id];
    delete usuarios[socket.id];
    io.emit("usuarios-conectados", Object.values(usuarios));
    socket.broadcast.emit("user-left", { username });
    console.log(`Usuario desconectado: ${username}`);
  });
});

server.listen(PORT, () =>
  console.log(`Servidor escuchando en el puerto ${PORT}`)
);
