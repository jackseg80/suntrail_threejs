import * as THREE from 'three';
import { state } from './state';
import { fetchGeocoding } from './utils';

let weatherPoints: THREE.Points | null = null;
let weatherMaterial: THREE.ShaderMaterial | null = null;
let geometry: THREE.BufferGeometry | null = null;

const MAX_PARTICLES = 15000;
const BOX_SIZE = 15000.0; 

let lastRequestId = 0;

export async function fetchWeather(lat: number, lon: number): Promise<void> {
    const requestId = ++lastRequestId;
    try {
        state.lastWeatherLat = lat;
        state.lastWeatherLon = lon;

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,weather_code,freezing_level_height,uv_index,visibility,precipitation_probability&forecast_days=3`);
        if (!weatherRes.ok) throw new Error('Weather API error');
        const data = await weatherRes.json();

        if (requestId !== lastRequestId) return;

        let locationName = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
        try {
            const geoData = await fetchGeocoding({ lat, lon });
            if (geoData) {
                const feature = Array.isArray(geoData) ? geoData[0] : (geoData.features ? geoData.features[0] : geoData);
                if (feature) {
                    locationName = feature.place_name_fr || feature.place_name || feature.display_name || feature.text_fr || feature.text || locationName;
                    locationName = locationName.split(',')[0];
                }
            }
        } catch (geoErr) { console.warn('[Weather] Geolocation reverse-geocoding failed silently:', geoErr); }
        
        const current = data.current || data.current_weather;
        const code = current?.weather_code ?? current?.weathercode ?? 0;

        const date = new Date();
        const nowISO = date.toISOString().split(':')[0] + ':00';
        let startIndex = data.hourly.time.findIndex((t: string) => t.startsWith(nowISO));
        if (startIndex === -1) startIndex = date.getHours();

        const hourlyForecast = [];
        for (let i = startIndex; i < startIndex + 24; i++) {
            if (data.hourly && data.hourly.time[i]) {
                hourlyForecast.push({
                    time: data.hourly.time[i].split('T')[1],
                    temp: data.hourly.temperature_2m[i],
                    code: data.hourly.weather_code[i]
                });
            }
        }

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
                dewPoint: data.current.dew_point_2m,
                windSpeed: data.current.wind_speed_10m,
                windDir: data.current.wind_direction_10m,
                windGusts: data.current.wind_gusts_10m,
                humidity: data.current.relative_humidity_2m,
                cloudCover: data.current.cloud_cover,
                locationName: locationName,
                uvIndex: data.hourly?.uv_index[startIndex] || 0,
                freezingLevel: data.hourly?.freezing_level_height[startIndex] || 0,
                visibility: (data.hourly?.visibility[startIndex] || 0) / 1000,
                precProb: data.hourly?.precipitation_probability[startIndex] || 0,
                hourly: hourlyForecast
            };
        }

    } catch (e) {
        state.currentWeather = 'clear';
    }
}

export function getWeatherIcon(code: number): string {
    if (code === 0) return '☀️';
    if (code <= 3) return '🌤️';
    if (code <= 48) return '☁️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '🌨️';
    return '⛈️';
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

/**
 * Avance uniquement uTime — appelé à chaque frame rendue pour des particules fluides.
 * Découplé de updateWeatherSystem (uniforms cosmétiques, throttlé à 20fps).
 */
export function tickWeatherTime(delta: number): void {
    if (!weatherMaterial || !weatherPoints?.visible) return;
    weatherMaterial.uniforms.uTime.value += delta;
    weatherMaterial.uniformsNeedUpdate = true;
}

export function updateWeatherSystem(delta: number, cameraPos: THREE.Vector3): void {
    if (!weatherPoints || !weatherMaterial || !geometry) return;
    const altitude = cameraPos.y;
    const is2D = state.RESOLUTION <= 2;

    if (state.currentWeather === 'clear' || state.WEATHER_DENSITY <= 0 || altitude > 100000 || is2D) {
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
