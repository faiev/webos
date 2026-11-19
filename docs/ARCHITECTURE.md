# WebOS architecture

## Execution model

WebOS is a client-side virtual computer. GitHub Pages only delivers static files; it does not run the guest operating system.

The browser loads the WebOS HTML, CSS, and JavaScript. The application creates a v86 virtual x86 PC. v86 translates guest x86 instructions into WebAssembly at runtime and emulates the devices exposed to the guest. A Buildroot-generated Linux kernel then boots with a compressed initramfs containing BusyBox.

## Why 32-bit x86?

The official v86 compatibility documentation currently says 64-bit Linux kernels are not supported. The first WebOS target is therefore 32-bit x86. Do not change this to x86-64 unless the selected emulator version demonstrably supports the required long-mode Linux boot path and the full system passes browser boot tests.

## Static deployment

All runtime dependencies are published under the Pages site:

- assets/v86/libv86.js
- assets/v86/v86.wasm
- os/bzImage
- os/rootfs.cpio.gz

The workflow checks out v86 at a pinned commit and builds its browser library. It downloads the pinned stable Buildroot release, applies the WebOS external-tree configuration, builds the kernel and initramfs, boots that guest under QEMU until the WebOS userspace marker is observed, collects Buildroot legal information, and assembles the static site. Before publishing, headless Chromium loads those exact static files, starts v86, waits for the Linux userspace marker, and exercises pause, resume, and restart.

Relative URLs are used so the site can work at a project URL such as /webos/, not only at a domain root.

## Guest boot

The Linux kernel receives both VGA and serial console parameters. BusyBox init starts a shell on the virtual VGA console and on the first serial port. The serial output is monitored by the browser application to identify the WebOS boot marker and report that userspace has started.

A successful download, WebAssembly initialization, or emulator start is not proof that Linux booted. The boot-ready state is only set after the guest emits the marker printed by the guest startup script.

## Persistence

The Save state control calls v86's state serialization API and stores the resulting binary snapshot in IndexedDB. Restore state loads that snapshot into a machine created with the same kernel, initramfs, memory size, and emulator version.

The initial root filesystem is RAM-backed. Saving an emulator state preserves the running machine snapshot; it is not a multi-device synchronization service or a durable cloud filesystem.

## Security boundaries

The guest runs inside an emulator in the browser and does not receive native host root privileges. Browser permissions and same-origin restrictions still apply. Do not add host filesystem access, clipboard access, networking relays, or third-party APIs without an explicit design and security review.

## Future milestones

1. Extend browser tests to verify keyboard input and shell commands, not only boot and machine controls.
2. Evaluate a small graphical environment only after the shell build is reliable.
3. Consider guest networking and persistent virtual storage as separate, testable features.
