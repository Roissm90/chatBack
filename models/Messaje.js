const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  user: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  visto: { type: Boolean, default: false } // Usamos 'visto' para coincidir con tu server
});

module.exports = mongoose.model("Message", MessageSchema);