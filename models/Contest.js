const mongoose = require("mongoose");
let Schema = mongoose.Schema;

let userSchema = new Schema({
    username: String,
    picture: String,
    merged_prs: [String],
    open_prs: [String],
    closed_prs: [String]
});

let contestSchema = new Schema({
    key: String,
    open_prs_cursor: String,
    closed_prs_cursor: String,
    merged_prs_cursor: String,
    users: Object,
    processing: Boolean,
    status: String
});

module.exports = mongoose.model("Contest", contestSchema);
