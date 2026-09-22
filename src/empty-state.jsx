import { MagnifyingGlass } from "./icons.jsx";

export function EmptyState({
  className = "",
  icon: Icon = MagnifyingGlass,
  iconSize = 26,
  title = "Ничего не найдено",
  description,
  children,
  ...props
}) {
  const classes = ["empty-state", "content-empty-state", className].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      <Icon size={iconSize} aria-hidden="true" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
