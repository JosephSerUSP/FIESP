import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Global App State
let scene, camera, renderer, controls;
let buildingModel = null;
let envModel = null;
let screenMesh = null;
let screenMaterial = null;
let canvasTexture = null;
let warper = null;
let warpConfig = null;
let liveStream = null;
let videoFileElement = null;
let animationFrameId = null;

// DOM Elements
const canvas3DContainer = document.getElementById('canvas3d-container');
const canvasWarped = document.getElementById('canvas-warped');
const canvasSource = document.getElementById('canvas-source');
const videoElement = document.getElementById('webcam-video');
const loadingOverlay = document.getElementById('loading-overlay');

// Control Inputs
const btnUpload = document.getElementById('btn-upload');
const btnVideo = document.getElementById('btn-video');
const btnCamera = document.getElementById('btn-camera');
const uploadControls = document.getElementById('upload-controls');
const videoControls = document.getElementById('video-controls');
const cameraControls = document.getElementById('camera-controls');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const videoFileInput = document.getElementById('video-file-input');
const videoFileNameDisplay = document.getElementById('video-file-name');
const videoPlaybackControls = document.getElementById('video-playback-controls');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnVideoLoop = document.getElementById('btn-video-loop');
const cameraSelect = document.getElementById('camera-select');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnExport = document.getElementById('btn-export');
const chkApplyDistortion = document.getElementById('chk-apply-distortion');

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
const langSelect = document.getElementById('lang-select');
const qualitySlider = document.getElementById('quality-slider');

const debugPanel = document.getElementById('debug-panel');
const debugInputsContainer = document.getElementById('debug-inputs');
const btnSaveConfig = document.getElementById('btn-save-config');
const btnCloseDebug = document.getElementById('btn-close-debug');

// Set warped canvas dimensions (Calibrated aspect ratio 16:9)
canvasWarped.width = 1280;
canvasWarped.height = 720;

// Initialize Application
async function init() {
  await fetchWarpConfig();
  initThreeJS();
  initWarper();
  loadModels();
  setupUIEventListeners();
  animate();
}

async function fetchWarpConfig() {
  try {
    const res = await fetch('warp_config.json');
    warpConfig = await res.json();
    console.log('Loaded warp config:', warpConfig);
  } catch (err) {
    console.error('Failed to load warp_config.json, using defaults:', err);
    // Provide defaults so the app doesn't crash
    warpConfig = {
      "activeH": 297.0,
      "L_Tx1": 0.499, "L_Tx2": 77.504,
      "L_Bx1": 0.499, "L_Bx2": 173.555,
      "M_Tx1": 241.497, "M_Tx2": 347.494,
      "M_Bx1": 199.846, "M_Bx2": 395.097,
      "R_Tx1": 513.497, "R_Tx2": 542.502,
      "R_Bx1": 419.993, "R_Bx2": 542.502
    };
  }
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

let warpWorker = null;
let isWarping = false;
let qualityStep = 1; // 1 = highest quality
let warpRequestId = 0;

// Initialize the 2D canvas warping engine
function initWarper() {
  warpWorker = new Worker('warpWorker.js');
  
  warpWorker.onmessage = function(e) {
    const { destData, requestId } = e.data;
    isWarping = false;

    // Ignore a completed warp when the user has switched to a pre-distorted source.
    if (requestId !== warpRequestId || !chkApplyDistortion.checked) {
      if (chkApplyDistortion.checked) triggerWarp();
      return;
    }

    const clampedArray = new Uint8ClampedArray(destData);
    const imgData = new ImageData(clampedArray, canvasWarped.width, canvasWarped.height);
    const ctx = canvasWarped.getContext('2d');
    ctx.putImageData(imgData, 0, 0);

    if (chkUvWireframe && chkUvWireframe.checked) {
      drawUVWireframe();
    }

    if (canvasTexture) {
      canvasTexture.needsUpdate = true;
    }
  };

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
  const srcW = canvasSource.width;
  const srcH = canvasSource.height;
  if (srcW === 0 || srcH === 0) return;

  if (!chkApplyDistortion.checked) {
    warpRequestId += 1;
    drawSourceWithoutDistortion();
    return;
  }

  if (!warpWorker || isWarping) return;

  const ctx = canvasSource.getContext('2d');
  const srcImgData = ctx.getImageData(0, 0, srcW, srcH);
  
  isWarping = true;
  warpWorker.postMessage({
    srcData: srcImgData.data,
    w: canvasWarped.width,
    h: canvasWarped.height,
    srcW: srcW,
    srcH: srcH,
    config: warpConfig,
    qualityStep: qualityStep,
    requestId: ++warpRequestId
  });
}

// Copies media that has already been prepared in the LED texture layout.
function drawSourceWithoutDistortion() {
  const ctx = canvasWarped.getContext('2d');
  ctx.clearRect(0, 0, canvasWarped.width, canvasWarped.height);
  ctx.drawImage(canvasSource, 0, 0, canvasWarped.width, canvasWarped.height);

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
      
      // Set initial rotation to 90 degrees (so it faces the camera by default)
      envModel.rotation.y = Math.PI / 2;

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
      
      // Set initial rotation to 90 degrees (so it faces the camera by default)
      buildingModel.rotation.y = Math.PI / 2;

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

function buildDebugPanel() {
  debugInputsContainer.innerHTML = '';
  for (const key in warpConfig) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';

    const label = document.createElement('label');
    label.textContent = key;
    label.style.fontSize = '12px';
    label.style.color = '#ccc';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.001';
    input.value = warpConfig[key];
    input.style.padding = '4px';
    input.style.background = '#222';
    input.style.border = '1px solid #555';
    input.style.color = 'white';
    input.style.borderRadius = '4px';

    input.addEventListener('input', (e) => {
      warpConfig[key] = parseFloat(e.target.value);
      triggerWarp();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    debugInputsContainer.appendChild(wrapper);
  }
}

// Setup Event Listeners for UI
function setupUIEventListeners() {
  // Input Selection Buttons
  btnUpload.addEventListener('click', () => {
    btnUpload.classList.add('active');
    btnCamera.classList.remove('active');
    btnVideo.classList.remove('active');
    uploadControls.classList.remove('hidden');
    cameraControls.classList.add('hidden');
    videoControls.classList.add('hidden');
    stopWebcam();
    stopVideoFile();

    if (fileInput.files.length === 0) {
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

  btnVideo.addEventListener('click', () => {
    btnVideo.classList.add('active');
    btnUpload.classList.remove('active');
    btnCamera.classList.remove('active');
    videoControls.classList.remove('hidden');
    uploadControls.classList.add('hidden');
    cameraControls.classList.add('hidden');
    stopWebcam();
  });

  btnCamera.addEventListener('click', () => {
    btnCamera.classList.add('active');
    btnUpload.classList.remove('active');
    btnVideo.classList.remove('active');
    cameraControls.classList.remove('hidden');
    uploadControls.classList.add('hidden');
    videoControls.classList.add('hidden');
    stopVideoFile();
    populateCameras();
  });

  // Video File Upload
  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    videoFileNameDisplay.textContent = file.name;
    stopVideoFile();

    videoFileElement = document.createElement('video');
    videoFileElement.src = URL.createObjectURL(file);
    videoFileElement.loop = btnVideoLoop.classList.contains('active');
    videoFileElement.muted = true; // muted so autoplay works without user gesture issues
    videoFileElement.playsInline = true;
    videoFileElement.play();

    videoPlaybackControls.classList.remove('hidden');
    btnPlayPause.innerHTML = `&#9646;&#9646; <span data-i18n="pauseBtn">${translations[currentLang]?.pauseBtn || 'Pause'}</span>`;
  });

  // Play/Pause Toggle
  btnPlayPause.addEventListener('click', () => {
    if (!videoFileElement) return;
    if (videoFileElement.paused) {
      videoFileElement.play();
      btnPlayPause.innerHTML = `&#9646;&#9646; <span data-i18n="pauseBtn">${translations[currentLang]?.pauseBtn || 'Pause'}</span>`;
    } else {
      videoFileElement.pause();
      btnPlayPause.innerHTML = `&#9654; <span data-i18n="playBtn">${translations[currentLang]?.playBtn || 'Play'}</span>`;
    }
  });

  // Loop Toggle
  btnVideoLoop.addEventListener('click', () => {
    const looping = btnVideoLoop.classList.toggle('active');
    if (videoFileElement) videoFileElement.loop = looping;
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

  chkApplyDistortion.addEventListener('change', () => {
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
    if (!isCollapsed) {
      controlsPreviewPanel.classList.add('collapsed');
    }
  });

  // Preview Controls toggler (Mutually exclusive with 2D UV Preview)
  btnToggleControls.addEventListener('click', () => {
    const isCollapsed = controlsPreviewPanel.classList.toggle('collapsed');
    if (!isCollapsed) {
      uvPanel.classList.add('collapsed');
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

  // Quality Slider listener
  if (qualitySlider) {
    qualitySlider.addEventListener('input', (e) => {
      qualityStep = parseInt(e.target.value);
      // Ensure we immediately update the canvas if an image is loaded
      triggerWarp();
    });
  }

  // Debug panel listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      if (debugPanel.style.display === 'none') {
        buildDebugPanel();
        debugPanel.style.display = 'block';
      } else {
        debugPanel.style.display = 'none';
      }
    }
  });

  if (btnCloseDebug) {
    btnCloseDebug.addEventListener('click', () => {
      debugPanel.style.display = 'none';
    });
  }

  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(warpConfig, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "warp_config.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    });
  }

  // Language selection listener
  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      updateLanguage(e.target.value);
    });
  }

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

// Stop Video File Playback
function stopVideoFile() {
  if (videoFileElement) {
    videoFileElement.pause();
    videoFileElement.src = '';
    videoFileElement = null;
  }
  if (videoPlaybackControls) videoPlaybackControls.classList.add('hidden');
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

  // If video file is active, draw current frame to source canvas and re-warp
  if (videoFileElement && !videoFileElement.paused && !videoFileElement.ended &&
      videoFileElement.readyState >= videoFileElement.HAVE_CURRENT_DATA) {
    canvasSource.width = videoFileElement.videoWidth;
    canvasSource.height = videoFileElement.videoHeight;
    const ctx = canvasSource.getContext('2d');
    ctx.drawImage(videoFileElement, 0, 0, canvasSource.width, canvasSource.height);
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

// Translation Dictionary
const translations = {
  pt: {
    logoTitle: "FIESP",
    logoSub: "MAPEADOR 3D UV",
    tagline: "Distorção interativa de conteúdo e visualização 3D para a Galeria Digital do SESI.",
    inputSource: "Origem do Conteúdo",
    uploadBtn: "Enviar Imagem",
    videoBtn: "Vídeo",
    cameraBtn: "Câmera ao Vivo",
    chooseDrag: "Escolha ou Arraste uma Imagem",
    chooseVideo: "Escolha um Arquivo de Vídeo",
    noFile: "Nenhum arquivo selecionado",
    selectCamera: "Selecionar Câmera:",
    startCam: "Iniciar Câmera",
    stopCam: "Parar Câmera",
    playBtn: "Reproduzir",
    pauseBtn: "Pausar",
    applyDistortion: "Aplicar distorção",
    inputsBtn: "Entradas",
    loading: "Carregando Modelo 3D da FIESP...",
    textureTitle: "Textura Distorcida 2D",
    textureDesc: "Esta é a imagem distorcida enviada para o sistema de LED do edifício.",
    exportBtn: "Exportar Textura",
    controlsTitle: "Controles de Visualização",
    channelLabel: "Canal do Mapa UV",
    uvChannel2: "Canal 2 (Calibrado)",
    uvChannel1: "Canal 1",
    uvChannel0: "Padrão (Canal 0)",
    langLabel: "Idioma / Language",
    showEnv: "Mostrar Ambiente",
    showUv: "Mostrar Linhas UV",
    wireframe: "Modo Wireframe",
    autoRotate: "Auto-Rotacionar Edifício"
  },
  en: {
    logoTitle: "FIESP",
    logoSub: "3D UV MAPPER",
    tagline: "Interactive content distortion & 3D preview for the SESI Digital Gallery.",
    inputSource: "Input Source",
    uploadBtn: "Upload Image",
    videoBtn: "Video",
    cameraBtn: "Live Camera",
    chooseDrag: "Choose or Drag Image",
    chooseVideo: "Choose a Video File",
    noFile: "No file selected",
    selectCamera: "Select Camera:",
    startCam: "Start Live Feed",
    stopCam: "Stop Live Feed",
    playBtn: "Play",
    pauseBtn: "Pause",
    applyDistortion: "Apply distortion",
    inputsBtn: "Inputs",
    loading: "Loading FIESP 3D Model...",
    textureTitle: "2D Warped Texture",
    textureDesc: "This is the distorted image sent to the building's LED system.",
    exportBtn: "Export Texture",
    controlsTitle: "Preview Controls",
    channelLabel: "UV Map Channel",
    uvChannel2: "Channel 2 (Calibrated)",
    uvChannel1: "Channel 1",
    uvChannel0: "Default (Channel 0)",
    langLabel: "Language / Idioma",
    showEnv: "Show Environment",
    showUv: "Show UV Overlay",
    wireframe: "Wireframe Mode",
    autoRotate: "Auto-Rotate Building"
  }
};

let currentLang = localStorage.getItem('fiesp-lang') || 'pt';

function updateLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('fiesp-lang', lang);
  if (langSelect) langSelect.value = lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const trans = translations[lang][key];
    if (trans) {
      if (el.tagName === 'OPTION') {
        el.text = trans;
      } else {
        // If it contains icons/spans, only replace the text node
        let hasTextNode = false;
        for (let child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            child.textContent = trans;
            hasTextNode = true;
            break;
          }
        }
        if (!hasTextNode) {
          el.textContent = trans;
        }
      }
    }
  });

  // Update toggle camera button text states dynamically
  if (liveStream) {
    btnToggleCam.textContent = translations[lang].stopCam;
  } else {
    btnToggleCam.textContent = translations[lang].startCam;
  }
}

// Run App initialization
init();
// Apply default language
updateLanguage(currentLang);
