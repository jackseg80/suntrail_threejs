/** Compile the production normal decoder in WebGL and measure slope fidelity. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { terrainNormalShaderChunk } from '../src/modules/terrain/normalEncoding';
import { terrainNormalPixels } from '../src/workers/terrainNormals';

async function main() {
    const cases = [0, 1, 2, 3, 4, 4.75, 5, 5.25, 6, 8, 10, 15, 30].map(
        (angle) => {
            const data = new Uint8ClampedArray(8 * 8 * 4);
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    const encoded = Math.round(
                        (10100 + (angle === 0 ? 0 : y * 4)) * 10
                    );
                    data.set(
                        [
                            encoded >> 16,
                            (encoded >> 8) & 255,
                            encoded & 255,
                            255,
                        ],
                        (y * 8 + x) * 4
                    );
                }
            }
            const spacing =
                angle === 0 ? 1 : 4 / Math.tan((angle * Math.PI) / 180);
            const i = (4 * 8 + 4) * 4;
            const full = [
                ...terrainNormalPixels(data, 8, 8, spacing, false).slice(
                    i,
                    i + 4
                ),
            ];
            return {
                angle,
                compact: [
                    ...terrainNormalPixels(data, 8, 8, spacing, true).slice(
                        i,
                        i + 4
                    ),
                ],
                full,
                // Frozen historical RG=(X,Y), B=sign(Z) contract, for A/B proof.
                legacy: [full[0], full[1], full[2] >= 127.5 ? 255 : 0, 255],
            };
        }
    );
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
        const page = await browser.newPage();
        // tsx keeps function names via __name; page.evaluate crosses runtimes.
        await page.addScriptTag({
            content: 'globalThis.__name = (value) => value;',
        });
        const report = await page.evaluate(
            ({ shader, cases }) => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                const gl = canvas.getContext('webgl', {
                    preserveDrawingBuffer: true,
                });
                if (!gl) throw new Error('WebGL indisponible');
                const compile = (type: number, source: string) => {
                    const object = gl.createShader(type)!;
                    gl.shaderSource(object, source);
                    gl.compileShader(object);
                    if (!gl.getShaderParameter(object, gl.COMPILE_STATUS))
                        throw new Error(
                            gl.getShaderInfoLog(object) ??
                                'Compilation GLSL refusée'
                        );
                    return object;
                };
                const program = gl.createProgram()!;
                gl.attachShader(
                    program,
                    compile(
                        gl.VERTEX_SHADER,
                        'attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}'
                    )
                );
                gl.attachShader(
                    program,
                    compile(
                        gl.FRAGMENT_SHADER,
                        `precision highp float; uniform sampler2D inputMap; uniform float compact;
                        ${shader}
                        vec3 decodeLegacyNormal(vec3 encoded) {
                            vec3 n=encoded*2.0-1.0;
                            n.z=sqrt(max(0.0,1.0-n.x*n.x-n.y*n.y))*(encoded.b*2.0-1.0);
                            return normalize(n);
                        }
                        void main(){vec3 texel=texture2D(inputMap,vec2(0.5)).rgb;
                        vec3 n=compact>1.5?decodeLegacyNormal(texel):decodeTerrainNormal(texel,compact);
                        gl_FragColor=vec4(n*0.5+0.5,1.0);}`
                    )
                );
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                    throw new Error(
                        gl.getProgramInfoLog(program) ??
                            'Édition de liens GLSL refusée'
                    );
                gl.useProgram(program);
                const buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(
                    gl.ARRAY_BUFFER,
                    new Float32Array([-1, -1, 3, -1, -1, 3]),
                    gl.STATIC_DRAW
                );
                const position = gl.getAttribLocation(program, 'position');
                gl.enableVertexAttribArray(position);
                gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
                gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_MIN_FILTER,
                    gl.NEAREST
                );
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_MAG_FILTER,
                    gl.NEAREST
                );
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_S,
                    gl.CLAMP_TO_EDGE
                );
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_T,
                    gl.CLAMP_TO_EDGE
                );
                const render = (pixels: number[], compact: number) => {
                    gl.texImage2D(
                        gl.TEXTURE_2D,
                        0,
                        gl.RGBA,
                        1,
                        1,
                        0,
                        gl.RGBA,
                        gl.UNSIGNED_BYTE,
                        new Uint8Array(pixels)
                    );
                    gl.uniform1f(
                        gl.getUniformLocation(program, 'compact'),
                        compact
                    );
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                    const result = new Uint8Array(4);
                    gl.readPixels(
                        0,
                        0,
                        1,
                        1,
                        gl.RGBA,
                        gl.UNSIGNED_BYTE,
                        result
                    );
                    if (gl.getError() !== gl.NO_ERROR)
                        throw new Error('Erreur WebGL');
                    const x = result[0] / 127.5 - 1;
                    const y = result[1] / 127.5 - 1;
                    const z = result[2] / 127.5 - 1;
                    return (Math.atan2(Math.hypot(x, z), y) * 180) / Math.PI;
                };
                return {
                    renderer: gl.getParameter(gl.RENDERER),
                    cases: cases.map((test) => ({
                        expectedDegrees: test.angle,
                        compactDegrees: render(test.compact, 1),
                        fullDegrees: render(test.full, 0),
                        legacyDegrees: render(test.legacy, 2),
                    })),
                };
            },
            { shader: terrainNormalShaderChunk, cases }
        );
        const maxCompactErrorDegrees = Math.max(
            ...report.cases.map((test) =>
                Math.abs(test.expectedDegrees - test.compactDegrees)
            )
        );
        const maxFullErrorDegrees = Math.max(
            ...report.cases.map((test) =>
                Math.abs(test.expectedDegrees - test.fullDegrees)
            )
        );
        const maxLegacyErrorDegrees = Math.max(
            ...report.cases.map((test) =>
                Math.abs(test.expectedDegrees - test.legacyDegrees)
            )
        );
        const result = {
            ...report,
            maxCompactErrorDegrees,
            maxFullErrorDegrees,
            maxLegacyErrorDegrees,
            passed: maxCompactErrorDegrees < 0.6 && maxFullErrorDegrees < 0.6,
            scope: 'GLSL decoder compiled and executed in headless Chromium WebGL; not a full application or S23 visual check.',
        };
        fs.mkdirSync('output/terrain-moire', { recursive: true });
        fs.writeFileSync(
            path.resolve('output/terrain-moire/webgl-normals.json'),
            JSON.stringify(result, null, 2)
        );
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) throw new Error('Fidélité des pentes insuffisante');
    } finally {
        await browser.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
