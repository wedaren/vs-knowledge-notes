import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './generic-selector'; // Import the generic selector
import type { SelectorOption } from './generic-selector'; // Import the interface

@customElement('model-selector')
export class ModelSelector extends LitElement {
    static override styles = css`
    /* Styles for model-selector can be minimal or specific if needed */
    /* Most styling will come from generic-selector */
  `;

    @property({ type: String })
    currentModelId: string = '';

    // Hardcoded models, matching the original implementation
    private models: SelectorOption[] = [
        { value: 'gpt-4o', label: 'gpt-4o' },
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
        { value: 'o1', label: 'o1' },
        { value: 'o1-mini', label: 'o1-mini' },
        { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' }, // Adjusted label for better display
    ];

    private _handleModelChange(event: CustomEvent) {
        const newModelId = event.detail.value;
        // Update currentModelId immediately to reflect the change in the UI
        // This might not be strictly necessary if the parent component updates the prop,
        // but good for internal consistency if this component can be used standalone.
        this.currentModelId = newModelId;
        this.dispatchEvent(new CustomEvent('model-change', {
            detail: { modelId: newModelId },
            bubbles: true,
            composed: true
        }));
    }

    override render() {
        return html`
      <generic-selector
        .options=${this.models}
        .currentValue=${this.currentModelId}
        .ariaLabel=${"Select Model"}
        .defaultLabel=${"Select Model"}
        @value-change=${this._handleModelChange}
      ></generic-selector>
    `;
    }
}

// Ensures TypeScript treats this as a module
export { };
