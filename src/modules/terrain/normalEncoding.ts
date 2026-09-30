/** Shared vertex/fragment decoder for Y-up terrain normals: compact RG = (X, Z). */
export const terrainNormalShaderChunk = `
    vec3 decodeTerrainNormal(vec3 encoded, float compact) {
        vec3 components = encoded * 2.0 - 1.0;
        if (compact > 0.5) {
            float up = sqrt(max(0.0, 1.0 - dot(components.xy, components.xy)));
            return normalize(vec3(components.x, up, components.y));
        }
        return normalize(components);
    }
`;
