require("dotenv").config();
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
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error de conexión:", err));

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
  socket.on("mensaje", async ({ text }) => {
    const fromUser = usuarios[socket.id];
    if (!fromUser) return;

    const mensajeObj = {
      user: fromUser, // El backend añade quién lo envía
      text: text,
      timestamp: new Date(),
    };

    try {
      // 1. Guardar en MongoDB Atlas
      const user = await User.findOne({ username: fromUser });
      if (user) {
        let conv = user.conversations.find((c) => c.withUser === "General");
        if (!conv) {
          conv = { withUser: "General", messages: [] };
          user.conversations.push(conv);
        }
        conv.messages.push(mensajeObj);
        await user.save();
      }

      // 2. IMPORTANTE: Enviar el mensaje a TODO EL MUNDO (incluyéndote a ti)
      io.emit("mensaje", mensajeObj);
    } catch (err) {
      console.error("Error al guardar mensaje:", err);
    }
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
