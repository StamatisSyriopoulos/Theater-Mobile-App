const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

// ================= MIDDLEWARE =================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// ================= TEST =================
app.get("/", (req, res) => {
  res.send("API is running");
});

// ================= USERS =================

// Register
app.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

  db.query(sql, [name, email, password], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error registering user");
    }
    res.send("User registered successfully");
  });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";

  db.query(sql, [email, password], (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error logging in");
    }

    if (results.length === 0) {
      return res.status(401).send("Invalid credentials");
    }

    res.json(results[0]);
  });
});

// ================= THEATRES =================

app.get("/theatres", (req, res) => {
  db.query("SELECT * FROM theatres", (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error fetching theatres");
    }
    res.json(results);
  });
});

app.post("/theatres", (req, res) => {
  const { name, location, description } = req.body;

  const sql = "INSERT INTO theatres (name, location, description) VALUES (?, ?, ?)";

  db.query(sql, [name, location, description], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error adding theatre");
    }
    res.send("Theatre added successfully");
  });
});

// ================= SHOWS =================

app.get("/shows", (req, res) => {
  const { theatreId } = req.query;

  let sql = "SELECT * FROM shows";
  let params = [];

  if (theatreId) {
    sql += " WHERE theatre_id = ?";
    params.push(theatreId);
  }

  db.query(sql, params, (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error fetching shows");
    }
    res.json(results);
  });
});

app.post("/shows", (req, res) => {
  const { theatre_id, title, description, duration } = req.body;

  const sql = "INSERT INTO shows (theatre_id, title, description, duration) VALUES (?, ?, ?, ?)";

  db.query(sql, [theatre_id, title, description, duration], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error adding show");
    }
    res.send("Show added successfully");
  });
});

// ================= SHOWTIMES =================

// 🔥 ADVANCED SHOWTIMES (WITH AVAILABLE SEATS)
app.get("/showtimes", (req, res) => {
  const { showId } = req.query;

  const sql = `
    SELECT 
      s.showtime_id,
      s.show_id,
      s.date,
      s.time,
      s.capacity,
      IFNULL(SUM(r.seats), 0) AS booked,
      (s.capacity - IFNULL(SUM(r.seats), 0)) AS available
    FROM showtimes s
    LEFT JOIN reservations r ON s.showtime_id = r.showtime_id
    WHERE s.show_id = ?
    GROUP BY s.showtime_id
  `;

  db.query(sql, [showId], (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error fetching showtimes");
    }
    res.json(results);
  });
});

// Add showtime
app.post("/showtimes", (req, res) => {
  const { show_id, date, time, capacity } = req.body;

  const sql = `
    INSERT INTO showtimes (show_id, date, time, capacity)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [show_id, date, time, capacity || 50], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error adding showtime");
    }
    res.send("Showtime added successfully");
  });
});

// ================= RESERVATIONS =================

// 🔥 SAFE BOOKING (NO OVERBOOKING)
app.post("/reservations", (req, res) => {
  const { user_id, showtime_id, seats } = req.body;

  const checkSql = `
    SELECT 
      s.capacity,
      IFNULL(SUM(r.seats), 0) AS booked
    FROM showtimes s
    LEFT JOIN reservations r ON s.showtime_id = r.showtime_id
    WHERE s.showtime_id = ?
    GROUP BY s.showtime_id
  `;

  db.query(checkSql, [showtime_id], (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error checking availability");
    }

    if (results.length === 0) {
      return res.status(404).send("Showtime not found");
    }

    const available = results[0].capacity - results[0].booked;

    if (seats > available) {
      return res.status(400).send("Not enough seats available");
    }

    const insertSql = `
      INSERT INTO reservations (user_id, showtime_id, seats)
      VALUES (?, ?, ?)
    `;

    db.query(insertSql, [user_id, showtime_id, seats], (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send("Error booking");
      }
      res.send("Reservation successful");
    });
  });
});

// 🔥 FIXED RESERVATIONS (NO UNKNOWN)
app.get("/user/reservations/:user_id", (req, res) => {
  const { user_id } = req.params;

  const sql = `
    SELECT 
      r.reservation_id,
      r.seats,
      s.date,
      s.time,
      sh.title
    FROM reservations r
    LEFT JOIN showtimes s ON r.showtime_id = s.showtime_id
    LEFT JOIN shows sh ON s.show_id = sh.show_id
    WHERE r.user_id = ?
  `;

  db.query(sql, [user_id], (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error fetching reservations");
    }
    res.json(results);
  });
});

// Delete reservation
app.delete("/reservations/:id", (req, res) => {
  const { id } = req.params;

  const sql = "DELETE FROM reservations WHERE reservation_id = ?";

  db.query(sql, [id], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error deleting reservation");
    }
    res.send("Reservation deleted successfully");
  });
});

// ================= START SERVER =================
app.listen(3000, () => {
  console.log("🚀 Server started on port 3000");
});