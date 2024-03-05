require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const { validationResult, check } = require("express-validator");
const Twilio = require("twilio");

const app = express();
const port = 3000;
app.use(express.json());

// Twilio setup

const apiKeySid = "SK547e019cc7115075d8e801dbb2b4266b";
const apiKeySecret = "DBF6V6nR2yfXgldyYTkK5nHziBEf9Lpp";
const accountSid = "AC089d06f4cc8953be85e9046e9bf28e49";
const twilioClient = new Twilio(apiKeySid, apiKeySecret, {
  accountSid: accountSid,
});
mongoose.connect("mongodb://localhost:27017/taskapp", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Root route
app.get("/", (req, res) => {
  res.send(`
      <h1>Welcome to the Task Management API!</h1>
      <p>Available Routes:</p>
      <ul>
        <li>POST /create-task</li>
        <li>POST /create-subtask</li>
        <li>GET /get-all-user-tasks</li>
        <li>GET /get-all-user-subtasks</li>
        <li>PUT /update-task/:taskId</li>
        <li>PUT /update-subtask/:subtaskId</li>
        <li>DELETE /delete-task/:taskId</li>
        <li>DELETE /delete-subtask/:subtaskId</li>
      </ul>
    `);
});

// User model
const userSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  phone_number: { type: String, required: true },
  priority: { type: Number, enum: [0, 1, 2], required: true },
});

const User = mongoose.model("User", userSchema);

// SubTask model
const subTaskSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  task_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
    required: true,
  },
  status: { type: Number, enum: [0, 1], default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date, default: null },
});

const SubTask = mongoose.model("SubTask", subTaskSchema);

// Task model
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  due_date: { type: Date, required: true },
  status: {
    type: String,
    enum: ["TODO", "IN_PROGRESS", "DONE"],
    default: "TODO",
  },
  priority: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

const Task = mongoose.model("Task", taskSchema);

app.use(bodyParser.json());

// Middleware for validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Middleware for authentication using JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);

    req.user = user;
    next();
  });
};
let subTasks = [];
let tasks = [];
let users = [
  { id: 1, phone_number: "1234567890", priority: 0 },
  { id: 2, phone_number: "9876543210", priority: 1 },
];

// Login API to generate JWT token
app.post("/api/login", handleValidationErrors, (req, res) => {
  const { phone_number, priority } = req.body;

  const user = users.find(
    (u) => u.phone_number === phone_number && u.priority === priority
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { user_id: user.id, priority: user.priority },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

// API to create task
app.post("/api/tasks", authenticateToken, async (req, res) => {
  const { title, description, due_date } = req.body;

  // Validation
  if (!title || !description || !due_date) {
    return res
      .status(400)
      .json({ error: "Title, description, and due_date are required" });
  }

  const createdTask = {
    id: tasks.length + 1,
    user_id: req.user.id,
    title,
    description,
    due_date,
    priority: 0,
    status: "TODO",
    created_at: new Date().toISOString(),
    updated_at: null,
    deleted_at: null,
  };

  tasks.push(createdTask);

  console.log("Created Task:", createdTask); // Logging statement

  res.json({ message: "Task created successfully", taskId: createdTask.id });
});

// API to get latest task ID for a user
app.get("/api/latest-task-id", authenticateToken, (req, res) => {
  // Replace this with your actual task retrieval logic
  const latestTask = tasks
    .filter((task) => task.user_id === req.user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (!latestTask) {
    return res.status(404).json({ error: "No tasks found for the user" });
  }

  console.log("Retrieved Latest Task:", latestTask); // Logging statement

  res.json({ latestTaskId: latestTask.id });
});

// API to create subtask for a task
app.post("/api/subtasks/:taskId", authenticateToken, async (req, res) => {
  const { status } = req.body;
  const { taskId } = req.params;

  // Validation
  if (!status || !taskId) {
    return res.status(400).json({ error: "Status and taskId are required" });
  }

  // Check if the task with the given taskId exists
  const task = tasks.find((task) => task.id === parseInt(taskId));

  if (!task) {
    console.error("Task not found for taskId:", taskId);
    return res.status(404).json({ error: "Task not found" });
  }

  const subTask = {
    id: subTasks.length + 1, // Adjust this logic based on your subtask creation logic
    task_id: task.id,
    status: status,
    created_at: new Date().toISOString(),
    updated_at: null,
    deleted_at: null,
  };

  console.log("Created Subtask:", subTask);

  res.json({ message: "Subtask created successfully", subTask });
});

// API to get all user tasks
app.get("/api/tasks", authenticateToken, (req, res) => {
  const { priority, due_date, page, per_page } = req.query;

  // Filter tasks based on priority, due_date, and pagination
  let filteredTasks = tasks;

  if (priority !== undefined) {
    filteredTasks = filteredTasks.filter(
      (task) => task.priority === parseInt(priority)
    );
  }

  if (due_date !== undefined) {
    filteredTasks = filteredTasks.filter((task) => task.due_date === due_date);
  }

  const startIndex = (page - 1) * per_page;
  const endIndex = startIndex + per_page;
  const paginatedTasks = filteredTasks.slice(startIndex, endIndex);

  if (paginatedTasks.length > 0) {
    res.json({ tasks: paginatedTasks, total: filteredTasks.length });
  } else {
    // Handle the case when there are no tasks
    res.json({ tasks: [], total: 0 });
  }
});

//  Update subtask API
app.put("/update-subtask/:subtaskId", authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const subtaskId = req.params.subtaskId;

    const subTask = await SubTask.findByIdAndUpdate(
      subtaskId,
      { status },
      { new: true }
    );

    res.status(200).send(subTask);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Delete task (soft deletion) API
app.delete("/delete-task/:taskId", authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.taskId;

    const task = await Task.findByIdAndUpdate(
      taskId,
      { deleted: true },
      { new: true }
    );

    // Soft delete corresponding subtasks
    await SubTask.updateMany({ task_id: taskId }, { deleted_at: Date.now() });

    res.status(200).send(task);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Delete subtask (soft deletion) API
app.delete(
  "/delete-subtask/:subtaskId",
  authenticateToken,
  async (req, res) => {
    try {
      const subtaskId = req.params.subtaskId;

      const subTask = await SubTask.findByIdAndUpdate(
        subtaskId,
        { deleted_at: Date.now() },
        { new: true }
      );

      res.status(200).send(subTask);
    } catch (error) {
      res.status(500).send(error.message);
    }
  }
);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
