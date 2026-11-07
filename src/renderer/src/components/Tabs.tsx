import './Tabs.css';

/**
 * Today / Month / Year. Month and Year arrive in step 3c, so for now they're shown but disabled.
 */
export function Tabs() {
  return (
    <div className="tabs" role="tablist" aria-label="Habit views">
      <button type="button" role="tab" className="tabs__tab" aria-selected="true">
        Today
      </button>
      <button type="button" role="tab" className="tabs__tab" aria-selected="false" disabled title="Coming soon">
        Month
      </button>
      <button type="button" role="tab" className="tabs__tab" aria-selected="false" disabled title="Coming soon">
        Year
      </button>
    </div>
  );
}
