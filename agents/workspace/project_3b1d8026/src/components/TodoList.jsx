import React from "react";
import { useTodos } from "../TodoContext.jsx";
import TodoItem from "./TodoItem.jsx";

export default function TodoList() {
  const { todos } = useTodos();

  if (todos.length === 0) {
    return <p className="text-center text-gray-500">No todos yet. Add one above!</p>;
  }

  return (
    <ul className="divide-y">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
