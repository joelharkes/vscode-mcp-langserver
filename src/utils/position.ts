import { z } from 'zod';

/**
 * Zod schema for a file path parameter.
 */
export const fileParam = z.string().describe('File path (relative to workspace root or absolute)');

/**
 * Zod schema for file + position parameters (file, line, character).
 */
export const positionParams = {
  file: fileParam,
  line: z.number().int().min(0).describe('Zero-based line number'),
  character: z.number().int().min(0).describe('Zero-based character offset'),
};
