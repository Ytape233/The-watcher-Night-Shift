import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { dustVertexShader, dustFragmentShader, getSoftParticleTexture } from './particleShader.js';

// --- private variables ---
let ghostMesh;
let particlesMesh;

const ghostState = {
    phase: 'wander',     // wander, approach, stalk, attack, retreat
    targetX: 0,
    speed: 5.0,
    timer: 0,
    attackSide: 'none',  // left, right
    wanderTimer: 0,
    
    // --- New state variables ---
    rngCheckTimer: 0,    // Used to perform a check at intervals when the flashlight is off
    stalkTimer: 0,       // Records the total time spent standing at the door (3.5s limit)
    exposureTimer: 0     // Records the duration of continuous flashlight exposure (2s target)
};

// 1. Initialization
export function initEnemy(scene) {
    const textureLoader = new THREE.TextureLoader();
    const specificTexture = textureLoader.load('./assets/models/ghost.png');
    specificTexture.colorSpace = THREE.SRGBColorSpace;

    const mtlLoader = new MTLLoader();
    mtlLoader.load('./assets/models/ghost.mtl', function (materials) {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        
        objLoader.load('./assets/models/ghost.obj', function (object) {
            ghostMesh = object;
            ghostMesh.scale.set(3.5, 3.5, 3.5); 
            ghostMesh.position.set(0, 5, -20); 

            ghostMesh.traverse(function (child) {
                if (child.isMesh) {
                    child.material.map = specificTexture;
                    child.material.transparent = false; 
                    child.material.alphaTest = 0.5; 
                    child.material.depthWrite = true;
                    child.castShadow = true;
                    child.material.emissive = new THREE.Color(0x003311);
                    child.material.emissiveMap = specificTexture;
                    child.material.emissiveIntensity = 0.002; 
                }
            });

            scene.add(ghostMesh);
            console.log("Ghost Model Loaded!");

        }, undefined, function (error) {
            console.error('Error loading model:', error);
        });
    });

    createAtmosphereParticles(scene);
}

// 2. Update Logic
export function updateEnemy(dt, camera, flashLight, gameState, gameOverCallback) {
    if (!ghostMesh) return;

    // --- Particle effects update ---
    if (particlesMesh) {
        particlesMesh.rotation.y += dt * 0.02;
        const material = particlesMesh.material;
        if (flashLight) {
            material.uniforms.uCamPos.value.copy(flashLight.position);
            const lightDir = new THREE.Vector3()
                .subVectors(flashLight.target.position, flashLight.position)
                .normalize();
            material.uniforms.uCamDir.value.copy(lightDir);
            material.uniforms.uOffset.value = 0.0; 
        }
        const targetIntensity = gameState.flashlightOn ? 1.0 : 0.0;
        material.uniforms.uIntensity.value = THREE.MathUtils.lerp(
            material.uniforms.uIntensity.value,
            targetIntensity,
            dt * 10
        );
    }
    
    // Billboarding (always face the player)
    ghostMesh.lookAt(camera.position); 

    // General up-and-down floating (when not stalking or attacking)
    if (ghostState.phase !== 'attack' && ghostState.phase !== 'stalk') {
        const time = Date.now() * 0.001;
        ghostMesh.position.y = 4 + Math.sin(time * 2) * 0.5;
    }

    switch(ghostState.phase) {
        case 'wander':
            handleWanderPhase(dt, gameState);
            break;

        case 'approach':
            handleApproachPhase(dt, gameState);
            break;

        case 'stalk':
            // New: Logic for stalking at the door
            handleStalkPhase(dt, camera, gameState, gameOverCallback);
            break;

        case 'attack':
            handleAttackPhase(dt, camera, gameOverCallback);
            break;

        case 'retreat':
            handleRetreatPhase(dt);
            break;
    }
}

// --- State Handling Functions ---

function handleWanderPhase(dt, gameState) {
    // Base position setting
    ghostMesh.position.z = -20;

    // 1. Check flashlight status
    if (gameState.flashlightOn) {
        // [Flashlight On]: Existing logic, slow wandering
        ghostState.wanderTimer += dt * 0.5;
        ghostMesh.position.x = Math.sin(ghostState.wanderTimer) * 8;
        
        // Only trigger normal attack at the edges (Keep existing logic)
        if (Math.random() < 0.005 && Math.abs(ghostMesh.position.x) > 6) {
             triggerNormalAttack(gameState);
        }
    } else {
        // [Flashlight Off]: New logic
        // Still wandering, but perform a check at intervals
        ghostState.wanderTimer += dt * 0.5;
        ghostMesh.position.x = Math.sin(ghostState.wanderTimer) * 8;
        
        ghostState.rngCheckTimer += dt;
        
        // Perform a teleport probability check every 1.5 seconds
        if (ghostState.rngCheckTimer > 1.5) {
            ghostState.rngCheckTimer = 0;
            
            // 50% chance to maintain current state, 50% chance to trigger teleport logic
            if (Math.random() < 0.5) {
                // Try to find open doors
                const availableDoors = [];
                if (gameState.leftOpen) availableDoors.push('left');
                if (gameState.rightOpen) availableDoors.push('right');
                
                // Only teleport if there are open doors
                if (availableDoors.length > 0) {
                    // Randomly select one of the open doors
                    const chosenSide = availableDoors[Math.floor(Math.random() * availableDoors.length)];
                    teleportToDoor(chosenSide);
                } else {
                    // If all doors are closed, do nothing and continue wandering
                    console.log("Ghost wanted to teleport, but doors are closed.");
                }
            }
        }
    }
}

function triggerNormalAttack(gameState) {
    console.log("Ghost deciding to approach normally...");
    ghostState.phase = 'approach';
    
    // Intelligent attack direction selection
    const currentX = ghostMesh.position.x;
    const leftOpen = gameState.leftOpen;
    const rightOpen = gameState.rightOpen;
    
    if (leftOpen && !rightOpen) ghostState.attackSide = 'left';
    else if (rightOpen && !leftOpen) ghostState.attackSide = 'right';
    else if (leftOpen && rightOpen) {
        const nearSide = currentX < 0 ? 'left' : 'right';
        ghostState.attackSide = Math.random() < 0.64 ? nearSide : (nearSide === 'left' ? 'right' : 'left');
    } else {
        ghostState.attackSide = currentX < 0 ? 'left' : 'right';
    }
}

function teleportToDoor(side) {
    console.log(`Ghost TELEPORTING to ${side} door!`);
    
    ghostState.phase = 'stalk';
    ghostState.attackSide = side;
    ghostState.stalkTimer = 0;     // Reset stalk timer
    ghostState.exposureTimer = 0;  // Reset exposure timer
    
    // Teleport position calculation
    // The door is roughly at x=±15, z=-1.
    // We let it stand just a bit outside the door
    const xPos = side === 'left' ? -18 : 18;
    
    // Set position (teleport)
    ghostMesh.position.set(xPos, 4, -2); // y=4 moderate height, z=-2 right at the door
    
    // Restore color (in case it was previously red)
    ghostMesh.traverse(c => { if(c.isMesh) c.material.color.setHex(0xffffff); });
}

function handleStalkPhase(dt, camera, gameState, gameOverCallback) {
    // 1. Timing: total time ghost has been at the door
    ghostState.stalkTimer += dt;
    
    // 2. Check if irradiated by flashlight
    let isIrradiated = false;
    
    if (gameState.flashlightOn) {
        // Calculate the angle between player's facing direction and the "player->ghost" vector
        const toGhost = new THREE.Vector3().subVectors(ghostMesh.position, camera.position).normalize();
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        
        // Dot product: 1.0 = facing directly, 0 = perpendicular.
        // Flashlight roughly 20 degrees cone, cos(10 degrees) ≈ 0.98. We relax it to 0.9 (about 25 degrees) for easier detection
        const dot = camDir.dot(toGhost);
        
        if (dot > 0.9) {
            isIrradiated = true;
        }
    }
    
    // 3. Irradiation logic handling
    if (isIrradiated) {
        ghostState.exposureTimer += dt;
        
        // Visual feedback: shaking
        const shakeIntensity = 0.1;
        ghostMesh.position.x += (Math.random() - 0.5) * shakeIntensity;
        ghostMesh.position.y += (Math.random() - 0.5) * shakeIntensity;
        
        // Visual feedback: turning red (based on exposureTimer / 2.0 ratio)
        const ratio = Math.min(ghostState.exposureTimer / 2.0, 1.0);
        // From white (1,1,1) to red (1,0,0)
        const g = 1.0 - ratio; 
        const b = 1.0 - ratio;
        ghostMesh.traverse(c => { 
            if(c.isMesh) c.material.color.setRGB(1.0, g, b); 
        });

        // Successful banishment check
        if (ghostState.exposureTimer >= 2.0) {
            console.log("Ghost banished by light!");
            ghostState.phase = 'retreat';
            // When retreat is triggered, it will move back from z=-2, passing through the door back into darkness
        }
    } else {
        // If the flashlight is moved away, the exposure timer can slowly decay or remain unchanged (here we choose to keep it unchanged, for a harder challenge you can choose to decay)
        // ghostState.exposureTimer = Math.max(0, ghostState.exposureTimer - dt * 0.5);
    }
    
    // 4. Attack determination (time exhausted)
    // If total time exceeds 4.0 seconds and exposure time is less than 2 seconds
    if (ghostState.stalkTimer >= 4.0 && ghostState.exposureTimer < 2.0) {
        console.log("Stalk time over! Attacking!");
        ghostState.phase = 'attack';
    }
}

function handleApproachPhase(dt, gameState) {
    // Maintain original logic: slowly walk from corridor to door
    const targetDoorX = ghostState.attackSide === 'left' ? -18 : 18;
    const cornerZ = -18;
    const doorZ = -5;

    if (ghostMesh.position.z < cornerZ) {
        ghostMesh.position.z += dt * 3;
        ghostMesh.position.x += (targetDoorX - ghostMesh.position.x) * dt * 2;
    } else if (ghostMesh.position.z < doorZ) {
        ghostMesh.position.x = targetDoorX;
        ghostMesh.position.z += dt * 3;
    } else {
        const isDoorOpen = ghostState.attackSide === 'left' ? gameState.leftOpen : gameState.rightOpen;
        if (isDoorOpen) {
            ghostState.phase = 'attack'; 
        } else {
            ghostState.phase = 'retreat'; 
            ghostMesh.traverse(c => { if(c.isMesh) c.material.color.setHex(0xffaaaa); });
        }
    }
}

function handleAttackPhase(dt, camera, gameOverCallback) {
    ghostMesh.position.lerp(camera.position, dt * 8);
    const dist = ghostMesh.position.distanceTo(camera.position);
    if (dist < 0.5) {
        if(typeof gameOverCallback === 'function') gameOverCallback();
    }
}

function handleRetreatPhase(dt) {
    // Retreat speed
    ghostMesh.position.z -= dt * 10;
    
    // Gradually restore color (if it was previously red)
    ghostMesh.traverse(c => { 
        if(c.isMesh) {
            // Simple interpolation back to white
            const curr = c.material.color;
            c.material.color.setRGB(
                curr.r + (1 - curr.r) * 0.1,
                curr.g + (1 - curr.g) * 0.1,
                curr.b + (1 - curr.b) * 0.1
            );
        }
    });

    if (ghostMesh.position.z < -25) {
        // Reset back to Wander
        ghostState.phase = 'wander';
        ghostMesh.position.z = -20;
        
        // Reset color
        ghostMesh.traverse(c => { if(c.isMesh) c.material.color.setHex(0xffffff); });

        // Based on which side it disappeared from, reset sine wave position
        if (ghostState.attackSide === 'left') {
            ghostMesh.position.x = -8; 
            ghostState.wanderTimer = -Math.PI / 2; 
        } else {
            ghostMesh.position.x = 8;
            ghostState.wanderTimer = Math.PI / 2;
        }
    }
}

// Reset function
export function resetEnemy() {
    console.log("Resetting Enemy...");
    ghostState.phase = 'wander';
    ghostState.stalkTimer = 0;
    ghostState.exposureTimer = 0;
    if(ghostMesh) {
        ghostMesh.position.set(0, 4, -20);
        ghostMesh.traverse(c => { if(c.isMesh) c.material.color.setHex(0xffffff); });
    }
}

// 1. Check if the ghost is currently blocking the specified door
export function isGhostBlockingDoor(side) {
    // Only counts as blocking if in 'stalk' phase and exactly on that side
    return ghostState.phase === 'stalk' && ghostState.attackSide === side;
}

// 2. Ghost's reaction when hit by the door
export function onGhostHitByDoor() {
    console.log("Ghost hit by door! Retreating temporarily...");
    
    // Ghost receives physical hit, forced to retreat
    ghostState.phase = 'retreat';
    
    // Reset timers
    ghostState.stalkTimer = 0;
    ghostState.exposureTimer = 0;

    // Visual feedback: ghost instantly turns red, simulating injury/anger
    if (ghostMesh) {
        ghostMesh.traverse(c => { 
            if(c.isMesh) c.material.color.setHex(0x550000); 
        });
    }
}

function createAtmosphereParticles(scene) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 1000000; i++) {
        vertices.push((Math.random() - 0.5) * 80); 
        vertices.push((Math.random() - 0.5) * 40 + 3); 
        vertices.push((Math.random() - 0.5) * 80); 
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: getSoftParticleTexture() },
            uColor: { value: new THREE.Color(0x8899aa) },
            uCamPos: { value: new THREE.Vector3() },
            uCamDir: { value: new THREE.Vector3(0, 0, -1) },
            uLightAngle: { value: Math.cos(Math.PI / 10) }, 
            uIntensity: { value: 0.0 }, 
            uOffset: { value: 0.16 } 
        },
        vertexShader: dustVertexShader,
        fragmentShader: dustFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    particlesMesh = new THREE.Points(geometry, material);
    scene.add(particlesMesh);
}