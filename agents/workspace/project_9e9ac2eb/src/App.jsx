import { useState, useEffect } from "react";
import TodoList from "./components/TodoList.jsx";

const LOCAL_STORAGE_KEY = "vite-react-todo-items";

export default function App() {
  const [items, setItems] = useState([]);
  const [newTask, setNewTask] = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) setItems(JSON.parse(stored));
  }, []);

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (e) => {
    e.preventDefault();
    const trimmed = newTask.trim();
    if (!trimmed) return;
    setItems([
      ...items,
      { id: Date.now(), text: trimmed, completed: false }
    ]);
    setNewTask("");
  };

  const toggleItem = (id) => {
    setItems(items.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
  };

  const deleteItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const editItem = (id, newText) => {
    setItems(items.map(item => item.id === id ? { ...item, text: newText } : item));
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-center mb-4">Todo List</h1>
        <form onSubmit={addItem} className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="New task"
          />
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add
          </button>
        </form>
        {items.length === 0 ? (
          <p className="text-center text-gray-500">No tasks yet. Add one above!</p>
        ) : (
          <TodoList
            items={items}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onEdit={editItem}
          />
        )}
      </div>
    </div>
  );
}
