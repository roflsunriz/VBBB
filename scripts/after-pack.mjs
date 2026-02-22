/**
 * electron-builder afterPack hook.
 * Removes WebGPU-related DLLs from the Windows build output.
 *
 * These files are part of Electron's WebGPU implementation (Dawn/DirectX Shader Compiler
 * and Vulkan software renderer). This app is a BBS browser and does not use WebGPU,
 * so these files are safe to remove, reducing the installed app size by ~32 MB.
 *
 * Files removed:
 *   - dxcompiler.dll  (24.4 MB) WebGPU HLSL shader compiler
 *   - dxil.dll         (1.4 MB) DirectX Intermediate Language (dxcompiler dependency)
 *   - vk_swiftshader.dll (5.4 MB) Vulkan software renderer (WebGPU fallback)
 *   - vk_swiftshader_icd.json   Vulkan ICD manifest for vk_swiftshader
 *   - vulkan-1.dll     (0.9 MB) Vulkan loader
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const WEBGPU_FILES = [
  'dxcompiler.dll',
  'dxil.dll',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll',
];

/** @param {import('electron-builder').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  for (const file of WEBGPU_FILES) {
    const filePath = join(context.appOutDir, file);
    await rm(filePath, { force: true });
    console.log(`[after-pack] Removed: ${file}`);
  }
}
