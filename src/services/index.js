/* ================================================================
   SERVICES — Re-export all domain modules for backward compatibility
   import { ... } from "./services" still works
   ================================================================ */

// Storage
export { setUserPrefix, userKey, loadJSON, saveJSON, migrateData } from "./storage";

// Cloud sync
export { cloudSave, cloudLoad, cloudSaveAll, cloudLoadAll, cloudLoadKeys, scheduleSyncDebounced, cancelAllPendingSyncs } from "./cloud";

// Auth / Accounts
export { hashPassword, loadAccounts, saveAccounts, generateOTP, maskPhone } from "./auth";

// Token encryption
export { encryptToken, decryptToken } from "./crypto";

// Text-to-speech
export { tts } from "./tts";

// Claude API
export { callClaude, callClaudeStream, extractKnowledge } from "./ai";

// Data: history, memory, knowledge, settings, import/export, clear, markdown, backup
export {
  loadHistory, saveHistory, addLog,
  loadMemory, saveMemory, addMemory, deleteMemory, memoryToText,
  loadKnowledge, saveKnowledge, guessCategory, extractTags,
  addKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry,
  saveKnowledgeProfile, approveKnowledgeEntry, approveAllPending,
  buildKnowledgePrompt,
  loadSettings, saveSettings,
  processMemoryCommands,
  inlineMd,
  exportAllData, importData,
  clearAllData, isDataCleared, clearDataClearedFlag,
  clearAllDataWithCloud, clearAllSystemData,
  sendBackupEmail,
} from "./data";

// Task commands
export { processTaskCommands, executeTaskActions } from "./taskCommands";
