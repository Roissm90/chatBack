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

mongoose
  .connect("mongodb://127.0.0.1:27017/chat", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB conectado"))
  .catch(console.error);

app.get("/", (req, res) => res.send("Servidor funcionando"));

// Usuarios conectados temporalmente
const usuarios = {};

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("join", async ({ username }) => {
    // Guardar usuario conectado temporalmente
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

  socket.on("mensaje", async ({ toUser, text }) => {
    const fromUser = usuarios[socket.id];
    if (!fromUser) return;

    // Buscar usuarios involucrados
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

    // Agregar mensaje a ambas conversaciones
    conversationSender.messages.push(mensajeObj);
    conversationReceiver.messages.push(mensajeObj);

    // Guardar cambios en DB
    await sender.save();
    await receiver.save();

    io.emit("mensaje", mensajeObj);
  });

  socket.on("disconnect", () => {
    const username = usuarios[socket.id];
    delete usuarios[socket.id];
    io.emit("usuarios-conectados", Object.values(usuarios));
    socket.broadcast.emit("user-left", { username });
  });
});

server.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));
