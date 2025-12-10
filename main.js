import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FlashlightSystem } from './flashlight.js';
import { initEnemy, updateEnemy, resetEnemy, isGhostBlockingDoor, onGhostHitByDoor } from './enemy.js';

// --- Global Variables ---
let scene, camera, renderer;
let leftDoor, rightDoor;
let ceilingLight, bulbMat, flashLight;
let flashlightSystem;

const gameState = {
    isPlaying: false,
    leftOpen: true,
    rightOpen: true,
    // --- Door damage states ---
    leftBroken: false,  // Whether left door is broken
    rightBroken: false, // Whether right door is broken
    isGameOver: false,
    flashlightOn: false 
};

const clock = new THREE.Clock();

init();
animate();

function init() {
    // 1. Initialize scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.03); // Slightly lighter fog

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 2. Load textures
    const textureLoader = new THREE.TextureLoader();
    
    // --- Load PBR floor textures (rough_wood) ---
    const floorPath = './assets/textures/floor/rough_wood_';

    // Load all texture channels
    const floorColor = textureLoader.load(floorPath + 'diff_1k.jpg');   // Diffuse/Color
    const floorNormal = textureLoader.load(floorPath + 'nor_gl_1k.jpg'); // Normal map (OpenGL)
    const floorRough = textureLoader.load(floorPath + 'rough_1k.jpg');  // Roughness
    const floorAO = textureLoader.load(floorPath + 'ao_1k.jpg');        // Ambient Occlusion
    const floorDisp = textureLoader.load(floorPath + 'disp_1k.jpg');    // Displacement/Height

    // Set texture wrapping and repeat for all floor textures
    const floorTextures = [floorColor, floorNormal, floorRough, floorAO, floorDisp];
    
    floorTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        // Floor is large (100x100), so use high repeat count to avoid giant wood grain
        t.repeat.set(30, 30); 
    });

    // Color texture must use sRGB color space
    floorColor.colorSpace = THREE.SRGBColorSpace;

    // Define floor material with PBR properties
    const floorMat = new THREE.MeshStandardMaterial({ 
        map: floorColor,
        
        normalMap: floorNormal,
        normalScale: new THREE.Vector2(1, 1), // Adjust bump intensity
        
        roughnessMap: floorRough,
        roughness: 1.0, // Used with roughnessMap
        
        aoMap: floorAO,
        aoMapIntensity: 1.0,
        
        displacementMap: floorDisp,
        displacementScale: 0.1, // Slight surface variation, too high causes clipping
        
        side: THREE.DoubleSide
    });

    // --- Load PBR wall textures (castle brick) ---
    const path = './assets/textures/wall1/castle_brick_02_white_';
    
    const wallColor = textureLoader.load(path + 'diff_1k.jpg');   // Diffuse/Color
    const wallNormal = textureLoader.load(path + 'nor_gl_1k.jpg'); // Normal map (use OpenGL version)
    const wallRough = textureLoader.load(path + 'rough_1k.jpg');  // Roughness
    const wallAO = textureLoader.load(path + 'ao_1k.jpg');        // Ambient Occlusion
    const wallDisp = textureLoader.load(path + 'disp_1k.jpg');    // Displacement/Height

    // Set texture wrapping and repeat - all textures must align perfectly
    const wallTextures = [wallColor, wallNormal, wallRough, wallAO, wallDisp];
    
    wallTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2); // Match original wall texture density
    });

    // Color texture uses sRGB space, math textures (normal/roughness) stay in Linear space
    wallColor.colorSpace = THREE.SRGBColorSpace;

    // Create PBR wall material using MeshStandardMaterial
    const wallMat = new THREE.MeshStandardMaterial({ 
        map: wallColor,
        
        normalMap: wallNormal,      // Add surface detail and bump
        normalScale: new THREE.Vector2(1, 1), // Adjust bump intensity
        
        roughnessMap: wallRough,    // Control surface smoothness variation
        roughness: 1.0,             // Base roughness, used with roughnessMap
        
        aoMap: wallAO,              // Add shadow details in crevices
        aoMapIntensity: 1.0,
        
        displacementMap: wallDisp,  // Real geometric displacement
        displacementScale: 0.15,    // Sensitive value, too high causes artifacts
        
        side: THREE.DoubleSide
    });

    // --- Load concrete wall textures (Dirty Concrete) for front wall ---
    const concretePath = './assets/textures/wall2/dirty_concrete_';
    
    const concColor = textureLoader.load(concretePath + 'diff_1k.jpg');
    const concNormal = textureLoader.load(concretePath + 'nor_gl_1k.jpg');
    const concRough = textureLoader.load(concretePath + 'rough_1k.jpg');
    const concAO = textureLoader.load(concretePath + 'ao_1k.jpg');
    const concDisp = textureLoader.load(concretePath + 'disp_1k.jpg');

    const concTextures = [concColor, concNormal, concRough, concAO, concDisp];
    concTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(6, 1); 
    });
    concColor.colorSpace = THREE.SRGBColorSpace;

    // Define concrete material
    const concreteMat = new THREE.MeshStandardMaterial({ 
        map: concColor,
        normalMap: concNormal,
        roughnessMap: concRough,
        roughness: 1.0,
        aoMap: concAO,
        aoMapIntensity: 1.5,
        displacementMap: concDisp,
        displacementScale: 0.15, // Less displacement for concrete
        side: THREE.DoubleSide
    });

    // --- Load door PBR textures (Rusty Metal Grid) ---
    const doorPath = './assets/textures/door/rusty_metal_grid_';

    const doorColor = textureLoader.load(doorPath + 'diff_1k.jpg');
    const doorNormal = textureLoader.load(doorPath + 'nor_gl_1k.jpg');
    const doorRough = textureLoader.load(doorPath + 'rough_1k.jpg');
    const doorAO = textureLoader.load(doorPath + 'ao_1k.jpg');
    const doorDisp = textureLoader.load(doorPath + 'disp_1k.jpg');
    const doorMetal = textureLoader.load(doorPath + 'arm_1k.jpg'); // ARM texture for metalness

    const doorTextures = [doorColor, doorNormal, doorRough, doorAO, doorDisp, doorMetal];

    doorTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        // Door is 8 wide x 14 tall
        // Use high repeat to avoid stretching the grid pattern
        t.repeat.set(2, 4); 
    });

    doorColor.colorSpace = THREE.SRGBColorSpace;

    // Create door material with metallic properties
    const doorMat = new THREE.MeshStandardMaterial({
        map: doorColor,
        
        normalMap: doorNormal,
        normalScale: new THREE.Vector2(1, 1),

        roughnessMap: doorRough,
        roughness: 1.0, 

        aoMap: doorAO,
        aoMapIntensity: 1.0,
        
        // For rusty metal, metalnessMap is important
        // ARM texture: R=AO, G=Roughness, B=Metalness
        metalnessMap: doorMetal, 
        metalness: 1.0, 

        displacementMap: doorDisp,
        displacementScale: 0.2, // Grid door can have stronger bump

        side: THREE.DoubleSide
    });

    // --- Load player chair model ---
    const mtlLoader = new MTLLoader();
    
    mtlLoader.load('./assets/models/chair.mtl', function (materials) {
        materials.preload();
        
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        
        objLoader.load('./assets/models/chair.obj', function (object) {
            
            // 1. Manual texture loading and application (prevent black model due to MTL path issues)
            const chairTex = textureLoader.load('./assets/models/chair.png'); 
            chairTex.colorSpace = THREE.SRGBColorSpace;

            object.traverse(function (child) {
                if (child.isMesh) {
                    child.material.map = chairTex; // Force assign texture
                    child.castShadow = true;       // Chair casts shadow
                    child.receiveShadow = true;    // Chair receives flashlight shadows
                }
            });

            // 2. Positioning
            // Player is at (0, 5, 5), so chair is placed at (0, 2.20, 5) on the floor
            object.position.set(0, 2.20, 5);
            
            // 3. Rotation
            // Math.PI (180 degrees) makes the chair face away from the window, showing the player's back (simulating the player just sat down)
            // Or set to 0 to face the desk. Usually, chairs face the desk.
            object.rotation.y = Math.PI; 

            // 4. Scaling
            // OBJ model units are usually inconsistent. Adjust here if the chair is too big or too small.
            object.scale.set(2.0, 2.0, 2.0); 

            scene.add(object);
            
        }, undefined, function(error) {
            console.error("加载椅子出错:", error);
        });
    });
    
    // 3. Scene construction: modular room (solving "wall behind glass" and "door facing wall" issues)
    
    // --- A. Floor and ceiling ---
    // Huge floor (including inside the room and outside the corridor)
    const bigFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 200, 200), floorMat);
    bigFloor.rotation.x = -Math.PI / 2;
    bigFloor.receiveShadow = true;
    scene.add(bigFloor);

    // Huge ceiling (prevent light leakage)
    const hallCeiling = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), wallMat);
    hallCeiling.rotation.x = Math.PI / 2;
    hallCeiling.position.set(0, 15, -5); // Cover the front corridor
    scene.add(hallCeiling);

    // --- B. Wall assembly ---
    
    // 1. Back wall (solid)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(30, 15, 100, 100), wallMat);
    backWall.position.set(0, 7.5, 15);
    backWall.rotation.y = Math.PI; // Facing inside the room
    scene.add(backWall);

    // 2. Front wall (with window opening)
    // Room width 30 (-15 to 15), height 15. Window width 20 (-10 to 10), height 10 (from 5 to 15 above ground).
    // We need to assemble 4 panels to surround this opening, or simply: left and right parts + low wall below window
    
    // Front wall - left part
    const frontWallLeft = new THREE.Mesh(new THREE.PlaneGeometry(5, 15), wallMat);
    frontWallLeft.position.set(-12.5, 7.5, -15);
    scene.add(frontWallLeft);

    // Front wall - right part 
    const frontWallRight = new THREE.Mesh(new THREE.PlaneGeometry(5, 15), wallMat);
    frontWallRight.position.set(12.5, 7.5, -15);
    scene.add(frontWallRight);

    // Front wall - low wall below window (y: 0 to 2)
    const frontWallBottom = new THREE.Mesh(new THREE.PlaneGeometry(20, 2), concreteMat);
    frontWallBottom.position.set(0, 1, -15);
    scene.add(frontWallBottom);
    
    // Front wall - top beam above window (y: 12 to 15)
    const frontWallTop = new THREE.Mesh(new THREE.PlaneGeometry(20, 3), concreteMat);
    frontWallTop.position.set(0, 13.5, -15);
    scene.add(frontWallTop);

    // Real glass window
    const glassGeo = new THREE.PlaneGeometry(20, 10);
    const glassMat = new THREE.MeshPhysicalMaterial({ 
    color: 0xffffff,        // use white to avoid ghost color distortion
    transmission: 1.0,      // Full transmission (core to glass appearance)
    opacity: 1.0,           // Since transmission is used, opacity should be set to 1
    transparent: true,      // Must be enabled to trigger transmission
    roughness: 0.0,         // The smoother, the clearer
    metalness: 0.0,         // Glass is usually non-metallic
    ior: 1.5,               // Index of refraction (glass is about 1.5)
    thickness: 0.1,         // Adds a bit of thickness feel
    side: THREE.DoubleSide
    });
    const windowPane = new THREE.Mesh(glassGeo, glassMat);
    windowPane.position.set(0, 7, -15);
    scene.add(windowPane);

    // 3. Side walls (with door openings)
    // Door width about 8, located around z = -5.
    // Side walls are divided into: back half (solid) and front half (solid), with a gap in the middle for the door.

    // Left wall (x = -15)
    // Back half (z: 15 to -1)
    const leftWallBack = new THREE.Mesh(new THREE.PlaneGeometry(16, 15, 100, 100), wallMat);
    leftWallBack.rotation.y = Math.PI / 2;
    leftWallBack.position.set(-15, 7.5, 7); // Center point calculation: (15 + -1)/2 = 7
    scene.add(leftWallBack);
    
    // Front half (z: -9 to -15)
    const leftWallFront = new THREE.Mesh(new THREE.PlaneGeometry(6, 15, 100, 100), wallMat);
    leftWallFront.rotation.y = Math.PI / 2;
    leftWallFront.position.set(-15, 7.5, -12);
    scene.add(leftWallFront);

    // Right wall (x = 15) - same logic
    const rightWallBack = new THREE.Mesh(new THREE.PlaneGeometry(16, 15, 100, 100), wallMat);
    rightWallBack.rotation.y = -Math.PI / 2;
    rightWallBack.position.set(15, 7.5, 7);
    scene.add(rightWallBack);

    const rightWallFront = new THREE.Mesh(new THREE.PlaneGeometry(6, 15, 100, 100), wallMat);
    rightWallFront.rotation.y = -Math.PI / 2;
    rightWallFront.position.set(15, 7.5, -12);
    scene.add(rightWallFront);

    // --- C. External corridor structure ---
    // To prevent players from seeing the void through the glass, add two walls to the corridor
    const hallLeft = new THREE.Mesh(new THREE.PlaneGeometry(20, 15, 100, 100), wallMat);
    hallLeft.rotation.y = Math.PI / 2;
    hallLeft.position.set(-25, 7.5, -13);
    scene.add(hallLeft);

    const hallRight = new THREE.Mesh(new THREE.PlaneGeometry(20, 15, 100, 100), wallMat);
    hallRight.rotation.y = -Math.PI / 2;
    hallRight.position.set(25, 7.5, -13);
    scene.add(hallRight);
    
    // Corridor end wall
    const hallBack = new THREE.Mesh(new THREE.PlaneGeometry(50, 15, 100, 100), wallMat);
    hallBack.position.set(0, 7.5, -35);
    scene.add(hallBack);

    // 4. Door system (placed in the side wall openings reserved earlier)
    // Door center roughly at z = -5
    // Pass in doorMat
    leftDoor = createDoor(-15, doorMat);  
    rightDoor = createDoor(15, doorMat);
    // Right door does not need initial rotation, closed state is rotation.y = 0 

    // 5. Lighting system
    
    // --- A. Ambient atmosphere (very dark) ---
    // Fog changed to pure black to simulate deep darkness
    scene.fog = new THREE.FogExp2(0x000000, 0.03); 
    
    // Ambient light set to very faint deep blue (moonlight feel), almost invisible, just to prevent shadows from becoming pitch black
    const ambient = new THREE.AmbientLight(0x050510, 0.09); 
    scene.add(ambient);

    // --- B. Corridor light (ghost background light) ---
    // Dimmed and limited range to make the ghost faintly visible in the distance
    const hallLight = new THREE.PointLight(0x88ff88, 0.5, 20, 2); 
    hallLight.position.set(0, 10, -20);
    scene.add(hallLight);

    // --- C. Flickering desk lamp inside the room ---
    const lampGroup = new THREE.Group();
    const shade = new THREE.Mesh(
        new THREE.ConeGeometry(2, 1, 32, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide })
    );
    shade.position.y = 14;
    lampGroup.add(shade);
    
    bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2), bulbMat); // Bulb made smaller
    bulb.position.y = 13.5;
    lampGroup.add(bulb);
    scene.add(lampGroup);

    // SpotLight instead of PointLight to simulate the lampshade's downward spotlight effect
    ceilingLight = new THREE.SpotLight(0xffaa00, 0, 30, Math.PI / 6, 1, 1); //distance=30 (enough to reach the floor), decay=1 (physical decay)
    ceilingLight.position.set(0, 13.5, 0);
    ceilingLight.castShadow = true;
    // Shadow bias to reduce artifacts
    ceilingLight.shadow.bias = -0.0001; 
    scene.add(ceilingLight);


    // --- D. Player flashlight (core light source) ---
    flashLight = new THREE.SpotLight(0xffffff, 0); 
    flashLight.angle = Math.PI / 10; // Spotlight cone angle smaller, more focused (about 22 degrees)
    flashLight.penumbra = 0.2;      // Edges slightly softer to simulate a real flashlight
    flashLight.decay = 2;           // Quickly dims with distance
    flashLight.distance = 100;       // Range
    flashLight.castShadow = true;
    
    // Note: Changed to scene.add here because flashlight.js will manually update its position
    scene.add(flashLight); 
    scene.add(flashLight.target); // target also needs to be added to the scene
    
    scene.add(camera);

    flashlightSystem = new FlashlightSystem(camera, flashLight);

    initEnemy(scene);
    setupInputs();
    window.addEventListener('resize', onWindowResize, false);
}

function createDoor(xPos, material) { // Add material parameter
    const doorGroup = new THREE.Group();
    
    // Door panel width 8, height 14, thickness 1
    // UV mapping of BoxGeometry can sometimes stretch on the sides, but usually works fine for mesh textures
    const doorGeo = new THREE.BoxGeometry(1, 14, 8);
    
    // Use the passed-in PBR material, or default if not provided (to prevent errors)
    const useMat = material || new THREE.MeshStandardMaterial({ color: 0x333333 });
    
    const doorMesh = new THREE.Mesh(doorGeo, useMat);
    
    // Enable shadows
    doorMesh.castShadow = true;
    doorMesh.receiveShadow = true;

    if (xPos < 0) {
        doorMesh.position.z = 4;
    } else {
        doorMesh.position.z = 4;
    }
    
    doorGroup.add(doorMesh);
    doorGroup.position.set(xPos, 6, -1);
    scene.add(doorGroup);
    return doorGroup;
}

function setupInputs() {

    const overlay = document.getElementById('overlay');
    overlay.addEventListener('click', () => { 
        // if is Game Over, restart instead of locking pointer
        if (gameState.isGameOver) {
            restartGame();
            return; // end here
        }
        
        // only when not in Game Over state (i.e., in the start menu), click to lock the mouse and start the game
        document.body.requestPointerLock(); 
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            gameState.isPlaying = true;
            overlay.style.display = 'none';
        } else {
            gameState.isPlaying = false;
            overlay.style.display = 'flex';
            // Only show PAUSED when the game is not over
            if (!gameState.isGameOver) {
                document.getElementById('overlay-text').innerText = "PAUSED";
            }
        }
    });
    document.addEventListener('mousemove', (event) => {
        if (!gameState.isPlaying) return;
        camera.rotation.y -= event.movementX * 0.002;
        camera.rotation.x -= event.movementY * 0.002;
        camera.rotation.x = Math.max(-1, Math.min(1, camera.rotation.x));
    });

    document.addEventListener('keydown', (e) => {
        if (!gameState.isPlaying || gameState.isGameOver) return;

        // --- Left door control (Q) ---
        if(e.code === 'KeyQ') { 
            // 1. If the door is already broken, key press is invalid, issue a warning
            if (gameState.leftBroken) {
                console.log("Left door is BROKEN! Cannot move.");
                return;
            }

            // 2. Check if trying to close the door on the ghost
            // Logic: currently open (gameState.leftOpen) + ghost is blocking the door (isGhostBlockingDoor)
            if (gameState.leftOpen && isGhostBlockingDoor('left')) {
                triggerDoorBreak('left'); // Trigger break logic
            } else {
                // Normal open/close door
                gameState.leftOpen = !gameState.leftOpen;
                // Mutual exclusion logic (keep as is)
                if (!gameState.leftOpen && !gameState.rightOpen) gameState.rightOpen = true;
                updateDoorVisuals(); 
            }
        }

        // --- Right door control (E) ---
        if(e.code === 'KeyE') { 
            if (gameState.rightBroken) {
                console.log("Right door is BROKEN! Cannot move.");
                return;
            }

            if (gameState.rightOpen && isGhostBlockingDoor('right')) {
                triggerDoorBreak('right');
            } else {
                gameState.rightOpen = !gameState.rightOpen;
                if (!gameState.rightOpen && !gameState.leftOpen) gameState.leftOpen = true;
                updateDoorVisuals(); 
            }
        }
    });

    // --- Mouse click controls flashlight model ---
    document.addEventListener('mousedown', (e) => { 
        if(gameState.isPlaying) {
            // Trigger button press animation
            flashlightSystem.pressButton();
        }
    });

    document.addEventListener('mouseup', () => { 
        if(gameState.isPlaying) {
            // Trigger button release animation and toggle switch
            flashlightSystem.releaseButton();
        }
    });
}

function triggerDoorBreak(side) {
    console.log(`CRITICAL: ${side} DOOR BROKEN!`);
    
    // 1. Mark the door as broken
    if (side === 'left') gameState.leftBroken = true;
    if (side === 'right') gameState.rightBroken = true;

    // 2. The door is forced to remain "open" (because it's broken and can't be closed)
    if (side === 'left') gameState.leftOpen = true;
    if (side === 'right') gameState.rightOpen = true;

    // 3. Notify the ghost to retreat
    onGhostHitByDoor();

    // 4. Update visuals
    updateDoorVisuals();

    // 5. Screen shake feedback (simulate impact)
    const shakeIntensity = 0.5;
    const startShake = Date.now();
    
    // Save original position
    const originalX = camera.position.x;
    const originalY = camera.position.y;
    
    const shakeInterval = setInterval(() => {
        const elapsed = Date.now() - startShake;
        if (elapsed > 500) { // Shake for 0.5 seconds
            clearInterval(shakeInterval);
            // Restore to original position
            camera.position.x = originalX;
            camera.position.y = originalY;
            return;
        }
        // Shake around original position
        camera.position.x = originalX + (Math.random() - 0.5) * shakeIntensity;
        camera.position.y = originalY + (Math.random() - 0.5) * shakeIntensity;
    }, 16);
}

function updateDoorVisuals() {
    // Helper function: handle visual state of a single door
    const updateSingleDoor = (doorGroup, isOpen, isBroken, sideMultiplier) => {
        if (isBroken) {
            // --- Broken state ---
            // 1. Door appears half-open and stuck (45 degrees)
            // sideMultiplier: 1 for left door, -1 for right door, controls rotation direction
            doorGroup.rotation.y = sideMultiplier * (Math.PI / 4); 
            
            // 2. Door panel is tilted (simulate hinge break)
            doorGroup.rotation.z = sideMultiplier * 0.1; // Slightly tilted
            doorGroup.position.y = 5.8; // Slightly dropped (original height is 6)

        } else {
            // --- Normal state ---
            // Restore position and Z-axis rotation (in case previously broken and game reset)
            doorGroup.rotation.z = 0;
            doorGroup.position.y = 6;
            doorGroup.children[0].material.color.setHex(0xffffff);

            // Normal open/close logic
            // Left door closed: -PI, Right door closed: PI
            const closedRot = sideMultiplier * -Math.PI;
            doorGroup.rotation.y = isOpen ? 0 : closedRot;
        }
    };

    // Update left door (sideMultiplier = 1)
    // Left door closed: -PI
    updateSingleDoor(leftDoor, gameState.leftOpen, gameState.leftBroken, 1);

    // Update right door (sideMultiplier = -1)
    // Note: original logic right door closed is PI.
    // To reuse the function, we can pass isOpen ? 0 : Math.PI, or write manually:
    
    if (gameState.rightBroken) {
        rightDoor.rotation.y = -Math.PI / 4; // Tilted to one side
        rightDoor.rotation.z = -0.1;
        rightDoor.position.y = 5.8;
        rightDoor.children[0].material.color.setHex(0xffffff);
    } else {
        rightDoor.rotation.z = 0;
        rightDoor.position.y = 6;
        rightDoor.children[0].material.color.setHex(0xffffff); 
        rightDoor.rotation.y = gameState.rightOpen ? 0 : Math.PI;
    }

    // Update UI
    const uiLeft = document.getElementById('status-left');
    const uiRight = document.getElementById('status-right');
    
    // Update left UI
    if (gameState.leftBroken) {
        uiLeft.className = 'door-status open'; // Style uses red "open"
        uiLeft.innerText = "BROKEN";           // Text shows broken
        uiLeft.style.color = "#880000";        // Dark red text
        uiLeft.style.borderColor = "#880000";
    } else {
        uiLeft.style.color = ""; // Restore default
        uiLeft.style.borderColor = "";
        uiLeft.className = `door-status ${gameState.leftOpen ? 'open' : 'closed'}`;
        uiLeft.innerText = gameState.leftOpen ? "OPEN" : "CLOSED";
    }

    // Update right UI
    if (gameState.rightBroken) {
        uiRight.className = 'door-status open';
        uiRight.innerText = "BROKEN";
        uiRight.style.color = "#880000";
        uiRight.style.borderColor = "#880000";
    } else {
        uiRight.style.color = "";
        uiRight.style.borderColor = "";
        uiRight.className = `door-status ${gameState.rightOpen ? 'open' : 'closed'}`;
        uiRight.innerText = gameState.rightOpen ? "OPEN" : "CLOSED";
    }
}

function onGameOver() {
    console.log("GAME OVER!");
    gameState.isPlaying = false;
    gameState.isGameOver = true;
    document.exitPointerLock();
    const overlay = document.getElementById('overlay');
    const overlayText = document.getElementById('overlay-text');
    overlay.style.display = 'flex';
    overlayText.innerText = "GAME OVER - Click to Restart";
    overlayText.style.color = "red";
}

function restartGame() {
    console.log("Restarting game...");
    gameState.isGameOver = false;
    gameState.isPlaying = false;
    gameState.leftOpen = true;
    gameState.rightOpen = true;

    gameState.leftBroken = false;
    gameState.rightBroken = false;

    camera.position.set(0, 5, 5);
    camera.rotation.set(0, 0, 0);
    
    // Restore UI styles
    const uiLeft = document.getElementById('status-left');
    const uiRight = document.getElementById('status-right');
    uiLeft.style.color = ""; uiLeft.style.borderColor = "";
    uiRight.style.color = ""; uiRight.style.borderColor = "";
    
    //reset flashlight battery
    flashlightSystem.battery = 6;
    flashlightSystem.isDepleted = false;
    if(flashlightSystem.isOn) flashlightSystem.toggle(); // Turn off
    
    resetEnemy();
    updateDoorVisuals();
    
    const overlayText = document.getElementById('overlay-text');
    overlayText.innerText = "CLICK TO START";
    overlayText.style.color = "red";
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const time = clock.getElapsedTime();

    // Light flicker logic
    if (Math.random() > 0.95) {
        // Flicker dim
        ceilingLight.intensity = Math.random() * 5; // When dim
        bulbMat.color.setHex(0x331100);
    } else {
        // Normal brightness (because decay:1 is used, intensity needs to be around 20-50 to be bright enough)
        ceilingLight.intensity = 50 + Math.sin(time * 10) * 15; 
        bulbMat.color.setHex(0xffaa00);
    }

    // Update flashlight system (battery, animation)
    // Note: we have handed over the state management of gameState.flashlightOn to flashlightSystem.isOn
    if (flashlightSystem) {
        flashlightSystem.update(dt);
        
        // Sync the flashlight on/off state back to gameState for Enemy.js to read
        // Because enemy.js uses gameState.flashlightOn to determine if it is illuminated
        gameState.flashlightOn = flashlightSystem.isOn; 
    }

    if (gameState.isPlaying && !gameState.isGameOver) {
        // --- Pass flashLight parameter ---
        updateEnemy(dt, camera, flashLight, gameState, onGameOver);
    }

    renderer.render(scene, camera);
}