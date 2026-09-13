import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';
import { showToast } from '../../toast';
import { expertService } from '../../expertService';
import templateHTML from '../templates/sos.html?raw';

export class SOSSheet extends BaseComponent {
    constructor() {
        super('template-sos', 'sheet-container', templateHTML);
    }

    public render(): void {
        if (!this.element) return;

        const sosCopyBtn = this.element.querySelector('#sos-copy-btn');
        sosCopyBtn?.setAttribute('aria-label', i18n.t('sos.copy'));
        sosCopyBtn?.addEventListener('click', () => {
            const txt = this.element?.querySelector(
                '#sos-text-container'
            )?.textContent;
            if (txt) {
                navigator.clipboard.writeText(txt);
                showToast(i18n.t('sos.copied'));
            }
        });

        const sosSmsBtn = this.element.querySelector('#sos-sms-btn');
        sosSmsBtn?.setAttribute('aria-label', i18n.t('sos.sms'));

        const closeButton = this.element.querySelector('#sos-header-close-btn');
        closeButton?.setAttribute('aria-label', i18n.t('sos.close'));
        closeButton?.addEventListener('click', () => sheetManager.back());

        // ARIA: SOS text container is a live region
        const sosTextContainer = this.element.querySelector(
            '#sos-text-container'
        );
        sosTextContainer?.setAttribute('aria-live', 'polite');

        // Résolution GPS déclenchée sur l'événement sheetOpened
        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'sos') void this.resolveAndDisplay();
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));
    }

    private async resolveAndDisplay(): Promise<void> {
        const textContainer = this.element?.querySelector(
            '#sos-text-container'
        );
        if (!textContainer) return;

        const smsBtn =
            this.element?.querySelector<HTMLButtonElement>('#sos-sms-btn');
        if (smsBtn) {
            smsBtn.disabled = true;
            smsBtn.onclick = null;
        }
        textContainer.textContent = i18n.t('sos.locating');

        try {
            const message = await expertService.generateSOSMessage();
            textContainer.textContent = message;

            if (smsBtn) {
                smsBtn.disabled = false;
                smsBtn.onclick = () => {
                    window.open(`sms:?body=${encodeURIComponent(message)}`);
                };
            }
        } catch (e) {
            textContainer.textContent = i18n.t('sos.error');
            console.error('[SOS] Failed to generate message:', e);
        }
    }
}
