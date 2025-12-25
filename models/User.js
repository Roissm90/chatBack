const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema({
  withUser: { type: String, required: true },
  messages: [MessageSchema],
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true }, // QUITADO unique: true
  email: { type: String, required: true, unique: true, lowercase: true }, 
  password: {
    type: String, 
    required: true,
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    validate: {
      validator: function(value) {
        // REGEX de una letra, un número y un carácter especial
        return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/.test(value);
      },
      message: 'La contraseña debe contener al menos una letra, un número y un carácter especial.'
    }
  },
  conversations: [ConversationSchema],
});

module.exports = mongoose.model("User", UserSchema);
