"use strict";

(function () {
  const byId = function (id) { return document.getElementById(id); };
  const welcome = byId("welcome");
  const workspace = byId("workspace");
  const startButton = byId("start-button");
  const pauseButton = byId("pause-button");
  const restartButton = byId("restart-button");
  const saveButton = byId("save-button");
  const restoreButton = byId("restore-button");
  const fullscreenButton = byId("fullscreen-button");
  const screenContainer = byId("screen-container");
  const screenWait = byId("screen-wait");
  const bootMessage = byId("boot-message");
  const statusLabel = byId("state-label");
  const statusIndicator = byId("status-indicator");
  const statusMessage = byId("status-message");
  const windowState = byId("window-state");
  const errorMessage = byId("error-message");
  const toast = byId("toast");

  let machine = null;
  let paused = false;
  let booted = false;
  let serialBuffer = "";
  let toastTimer = 0;

  function asset(path) {
    return new URL(path, document.baseURI).href;
  }

  function setStatus(label, message, state) {
    statusLabel.textContent = label;
    statusMessage.textContent = message;
    windowState.textContent = state === "ready" ? "LINUX RUNNING" : (state === "error" ? "BOOT ERROR" : "BOOT SEQUENCE");
    statusIndicator.parentElement.dataset.state = state || "loading";
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    setStatus("ERROR", "The virtual machine needs attention", "error");
    bootMessage.textContent = "Check the build and deployment workflow.";
    screenWait.hidden = false;
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("visible");
    }, 2800);
  }

  function setControlsEnabled(enabled) {
    pauseButton.disabled = !enabled;
    restartButton.disabled = !enabled;
    saveButton.disabled = !enabled;
    restoreButton.disabled = !enabled;
    fullscreenButton.disabled = !enabled;
  }

  function openStateDatabase() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser does not provide IndexedDB."));
        return;
      }
      const request = indexedDB.open("webos-local-state", 1);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains("snapshots")) {
          database.createObjectStore("snapshots");
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Could not open browser storage.")); };
    });
  }

  async function saveSnapshot(buffer) {
    const database = await openStateDatabase();
    return new Promise(function (resolve, reject) {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(buffer, "latest");
      transaction.oncomplete = function () { database.close(); resolve(); };
      transaction.onerror = function () { database.close(); reject(transaction.error || new Error("Could not save the snapshot.")); };
      transaction.onabort = function () { database.close(); reject(transaction.error || new Error("The snapshot save was cancelled.")); };
    });
  }

  async function readSnapshot() {
    const database = await openStateDatabase();
    return new Promise(function (resolve, reject) {
      const transaction = database.transaction("snapshots", "readonly");
      const request = transaction.objectStore("snapshots").get("latest");
      request.onsuccess = function () {
        const value = request.result || null;
        database.close();
        resolve(value);
      };
      request.onerror = function () {
        database.close();
        reject(request.error || new Error("Could not read the saved snapshot."));
      };
    });
  }

  function handleSerialByte(byte) {
    serialBuffer += String.fromCharCode(byte);
    if (serialBuffer.length > 8192) {
      serialBuffer = serialBuffer.slice(-4096);
    }

    if (!booted && serialBuffer.indexOf("WEBOS_BOOT_COMPLETE") !== -1) {
      booted = true;
      document.documentElement.dataset.guestBooted = "true";
      screenWait.hidden = true;
      setStatus("LINUX READY", "Linux userspace is running", "ready");
      notify("Linux has booted. Welcome to WebOS.");
    }

    if (!booted && serialBuffer.toLowerCase().indexOf("kernel panic") !== -1) {
      showError("The Linux kernel reported a panic. Check the guest build configuration and workflow logs.");
    }
  }

  function handleDownloadProgress(progress) {
    if (!progress) return;
    if (progress.lengthComputable && progress.total > 0) {
      const percent = Math.min(100, Math.round((progress.loaded / progress.total) * 100));
      bootMessage.textContent = "Loading " + progress.file_name + " · " + percent + "%";
    } else if (progress.file_name) {
      bootMessage.textContent = "Loading " + progress.file_name + "…";
    }
  }

  async function startMachine() {
    errorMessage.hidden = true;
    startButton.disabled = true;
    welcome.hidden = true;
    workspace.hidden = false;
    screenWait.hidden = false;
    bootMessage.textContent = "Loading the WebAssembly emulator…";
    setStatus("INITIALIZING", "Preparing virtual hardware", "loading");

    if (!("WebAssembly" in window)) {
      showError("This browser does not support WebAssembly. Open WebOS in a current version of Chrome, Edge, Firefox, or Safari.");
      return;
    }
    if (typeof window.V86 !== "function") {
      showError("The v86 runtime was not loaded. Refresh the page and check that the emulator assets were published by GitHub Actions.");
      return;
    }

    try {
      serialBuffer = "";
      booted = false;
      document.documentElement.dataset.guestBooted = "false";
      machine = new window.V86({
        wasm_path: asset("assets/v86/v86.wasm"),
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        bios: { url: asset("assets/v86/bios/seabios.bin") },
        vga_bios: { url: asset("assets/v86/bios/vgabios.bin") },
        bzimage: { url: asset("os/bzImage") },
        initrd: { url: asset("os/rootfs.cpio.gz") },
        cmdline: "console=tty0 console=ttyS0,115200n8 rdinit=/sbin/init loglevel=4",
        screen: {
          container: screenContainer,
          use_graphical_text: false
        },
        autostart: true
      });

      machine.add_listener("emulator-ready", function () {
        bootMessage.textContent = "Virtual hardware ready. Starting the Linux kernel…";
        setStatus("BOOTING", "Starting Linux", "loading");
        setControlsEnabled(true);
      });

      machine.add_listener("emulator-started", function () {
        screenWait.hidden = true;
        if (!booted) {
          setStatus("BOOTING", "Linux kernel is starting", "loading");
        }
      });

      machine.add_listener("emulator-stopped", function () {
        if (paused) {
          setStatus("PAUSED", "Virtual machine paused", "loading");
        }
      });

      machine.add_listener("serial0-output-byte", handleSerialByte);
      machine.add_listener("download-progress", handleDownloadProgress);
      machine.add_listener("download-error", function (details) {
        showError("A required emulator or Linux resource could not be downloaded: " +
          (details && details.file_name ? details.file_name : "unknown file") +
          ". Check that the Pages build published the kernel, initramfs, and v86 assets.");
      });
    } catch (error) {
      showError("Could not initialize the virtual computer: " + (error && error.message ? error.message : String(error)));
      startButton.disabled = false;
    }
  }

  startButton.addEventListener("click", startMachine);

  pauseButton.addEventListener("click", async function () {
    if (!machine) return;
    try {
      if (paused) {
        await machine.run();
        paused = false;
        pauseButton.innerHTML = "<span aria-hidden=\"true\">Ⅱ</span> Pause";
        setStatus(booted ? "LINUX READY" : "BOOTING", booted ? "Linux userspace is running" : "Linux is starting", booted ? "ready" : "loading");
      } else {
        await machine.stop();
        paused = true;
        pauseButton.innerHTML = "<span aria-hidden=\"true\">▶</span> Resume";
        setStatus("PAUSED", "Virtual machine paused", "loading");
      }
    } catch (error) {
      notify("Could not change the virtual machine state: " + error.message);
    }
  });

  restartButton.addEventListener("click", function () {
    if (!machine) return;
    try {
      paused = false;
      booted = false;
      serialBuffer = "";
      document.documentElement.dataset.guestBooted = "false";
      pauseButton.innerHTML = "<span aria-hidden=\"true\">Ⅱ</span> Pause";
      pauseButton.disabled = false;
      screenWait.hidden = true;
      setStatus("RESTARTING", "Rebooting the virtual computer", "loading");
      machine.restart();
    } catch (error) {
      showError("Could not restart Linux: " + error.message);
    }
  });

  saveButton.addEventListener("click", async function () {
    if (!machine) return;
    saveButton.disabled = true;
    try {
      setStatus("SAVING", "Creating a local machine snapshot", booted ? "ready" : "loading");
      const state = await machine.save_state();
      await saveSnapshot(state);
      notify("Machine state saved in this browser.");
      setStatus(booted ? "LINUX READY" : "BOOTING", "Snapshot saved locally", booted ? "ready" : "loading");
    } catch (error) {
      notify("Could not save state: " + error.message);
      setStatus(booted ? "LINUX READY" : "BOOTING", "Snapshot save failed", booted ? "ready" : "loading");
    } finally {
      saveButton.disabled = false;
    }
  });

  restoreButton.addEventListener("click", async function () {
    if (!machine) return;
    restoreButton.disabled = true;
    try {
      const state = await readSnapshot();
      if (!state) {
        notify("No WebOS snapshot is saved in this browser yet.");
        return;
      }
      await machine.stop();
      await machine.restore_state(state);
      paused = false;
      await machine.run();
      booted = true;
      document.documentElement.dataset.guestBooted = "true";
      screenWait.hidden = true;
      pauseButton.innerHTML = "<span aria-hidden=\"true\">Ⅱ</span> Pause";
      setStatus("LINUX READY", "Local machine snapshot restored", "ready");
      notify("WebOS snapshot restored.");
    } catch (error) {
      notify("Could not restore state: " + error.message);
    } finally {
      restoreButton.disabled = false;
    }
  });

  fullscreenButton.addEventListener("click", async function () {
    const target = byId("machine-window");
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else {
        notify("Fullscreen is not available in this browser.");
      }
    } catch (error) {
      notify("Fullscreen could not be enabled: " + error.message);
    }
  });

  window.addEventListener("beforeunload", function () {
    if (machine && typeof machine.destroy === "function") {
      machine.destroy();
    }
  });

  window.WebOS = {
    get machine() { return machine; },
    get booted() { return booted; },
    get serialOutput() { return serialBuffer; }
  };
}());
