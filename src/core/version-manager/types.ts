import type { TFile } from 'obsidian';
import type { VersionControlSettings, VersionHistoryEntry } from '@/types';

/**
 * Options for saving a new version of a file
 */
export interface SaveVersionOptions {
  name?: string;
  force?: boolean;
  isAuto?: boolean;
  settings: VersionControlSettings;
}

/**
 * Result of a save operation
 */
export interface SaveVersionResult {
  status: 'saved' | 'duplicate' | 'skipped_min_lines';
  newVersionEntry: VersionHistoryEntry | null;
  displayName: string;
  newNoteId: string;
}

/**
 * Options for updating version details
 */
export interface UpdateVersionDetails {
  name?: string;
  description?: string;
}

/**
 * Restore operation parameters
 */
export interface RestoreVersionParams {
  liveFile: TFile;
  noteId: string;
  versionId: string;
}

/**
 * Delete operation parameters
 */
export interface DeleteVersionParams {
  noteId: string;
  versionId: string;
}

/**
 * Branch state for editor restoration
 */
export interface BranchState {
  content: string;
  cursor: { line: number; ch: number };
  scroll: { left: number; top: number };
}

/**
 * Version metadata for manifest updates
 */
export interface VersionMetadata {
  versionNumber: number;
  timestamp: string;
  size: number;
  name?: string;
  wordCount: number;
  wordCountWithMd: number;
  charCount: number;
  charCountWithMd: number;
  lineCount: number;
  lineCountWithoutMd: number;
  description?: string;
}
