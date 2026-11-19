# WebOS

**A real Linux system running inside your browser.**

WebOS is a small Linux distribution that boots in a browser tab. GitHub Pages serves the static application, WebAssembly emulator, Linux kernel, and root filesystem. The computer itself is emulated locally in the visitor's browser.

This is not a terminal simulator: the intended runtime boots a real 32-bit x86 Linux kernel with a BusyBox userspace.

## How it works

1. The WebOS interface loads from GitHub Pages.
2. The pinned v86 emulator loads its WebAssembly CPU engine.
3. v86 emulates an x86 PC and its basic devices inside the browser.
4. The Linux kernel boots with a Buildroot-generated compressed initramfs.
5. BusyBox starts the WebOS shell on the virtual VGA and serial consoles.

The browser does the emulation. No WebOS backend or remote virtual machine is required.

## Hardware target

The first release targets **32-bit x86 (i386/Pentium Pro class)**. The official v86 emulator documents that 64-bit Linux kernels are not supported, so this is a deliberate compatibility choice rather than an arbitrary limitation.

The system currently focuses on a bootable Linux shell. A graphical desktop, guest networking, and richer file persistence are future work and must not be presented as available until implemented and tested.

## Repository layout

- index.html — browser application shell.
- assets/css/ — application styling.
- assets/js/ — emulator lifecycle and browser controls.
- os/buildroot-external/ — WebOS Buildroot configuration and root filesystem overlay.
- .github/workflows/pages.yml — builds emulator and Linux resources, then deploys GitHub Pages.
- docs/ARCHITECTURE.md — technical architecture and limitations.

Generated binaries are intentionally not committed to the source tree. GitHub Actions builds them and assembles the static Pages site.

## First deployment

1. Open the repository's **Settings → Pages**.
2. Set the build and deployment source to **GitHub Actions**.
3. Ensure Actions are enabled for the repository.
4. Run the **Build and deploy WebOS** workflow, or push a commit to main.
5. Open the Pages URL after the workflow completes successfully.

The first build compiles v86 and Buildroot, so it takes longer than a normal static-site deployment. Before publishing, the workflow boots the generated kernel and initramfs under QEMU, then launches the assembled Pages site in headless Chromium. The browser test verifies that v86 boots the real Linux userspace and that pause, resume, and restart work. The workflow must complete successfully before the OS assets are available on Pages.

## Local development

After a successful workflow build, download the workflow artifact named webos-pages or use the generated _site directory in a local checkout. Serve it over HTTP:

    python3 -m http.server 8000 --directory _site

Then open http://127.0.0.1:8000.

Do not open the page with a file URL. The emulator loads WebAssembly and binary images using browser HTTP requests.

## Browser controls

- Start creates the virtual PC and boots Linux.
- Pause / Resume pauses or continues emulation.
- Restart reboots the virtual PC.
- Save state stores an emulator snapshot in this browser's IndexedDB.
- Restore state restores the most recent snapshot from this browser.
- Fullscreen expands the guest display.

Click inside the guest display to send keyboard input to Linux. The browser may reserve some system shortcuts.

A saved machine state is a local browser snapshot. It is not cloud storage, and it does not make the guest's RAM-based root filesystem durable across unrelated sessions unless a compatible snapshot is restored.

## Build versions

- Buildroot: 2026.08.2 stable release.
- v86: pinned to commit 315b2b0b758703ef0e6cc7b4088d6068f83f3c20.
- Linux kernel: selected through the pinned Buildroot configuration.

The generated site includes build metadata so the exact source revisions can be identified.

## Important limitations

- This is an emulated 32-bit x86 PC, not a native host operating system.
- Performance depends on the visitor's browser, CPU, and available memory.
- Guest networking is not enabled in the initial configuration.
- The first boot downloads the emulator and Linux images; browser caching may make later launches faster.
- Browser storage can be cleared by the user or evicted by the browser.
- GitHub Pages is static hosting. It does not execute Linux or provide a server-side VM.

## Licensing

WebOS configuration and application files are maintained in this repository. The build also includes third-party components with their own licenses, including Linux, Buildroot, BusyBox, and v86. See CREDITS.md and the licenses distributed with their source projects before redistributing modified builds.
