import { BaseComponent } from '../core/BaseComponent';
import { state } from '../../state';
import { runSolarProbe, getAltitudeAt } from '../../analysis';
import { worldToLngLat } from '../../geo';
import { showToast } from '../../utils';
import { updateWeatherUIIndicator } from '../../weather';
import { sheetManager } from '../core/SheetManager';

export class WeatherSheet extends BaseComponent {
    constructor() {
        super('template-weather', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const expertPanel = document.getElementById('expert-weather-panel');

        const closeWeather = this.element.querySelector('#close-weather');
        closeWeather?.addEventListener('click', () => {
            sheetManager.close();
        });

        const openExpert = this.element.querySelector('#open-expert-weather');
        openExpert?.addEventListener('click', () => {
            if (expertPanel) expertPanel.style.display = 'block';
        });

        const closeExpert = expertPanel?.querySelector('#close-expert-weather');
        closeExpert?.addEventListener('click', () => {
            if (expertPanel) expertPanel.style.display = 'none';
        });

        // Simulation Météo Manuelle
        this.element.querySelectorAll('.weather-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.currentWeather = (btn as HTMLElement).dataset.weather as any;
                state.WEATHER_DENSITY = (state.currentWeather === 'clear') ? 0 : 5000;
                updateWeatherUIIndicator();
            });
        });
    }
}

export class SolarProbeSheet extends BaseComponent {
    constructor() {
        super('template-solar-probe', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const closeProbe = this.element.querySelector('#close-probe');
        closeProbe?.addEventListener('click', () => {
            sheetManager.close();
        });

        // Attach to the probe button which might be elsewhere in the DOM
        const probeBtn = document.getElementById('probe-btn');
        probeBtn?.addEventListener('click', () => {
            if (state.hasLastClicked) {
                runSolarProbe(state.lastClickedCoords.x, state.lastClickedCoords.z, state.lastClickedCoords.alt);
            } else {
                showToast("Cliquez sur le terrain d'abord");
            }
        });
    }
}

export class SOSSheet extends BaseComponent {
    constructor() {
        super('template-sos', 'sheet-container');
    }

    public render(): void {
        if (!this.element) return;

        const sosCopyBtn = this.element.querySelector('#sos-copy-btn');
        sosCopyBtn?.addEventListener('click', () => {
            const txt = this.element?.querySelector('#sos-text-container')?.textContent;
            if (txt) { 
                navigator.clipboard.writeText(txt); 
                showToast("🆘 Message copié"); 
            }
        });

        const sosCloseBtn = this.element.querySelector('#sos-close-btn');
        sosCloseBtn?.addEventListener('click', () => { 
            sheetManager.close();
        });

        // Attach to the SOS button which might be elsewhere in the DOM
        const sosBtn = document.getElementById('sos-btn');
        sosBtn?.addEventListener('click', this.openSOSModal.bind(this));
    }

    private async openSOSModal() {
        if (!this.element) return;
        
        const textContainer = this.element.querySelector('#sos-text-container');
        if (!textContainer) return;

        sheetManager.open('sos');
        textContainer.textContent = "⌛ Localisation en cours...";
        
        let lat: number, lon: number, alt: number;
        
        if (state.userLocation) { 
            lat = state.userLocation.lat; 
            lon = state.userLocation.lon; 
            alt = state.userLocation.alt; 
        } else { 
            const gps = worldToLngLat(state.controls?.target.x || 0, state.controls?.target.z || 0, state.originTile); 
            lat = gps.lat; 
            lon = gps.lon; 
            alt = getAltitudeAt(state.controls?.target.x || 0, state.controls?.target.z || 0) / state.RELIEF_EXAGGERATION; 
        }
        
        let bat = "??"; 
        try { 
            const battery = await (navigator as any).getBattery(); 
            bat = Math.round(battery.level * 100).toString(); 
        } catch(e) {}
        
        const now = new Date(); 
        const time = `${now.getHours()}h${now.getMinutes().toString().padStart(2, '0')}`;
        
        textContainer.textContent = `🆘 SOS SUNTRAIL: ${lat.toFixed(5)},${lon.toFixed(5)} | ALT:${Math.round(alt)}m | BAT:${bat}% | ${time}`;
    }
}
