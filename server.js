const express = require("express");
const mongoose = require("mongoose");
const flash = require("connect-flash");
const nocache = require("nocache");
const session = require("express-session");
const userRoutes = require("./Routes/userRoutes");
const adminRoutes = require('./Routes/adminRoutes');
const passport = require("./middleware/passportOAuth");
const path = require('path')
const app = express();   


require("dotenv").config();
const port = process.env.PORT || 3000;
const mongoDB = process.env.DBURL;

const connectDB = async () => {
  try {
    await mongoose.connect(mongoDB);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
  }
};
connectDB();

app.set("view engine", "ejs");
app.set('views',[path.join(__dirname,"views/auth") , path.join(__dirname , "views/admin") , path.join(__dirname,"views/user")]);

app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  next();
});

app.use(nocache());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("./public"));

app.use("/", userRoutes);
app.use("/", adminRoutes); 

app.get("*", (req, res) => {
  res.redirect("/not-found");
});

app.listen(port, () => {
  console.log(`server running on http://127.0.0.1:${port}`);
});

