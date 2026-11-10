import './SegmentedControl.css';

interface SegmentedControlProps<T extends string | number> {
  legend: string;
  /** Stretch the options across the full width. */
  fill?: boolean;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}

/**
 * A row of real radio buttons styled as segments. Using native radios means the arrow keys
 * move between options and screen readers announce "1 of 3", with no extra code.
 */
export function SegmentedControl<T extends string | number>({
  legend,
  fill,
  name,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={`segmented${fill ? ' segmented--fill' : ''}`}>
      <legend className="segmented__legend">{legend}</legend>
      <div className="segmented__options">
        {options.map((option) => (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
