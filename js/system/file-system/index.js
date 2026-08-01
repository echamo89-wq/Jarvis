// Core
export { default as FileSystemCore } from './FileSystemCore.js';
export { resolvePath, resolvePathWithPowerShell } from './PathResolver.js';
export {
  isSensitivePath, getRiskLevel, isTextExtension, isDocumentExtension,
  getMediaType, getFileDescription, getCategory, getCategoryEmoji,
} from './PathValidator.js';
export { ensurePermitted, ensurePermittedWithDetails, consumePermission } from './FilePermissionManager.js';

// Operations
export { readFile, readFilePreview } from './FileReader.js';
export { writeFile, appendFile } from './FileWriter.js';
export { searchFiles } from './FileSearcher.js';
export { moveFile, copyFile } from './FileMover.js';
export { deleteFile, deleteFolder } from './FileDeleter.js';
export { inspectPath } from './FileInspector.js';

// Specialized
export { processDocument } from './DocumentProcessor.js';
export { findMedia } from './MediaFinder.js';
export { preview, execute, undo } from './FolderOrganizer.js';

// Router
export { execute, executeOperation } from './FileToolRouter.js';

// Result & Errors
export * as FileResult from './FileResult.js';
export * as FileErrors from './FileErrors.js';
