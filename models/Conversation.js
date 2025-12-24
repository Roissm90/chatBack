const mongoose = require("mongoose");
const MessageSchema = require("./Message");

const ConversationSchema = new mongoose.Schema({
  withUser: { type: String, required: true },
  messages: [MessageSchema],
});

module.exports = ConversationSchema;
