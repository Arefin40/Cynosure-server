const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { ObjectId } = require("mongodb");
const { connectToDB } = require("../db/database");

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
app.use(cookieParser());

// token verification middleware
const verifyToken = (req, res, next) => {
   const token = req.cookies?.token;
   if (!token) return res.status(401).send({ message: "unauthorized access" });

   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) return res.status(401).send({ message: "unauthorized access" });
      req.user = decoded;
      next();
   });
};

(async () => {
   // ======== TOKEN ========
   const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
   };

   // generate json web token
   app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
         expiresIn: "7d",
      });
      res.cookie("token", token, cookieOptions).send({ success: true, token });
   });

   // Clear token on logout
   app.get("/logout", (req, res) => {
      res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).send({
         success: true,
      });
   });

   app.get("/", async (req, res) => {
      res.send("Server is running");
   });
})();

module.exports = app;
