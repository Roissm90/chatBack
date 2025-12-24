const mongoose = require("mongoose");
const ConversationSchema = require("./Conversation");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  conversations: [ConversationSchema],
});

module.exports = mongoose.model("User", UserSchema);
