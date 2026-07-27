import { useState } from "react";

export default function TodoItem({ item, onToggle, onDelete, onEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const handleEditSubmit = (e) => {
    e.preventDefault();
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) {
      onEdit(item.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <li className="flex items-center justify-between bg-gray-50 rounded p-2">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={item.completed}
          onChange={() => onToggle(item.id)}
          className="form-checkbox h-4 w-4 text-blue-600"
          aria-label={item.completed ? "Mark as incomplete" : "Mark as complete"}
        />
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="flex items-center">
            <input
              type="text"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="ml-2 text-blue-600 hover:underline"
            >
              Save
            </button>
          </form>
        ) : (
          <span className={item.completed ? "line-through text-gray-500" : "text-gray-800"}>
            {item.text}
          </span>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-sm text-indigo-600 hover:underline focus:outline-none"
        >
          {isEditing ? "Cancel" : "Edit"}
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="text-sm text-red-600 hover:underline focus:outline-none"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
