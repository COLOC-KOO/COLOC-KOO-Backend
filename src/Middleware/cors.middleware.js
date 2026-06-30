const cors = require("cors");
require("dotenv").config();

const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(origin => origin.trim())
    : [];

const corsOptions = {
    origin: (origin, callback) => {
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS non autorisé pour : ${origin}`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
};

module.exports = cors(corsOptions);