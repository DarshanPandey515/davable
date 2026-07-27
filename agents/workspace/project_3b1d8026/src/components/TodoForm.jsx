import React, { useState } from "react";
import { useTodos } from "../TodoContext.jsx";

export default function TodoForm() {
  const { addTodo } = useTodos();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setTimeout(() => {
      addTodo(text.trim());
      setText("");
      setLoading(false);
    }, 200); // simulate async
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
      <input
        type="text"
        className="flex-1 border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Add a new todo"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={loading}
        aria-label="Todo text"
      />
      <button
        type="submit"
        className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        disabled={loading}
      >
        {loading ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
