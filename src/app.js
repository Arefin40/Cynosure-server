const express = require("express");
const cors = require("cors");

const app = express();

// middlewares
app.use(
   cors({
      origin: [
         "http://localhost:5173",
         "https://sa-cynosure.web.app",
         "https://sa-cynosure.firebaseapp.com",
      ],
      credentials: true,
   })
);
app.use(express.json());

(async () => {
   app.get("/", async (req, res) => {
      res.send("Server is running");
   });
})();

module.exports = app;
