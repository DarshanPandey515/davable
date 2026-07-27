import React, { useState } from "react";
import { useTodos } from "../TodoContext.jsx";

export default function TodoItem({ todo }) {
  const { editTodo, deleteTodo, toggleComplete } = useTodos();
  const [isEditing, setIsEditing] = useState(false);
  const [newText, setNewText] = useState(todo.text);
  const [loading, setLoading] = useState(false);

  const handleSave = () => {
    if (!newText.trim()) return;
    setLoading(true);
    setTimeout(() => {
      editTodo(todo.id, newText.trim());
      setIsEditing(false);
      setLoading(false);
    }, 200);
  };

  return (
    <li className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => toggleComplete(todo.id)}
          className="h-4 w-4"
          aria-label="Mark as completed"
        />
        {isEditing ? (
          <input
            type="text"
            className="border rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            disabled={loading}
          />
        ) : (
          <span
            className={`${
              todo.completed ? "line-through text-gray-500" : ""
            }`}
          >
            {todo.text}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <button
            onClick={handleSave}
            className="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="px-2 py-0.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            Edit
          </button>
        )}
        <button
          onClick={() => deleteTodo(todo.id)}
          className="px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
