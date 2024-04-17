const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recepient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String },
    file: { type: String },
}, { timestamps: true })

const MessageModel = mongoose.model('Messages', userSchema);

module.exports = MessageModel;