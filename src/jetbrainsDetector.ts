// src/jetbrainsDetector.ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export interface IdeDefinition {
  name: string;
  binaryName: string;        // lowercase binary name (e.g., 'idea', 'webstorm')
  macAppPatterns: string[];   // glob patterns for .app bundles
}

export const IDE_DEFINITIONS: IdeDefinition[] = [
  { name: 'IntelliJ IDEA', binaryName: 'idea', macAppPatterns: ['IntelliJ IDEA*'] },
  { name: 'WebStorm', binaryName: 'webstorm', macAppPatterns: ['WebStorm*'] },
  { name: 'PyCharm', binaryName: 'pycharm', macAppPatterns: ['PyCharm*'] },
  { name: 'GoLand', binaryName: 'goland', macAppPatterns: ['GoLand*'] },
  { name: 'PhpStorm', binaryName: 'phpstorm', macAppPatterns: ['PhpStorm*'] },
  { name: 'Rider', binaryName: 'rider', macAppPatterns: ['Rider*'] },
  { name: 'CLion', binaryName: 'clion', macAppPatterns: ['CLion*'] },
  { name: 'RubyMine', binaryName: 'rubymine', macAppPatterns: ['RubyMine*'] },
  { name: 'DataGrip', binaryName: 'datagrip', macAppPatterns: ['DataGrip*'] },
];

export interface DetectedIde {
  name: string;
  binaryName: string;
  binaryPath: string;
}

export function getJetBrainsSearchPaths(platform: string): string[] {
  const home = homedir();

  switch (platform) {
    case 'darwin':
      return [
        // Toolbox 2.0 scripts
        join(home, 'Library', 'Application Support', 'JetBrains', 'Toolbox', 'scripts'),
        // App bundles
        '/Applications',
        join(home, 'Applications'),
      ];

    case 'linux':
      return [
        // Toolbox 2.0 scripts
        join(home, '.local', 'share', 'JetBrains', 'Toolbox', 'scripts'),
        // Toolbox 1.x
        join(home, '.local', 'share', 'JetBrains', 'Toolbox', 'apps'),
        // System
        '/opt/jetbrains',
        // Snap
        '/snap',
      ];

    case 'win32':
      return [
        // Toolbox 2.0
        join(process.env.LOCALAPPDATA || '', 'Programs'),
        // Toolbox 1.x
        join(process.env.LOCALAPPDATA || '', 'JetBrains', 'Toolbox', 'apps'),
        // System
        join(process.env.PROGRAMFILES || '', 'JetBrains'),
      ];

    default:
      return [];
  }
}

export function detectJetBrainsIde(platform: string = process.platform): DetectedIde | null {
  const searchPaths = getJetBrainsSearchPaths(platform);

  for (const ide of IDE_DEFINITIONS) {
    for (const basePath of searchPaths) {
      if (!existsSync(basePath)) continue;

      const found = findIdeBinary(basePath, ide, platform);
      if (found) return { name: ide.name, binaryName: ide.binaryName, binaryPath: found };
    }
  }

  return null;
}

/** Shallow list of directories matching a prefix in a parent dir */
function findMatchingDirs(parentDir: string, prefix: string): string[] {
  try {
    return readdirSync(parentDir)
      .filter(name => name.startsWith(prefix))
      .map(name => join(parentDir, name))
      .filter(p => { try { return statSync(p).isDirectory(); } catch { return false; } });
  } catch { return []; }
}

/** Recursively find a file by name, max 3 levels deep to avoid scanning too broadly */
function findFileRecursive(dir: string, fileName: string, maxDepth = 3): string | null {
  if (maxDepth <= 0) return null;
  try {
    const entries = readdirSync(dir);
    const subdirs: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const isDir = statSync(full).isDirectory();
        if (!isDir && entry === fileName) return full;
        if (isDir) subdirs.push(full);
      } catch { continue; }
    }
    for (const subdir of subdirs) {
      const found = findFileRecursive(subdir, fileName, maxDepth - 1);
      if (found) return found;
    }
  } catch { /* unreadable dir */ }
  return null;
}

function findIdeBinary(basePath: string, ide: IdeDefinition, platform: string): string | null {
  if (platform === 'darwin') {
    // Check Toolbox scripts first
    const toolboxScript = join(basePath, ide.binaryName);
    if (existsSync(toolboxScript)) return toolboxScript;

    // Check .app bundles
    if (basePath.endsWith('Applications')) {
      for (const pattern of ide.macAppPatterns) {
        const prefix = pattern.replace('*', '');
        const appDirs = findMatchingDirs(basePath, prefix)
          .filter(d => d.endsWith('.app'));
        for (const appPath of appDirs) {
          const binary = join(appPath, 'Contents', 'MacOS', ide.binaryName);
          if (existsSync(binary)) return binary;
        }
      }
    }
  } else if (platform === 'linux') {
    // Toolbox scripts
    const toolboxScript = join(basePath, ide.binaryName);
    if (existsSync(toolboxScript)) return toolboxScript;

    // Search for bin/<name>.sh (max 3 levels deep)
    const found = findFileRecursive(basePath, ide.binaryName + '.sh');
    if (found) return found;
  } else if (platform === 'win32') {
    // Search for bin/<name>64.exe (max 3 levels deep)
    const found = findFileRecursive(basePath, ide.binaryName + '64.exe');
    if (found) return found;
  }

  return null;
}
