import { z } from 'zod';

/**
 * Zod schema for a file path parameter.
 */
export const fileParam = z.string().describe('File path (relative to workspace root or absolute)');

/**
 * Zod schema for file + position parameters (file, line, character).
 * Line and character are 1-based (matching editor display). Convert to 0-based internally.
 */
export const positionParams = {
  file: fileParam,
  line: z.number().int().min(1).describe('Line number (1-based)'),
  character: z.number().int().min(1).describe('Character offset (1-based)'),
};
