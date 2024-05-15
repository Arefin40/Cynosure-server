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
   const db = await connectToDB();

   // Collections
   const roomsCollection = await db.collection("rooms");
   const bookingsCollection = await db.collection("bookings");
   const discountsCollection = await db.collection("discounts");

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

   // ======== Root api ========
   app.get("/", async (req, res) => {
      res.send("Server is running");
   });

   // ======== Rooms ========
   // add new room
   app.post("/rooms", async (req, res) => {
      const result = await roomsCollection.insertOne(req.body);
      res.send(result);
   });

   // get all rooms information
   app.get("/rooms", async (req, res) => {
      const rooms = await roomsCollection.find(req.query).toArray();
      res.send(rooms);
   });

   // get single room information
   app.get("/rooms/:id", async (req, res) => {
      const token = req.cookies?.token;

      let room = await roomsCollection.findOne({
         _id: new ObjectId(req.params.id),
      });

      if (!room) res.send(null);

      // attach offer data if applicable
      if (room.specialOffer !== "nil") {
         const discount = await discountsCollection.findOne({
            _id: new ObjectId(room.specialOffer),
         });
         room.specialOffer = discount;
      }

      room["bookingStatus"] = room.bookingId === "nil" ? "available" : "unavailable";

      delete room.bookingId;

      res.send(room);
   });

   // update room information
   app.patch("/rooms/:id", async (req, res) => {
      const result = await roomsCollection.updateOne(
         { _id: new ObjectId(req.params.id) },
         { $set: req.body }
      );
      res.send({ response: result, updated: req.body });
   });

   // ======== Discount ========
   // add new discount
   app.post("/discounts", async (req, res) => {
      const result = await discountsCollection.insertOne(req.body);
      res.send(result);
   });

   // get all discounts information
   app.get("/discounts", async (req, res) => {
      const discounts = await discountsCollection.find(req.query).toArray();
      res.send(discounts);
   });

   // get single discount information
   app.get("/discounts/:id", async (req, res) => {
      const discount = await discountsCollection.findOne({
         _id: new ObjectId(req.params.id),
      });
      res.send(discount);
   });

   // ======== Bookings ========
   // book a room
   app.post("/bookings", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;

      if (tokenEmail !== req.body.bookedBy) {
         return res.status(403).send({ message: "forbidden access" });
      }

      try {
         const room = await roomsCollection.findOne({
            _id: new ObjectId(req.body.roomId),
         });

         if (room.bookingId !== "nil")
            return res.status(400).send({ message: "Room is already booked" });

         const result = await bookingsCollection.insertOne(req.body);
         await roomsCollection.updateOne(
            { _id: new ObjectId(req.body.roomId) },
            { $set: { bookingId: result.insertedId } }
         );
         res.status(201).send({ message: "Booking successful" });
      } catch (error) {
         console.log(error);
         res.status(500).send({ message: "Failed to book a room" });
      }
   });

   // get all bookings information
   app.get("/bookings/:email", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;

      if (tokenEmail !== req.params.email) {
         return res.status(403).send({ message: "forbidden access" });
      }

      let bookings = await bookingsCollection.find(req.query).toArray();
      res.send(bookings);
   });

   // update booking dates
   app.patch("/booking/:id", verifyToken, async (req, res) => {
      try {
         const booking = await bookingsCollection.findOne({
            _id: new ObjectId(req.params.id),
         });

         // Before updating, first check if the booking is bookedBy this user
         const tokenEmail = req.user.email;
         if (tokenEmail !== booking.bookedBy) {
            return res.status(403).send({ message: "forbidden access" });
         }

         await bookingsCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: req.body }
         );

         res.status(200).send({ message: "Booking dates updated successfully" });
      } catch (error) {
         console.log(error);
         res.status(500).send({ message: "Failed to update the booking dates" });
      }
   });

   // cancel a booking
   app.delete("/bookings/:id", verifyToken, async (req, res) => {
      try {
         const booking = await bookingsCollection.findOne({
            _id: new ObjectId(req.params.id),
         });

         // Before cancellation, first check if the booking is bookedBy this user
         const tokenEmail = req.user.email;
         if (tokenEmail !== booking.bookedBy) {
            return res.status(403).send({ message: "forbidden access" });
         }

         await bookingsCollection.deleteOne({
            _id: new ObjectId(req.params.id),
         });

         // make the room available for booking
         await roomsCollection.updateOne(
            { _id: new ObjectId(booking.roomId) },
            { $set: { bookingId: "nil" } }
         );

         res.status(200).send({ message: "Booking cancellation successful" });
      } catch (error) {
         console.log(error);
         res.status(500).send({ message: "Failed to cancel the booking" });
      }
   });
})();

module.exports = app;
