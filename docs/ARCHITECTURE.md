# WebOS architecture

## Execution model

WebOS is a client-side virtual computer. GitHub Pages only delivers static files; it does not run the guest operating system.

The browser loads the WebOS HTML, CSS, and JavaScript. The application creates a v64 virtual x86-64 PC. v64 emulates x86-64 long mode and translates guest instructions into WebAssembly at runtime. A Buildroot-generated 64-bit Linux kernel then boots with a compressed initramfs containing a 64-bit BusyBox userspace.

The guest CPU, kernel, and userspace are all x86-64. WebAssembly is the host-side execution technology; it is not the guest Linux architecture.

## 64-bit guest architecture

The Buildroot external configuration selects BR2_x86_64 and the generic BR2_x86_x86_64 CPU baseline. Linux is configured from x86_64_defconfig, with the WebOS fragment enabling the emulated PC's VGA, serial, PCI, ATA, and input devices.

The browser configures v64 with cpu_type x86_64, cpu_features x86-64-v1, one virtual CPU core, 512 MiB of guest RAM, ACPI, and a Bochs-compatible VGA adapter.

The guest startup script prints uname -m and the browser reports the machine ready only after it sees Architecture: x86_64 and the WEBOS_BOOT_COMPLETE marker.

v64's current guest physical memory ceiling is 4 GiB due to its wasm32 memory model. This is a memory-capacity constraint, not a 32-bit guest CPU or operating system.

## Static deployment

All runtime dependencies are published under the Pages site:

- assets/v64/libv86.js
- assets/v64/v86.wasm
- assets/v64/bios/seabios.bin
- assets/v64/bios/vgabios.bin
- os/bzImage
- os/rootfs.cpio.gz

The workflow checks out v64 at a pinned commit and builds its browser library. It downloads the pinned stable Buildroot release, applies the WebOS external-tree configuration, builds the 64-bit kernel and initramfs, verifies the kernel's CONFIG_64BIT and CONFIG_X86_64 settings, and verifies BusyBox is ELF64.

It then boots the guest using qemu-system-x86_64 and checks both the architecture string and the userspace boot marker. Before publishing, headless Chromium loads those exact static files, starts v64, checks the x86-64 boot marker, and exercises pause, resume, and restart.

Relative URLs are used so the site works at a project URL such as /webos/, not only at a domain root.

## Guest boot

The Linux kernel receives both VGA and serial console parameters. BusyBox init starts a shell on the virtual VGA console and on the first serial port. The serial output is monitored by the browser application to identify the architecture and WebOS boot marker.

A successful download, WebAssembly initialization, or emulator start is not proof that Linux booted. The boot-ready state is only set after the guest emits the marker printed by the guest startup script.

## Persistence

The Save state control calls v64's state serialization API and stores the resulting binary snapshot in IndexedDB. Restore state loads that snapshot into a machine created with the same kernel, initramfs, memory size, and emulator version.

The initial root filesystem is RAM-backed. Saving an emulator state preserves the running machine snapshot; it is not a multi-device synchronization service or a durable cloud filesystem.

## Security boundaries

The guest runs inside an emulator in the browser and does not receive native host root privileges. Browser permissions and same-origin restrictions still apply. Do not add host filesystem access, clipboard access, networking relays, or third-party APIs without an explicit design and security review.

## Current scope

The first milestone is a verified 64-bit Linux shell. A graphical desktop, guest networking, and persistent virtual storage are separate features and must be implemented and tested before being advertised as available.
