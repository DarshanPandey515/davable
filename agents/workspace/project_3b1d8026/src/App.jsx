import React from "react";
import { TodoProvider } from "./TodoContext.jsx";
import TodoForm from "./components/TodoForm.jsx";
import TodoList from "./components/TodoList.jsx";

export default function App() {
  return (
    <TodoProvider>
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
          <h1 className="text-2xl font-bold text-center mb-4">Todo App</h1>
          <TodoForm />
          <TodoList />
        </div>
      </div>
    </TodoProvider>
  );
}
