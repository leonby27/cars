import { forwardRef, useRef } from "react";
import { MagnifyingGlass, X } from "./icons.jsx";

export const SearchField = forwardRef(function SearchField(
  {
    value = "",
    onValueChange,
    onClear,
    placeholder,
    ariaLabel,
    className = "",
    inputProps = {},
  },
  forwardedRef,
) {
  const ownRef = useRef(null);
  const setInputRef = (node) => {
    ownRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  const clear = () => {
    if (onClear) onClear();
    else onValueChange?.("");
    ownRef.current?.focus();
  };

  return (
    <div className={`app-search-field${className ? ` ${className}` : ""}`}>
      <MagnifyingGlass size={19} aria-hidden="true" />
      <input
        {...inputProps}
        ref={setInputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onValueChange?.(event.target.value, event)}
      />
      {value && (
        <button className="app-search-field-clear" type="button" aria-label="Очистить поиск" onClick={clear}>
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
