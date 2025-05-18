import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './generic-selector'; // Import the generic selector
import type { SelectorOption } from './generic-selector'; // Import the interface

@customElement('history-selector')
export class HistorySelector extends LitElement {
    static override styles = css`
    /* Styles for history-selector can be minimal or specific if needed */
    /* Most styling will come from generic-selector */
  `;

    @property({ type: String })
    currentHistoryValue: string = '0'; // Default to "Last 0"

    private historyOptions: SelectorOption[] = Array.from({ length: 11 }, (_, i) => ({
        value: i.toString(),
        label: `Last ${i}`
    }));

    private _handleHistoryChange(event: CustomEvent) {
        const newHistoryValue = event.detail.value;
        this.currentHistoryValue = newHistoryValue;
        this.dispatchEvent(new CustomEvent('history-change', {
            detail: { historyValue: newHistoryValue },
            bubbles: true,
            composed: true
        }));
    }

    override render() {
        return html`
      <generic-selector
        .options=${this.historyOptions}
        .currentValue=${this.currentHistoryValue}
        .ariaLabel=${"Select History Range"}
        .defaultLabel=${"Select History"}
        @value-change=${this._handleHistoryChange}
      ></generic-selector>
    `;
    }
}

// Ensures TypeScript treats this as a module
export { };
