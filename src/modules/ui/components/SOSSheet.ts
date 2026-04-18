import { BaseComponent } from '../core/BaseComponent';
import { sheetManager } from '../core/SheetManager';
import { i18n } from '../../../i18n/I18nService';
import { eventBus } from '../../eventBus';
import { showToast } from '../../toast';
import { expertService } from '../../expertService';

export class SOSSheet extends BaseComponent {
    private attachSosBtnTimer: any = null;

    constructor() {
        super('template-sos', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const sosCopyBtn = document.getElementById('sos-copy-btn');
        sosCopyBtn?.setAttribute('aria-label', i18n.t('sos.copy'));
        sosCopyBtn?.addEventListener('click', () => {
            const txt = document.getElementById('sos-text-container')?.textContent;
            if (txt) { 
                navigator.clipboard.writeText(txt); 
                showToast("🆘 Message copié"); 
            }
        });

        const sosSmsBtn = document.getElementById('sos-sms-btn');
        sosSmsBtn?.setAttribute('aria-label', i18n.t('sos.sms'));

        const sosCloseBtn = document.getElementById('sos-close-btn');
        sosCloseBtn?.setAttribute('aria-label', i18n.t('sos.close'));
        sosCloseBtn?.addEventListener('click', () => { 
            sheetManager.close();
        });

        // ARIA: SOS text container is a live region
        const sosTextContainer = document.getElementById('sos-text-container');
        sosTextContainer?.setAttribute('aria-live', 'polite');

        // Résolution GPS déclenchée sur l'événement sheetOpened
        const onSheetOpened = ({ id }: { id: string }) => {
            if (id === 'sos') void this.resolveAndDisplay();
        };
        eventBus.on('sheetOpened', onSheetOpened);
        this.addSubscription(() => eventBus.off('sheetOpened', onSheetOpened));

        // Bouton pill (widget coords) — ouvre simplement le sheet
        const attachSosBtn = () => {
            const sosBtn = document.getElementById('sos-btn-pill');
            if (sosBtn) {
                sosBtn.setAttribute('aria-label', 'Appel SOS urgence');
                sosBtn.onclick = () => sheetManager.open('sos');
            } else {
                this.attachSosBtnTimer = setTimeout(attachSosBtn, 500);
            }
        };
        attachSosBtn();
    }

    public override dispose(): void {
        if (this.attachSosBtnTimer) {
            clearTimeout(this.attachSosBtnTimer);
            this.attachSosBtnTimer = null;
        }
        super.dispose();
    }

    private async resolveAndDisplay(): Promise<void> {
        const textContainer = document.getElementById('sos-text-container');
        if (!textContainer) return;

        textContainer.textContent = "⌛ Localisation en cours...";
        
        const message = await expertService.generateSOSMessage();
        textContainer.textContent = message;

        const smsBtn = document.getElementById('sos-sms-btn') as HTMLButtonElement | null;
        if (smsBtn) {
            smsBtn.disabled = false;
            smsBtn.onclick = () => {
                window.open(`sms:?body=${encodeURIComponent(message)}`);
            };
        }
    }
}
