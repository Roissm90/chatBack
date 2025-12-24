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
  .then(() => console.log("✅ MongoDB Conectado"))
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

      // Enviamos la lista de todos los usuarios registrados
      const todosLosUsuarios = await User.find({}, "username _id");
      io.emit("lista-usuarios-global", todosLosUsuarios);

    } catch (e) { console.error("Error join:", e); }
  });

  socket.on("get-chat", async ({ withUserId }) => {
    try {
      if (!socket.mongoId) return;
      const user = await User.findById(socket.mongoId);
      const conv = user.conversations.find(c => c.withUser === withUserId);
      socket.emit("historial", conv ? conv.messages : []);
    } catch (e) { console.error(e); }
  });

  socket.on("mensaje", async ({ text, toUserId }) => {
    if (!socket.mongoId || !toUserId || !text) return;

    const mensajeObj = {
      user: socket.username,
      text: text,
      timestamp: new Date()
    };

    try {
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

      socket.emit("mensaje", mensajeObj);
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));