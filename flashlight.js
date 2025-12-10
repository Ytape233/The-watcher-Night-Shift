import * as THREE from 'three';

// --- config ---
const CONFIG = {
    maxBattery: 6,
    drainRate: 3.0,     // On: consume one unit every 3 seconds
    rechargeDelay: 5.0, // Depleted: wait 5 seconds before restarting
    passiveRechargeSpeed: 0.5, // Off: automatically recharge 0.5 units per second (i.e., one unit every 2 seconds)
    barColors: {
        active: 0x00ff00,   // Bright fluorescent green
        inactive: 0x002200, // Dark green when off
        warning: 0xff0000   // Low battery warning red
    }
};

export class FlashlightSystem {
    constructor(camera, spotLightSource) {
        this.camera = camera;
        this.lightSource = spotLightSource; 
        
        // State
        this.isOn = false;
        this.isDepleted = false;
        this.battery = CONFIG.maxBattery;
        this.usageTimer = 0;
        this.rechargeTimer = 0;
        
        // Animated parts references
        this.buttonMesh = null;
        this.buttonBaseX = 0; 
        this.batteryBars = [];
        this.lightTargetObj = null;

        this.mesh = this.createModel();
        
        // Adjust flashlight position on screen
        this.mesh.position.set(0.5, -0.5, -0.8); 
        this.mesh.rotation.set(0.1, -0.15, 0); 
        
        this.camera.add(this.mesh);
    }

    createModel() {
        const group = new THREE.Group();

        // Materials
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.9,
            roughness: 0.4,
        });
        
        const gripMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.5,
            roughness: 0.8,
        });

        this.bulbMat = new THREE.MeshStandardMaterial({ 
            color: 0x000000,
            emissive: 0x000000,
            emissiveIntensity: 0
        });

        // 1. Body
        const bodyGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.4, 16);
        bodyGeo.rotateX(-Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, gripMat);
        body.castShadow = false; 
        body.receiveShadow = true; 
        group.add(body);

        // 2. Head
        const headGeo = new THREE.CylinderGeometry(0.065, 0.05, 0.12, 16);
        headGeo.rotateX(-Math.PI / 2);
        const head = new THREE.Mesh(headGeo, metalMat);
        head.position.z = -0.25; 
        head.castShadow = false;
        group.add(head);

        // 3. Lens
        const lensGeo = new THREE.CircleGeometry(0.06, 32);
        const lensMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transmission: 0.98,
            opacity: 1,
            metalness: 0,
            roughness: 0,
            ior: 1.5,
            thickness: 0.1
        });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.z = -0.311; 
        lens.castShadow = false;
        group.add(lens);

        // 4. Bulb
        const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), this.bulbMat);
        bulb.position.z = -0.30;
        bulb.castShadow = false;
        group.add(bulb);

        // Move to -0.6 to ensure it is completely in front of the lens and any model parts
        this.lightTargetObj = new THREE.Object3D();
        this.lightTargetObj.position.set(0, 0, -0.6); 
        group.add(this.lightTargetObj);

        // 5. Button
        const btnBase = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), metalMat);
        btnBase.position.set(-0.045, 0, -0.1); 
        btnBase.castShadow = false;
        group.add(btnBase);

        const btnGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16);
        const btnMat = new THREE.MeshStandardMaterial({ color: 0xaa0000 });
        this.buttonMesh = new THREE.Mesh(btnGeo, btnMat);
        this.buttonMesh.rotation.z = Math.PI / 2;
        this.buttonMesh.position.set(-0.055, 0, -0.1); 
        this.buttonBaseX = -0.055;
        this.buttonMesh.castShadow = false;
        group.add(this.buttonMesh);

        // 6. Display Screen
        const screenGroup = new THREE.Group();
        screenGroup.position.set(0, 0.045, 0.08); 
        screenGroup.rotation.x = -0.05; 
        
        const displayFrame = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.01, 0.14),
            new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 })
        );
        displayFrame.castShadow = false;
        screenGroup.add(displayFrame);

        // Light Bars
        const barW = 0.015;
        const barH = 0.01; 
        const gap = 0.005;
        
        for(let i=0; i<6; i++) {
            const barMat = new THREE.MeshBasicMaterial({ color: CONFIG.barColors.active });
            const bar = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), barMat);
            bar.rotation.x = -Math.PI / 2;
            bar.position.set(0, 0.006, 0.05 - i * (barH + gap)); 
            screenGroup.add(bar);
            this.batteryBars.push(bar);
        }
        
        group.add(screenGroup);
        return group;
    }

    pressButton() {
        if (this.buttonMesh) this.buttonMesh.position.x = this.buttonBaseX + 0.005; 
    }

    releaseButton() {
        if (this.buttonMesh) this.buttonMesh.position.x = this.buttonBaseX; 
        if (!this.isDepleted) this.toggle();
    }

    toggle() {
        // [Fix] Prevent crash at low battery
        // Do not allow turning on if battery is less than 1 unit (to prevent instant off due to consumption)
        if (!this.isOn && this.battery < 1.0) {
            return; 
        }

        this.isOn = !this.isOn;
        
        if (this.isOn) {
            this.consumeBatteryStep();
            this.usageTimer = 0;
            
            this.lightSource.intensity = 150; 
            this.bulbMat.color.setHex(0xffffff);
            this.bulbMat.emissive.setHex(0xffffff);
            this.bulbMat.emissiveIntensity = 2.0;
        } else {
            this.turnOffVisuals();
        }
        this.updateDisplay();
    }
    
    turnOffVisuals() {
        this.lightSource.intensity = 0;
        this.bulbMat.color.setHex(0x111111);
        this.bulbMat.emissiveIntensity = 0;
    }

    consumeBatteryStep() {
        this.battery -= 1;
        if (this.battery <= 0) {
            this.battery = 0;
            this.triggerDepletion();
        }
    }

    triggerDepletion() {
        this.isOn = false;
        this.isDepleted = true;
        this.turnOffVisuals();
    }

    update(dt) {
        // 1. Forced depletion check
        if (this.isDepleted) {
            this.isOn = false;
            this.turnOffVisuals();
        }

        // 2. Synchronize light source position
        if (this.lightTargetObj && this.lightSource) {
            const worldPos = new THREE.Vector3();
            this.lightTargetObj.getWorldPosition(worldPos);
            this.lightSource.position.copy(worldPos);
            
            const targetPos = new THREE.Vector3(0, 0, -10); 
            targetPos.applyMatrix4(this.mesh.matrixWorld); 
            this.lightSource.target.position.copy(targetPos);
        }

        // 3. Logic Branch
        if (this.isDepleted) {
            // A. Depleted: wait for recharge
            this.rechargeTimer += dt;
            if (this.rechargeTimer >= CONFIG.rechargeDelay) {
                // [Fix] After recharge, give 1.1 units of battery
                // This way, after turning on and consuming 1 unit, there is still 0.1 unit left,
                // allowing the flashlight to stay on for 1.5 seconds without instantly turning off
                this.battery = 1.1; 
                this.isDepleted = false;
                this.rechargeTimer = 0;
            }
        } else if (this.isOn) {
            // B. On: consume battery
            this.usageTimer += dt;
            if (this.usageTimer >= CONFIG.drainRate) {
                this.consumeBatteryStep();
                this.usageTimer = 0; 
            }
        } else {
            // C. [New] Off and not depleted: slow recharge
            // Only recharge when battery is not full
            if (this.battery < CONFIG.maxBattery) {
                this.battery += CONFIG.passiveRechargeSpeed * dt;
                if (this.battery > CONFIG.maxBattery) this.battery = CONFIG.maxBattery;
            }
        }

        this.updateDisplay();
    }

    updateDisplay() {
        const currentBars = Math.ceil(this.battery);

        this.batteryBars.forEach((bar, index) => {
            if (index < currentBars) {
                if (this.isDepleted || currentBars <= 1) {
                    bar.material.color.setHex(CONFIG.barColors.warning);
                } else {
                    bar.material.color.setHex(CONFIG.barColors.active);
                }
            } else {
                bar.material.color.setHex(CONFIG.barColors.inactive);
            }
            
            if (this.isDepleted && index === 0) {
                const flash = Math.sin(Date.now() * 0.01) > 0;
                bar.material.color.setHex(flash ? 0xff0000 : 0x000000);
            }
        });
    }
}