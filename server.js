const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

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
  .catch((err) => console.error("❌ Error de conexión:", err));

app.get("/", (req, res) => res.send("Servidor funcionando"));

// Memoria para usuarios conectados: { socketId: { username, mongoId } }
const usuariosActivos = {};

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("join", async ({ username }) => {
    try {
      let user = await User.findOne({ username });
      if (!user) {
        user = await User.create({ 
          username, 
          conversations: [{ withUser: "General", messages: [] }] 
        });
      }

      // Guardamos la info del usuario vinculada a su socket
      usuariosActivos[socket.id] = { 
        username: user.username, 
        mongoId: user._id.toString() 
      };

      // 1. Enviamos el ID propio al cliente
      socket.emit("init-session", { userId: user._id.toString() });

      // 2. Enviamos historial "General" por defecto al entrar
      const convGeneral = user.conversations.find(c => c.withUser === "General");
      socket.emit("historial", convGeneral ? convGeneral.messages : []);

      // 3. Enviamos lista de usuarios (objetos con nombre e ID)
      const listaParaEnviar = Object.values(usuariosActivos);
      io.emit("usuarios-conectados", listaParaEnviar);

    } catch (error) {
      console.error("Error en join:", error);
    }
  });

  // NUEVO: Cargar historial específico entre dos personas
  socket.on("get-private-history", async ({ otherUserId }) => {
    const me = usuariosActivos[socket.id];
    if (!me) return;
    try {
      const user = await User.findById(me.mongoId);
      const conv = user.conversations.find(c => c.withUser === otherUserId);
      socket.emit("historial", conv ? conv.messages : []);
    } catch (e) { console.error(e); }
  });

  socket.on("mensaje", async ({ text, toUserId }) => {
    const fromUser = usuariosActivos[socket.id];
    if (!fromUser || !text) return;

    const target = toUserId || "General";
    const mensajeObj = {
      user: fromUser.username,
      text: text,
      timestamp: new Date(),
    };

    try {
      if (target === "General") {
        // Chat Grupal: Guardar en todos los que tengan la sala General
        await User.updateMany(
          { "conversations.withUser": "General" },
          { $push: { "conversations.$.messages": mensajeObj } }
        );
        io.emit("mensaje", mensajeObj);
      } else {
        // Chat Privado: Guardar en emisor y receptor
        const ids = [fromUser.mongoId, target];
        for (const id of ids) {
          const recipientOfThisRecord = (id === fromUser.mongoId) ? target : fromUser.mongoId;
          
          const persona = await User.findById(id);
          if (!persona) continue;

          let c = persona.conversations.find(conv => conv.withUser === recipientOfThisRecord);
          if (!c) {
            persona.conversations.push({ withUser: recipientOfThisRecord, messages: [mensajeObj] });
          } else {
            c.messages.push(mensajeObj);
          }
          await persona.save();
        }

        // Emitir solo a los dos implicados
        const receptorSocket = Object.keys(usuariosActivos).find(
          k => usuariosActivos[k].mongoId === target
        );
        
        socket.emit("mensaje", mensajeObj); // Al emisor
        if (receptorSocket) {
          io.to(receptorSocket).emit("mensaje", mensajeObj); // Al receptor
        }
      }
    } catch (error) {
      console.error("Error en mensaje:", error);
    }
  });

  socket.on("disconnect", () => {
    delete usuariosActivos[socket.id];
    io.emit("usuarios-conectados", Object.values(usuariosActivos));
  });
});

server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));