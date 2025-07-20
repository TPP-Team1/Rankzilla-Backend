const { DataTypes } = require("sequelize");
const db = require("../db");

const PollAccess = db.define("pollAccess", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  pollId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'pollId'], // ensure each access is only tracked once
    },
  ],
});

module.exports = PollAccess;
