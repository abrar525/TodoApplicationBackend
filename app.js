const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "todoApplication.db");
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    });

    await database.run(`
      CREATE TABLE IF NOT EXISTS Todos (
        id CHAR(36) PRIMARY KEY,
        userId VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        status TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await database.run(`
    CREATE TABLE IF NOT EXISTS Users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email VARCHAR(250) NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

    app.listen(9002, () => {
      console.log("Server is running on port 9002");
    });
  } catch (err) {
    console.log(`DB Error: ${err.message}`);
  }
};

initializeDbAndServer();

const middleWare = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.userId = payload.userId;
        console.log(payload.userId);
        next();
      }
    });
  }
};

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const registerQuery =
      "INSERT INTO Users (name, email, password) VALUES (?, ?, ?)";
    const values = [name, email, hashedPassword];
    await database.run(registerQuery, values);
    res.json({ message: "Data Inserted" });
  } catch (err) {
    res.json({ message: err.message });
  }
});

app.get("/users", async (req, res) => {
  const userQuery = `SELECT * FROM Users`;
  const response = await database.all(userQuery);
  res.send(response);
});

app.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const userQuery = `SELECT * FROM Users WHERE id = ${id}`;
  const userResponse = await database.get(userQuery);
  res.json({ userDetails: userResponse });
  // .then(() => res.json({ UserDetails: userQuery }))
  // .catch((err) => res.json({ message: err.message }));
});

app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  const requestUserQuery = `UPDATE Users SET name = '${name}',email = '${email}' WHERE id = '${id}'`;

  await database.run(requestUserQuery);

  res.json({ message: "User Details Updated" });
});

app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  const requestUserQuery = `DELETE FROM Users WHERE id = '${id}'`;

  await database.run(requestUserQuery);

  res.json({ message: "User Details Deleted" });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const dbUser = `SELECT * FROM Users WHERE email = '${email}'`;
  const response = await database.get(dbUser);

  if (response === undefined) {
    res.status(401).json({ message: "User Not Found" });
  } else {
    const comparePassword = await bcrypt.compare(password, response.password);
    if (comparePassword) {
      const payload = {
        userId: response.id,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      res.status(200).json({ jwtToken });
    } else {
      res.status(400).json({ message: "Password Didn't Match" });
    }
  }
});

//Todos API

app.post("/todos", middleWare, async (req, res) => {
  const { userId } = req;
  const { id, title, status } = req.body;
  const todosQuery = `SELECT * FROM Todos WHERE title = '${title}' AND userId = '${userId}'`;

  const todosResponse = await database.get(todosQuery);

  if (todosResponse === undefined) {
    const insertQuery = `INSERT INTO Todos(id,userId,title,status) VALUES('${id}','${userId}','${title}','${status}')`;
    await database.run(insertQuery);
    res.json({ message: "Todo Created Successfully" });
  } else {
    res.json({ message: "Todo Already Exists" });
  }
});

app.get("/todosList", middleWare, async (req, res) => {
  const { userId } = req;
  const todosGetQuery = `SELECT * FROM Todos WHERE userId = '${userId}'`;
  const todosResponse = await database.all(todosGetQuery);
  res.send(todosResponse);
});

app.put("/todosList/:id", middleWare, async (req, res) => {
  const { userId } = req;
  const { title, status } = req.body;
  const { id } = req.params;
  const particularUserQuery = `SELECT * FROM Todos WHERE userId = '${userId}' AND id = '${id}'`;
  const particularQuery = await database.get(particularUserQuery);

  if (particularQuery !== undefined) {
    const todosUpdateQuery = `UPDATE Todos SET title = '${title}',status = '${status}' WHERE id = '${id}' AND userId = '${userId}'`;
    await database.run(todosUpdateQuery);
    res.json({ message: "Todo Updated Succesfully" });
  } else {
    res.json({ message: "Todo Item Not Exists" });
  }
});

app.delete("/todosList/:id", middleWare, async (req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const particularUserQuery = `SELECT * FROM Todos WHERE userId = '${userId}' AND id = '${id}'`;
  const particularQuery = await database.get(particularUserQuery);

  if (particularQuery !== undefined) {
    const todosUpdateQuery = `DELETE FROM Todos WHERE id = '${id}' AND userId = '${userId}'`;
    await database.run(todosUpdateQuery);
    res.json({ message: "Todo Deleted Succesfully" });
  } else {
    res.json({ message: "Todo Item Not Exists" });
  }
});

app.delete("/deleteList", middleWare, async (req, res) => {
  const { userId } = req;
  try {
    const deleteQuery = `DELETE FROM Todos WHERE userId = ?`;
    await database.run(deleteQuery, [userId]);

    res.status(200).json({ message: "Todos deleted successfully" });
  } catch (error) {
    console.error("Error deleting todos:", error);
    res.status(500).json({ error: "Failed to delete todos" });
  }
});

app.post("/saveTodo", middleWare, async (req, res) => {
  const { userId } = req;
  const todosList = req.body;

  console.log(todosList);

  try {
    const savePromises = todosList.map(async (eachItem) => {
      const saveQuery = `INSERT INTO Todos(id, userId, title, status) VALUES(?, ?, ?, ?)`;
      const saveValues = [eachItem.id, userId, eachItem.title, eachItem.status];
      await database.run(saveQuery, saveValues);
    });

    await Promise.all(savePromises);

    res.status(200).json({ message: "Todos saved successfully" });
  } catch (error) {
    console.error("Error saving todos:", error);
    res.status(500).json({ error: "Failed to save todos" });
  }
});
