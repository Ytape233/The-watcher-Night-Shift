import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FlashlightSystem } from './flashlight.js';
import { initEnemy, updateEnemy, resetEnemy, isGhostBlockingDoor, onGhostHitByDoor, updateParticleQuality } from './enemy.js';

// --- Global Variables ---
let scene, camera, renderer;
let leftDoor, rightDoor;
let ceilingLight, bulbMat, flashLight;
let flashlightSystem;
let performanceMode = false;

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

// --- Mobile Touch Variables ---
let touchStartX = 0;
let touchStartY = 0;
let previousTouchX = 0;
let previousTouchY = 0;

init();
animate();

function init() {
    // 1. Initialize scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.03); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 5);

    renderer = new THREE.WebGLRenderer({ 
        antialias: !performanceMode,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 2. Load textures
    const textureLoader = new THREE.TextureLoader();
    
    // --- Load PBR floor textures ---
    const floorPath = './assets/textures/floor/rough_wood_';
    const floorColor = textureLoader.load(floorPath + 'diff_1k.jpg');   
    const floorNormal = textureLoader.load(floorPath + 'nor_gl_1k.jpg'); 
    const floorRough = textureLoader.load(floorPath + 'rough_1k.jpg');  
    const floorAO = textureLoader.load(floorPath + 'ao_1k.jpg');        
    const floorDisp = textureLoader.load(floorPath + 'disp_1k.jpg');    

    const floorTextures = [floorColor, floorNormal, floorRough, floorAO, floorDisp];
    floorTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(30, 30); 
    });
    floorColor.colorSpace = THREE.SRGBColorSpace;

    const floorMat = new THREE.MeshStandardMaterial({ 
        map: floorColor,
        normalMap: floorNormal,
        normalScale: new THREE.Vector2(1, 1), 
        roughnessMap: floorRough,
        roughness: 1.0, 
        aoMap: floorAO,
        aoMapIntensity: 1.0,
        displacementMap: floorDisp,
        displacementScale: 0.1, 
        side: THREE.DoubleSide
    });

    // --- Load PBR wall textures ---
    const path = './assets/textures/wall1/castle_brick_02_white_';
    const wallColor = textureLoader.load(path + 'diff_1k.jpg');   
    const wallNormal = textureLoader.load(path + 'nor_gl_1k.jpg'); 
    const wallRough = textureLoader.load(path + 'rough_1k.jpg');  
    const wallAO = textureLoader.load(path + 'ao_1k.jpg');        
    const wallDisp = textureLoader.load(path + 'disp_1k.jpg');    

    const wallTextures = [wallColor, wallNormal, wallRough, wallAO, wallDisp];
    wallTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 2); 
    });
    wallColor.colorSpace = THREE.SRGBColorSpace;

    const wallMat = new THREE.MeshStandardMaterial({ 
        map: wallColor,
        normalMap: wallNormal,      
        normalScale: new THREE.Vector2(1, 1), 
        roughnessMap: wallRough,    
        roughness: 1.0,             
        aoMap: wallAO,              
        aoMapIntensity: 1.0,
        displacementMap: wallDisp,  
        displacementScale: 0.15,    
        side: THREE.DoubleSide
    });

    // --- Load concrete wall textures ---
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

    const concreteMat = new THREE.MeshStandardMaterial({ 
        map: concColor,
        normalMap: concNormal,
        roughnessMap: concRough,
        roughness: 1.0,
        aoMap: concAO,
        aoMapIntensity: 1.5,
        displacementMap: concDisp,
        displacementScale: 0.15,
        side: THREE.DoubleSide
    });

    // --- Load door PBR textures ---
    const doorPath = './assets/textures/door/rusty_metal_grid_';
    const doorColor = textureLoader.load(doorPath + 'diff_1k.jpg');
    const doorNormal = textureLoader.load(doorPath + 'nor_gl_1k.jpg');
    const doorRough = textureLoader.load(doorPath + 'rough_1k.jpg');
    const doorAO = textureLoader.load(doorPath + 'ao_1k.jpg');
    const doorDisp = textureLoader.load(doorPath + 'disp_1k.jpg');
    const doorMetal = textureLoader.load(doorPath + 'arm_1k.jpg'); 

    const doorTextures = [doorColor, doorNormal, doorRough, doorAO, doorDisp, doorMetal];
    doorTextures.forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 4); 
    });
    doorColor.colorSpace = THREE.SRGBColorSpace;

    const doorMat = new THREE.MeshStandardMaterial({
        map: doorColor,
        normalMap: doorNormal,
        normalScale: new THREE.Vector2(1, 1),
        roughnessMap: doorRough,
        roughness: 1.0, 
        aoMap: doorAO,
        aoMapIntensity: 1.0,
        metalnessMap: doorMetal, 
        metalness: 1.0, 
        displacementMap: doorDisp,
        displacementScale: 0.2, 
        side: THREE.DoubleSide
    });

    // --- Load player chair model ---
    const mtlLoader = new MTLLoader();
    mtlLoader.load('./assets/models/chair.mtl', function (materials) {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        
        objLoader.load('./assets/models/chair.obj', function (object) {
            const chairTex = textureLoader.load('./assets/models/chair.png'); 
            chairTex.colorSpace = THREE.SRGBColorSpace;

            object.traverse(function (child) {
                if (child.isMesh) {
                    child.material.map = chairTex; 
                    child.castShadow = true;       
                    child.receiveShadow = true;    
                }
            });

            object.position.set(0, 2.20, 5);
            object.rotation.y = Math.PI; 
            object.scale.set(2.0, 2.0, 2.0); 
            scene.add(object);
        }, undefined, function(error) {
            console.error("error loading chair model:", error);
        });
    });
    
    // 3. Scene construction
    const bigFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 200, 200), floorMat);
    bigFloor.rotation.x = -Math.PI / 2;
    bigFloor.receiveShadow = true;
    scene.add(bigFloor);

    const hallCeiling = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), wallMat);
    hallCeiling.rotation.x = Math.PI / 2;
    hallCeiling.position.set(0, 15, -5); 
    scene.add(hallCeiling);

    // Wall assembly
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(30, 15, 100, 100), wallMat);
    backWall.position.set(0, 7.5, 15);
    backWall.rotation.y = Math.PI; 
    scene.add(backWall);

    const frontWallLeft = new THREE.Mesh(new THREE.PlaneGeometry(5, 15), wallMat);
    frontWallLeft.position.set(-12.5, 7.5, -15);
    scene.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(new THREE.PlaneGeometry(5, 15), wallMat);
    frontWallRight.position.set(12.5, 7.5, -15);
    scene.add(frontWallRight);

    const frontWallBottom = new THREE.Mesh(new THREE.PlaneGeometry(20, 2), concreteMat);
    frontWallBottom.position.set(0, 1, -15);
    scene.add(frontWallBottom);
    
    const frontWallTop = new THREE.Mesh(new THREE.PlaneGeometry(20, 3), concreteMat);
    frontWallTop.position.set(0, 13.5, -15);
    scene.add(frontWallTop);

    const glassGeo = new THREE.PlaneGeometry(20, 10);
    const glassMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xffffff,
        transmission: 1.0,
        opacity: 1.0,
        transparent: true,
        roughness: 0.0,
        metalness: 0.0,
        ior: 1.5,
        thickness: 0.1,
        side: THREE.DoubleSide
    });
    const windowPane = new THREE.Mesh(glassGeo, glassMat);
    windowPane.position.set(0, 7, -15);
    windowPane.name = 'WindowGlass';
    scene.add(windowPane);

    // Left wall
    const leftWallBack = new THREE.Mesh(new THREE.PlaneGeometry(16, 15, 100, 100), wallMat);
    leftWallBack.rotation.y = Math.PI / 2;
    leftWallBack.position.set(-15, 7.5, 7); 
    scene.add(leftWallBack);
    
    const leftWallFront = new THREE.Mesh(new THREE.PlaneGeometry(6, 15, 100, 100), wallMat);
    leftWallFront.rotation.y = Math.PI / 2;
    leftWallFront.position.set(-15, 7.5, -12);
    scene.add(leftWallFront);

    // Right wall
    const rightWallBack = new THREE.Mesh(new THREE.PlaneGeometry(16, 15, 100, 100), wallMat);
    rightWallBack.rotation.y = -Math.PI / 2;
    rightWallBack.position.set(15, 7.5, 7);
    scene.add(rightWallBack);

    const rightWallFront = new THREE.Mesh(new THREE.PlaneGeometry(6, 15, 100, 100), wallMat);
    rightWallFront.rotation.y = -Math.PI / 2;
    rightWallFront.position.set(15, 7.5, -12);
    scene.add(rightWallFront);

    // External corridor
    const hallLeft = new THREE.Mesh(new THREE.PlaneGeometry(20, 15, 100, 100), wallMat);
    hallLeft.rotation.y = Math.PI / 2;
    hallLeft.position.set(-25, 7.5, -13);
    scene.add(hallLeft);

    const hallRight = new THREE.Mesh(new THREE.PlaneGeometry(20, 15, 100, 100), wallMat);
    hallRight.rotation.y = -Math.PI / 2;
    hallRight.position.set(25, 7.5, -13);
    scene.add(hallRight);
    
    const hallBack = new THREE.Mesh(new THREE.PlaneGeometry(50, 15, 100, 100), wallMat);
    hallBack.position.set(0, 7.5, -35);
    scene.add(hallBack);

    // 4. Door system
    leftDoor = createDoor(-15, doorMat);  
    rightDoor = createDoor(15, doorMat);

    // 5. Lighting system
    scene.fog = new THREE.FogExp2(0x000000, 0.03); 
    
    const ambient = new THREE.AmbientLight(0x050510, 0.09); 
    scene.add(ambient);

    const hallLight = new THREE.PointLight(0x88ff88, 0.5, 20, 2); 
    hallLight.position.set(0, 10, -20);
    scene.add(hallLight);

    const lampGroup = new THREE.Group();
    const shade = new THREE.Mesh(
        new THREE.ConeGeometry(2, 1, 32, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide })
    );
    shade.position.y = 14;
    lampGroup.add(shade);
    
    bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2), bulbMat);
    bulb.position.y = 13.5;
    lampGroup.add(bulb);
    scene.add(lampGroup);

    ceilingLight = new THREE.SpotLight(0xffaa00, 0, 30, Math.PI / 6, 1, 1); 
    ceilingLight.position.set(0, 13.5, 0);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.bias = -0.0001; 
    scene.add(ceilingLight);

    flashLight = new THREE.SpotLight(0xffffff, 0); 
    flashLight.angle = Math.PI / 10; 
    flashLight.penumbra = 0.2;      
    flashLight.decay = 2;           
    flashLight.distance = 100;       
    flashLight.castShadow = true;
    
    scene.add(flashLight); 
    scene.add(flashLight.target); 
    
    scene.add(camera);

    flashlightSystem = new FlashlightSystem(camera, flashLight);

    initEnemy(scene, performanceMode);
    setupInputs();
    window.addEventListener('resize', onWindowResize, false);
}

function togglePerformanceMode() {
    performanceMode = !performanceMode;
    const overlayStatus = document.getElementById('overlay-status');
    
    // 1. update particle quality
    updateParticleQuality(scene, performanceMode);

    if (performanceMode) {
        // --- PROTOTYPE MODE ---
        // Lower resolution (1/4)
        renderer.setSize(window.innerWidth / 4, window.innerHeight / 4, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        
        // Disable shadows
        renderer.shadowMap.enabled = false;
        scene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
            }
            if (child.isLight) {
                child.castShadow = false;
            }
        });

        console.log("MODE: PROTOTYPE");
        if(overlayStatus) {
            overlayStatus.innerText = "SYSTEM: SAFE MODE (LOW RES)";
            overlayStatus.style.display = 'block';
            setTimeout(() => overlayStatus.style.display = 'none', 2000);
        }

    } else {
        // --- HIGH QUALITY MODE ---
        renderer.setSize(window.innerWidth, window.innerHeight, true);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        scene.traverse((child) => {
            if (child.isMesh && child.name !== 'Skybox') { 
                // [FIX] Prevent glass from casting/receiving shadows
                if (child.name === 'WindowGlass') {
                    child.castShadow = false;
                    child.receiveShadow = false;
                } else {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            }
            if (child.isLight && child.intensity > 0) {
                child.castShadow = true;
            }
        });
        
        console.log("MODE: HIGH FIDELITY");
        if(overlayStatus) {
            overlayStatus.innerText = "SYSTEM: HD LINK ESTABLISHED";
            overlayStatus.style.display = 'block';
            setTimeout(() => overlayStatus.style.display = 'none', 2000);
        }
    }
}

function createDoor(xPos, material) {
    const doorGroup = new THREE.Group();
    const doorGeo = new THREE.BoxGeometry(1, 14, 8);
    const useMat = material || new THREE.MeshStandardMaterial({ color: 0x333333 });
    const doorMesh = new THREE.Mesh(doorGeo, useMat);
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
    
    // --- 1. Start Game Logic (PC & Mobile) ---
    overlay.addEventListener('click', () => { 
        if (gameState.isGameOver) {
            restartGame();
            return;
        }

        // Check if device is likely mobile (touch capable)
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        if (isTouchDevice) {
            // Mobile: Start game immediately, show controls
            gameState.isPlaying = true;
            overlay.style.display = 'none';
            // Ensure mobile controls are visible (CSS handles this, but good to be safe)
            const mobileControls = document.getElementById('mobile-controls');
            if(mobileControls) mobileControls.style.display = 'block';
            const btnProto = document.getElementById('btn-proto');
            if(btnProto) btnProto.style.display = 'flex';
        } else {
            // PC: Request pointer lock
            document.body.requestPointerLock(); 
        }
    });

    // Pointer Lock Change (PC Only)
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            gameState.isPlaying = true;
            overlay.style.display = 'none';
        } else {
            gameState.isPlaying = false;
            overlay.style.display = 'flex';
            if (!gameState.isGameOver) {
                document.getElementById('overlay-text').innerText = "PAUSED";
            }
        }
    });

    // --- 2. Camera Controls (Look) ---

    // PC: Mouse Movement
    document.addEventListener('mousemove', (event) => {
        if (!gameState.isPlaying) return;
        camera.rotation.y -= event.movementX * 0.002;
        camera.rotation.x -= event.movementY * 0.002;
        camera.rotation.x = Math.max(-1, Math.min(1, camera.rotation.x));
    });

    // Mobile: Touch Movement
    document.addEventListener('touchstart', (e) => {
        if (!gameState.isPlaying) return;
        touchStartX = e.touches[0].pageX;
        touchStartY = e.touches[0].pageY;
        previousTouchX = touchStartX;
        previousTouchY = touchStartY;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!gameState.isPlaying) return;
        
        // Prevent default scrolling only if it's not on a button
        // (But actually, we want to prevent scroll everywhere on the game canvas)
        if(e.cancelable) e.preventDefault(); 

        const touchX = e.touches[0].pageX;
        const touchY = e.touches[0].pageY;

        const deltaX = touchX - previousTouchX;
        const deltaY = touchY - previousTouchY;

        // Sensitivity factor for touch
        const touchSens = 0.005;

        camera.rotation.y -= deltaX * touchSens;
        camera.rotation.x -= deltaY * touchSens;
        
        camera.rotation.x = Math.max(-1, Math.min(1, camera.rotation.x));

        previousTouchX = touchX;
        previousTouchY = touchY;
    }, { passive: false });


    // --- 3. Door Controls ---

    // Function to handle Left Door Logic
    const toggleLeftDoor = () => {
        if (!gameState.isPlaying || gameState.isGameOver) return;
        if (gameState.leftBroken) {
            console.log("Left door is BROKEN!");
            return;
        }
        if (gameState.leftOpen && isGhostBlockingDoor('left')) {
            triggerDoorBreak('left');
        } else {
            gameState.leftOpen = !gameState.leftOpen;
            if (!gameState.leftOpen && !gameState.rightOpen) gameState.rightOpen = true;
            updateDoorVisuals(); 
        }
    };

    // Function to handle Right Door Logic
    const toggleRightDoor = () => {
        if (!gameState.isPlaying || gameState.isGameOver) return;
        if (gameState.rightBroken) {
            console.log("Right door is BROKEN!");
            return;
        }
        if (gameState.rightOpen && isGhostBlockingDoor('right')) {
            triggerDoorBreak('right');
        } else {
            gameState.rightOpen = !gameState.rightOpen;
            if (!gameState.rightOpen && !gameState.leftOpen) gameState.leftOpen = true;
            updateDoorVisuals(); 
        }
    };

    // PC: Keyboard
    document.addEventListener('keydown', (e) => {
        if (!gameState.isPlaying || gameState.isGameOver) return;
        if(e.code === 'KeyQ') toggleLeftDoor();
        if(e.code === 'KeyE') toggleRightDoor();
        if(e.code === 'KeyP') togglePerformanceMode();
    });

    // Mobile: Touch Buttons
    const btnLeft = document.getElementById('btn-left');
    if (btnLeft) {
        btnLeft.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent phantom mouse clicks
            e.stopPropagation(); // Stop event bubbling
            toggleLeftDoor();
        }, { passive: false });
    }

    const btnRight = document.getElementById('btn-right');
    if (btnRight) {
        btnRight.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleRightDoor();
        }, { passive: false });
    }

    const btnProto = document.getElementById('btn-proto');
    if (btnProto) {
        btnProto.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePerformanceMode();
        }, { passive: false });
    }


    // --- 4. Flashlight Controls ---

    // PC: Mouse Click
    document.addEventListener('mousedown', (e) => { 
        if(gameState.isPlaying) flashlightSystem.pressButton();
    });
    document.addEventListener('mouseup', () => { 
        if(gameState.isPlaying) flashlightSystem.releaseButton();
    });

    // Mobile: Touch Button
    const btnFlash = document.getElementById('btn-flash');
    if (btnFlash) {
        btnFlash.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if(gameState.isPlaying) flashlightSystem.pressButton();
        }, { passive: false });

        btnFlash.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if(gameState.isPlaying) flashlightSystem.releaseButton();
        }, { passive: false });
    }
}

function triggerDoorBreak(side) {
    console.log(`CRITICAL: ${side} DOOR BROKEN!`);
    
    if (side === 'left') gameState.leftBroken = true;
    if (side === 'right') gameState.rightBroken = true;

    if (side === 'left') gameState.leftOpen = true;
    if (side === 'right') gameState.rightOpen = true;

    onGhostHitByDoor();
    updateDoorVisuals();

    // Screen shake
    const shakeIntensity = 0.5;
    const startShake = Date.now();
    const originalX = camera.position.x;
    const originalY = camera.position.y;
    
    const shakeInterval = setInterval(() => {
        const elapsed = Date.now() - startShake;
        if (elapsed > 500) { 
            clearInterval(shakeInterval);
            camera.position.x = originalX;
            camera.position.y = originalY;
            return;
        }
        camera.position.x = originalX + (Math.random() - 0.5) * shakeIntensity;
        camera.position.y = originalY + (Math.random() - 0.5) * shakeIntensity;
    }, 16);
}

function updateDoorVisuals() {
    const updateSingleDoor = (doorGroup, isOpen, isBroken, sideMultiplier) => {
        if (isBroken) {
            doorGroup.rotation.y = sideMultiplier * (Math.PI / 4); 
            doorGroup.rotation.z = sideMultiplier * 0.1; 
            doorGroup.position.y = 5.8; 
        } else {
            doorGroup.rotation.z = 0;
            doorGroup.position.y = 6;
            doorGroup.children[0].material.color.setHex(0xffffff);

            const closedRot = sideMultiplier * -Math.PI;
            doorGroup.rotation.y = isOpen ? 0 : closedRot;
        }
    };

    updateSingleDoor(leftDoor, gameState.leftOpen, gameState.leftBroken, 1);

    if (gameState.rightBroken) {
        rightDoor.rotation.y = -Math.PI / 4; 
        rightDoor.rotation.z = -0.1;
        rightDoor.position.y = 5.8;
        rightDoor.children[0].material.color.setHex(0xffffff);
    } else {
        rightDoor.rotation.z = 0;
        rightDoor.position.y = 6;
        rightDoor.children[0].material.color.setHex(0xffffff); 
        rightDoor.rotation.y = gameState.rightOpen ? 0 : Math.PI;
    }

    // Update UI (Supports both PC text and Mobile buttons visually if needed, though buttons are static)
    const uiLeft = document.getElementById('status-left');
    const uiRight = document.getElementById('status-right');
    
    if (gameState.leftBroken) {
        uiLeft.className = 'door-status open'; 
        uiLeft.innerText = "BROKEN";           
        uiLeft.style.color = "#880000";        
        uiLeft.style.borderColor = "#880000";
    } else {
        uiLeft.style.color = ""; 
        uiLeft.style.borderColor = "";
        uiLeft.className = `door-status ${gameState.leftOpen ? 'open' : 'closed'}`;
        uiLeft.innerText = gameState.leftOpen ? "OPEN" : "CLOSED";
    }

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
    
    // Attempt to unlock pointer if on PC
    if(document.pointerLockElement) document.exitPointerLock();
    
    const overlay = document.getElementById('overlay');
    const overlayText = document.getElementById('overlay-text');
    overlay.style.display = 'flex';
    overlayText.innerText = "GAME OVER - Click to Restart";
    overlayText.style.color = "red";
    
    // Hide mobile controls on game over
    const mobileControls = document.getElementById('mobile-controls');
    if(mobileControls) mobileControls.style.display = 'none';
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
    
    const uiLeft = document.getElementById('status-left');
    const uiRight = document.getElementById('status-right');
    uiLeft.style.color = ""; uiLeft.style.borderColor = "";
    uiRight.style.color = ""; uiRight.style.borderColor = "";
    
    flashlightSystem.battery = 6;
    flashlightSystem.isDepleted = false;
    if(flashlightSystem.isOn) flashlightSystem.toggle(); 
    
    resetEnemy();
    updateDoorVisuals();
    
    const overlayText = document.getElementById('overlay-text');
    overlayText.innerText = "CLICK TO START";
    overlayText.style.color = "red";

    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
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

    if (Math.random() > 0.95) {
        ceilingLight.intensity = Math.random() * 5; 
        bulbMat.color.setHex(0x331100);
    } else {
        ceilingLight.intensity = 50 + Math.sin(time * 10) * 15; 
        bulbMat.color.setHex(0xffaa00);
    }

    if (flashlightSystem) {
        flashlightSystem.update(dt);
        gameState.flashlightOn = flashlightSystem.isOn; 
    }

    if (gameState.isPlaying && !gameState.isGameOver) {
        updateEnemy(dt, camera, flashLight, gameState, onGameOver);
    }

    renderer.render(scene, camera);
}