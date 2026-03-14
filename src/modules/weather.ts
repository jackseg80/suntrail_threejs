import * as THREE from 'three';
import SunCalc from 'suncalc';
import { state } from './state';

let weatherPoints: THREE.Points | null = null;
let weatherMaterial: THREE.ShaderMaterial | null = null;
let geometry: THREE.BufferGeometry | null = null;

const MAX_PARTICLES = 15000;
const BOX_SIZE = 15000.0; 

export async function fetchWeather(lat: number, lon: number): Promise<void> {
    try {
        const [weatherRes, geoRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,freezing_level_height,uv_index,visibility,precipitation_probability&forecast_days=1`),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`)
        ]);

        if (!weatherRes.ok) throw new Error('Weather API error');
        const data = await weatherRes.json();
        const geoData = await geoRes.json();
        
        const current = data.current || data.current_weather;
        const code = current?.weather_code ?? current?.weathercode ?? 0;
        const locationName = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.county || "Zone Inconnue";

        // --- CALCULS ASTRONOMIQUES (v4.5.4) ---
        const date = new Date();
        const times = SunCalc.getTimes(date, lat, lon);
        const moonIllum = SunCalc.getMoonIllumination(date);
        
        const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        
        // Phases de la lune
        const phases = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
        const phaseIdx = Math.floor(moonIllum.phase * 8) % 8;

        // Prévisions horaires
        const nowIdx = date.getHours();
        const hourlyForecast = [];
        for (let i = 1; i <= 6; i++) {
            const idx = nowIdx + i;
            if (data.hourly && data.hourly.time[idx]) {
                hourlyForecast.push({
                    time: data.hourly.time[idx].split('T')[1],
                    temp: data.hourly.temperature_2m[idx],
                    code: data.hourly.weather_code[idx]
                });
            }
        }

        // --- INTELLIGENCE VISUELLE ---
        let targetDensity = 2500;
        let speedMult = 1.0;
        if (code >= 51) {
            state.currentWeather = code >= 71 ? 'snow' : 'rain';
            targetDensity = (code === 65 || code === 75) ? 10000 : 4000;
            speedMult = code >= 65 ? 1.3 : 1.0;
        } else {
            state.currentWeather = 'clear';
            targetDensity = 0;
        }
        state.WEATHER_DENSITY = targetDensity;
        state.WEATHER_SPEED = speedMult;

        if (data.current) {
            state.weatherData = {
                temp: data.current.temperature_2m,
                apparentTemp: data.current.apparent_temperature,
                windSpeed: data.current.wind_speed_10m,
                windDir: data.current.wind_direction_10m,
                humidity: data.current.relative_humidity_2m,
                cloudCover: data.current.cloud_cover,
                locationName: locationName,
                uvIndex: data.hourly?.uv_index[nowIdx] || 0,
                freezingLevel: data.hourly?.freezing_level_height[nowIdx] || 0,
                visibility: (data.hourly?.visibility[nowIdx] || 0) / 1000,
                precProb: data.hourly?.precipitation_probability[nowIdx] || 0,
                goldenHour: fmtTime(times.goldenHour),
                blueHour: fmtTime(times.dawn),
                moonPhase: phases[phaseIdx],
                moonIllum: Math.round(moonIllum.fraction * 100),
                hourly: hourlyForecast
            };
        }

        updateWeatherUIIndicator();
    } catch (e) {
        state.currentWeather = 'clear';
    }
}

export function updateWeatherUIIndicator(): void {
    const indicator = document.getElementById('zoom-indicator');
    if (indicator) {
        let weatherIcon = '☀️';
        if (state.currentWeather === 'rain') weatherIcon = '🌧️';
        else if (state.currentWeather === 'snow') weatherIcon = '❄️';
        const tempStr = state.weatherData ? `${state.weatherData.temp.toFixed(1)}°C ` : '';
        indicator.innerHTML = `<span id="weather-clickable" style="cursor:pointer; text-decoration:underline;">${state.MAP_SOURCE.toUpperCase()}: Lvl ${state.ZOOM} | ${tempStr}${weatherIcon}</span>`;
    }
}

export function initWeatherSystem(scene: THREE.Scene): void {
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const randoms = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
        positions[i*3] = (Math.random()-0.5)*BOX_SIZE; positions[i*3+1] = (Math.random()-0.5)*BOX_SIZE; positions[i*3+2] = (Math.random()-0.5)*BOX_SIZE;
        randoms[i] = Math.random();
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    
    weatherMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }, uCameraPos: { value: new THREE.Vector3() },
            uSpeed: { value: 2000.0 }, uSize: { value: 30.0 },
            uColor: { value: new THREE.Color(1, 1, 1) }, uBoxSize: { value: BOX_SIZE },
            uOpacity: { value: 0.8 }, uIsRain: { value: 0.0 },
            uWindVec: { value: new THREE.Vector3(0, 0, 0) }
        },
        vertexShader: `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            uniform float uTime; uniform vec3 uCameraPos; uniform float uSpeed;
            uniform float uSize; uniform float uBoxSize; uniform float uIsRain; uniform vec3 uWindVec;
            attribute float aRandom; varying float vAlpha; varying float vIsRain; varying float vRandom;
            void main() {
                vIsRain = uIsRain; vRandom = aRandom;
                float individualSpeed = uSpeed * (0.8 + aRandom * 0.4);
                vec3 pos = position;
                pos.y -= uTime * individualSpeed;
                pos.x += uTime * uWindVec.x; pos.z += uTime * uWindVec.z;
                if (uIsRain < 0.5) {
                    pos.x += sin(uTime * 0.4 + aRandom * 20.0) * 100.0;
                    pos.z += cos(uTime * 0.3 + aRandom * 20.0) * 100.0;
                }
                vec3 delta = pos - uCameraPos;
                float h = uBoxSize * 0.5;
                delta.x = mod(delta.x + h, uBoxSize) - h;
                delta.y = mod(delta.y + h, uBoxSize) - h;
                delta.z = mod(delta.z + h, uBoxSize) - h;
                float dist = length(delta);
                vAlpha = smoothstep(h, h * 0.7, dist) * smoothstep(100.0, 500.0, dist);
                vec3 worldPos = uCameraPos + delta;
                vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <logdepthbuf_vertex>
                float pSize = uSize * (1500.0 / max(-mvPosition.z, 500.0));
                gl_PointSize = clamp(pSize, 2.0, uIsRain > 0.5 ? 40.0 : 100.0);
            }
        `,
        fragmentShader: `
            #include <logdepthbuf_pars_fragment>
            uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
            varying float vIsRain; varying float vRandom;
            void main() {
                #include <logdepthbuf_fragment>
                vec2 uv = gl_PointCoord * 2.0 - 1.0;
                float r = length(uv);
                if (r > 1.0) discard;
                if (vIsRain > 0.5) {
                    float xDist = abs(uv.x); if (xDist > 0.15) discard; 
                    gl_FragColor = vec4(uColor, uOpacity * vAlpha * (1.0 - xDist * 6.0));
                } else {
                    float angle = atan(uv.y, uv.x);
                    float branch = abs(sin(angle * 3.0 + vRandom * 6.28));
                    float shape = mix(0.3, 1.0, branch);
                    float soft = 1.0 - smoothstep(0.0, shape, r);
                    gl_FragColor = vec4(uColor, uOpacity * vAlpha * (soft + (1.0-r)*0.5));
                }
            }
        `,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending
    });
    weatherPoints = new THREE.Points(geometry, weatherMaterial);
    weatherPoints.frustumCulled = false; weatherPoints.renderOrder = 9999;
    weatherPoints.visible = false; scene.add(weatherPoints);
}

export function updateWeatherSystem(delta: number, cameraPos: THREE.Vector3): void {
    if (!weatherPoints || !weatherMaterial || !geometry) return;
    const altitude = cameraPos.y;
    if (state.currentWeather === 'clear' || state.WEATHER_DENSITY <= 0 || altitude > 100000) {
        weatherPoints.visible = false; return;
    }
    weatherPoints.visible = true;
    weatherMaterial.uniforms.uTime.value += delta;
    weatherMaterial.uniforms.uCameraPos.value.copy(cameraPos);
    weatherMaterial.uniformsNeedUpdate = true;
    geometry.setDrawRange(0, Math.min(state.WEATHER_DENSITY, MAX_PARTICLES));

    let windMultiplier = 1.0; let windVec = new THREE.Vector3(0, 0, 0);
    if (state.weatherData) {
        windMultiplier = 1.0 + (state.weatherData.windSpeed / 60.0);
        const angleRad = (state.weatherData.windDir - 90) * (Math.PI / 180);
        const windForce = state.weatherData.windSpeed * 20.0;
        windVec.set(Math.cos(angleRad) * windForce, 0, Math.sin(angleRad) * windForce);
    }
    weatherMaterial.uniforms.uWindVec.value.copy(windVec);

    if (state.currentWeather === 'rain') {
        weatherMaterial.uniforms.uIsRain.value = 1.0;
        weatherMaterial.uniforms.uSpeed.value = 4000.0 * state.WEATHER_SPEED * windMultiplier;
        weatherMaterial.uniforms.uSize.value = 50.0; weatherMaterial.uniforms.uColor.value.setHex(0xaaaaee);
        weatherMaterial.uniforms.uOpacity.value = 0.4;
    } else {
        weatherMaterial.uniforms.uIsRain.value = 0.0;
        weatherMaterial.uniforms.uSpeed.value = 700.0 * state.WEATHER_SPEED * windMultiplier;
        weatherMaterial.uniforms.uSize.value = 45.0; weatherMaterial.uniforms.uColor.value.setHex(0xffffff);
        weatherMaterial.uniforms.uOpacity.value = 0.8;
    }
}
