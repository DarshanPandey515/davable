import TodoItem from "./TodoItem.jsx";

export default function TodoList({ items, onToggle, onDelete, onEdit }) {
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <TodoItem
          key={item.id}
          item={item}
          onToggle={onToggle}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}
