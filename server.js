const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
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
  socket.on("join", async ({ username, email, password }) => {
    try {
      if (!email || !username || !password) {
        return socket.emit("user-error", "Todos los campos son obligatorios.");
      }

      const cleanEmail = email.toLowerCase().trim();
      const cleanUsername = username.trim();

      // Buscamos por email y por alias por separado para validar
      let userByEmail = await User.findOne({ email: cleanEmail });
      let userByUsername = await User.findOne({ username: cleanUsername });

      let user;

      if (userByEmail) {
        // CASO 1: El email ya existe
        if (userByEmail.username !== cleanUsername) {
          return socket.emit(
            "user-error",
            "Este email ya pertenece a otro alias."
          );
        }

        // Verificamos contraseña
        const esValida = await bcrypt.compare(password, userByEmail.password);
        if (!esValida) {
          return socket.emit("user-error", "Contraseña incorrecta.");
        }
        user = userByEmail;
      } else if (userByUsername) {
        // CASO 2: El email no existe pero el ALIAS SÍ (error de coincidencia)
        return socket.emit(
          "user-error",
          "Este alias ya está registrado con otro email."
        );
      } else {
        // CASO 3: Usuario nuevo (ni email ni alias existen)
        try {
          // Validamos formato antes de encriptar
          const passRegex =
            /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

          if (!passRegex.test(password)) {
            return socket.emit(
              "user-error",
              "La contraseña debe tener al menos 6 caracteres, una letra, un número y un símbolo (@$!%*?&)."
            );
          }

          const salt = await bcrypt.genSalt(10);
          const passwordHasheada = await bcrypt.hash(password, salt);

          user = new User({
            username: cleanUsername,
            email: cleanEmail,
            password: passwordHasheada,
            conversations: [],
          });

          await user.save({ validateBeforeSave: false });
        } catch (validationError) {
          if (validationError.errors && validationError.errors.password) {
            return socket.emit(
              "user-error",
              validationError.errors.password.message
            );
          }
          throw validationError;
        }
      }

      // LOGIN EXITOSO
      usuariosConectados[user._id.toString()] = socket.id;
      socket.mongoId = user._id.toString();
      socket.username = user.username;

      socket.emit("init-session", {
        userId: user._id.toString(),
        tempName: user.username,
        tempEmail: user.email,
      });

      const lista = await User.find({}, "username _id");
      io.emit("lista-usuarios-global", lista);
    } catch (e) {
      console.log("Error:", e);
      socket.emit("user-error", "Error interno en el servidor.");
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

        let c = persona.conversations.find(
          (conv) => conv.withUser === targetId
        );
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
