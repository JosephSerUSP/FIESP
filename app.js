import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FiespWarper } from './warper.js';

// Global App State
let scene, camera, renderer, controls;
let buildingModel = null;
let envModel = null;
let screenMesh = null;
let screenMaterial = null;
let canvasTexture = null;
let warper = null;
let liveStream = null;
let animationFrameId = null;

// DOM Elements
const canvas3DContainer = document.getElementById('canvas3d-container');
const canvasWarped = document.getElementById('canvas-warped');
const canvasSource = document.getElementById('canvas-source');
const videoElement = document.getElementById('webcam-video');
const loadingOverlay = document.getElementById('loading-overlay');

// Control Inputs
const btnUpload = document.getElementById('btn-upload');
const btnCamera = document.getElementById('btn-camera');
const uploadControls = document.getElementById('upload-controls');
const cameraControls = document.getElementById('camera-controls');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const cameraSelect = document.getElementById('camera-select');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnExport = document.getElementById('btn-export');

// Toggles
const chkEnv = document.getElementById('chk-env');
const chkUvWireframe = document.getElementById('chk-uv-wireframe');
const chkWireframe = document.getElementById('chk-wireframe');
const chkAutoRotate = document.getElementById('chk-auto-rotate');
const uvChannelSelect = document.getElementById('uv-channel-select');
const btnToggleUv = document.getElementById('btn-toggle-uv');
const uvPanelBody = document.getElementById('uv-panel-body');
const uvPanel = document.getElementById('uv-preview-panel');
const btnToggleControls = document.getElementById('btn-toggle-controls');
const controlsPreviewPanel = document.getElementById('controls-preview-panel');

// Set warped canvas dimensions (Calibrated aspect ratio 16:9)
canvasWarped.width = 1280;
canvasWarped.height = 720;

// Initialize Application
function init() {
  initThreeJS();
  initWarper();
  loadModels();
  setupUIEventListeners();
  animate();
}

// Initialize Three.js Scene, Camera, Lights & Controls
function initThreeJS() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070913);
  scene.fog = new THREE.FogExp2(0x070913, 0.005);

  // Camera setup
  camera = new THREE.PerspectiveCamera(
    45,
    canvas3DContainer.clientWidth / canvas3DContainer.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 15, 45);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvas3DContainer.clientWidth, canvas3DContainer.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas3DContainer.appendChild(renderer.domElement);

  // Controls setup
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.01; // Limit panning below ground
  controls.minDistance = 2;
  controls.maxDistance = 200;
  controls.target.set(0, 5, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight1.position.set(20, 40, 20);
  dirLight1.castShadow = true;
  dirLight1.shadow.mapSize.width = 2048;
  dirLight1.shadow.mapSize.height = 2048;
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x00f2fe, 0.5);
  dirLight2.position.set(-20, 20, -20);
  scene.add(dirLight2);

  // Soft floor reflection helper
  const gridHelper = new THREE.GridHelper(150, 100, 0x00f2fe, 0x1e293b);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  window.addEventListener('resize', onWindowResize);
}

// Initialize the 2D canvas warping engine
function initWarper() {
  warper = new FiespWarper(canvasSource, canvasWarped);
  
  // Create CanvasTexture
  canvasTexture = new THREE.CanvasTexture(canvasWarped);
  canvasTexture.colorSpace = THREE.SRGBColorSpace;
  canvasTexture.minFilter = THREE.LinearFilter;
  // We want the texture mapped strictly by the GLB's sacred UV mapping, without the WebGL Y-flip mirroring
  canvasTexture.flipY = false; 

  // Glow material
  screenMaterial = new THREE.MeshBasicMaterial({
    map: canvasTexture,
    side: THREE.DoubleSide
  });

  // Load default test texture
  const img = new Image();
  img.onload = () => {
    canvasSource.width = img.width;
    canvasSource.height = img.height;
    const ctx = canvasSource.getContext('2d');
    ctx.drawImage(img, 0, 0);
    triggerWarp();
  };
  img.src = 'assets/TestTexture.png';
}

// Global warp trigger with optional UV wireframe overlay drawing
function triggerWarp() {
  if (!warper) return;
  warper.warp();
  
  if (chkUvWireframe && chkUvWireframe.checked) {
    drawUVWireframe();
  }
  
  if (canvasTexture) {
    canvasTexture.needsUpdate = true;
  }
}

// Draws the 3D mesh's UV triangles directly on the 2D canvas for calibration inspection
function drawUVWireframe() {
  if (!screenMesh) return;
  const geom = screenMesh.geometry;
  const index = geom.index;
  const uv = geom.attributes.uv;
  if (!uv) return;

  const ctx = canvasWarped.getContext('2d');
  ctx.strokeStyle = '#ef4444'; // Bright red for debugging visibility
  ctx.lineWidth = 1.5;
  
  const w = canvasWarped.width;
  const h = canvasWarped.height;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const idx0 = index.getX(i);
      const idx1 = index.getX(i + 1);
      const idx2 = index.getX(i + 2);

      const u0 = uv.getX(idx0) * w;
      const v0 = uv.getY(idx0) * h;

      const u1 = uv.getX(idx1) * w;
      const v1 = uv.getY(idx1) * h;

      const u2 = uv.getX(idx2) * w;
      const v2 = uv.getY(idx2) * h;

      ctx.beginPath();
      ctx.moveTo(u0, v0);
      ctx.lineTo(u1, v1);
      ctx.lineTo(u2, v2);
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < uv.count; i += 3) {
      const u0 = uv.getX(i) * w;
      const v0 = (1.0 - uv.getY(i)) * h;
      const u1 = uv.getX(i + 1) * w;
      const v1 = (1.0 - uv.getY(i + 1)) * h;
      const u2 = uv.getX(i + 2) * w;
      const v2 = (1.0 - uv.getY(i + 2)) * h;

      ctx.beginPath();
      ctx.moveTo(u0, v0);
      ctx.lineTo(u1, v1);
      ctx.lineTo(u2, v2);
      ctx.closePath();
      ctx.stroke();
    }
  }
}

// Fit Camera & Controls to show the entire building close-up
function fitCameraToModels() {
  if (!buildingModel && !envModel) return;

  const box = new THREE.Box3();
  if (envModel) box.setFromObject(envModel);
  if (buildingModel) {
    if (envModel) box.expandByObject(buildingModel);
    else box.setFromObject(buildingModel);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  console.log('Building Center:', center);
  console.log('Building Size:', size);

  // Center controls pivot directly on the building
  controls.target.copy(center);

  // Bring the camera much closer for a prominent screen view
  const maxDim = Math.max(size.x, size.y, size.z);
  const fovRad = camera.fov * (Math.PI / 180);
  const cameraZ = (maxDim / 2) / Math.tan(fovRad / 2);

  camera.position.set(center.x, center.y + size.y * 0.15, center.z + cameraZ * 0.8);
  controls.maxDistance = maxDim * 4;
  controls.minDistance = maxDim * 0.1;
  controls.update();
}

// Load both models (FiespEnv and FiespScreen)
function loadModels() {
  const loader = new GLTFLoader();
  let envLoaded = false;
  let screenLoaded = false;

  const checkAllLoaded = () => {
    if (envLoaded && screenLoaded) {
      fitCameraToModels();
      triggerWarp(); // Force texture update once geometry is ready
      loadingOverlay.classList.add('hidden');
    }
  };

  // 1. Load FiespEnv (Main Environment & Building Body)
  loader.load(
    'assets/FiespEnv.glb',
    (gltf) => {
      envModel = gltf.scene;
      
      // Traverse to hide the screen in FiespEnv to prevent z-fighting
      envModel.traverse((child) => {
        if (child.isMesh && child.material) {
          const hideScreenMat = (mat) => {
            if (mat.name && (mat.name.includes('181') || mat.name.toLowerCase().includes('screen') || mat.name.toLowerCase().includes('fiesp'))) {
              console.log('Hiding screen material in FiespEnv:', mat.name);
              mat.visible = false;
            }
          };

          if (Array.isArray(child.material)) {
            child.material.forEach(hideScreenMat);
          } else {
            hideScreenMat(child.material);
          }
        }
      });

      // Show environment only if checked
      if (chkEnv.checked) {
        scene.add(envModel);
      }
      console.log('FiespEnv loaded successfully.');
      envLoaded = true;
      checkAllLoaded();
    },
    undefined,
    (error) => {
      console.error('Error loading FiespEnv.glb:', error);
      envLoaded = true;
      checkAllLoaded();
    }
  );

  // 2. Load FiespScreen (The LED display facade)
  loader.load(
    'assets/FiespScreen.glb',
    (gltf) => {
      buildingModel = gltf.scene;
      scene.add(buildingModel);
      console.log('FiespScreen loaded successfully.');

      buildingModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          screenMesh = child;

          console.log('Available geometry attributes on FiespScreen:', Object.keys(child.geometry.attributes));

          // Set default selected UV channel from UI
          updateUVCoordinates(uvChannelSelect.value);

          child.material = screenMaterial;
        }
      });

      screenLoaded = true;
      checkAllLoaded();
    },
    undefined,
    (error) => {
      console.error('Error loading FiespScreen.glb:', error);
      loadingOverlay.innerHTML = `<p style="color: #ef4444;">Error loading FiespScreen model. Check console.</p>`;
    }
  );
}

// Function to dynamically switch the screen mesh UV channel
function updateUVCoordinates(attrName) {
  if (!screenMesh) return;
  const uvSrc = screenMesh.geometry.attributes[attrName];
  if (uvSrc) {
    console.log(`Setting screen UV mapping to: "${attrName}" (using unmodified original UVs)`);
    const clonedAttr = uvSrc.clone();
    
    screenMesh.geometry.setAttribute('uv', clonedAttr);
    screenMesh.geometry.attributes.uv.needsUpdate = true;
    
    triggerWarp();
  } else {
    console.warn(`UV attribute "${attrName}" not found on FiespScreen geometry.`);
  }
}

// Window resize handler
function onWindowResize() {
  camera.aspect = canvas3DContainer.clientWidth / canvas3DContainer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas3DContainer.clientWidth, canvas3DContainer.clientHeight);
}

// Setup Event Listeners for UI
function setupUIEventListeners() {
  // Input Selection Buttons
  btnUpload.addEventListener('click', () => {
    btnUpload.classList.add('active');
    btnCamera.classList.remove('active');
    uploadControls.classList.remove('hidden');
    cameraControls.classList.add('hidden');
    stopWebcam();
    
    if (fileInput.files.length === 0) {
      // Revert to TestTexture if no file uploaded
      const img = new Image();
      img.onload = () => {
        canvasSource.width = img.width;
        canvasSource.height = img.height;
        const ctx = canvasSource.getContext('2d');
        ctx.drawImage(img, 0, 0);
        triggerWarp();
      };
      img.src = 'assets/TestTexture.png';
    } else {
      triggerWarp();
    }
  });

  btnCamera.addEventListener('click', () => {
    btnCamera.classList.add('active');
    btnUpload.classList.remove('active');
    cameraControls.classList.remove('hidden');
    uploadControls.classList.add('hidden');
    populateCameras();
  });

  // File Upload
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Draw to offscreen source canvas
        canvasSource.width = img.width;
        canvasSource.height = img.height;
        const ctx = canvasSource.getContext('2d');
        ctx.drawImage(img, 0, 0);

        triggerWarp();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Camera Activation
  btnToggleCam.addEventListener('click', () => {
    if (liveStream) {
      stopWebcam();
    } else {
      startWebcam();
    }
  });

  // Toggles
  chkEnv.addEventListener('change', (e) => {
    if (!envModel) return;
    if (e.target.checked) {
      scene.add(envModel);
    } else {
      scene.remove(envModel);
    }
  });

  chkUvWireframe.addEventListener('change', () => {
    triggerWarp();
  });

  chkWireframe.addEventListener('change', (e) => {
    screenMaterial.wireframe = e.target.checked;
  });

  // UV Channel Selector dropdown
  uvChannelSelect.addEventListener('change', (e) => {
    updateUVCoordinates(e.target.value);
  });

  // 2D UV Preview toggler (Mutually exclusive with Preview Controls)
  btnToggleUv.addEventListener('click', () => {
    const isCollapsed = uvPanel.classList.toggle('collapsed');
    btnToggleUv.textContent = isCollapsed ? '+' : '−';
    if (!isCollapsed) {
      controlsPreviewPanel.classList.add('collapsed');
      btnToggleControls.textContent = '+';
    }
  });

  // Preview Controls toggler (Mutually exclusive with 2D UV Preview)
  btnToggleControls.addEventListener('click', () => {
    const isCollapsed = controlsPreviewPanel.classList.toggle('collapsed');
    btnToggleControls.textContent = isCollapsed ? '+' : '−';
    if (!isCollapsed) {
      uvPanel.classList.add('collapsed');
      btnToggleUv.textContent = '+';
    }
  });

  // Texture Export Button (Now inside the UV Panel)
  btnExport.addEventListener('click', () => {
    const dataURL = canvasWarped.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'fiesp_warped_texture.png';
    link.href = dataURL;
    link.click();
  });

  // Mobile Bottom Sheet / Drawer Toggle via Floating HUD & [x] Button
  const sidebar = document.getElementById('app-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const hudBtnSource = document.getElementById('hud-btn-source');
  
  hudBtnSource.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('expanded');
  });

  btnCloseSidebar.addEventListener('click', () => {
    sidebar.classList.remove('expanded');
  });

  // Tap outside mobile drawer to close it
  document.addEventListener('touchstart', (e) => {
    if (window.innerWidth <= 900) {
      if (sidebar.classList.contains('expanded') && !sidebar.contains(e.target) && !hudBtnSource.contains(e.target)) {
        sidebar.classList.remove('expanded');
      }
    }
  });

  // Touch swipe down to slide sidebar dialog offscreen
  let touchStartY = 0;
  sidebar.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  sidebar.addEventListener('touchend', (e) => {
    if (window.innerWidth <= 900) {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchEndY - touchStartY > 120) { // Swiped down by 120px
        sidebar.classList.remove('expanded');
      }
    }
  }, { passive: true });
}

// Populate video input sources (webcams)
async function populateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    cameraSelect.innerHTML = '';
    
    if (videoDevices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.text = 'No cameras found';
      cameraSelect.appendChild(option);
      return;
    }

    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
  } catch (err) {
    console.warn('Error listing webcams:', err);
  }
}

// Start Live Webcam Feed
async function startWebcam() {
  // Stop any existing stream first
  if (liveStream) {
    stopWebcam();
  }

  const deviceId = cameraSelect.value;
  
  // Use 'ideal' instead of 'exact' to prevent OverconstrainedError if device ID is temporary/invalid,
  // falling back to standard video access if cameraSelect is empty.
  const videoConstraints = deviceId ? { deviceId: { ideal: deviceId } } : true;
  
  const constraints = {
    video: videoConstraints,
    audio: false
  };

  try {
    // Request permission/stream
    liveStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = liveStream;
    btnToggleCam.textContent = 'Stop Live Feed';
    btnToggleCam.classList.remove('action-btn-primary');
    btnToggleCam.classList.add('action-btn-success');
    
    // Re-populate cameras now that permission is granted (to get real labels instead of Camera 1, 2)
    await populateCameras();
    if (deviceId && cameraSelect.value !== deviceId) {
      cameraSelect.value = deviceId;
    }
    
    triggerWarp();
  } catch (err) {
    console.error('Error accessing webcam:', err);
    alert('Could not access webcam. Please ensure your browser allows camera permissions on this site (HTTPS or localhost is required).');
  }
}

// Stop Webcam Stream
function stopWebcam() {
  if (liveStream) {
    liveStream.getTracks().forEach(track => track.stop());
    liveStream = null;
    videoElement.srcObject = null;
  }
  btnToggleCam.textContent = 'Start Live Feed';
  btnToggleCam.classList.add('action-btn-primary');
  btnToggleCam.classList.remove('action-btn-success');
  
  if (btnUpload.classList.contains('active') && fileInput.files.length === 0) {
    const img = new Image();
    img.onload = () => {
      canvasSource.width = img.width;
      canvasSource.height = img.height;
      const ctx = canvasSource.getContext('2d');
      ctx.drawImage(img, 0, 0);
      triggerWarp();
    };
    img.src = 'assets/TestTexture.png';
  }
}

// Animation / Render Loop
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  // If live camera is active, draw video frame to source canvas and re-warp
  if (liveStream && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    canvasSource.width = videoElement.videoWidth;
    canvasSource.height = videoElement.videoHeight;
    const ctx = canvasSource.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvasSource.width, canvasSource.height);
    
    triggerWarp();
  }

  // Update controls
  controls.update();

  // Auto rotate building model if toggled
  if (buildingModel && chkAutoRotate.checked) {
    const delta = 0.003;
    buildingModel.rotation.y += delta;
    if (envModel) envModel.rotation.y += delta;
  }

  renderer.render(scene, camera);
}

// Run App initialization
init();
