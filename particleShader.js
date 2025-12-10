import * as THREE from 'three';

// --- 1. (Vertex Shader) ---
// calculates world position and point size for particles
export const dustVertexShader = `
    uniform float uIntensity;
    varying vec3 vWorldPosition;
    
    void main() {
        // 1. (World Space)
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // 2. Standard projection transform (World -> Camera -> Clip)
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
        
        // 3. Dynamic point size: larger when closer, smaller when farther
        // 150.0 is the base size factor, divided by z (depth) for perspective scaling
        gl_PointSize = 1.50 / -gl_Position.z; 
    }
`;

// --- 2. (Fragment Shader) ---
// calculates color and opacity for each pixel (implements flashlight cone logic)
export const dustFragmentShader = `
    uniform sampler2D uMap;     // particle texture
    uniform vec3 uColor;        // particle color
    uniform vec3 uCamPos;       // camera (flashlight) position
    uniform vec3 uCamDir;       // camera (flashlight) direction
    uniform float uLightAngle;  // cosine of flashlight cone angle
    uniform float uIntensity;   // flashlight intensity
    uniform float uOffset;      // vertical offset of flashlight cone
    
    varying vec3 vWorldPosition;

    void main() {
        // 1. Calculate direction vector from "flashlight -> dust"
        vec3 toParticle = normalize(vWorldPosition - uCamPos);
        
        // 2. Calculate angle (dot product)
        // --- Core correction ---
        // We manually correct the camera's direction vector.
        // If the flashlight cone is "too high", we slightly "lower" the detection direction in the shader (uCamDir.y - uOffset)
        // This makes the cone move downward on the screen
        vec3 correctedDir = normalize(vec3(uCamDir.x, uCamDir.y - uOffset, uCamDir.z));

        float dotProd = dot(toParticle, correctedDir);
        
        // 3. Determine if inside the light cone
        // smoothstep(edge0, edge1, x) -> smooth transition at edges
        // If dotProd < uLightAngle, it is outside the cone, result is 0
        float inLight = smoothstep(uLightAngle, uLightAngle + 0.05, dotProd);
        
        // 4. Read texture color
        vec4 texColor = texture2D(uMap, gl_PointCoord);
        
        // 5. Final composition
        // Color = set dust color
        // Opacity = texture alpha * inside light cone * flashlight intensity * 0.5 (base fade)
        gl_FragColor = vec4(uColor, texColor.a * inLight * uIntensity * 2.5);
    }
`;

// --- 3. Helper function: generate soft circular texture ---
export function getSoftParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');

    // Radial gradient: center white -> edge transparent
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)'); 
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 

    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}