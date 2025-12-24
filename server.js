const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

// 🔌 Conectar MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/chat", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB conectado"))
  .catch(console.error);

app.get("/", (req, res) => res.send("Servidor funcionando"));

// Usuarios conectados
const usuarios = {};

io.on("connection", async (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Enviar historial al conectarse
  const historial = await Message.find().sort({ timestamp: 1 }).limit(100);
  socket.emit("historial", historial);

  socket.on("join", ({ username }) => {
    usuarios[socket.id] = username;
    socket.broadcast.emit("user-joined", { username });
    io.emit("usuarios-conectados", Object.values(usuarios));
  });

  socket.on("mensaje", async (msg) => {
    const username = usuarios[socket.id] || "User";

    const mensajeObj = {
      user: username,
      text: msg.text,
      timestamp: msg.timestamp || Date.now(),
    };

    const saved = await Message.create(mensajeObj);
    io.emit("mensaje", saved);
  });

  socket.on("disconnect", () => {
    const username = usuarios[socket.id];
    delete usuarios[socket.id];
    io.emit("usuarios-conectados", Object.values(usuarios));
    socket.broadcast.emit("user-left", { username });
  });
});

server.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));