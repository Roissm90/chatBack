const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Atlas Conectado"))
  .catch((err) => console.error("❌ Error Mongo:", err));

const usuariosConectados = {};

io.on("connection", (socket) => {
  socket.on("join", async ({ username, email }) => {
    try {
      if (!email || !username) return;

      const cleanEmail = email.toLowerCase().trim();
      const cleanUsername = username.trim();

      // 1. Buscamos por EMAIL únicamente
      let user = await User.findOne({ email: cleanEmail });

      if (user) {
        // 2. Si el email ya existe, validamos que el alias sea el correcto
        if (user.username !== cleanUsername) {
          return socket.emit(
            "user-error",
            "Este email ya pertenece a otro alias. Usa tu nombre original."
          );
        }
      } else {
        // 3. Si el email no existe, creamos el usuario.
        // Aquí NO comprobamos si el username existe, permitiendo que se repitan.
        user = await User.create({ 
          username: cleanUsername, 
          email: cleanEmail, 
          conversations: [] 
        });
      }

      // Procedemos con la sesión
      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;

      socket.emit("init-session", { userId: user._id.toString() });

      const lista = await User.find({}, "username _id");
      io.emit("lista-usuarios-global", lista);
    } catch (e) {
      console.log("Error en Join:", e);
    }
  });

  socket.on("get-chat", async ({ withUserId }) => {
    try {
      if (!socket.mongoId) return;
      const user = await User.findById(socket.mongoId);
      const conv = user.conversations.find((c) => c.withUser === withUserId);
      socket.emit("historial", conv ? conv.messages : []);
    } catch (e) {
      console.log(e);
    }
  });

  socket.on("mensaje", async ({ text, toUserId }) => {
    if (!socket.mongoId || !toUserId || !text) return;

    const mensajeObj = {
      user: socket.username,
      text,
      timestamp: new Date(),
    };

    try {
      for (let id of [socket.mongoId, toUserId]) {
        const targetId = id === socket.mongoId ? toUserId : socket.mongoId;
        const persona = await User.findById(id);
        if (!persona) continue;

        let c = persona.conversations.find((conv) => conv.withUser === targetId);
        if (!c) {
          persona.conversations.push({
            withUser: targetId,
            messages: [mensajeObj],
          });
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
    } catch (e) {
      console.log(e);
    }
  });

  socket.on("disconnect", () => {
    if (socket.mongoId) delete usuariosConectados[socket.mongoId];
  });

  socket.on("reset-all-chats", async () => {
    try {
      await User.updateMany({}, { $set: { conversations: [] } });
      console.log("✅ Chats reseteados");
    } catch (e) {
      console.log("Error reset:", e);
    }
  });
});

server.listen(process.env.PORT || 10000);