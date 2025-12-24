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
  .then(() => console.log("✅ Atlas Conectado"))
  .catch(err => console.error("❌ Error Mongo:", err));

const usuariosConectados = {}; 

io.on("connection", (socket) => {
  
  socket.on("join", async ({ username }) => {
    try {
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ username, conversations: [] });
      }

      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;

      socket.emit("init-session", { userId: user._id.toString() });

      const lista = await User.find({}, "username _id");
      io.emit("lista-usuarios-global", lista);
    } catch (e) { console.log(e); }
  });

  socket.on("get-chat", async ({ withUserId }) => {
    try {
      if (!socket.mongoId) return;
      const user = await User.findById(socket.mongoId);
      const conv = user.conversations.find(c => c.withUser === withUserId);
      socket.emit("historial", conv ? conv.messages : []);
    } catch (e) { console.log(e); }
  });

  socket.on("mensaje", async ({ text, toUserId }) => {
    if (!socket.mongoId || !toUserId || !text) return;

    const mensajeObj = {
      user: socket.username,
      text,
      timestamp: new Date()
    };

    try {
      // Guardar en ambos (Remitente y Destinatario)
      for (let id of [socket.mongoId, toUserId]) {
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

      // Enviar
      socket.emit("mensaje", mensajeObj);
      const receptorSocketId = usuariosConectados[toUserId];
      if (receptorSocketId) {
        io.to(receptorSocketId).emit("mensaje", mensajeObj);
      }
    } catch (e) { console.log(e); }
  });

  socket.on("disconnect", () => {
    if (socket.mongoId) delete usuariosConectados[socket.mongoId];
  });
});

server.listen(process.env.PORT || 10000);