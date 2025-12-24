const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require('dotenv').config();

const User = require("./models/User");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 10000;

// 🔌 Conectar MongoDB Atlas
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión:", err));

app.get("/", (req, res) => res.send("Servidor funcionando"));

const usuarios = {};

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("join", async ({ username }) => {
    usuarios[socket.id] = username;

    try {
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username, conversations: [] });
      }

      // IMPORTANTE: Buscamos los mensajes de la conversación 'General'
      const convGeneral = user.conversations.find(c => c.withUser === "General");
      const historial = convGeneral ? convGeneral.messages : [];
      
      console.log(`Enviando historial a ${username}:`, historial.length, "mensajes");
      socket.emit("historial", historial);

      socket.broadcast.emit("user-joined", { username });
      io.emit("usuarios-conectados", Object.values(usuarios));
    } catch (error) {
      console.error("Error en join:", error);
    }
  });

  socket.on("mensaje", async ({ text }) => {
    const fromUser = usuarios[socket.id];
    if (!fromUser || !text) return;

    const mensajeObj = {
      user: fromUser,
      text: text,
      timestamp: new Date(),
    };

    try {
      // Guardar el mensaje para TODOS los usuarios que tengan una cuenta (Chat Global)
      // Esto asegura que cuando Laura entre, vea lo que escribió Santi
      await User.updateMany(
        {}, 
        { 
          $push: { 
            conversations: { 
              $each: [], // Truco para asegurar que la estructura existe
            } 
          } 
        }
      );

      // Lógica simplificada: Actualizamos al emisor y emitimos a todos
      const sender = await User.findOne({ username: fromUser });
      let conv = sender.conversations.find(c => c.withUser === "General");
      
      if (!conv) {
        sender.conversations.push({ withUser: "General", messages: [mensajeObj] });
      } else {
        conv.messages.push(mensajeObj);
      }
      
      await sender.save();

      // 🔥 ESTA ES LA CLAVE: Enviamos el mensaje a todos los clientes conectados AHORA
      console.log(`[Mensaje] ${fromUser}: ${text}`);
      io.emit("mensaje", mensajeObj); 

    } catch (error) {
      console.error("Error al procesar mensaje:", error);
    }
  });

  socket.on("disconnect", () => {
    const username = usuarios[socket.id];
    delete usuarios[socket.id];
    io.emit("usuarios-conectados", Object.values(usuarios));
    console.log(`Usuario desconectado: ${username}`);
  });
});

server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));