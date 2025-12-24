const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ MongoDB Conectado"));

const usuariosConectados = {}; // { mongoId: socketId }

io.on("connection", (socket) => {
  
  socket.on("join", async ({ username }) => {
    try {
      let user = await User.findOne({ username });
      if (!user) user = await User.create({ username, conversations: [] });

      // Mapeamos el ID de usuario al socket actual
      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;

      socket.emit("init-session", { userId: user._id.toString() });

      // Enviamos TODAS las conversaciones que tiene este usuario (su "bandeja de entrada")
      // Esto incluye con quién ha hablado, aunque el otro esté offline
      socket.emit("mis-conversaciones", user.conversations);

      // Enviamos lista de usuarios globales para iniciar nuevos chats
      const todos = await User.find({}, "username _id");
      io.emit("lista-usuarios-global", todos);

    } catch (e) { console.error(e); }
  });

  // Cargar mensajes de un chat específico
  socket.on("get-chat", async ({ withUserId }) => {
    try {
      const user = await User.findById(socket.mongoId);
      const conv = user.conversations.find(c => c.withUser === withUserId);
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
      // GUARDAR EN AMBOS (Remitente y Destinatario)
      const participantes = [socket.mongoId, toUserId];
      
      for (const id of participantes) {
        const targetId = (id === socket.mongoId) ? toUserId : socket.mongoId;
        
        await User.findByIdAndUpdate(id, {
          $push: { "conversations": { withUser: targetId, messages: [] } }
        }).catch(() => {}); // Evita error si ya existe

        const persona = await User.findById(id);
        let c = persona.conversations.find(conv => conv.withUser === targetId);
        
        if (!c) {
          persona.conversations.push({ withUser: targetId, messages: [mensajeObj] });
        } else {
          c.messages.push(mensajeObj);
        }
        await persona.save();
      }

      // ENVIAR EN TIEMPO REAL
      // Al emisor siempre
      socket.emit("mensaje", mensajeObj);
      
      // Al receptor solo si está online
      const receptorSocketId = usuariosConectados[toUserId];
      if (receptorSocketId) {
        io.to(receptorSocketId).emit("mensaje", mensajeObj);
      }
    } catch (e) { console.error(e); }
  });

  socket.on("disconnect", () => {
    if (socket.mongoId) delete usuariosConectados[socket.mongoId];
  });
});

server.listen(process.env.PORT || 10000);