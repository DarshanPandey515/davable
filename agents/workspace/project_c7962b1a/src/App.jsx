import { useEffect, useState } from "react";
import "./index.css";

function TodoApp() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  // Load tasks from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("todo-tasks");
    if (stored) setTasks(JSON.parse(stored));
  }, []);

  // Persist tasks whenever they change
  useEffect(() => {
    localStorage.setItem("todo-tasks", JSON.stringify(tasks));
  }, [tasks]);

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, { id: Date.now(), text: newTask.trim() }]);
    setNewTask("");
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const saveEdit = (id) => {
    if (!editingText.trim()) return;
    setTasks(
      tasks.map((t) => (t.id === id ? { ...t, text: editingText.trim() } : t))
    );
    setEditingId(null);
    setEditingText("");
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">Todo App</h1>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Add a new task"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
        />
        <button
          className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={addTask}
        >
          Add
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-center text-gray-500">No tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between border rounded px-2 py-1"
            >
              {editingId === task.id ? (
                <input
                  type="text"
                  className="flex-1 border rounded px-2 py-1 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(task.id)}
                />
              ) : (
                <span className="flex-1">{task.text}</span>
              )}
              <div className="flex gap-2 ml-2">
                {editingId === task.id ? (
                  <button
                    className="text-green-600 hover:underline"
                    onClick={() => saveEdit(task.id)}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => startEdit(task)}
                  >
                    Edit
                  </button>
                )}
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => deleteTask(task.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  return <TodoApp />;
}
