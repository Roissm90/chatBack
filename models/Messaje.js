const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Number, required: true },
});

module.exports = mongoose.model("Message", MessageSchema);
