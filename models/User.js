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
  username: { type: String, required: true, unique: true },
  conversations: [ConversationSchema],
});

module.exports = mongoose.model("User", UserSchema);
