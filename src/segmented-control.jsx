export function SegmentedControl({ options, value, onChange, label, className = "", renderOption, getOptionProps }) {
  return (
    <div className={`segmented-control${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
      {options.map((option) => {
        const { onClick, ...buttonProps } = getOptionProps?.(option) || {};
        return <button {...buttonProps} key={option.value} type="button" className={value === option.value ? "active" : ""} aria-pressed={value === option.value} onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onChange(option.value);
        }}>
          {renderOption ? renderOption(option) : option.label}
        </button>;
      })}
    </div>
  );
}
