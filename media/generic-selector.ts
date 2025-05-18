import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface SelectorOption {
    value: string;
    label: string;
}

@customElement('generic-selector')
export class GenericSelector extends LitElement {
    static override styles = css`
    :host {
      display: inline-block; /* Allow host to size with content */
    }
    .custom-select-container {
      position: relative;
      display: inline-block; /* Allow container to size with content */
      cursor: pointer;
    }
    .selected-display {
      display: flex; /* Use flex to align text and arrow */
      align-items: center;
      height: 24px;
      padding: 0 8px 0 10px; /* Adjust padding: top/bottom 0, left 10px, right for arrow */
      background-color: var(--vscode-input-background); /* Use VS Code variables */
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px; /* Slightly more rounded */
      font-family: var(--vscode-font-family);
      font-size: 12px;
      white-space: nowrap; /* Prevent text wrapping */
      box-sizing: border-box;
    }
    .selected-display:hover {
      background-color: var(--vscode-input-background-hover, var(--vscode-input-background)); /* Add hover state */
    }
    .dropdown-arrow {
      margin-left: 6px; /* Space between text and arrow */
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 4px solid var(--vscode-input-foreground); /* Arrow color */
    }

    /* The actual select element, made invisible and overlaid */
    select {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      /* Remove any browser default styling that might interfere */
      border: none;
      padding: 0;
      margin: 0;
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
    }

    /* Styles for the <option> elements within the native dropdown */
    option {
      background-color: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
      font-size: 12px;
      padding: 4px 8px; /* Consistent padding for options */
    }
  `;

    @property({ type: Array })
    options: SelectorOption[] = [];

    @property({ type: String })
    currentValue: string = '';

    @property({ type: String })
    ariaLabel: string = 'Select an option';

    @property({ type: String })
    defaultLabel: string = 'Select an option';

    get selectedLabel(): string {
        const selectedOption = this.options.find(opt => opt.value === this.currentValue);
        return selectedOption ? selectedOption.label : this.defaultLabel;
    }

    private _handleValueChange(event: Event) {
        const selectElement = event.target as HTMLSelectElement;
        const newValue = selectElement.value;
        // No need to update currentValue here directly if it's managed by the parent
        // Parent will re-render with new currentValue prop
        this.dispatchEvent(new CustomEvent('value-change', {
            detail: { value: newValue },
            bubbles: true,
            composed: true
        }));
    }

    override render() {
        return html`
      <div class="custom-select-container">
        <div class="selected-display">
          <span>${this.selectedLabel}</span>
          <div class="dropdown-arrow"></div>
        </div>
        <select
          .value=${this.currentValue}
          @change=${this._handleValueChange}
          aria-label=${this.ariaLabel}
        >
          ${this.options.map(option => html`
            <option value=${option.value} ?selected=${option.value === this.currentValue}>
              ${option.label}
            </option>
          `)}
        </select>
      </div>
    `;
    }
}

// Ensures TypeScript treats this as a module
export { };
