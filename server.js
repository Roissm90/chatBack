const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error:", err));

const usuariosConectados = {}; // { mongoId: socketId }

io.on("connection", (socket) => {
  
  socket.on("join", async ({ username }) => {
    try {
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username, conversations: [] });
      }

      // Guardamos quién está online
      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;

      socket.emit("init-session", { userId: user._id.toString() });

      // Enviamos a todos la lista de usuarios registrados para que puedan iniciar chats
      const todos LosUsuarios = await User.find({}, "username _id");
      io.emit("lista-usuarios-global", todosLosUsuarios);

    } catch (e) { console.error("Error en join:", e); }
  });

  // Cargar mensajes de una conversación específica (TIPO WHATSAPP)
  socket.on("get-chat", async ({ withUserId }) => {
    try {
      const user = await User.findById(socket.mongoId);
      const conv = user.conversations.find(c => c.withUser === withUserId);
      // Si no hay conversación previa, enviamos array vacío
      socket.emit("historial", conv ? conv.messages : []);
    } catch (e) { console.error(e); }
  });

  socket.on("mensaje", async ({ text, toUserId }) => {
    if (!socket.mongoId || !toUserId) return;

    const mensajeObj = {
      user: socket.username,
      text,
      timestamp: new Date()
    };

    try {
      // GUARDAR EN AMBOS USUARIOS (LA CLAVE DE LA PERSISTENCIA)
      const participantes = [socket.mongoId, toUserId];
      
      for (const id of participantes) {
        const targetId = (id === socket.mongoId) ? toUserId : socket.mongoId;
        
        const persona = await User.findById(id);
        if (!persona) continue;

        let c = persona.conversations.find(conv => conv.withUser === targetId);
        
        if (!c) {
          persona.conversations.push({ withUser: targetId, messages: [mensajeObj] });
        } else {
          c.messages.push(mensajeObj);
        }
        await persona.save();
      }

      // ENVIAR EN TIEMPO REAL
      socket.emit("mensaje", mensajeObj); // Al que envía
      
      const receptorSocketId = usuariosConectados[toUserId];
      if (receptorSocketId) {
        io.to(receptorSocketId).emit("mensaje", mensajeObj); // Al receptor si está online
      }
    } catch (e) { console.error(e); }
  });

  socket.on("disconnect", () => {
    if (socket.mongoId) delete usuariosConectados[socket.mongoId];
  });
});

server.listen(process.env.PORT || 10000, () => console.log("Servidor listo"));