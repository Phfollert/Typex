import { z } from 'zod';

export const ExampleEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  files: z.array(z.string()), // paths relative to /examples; array order = pane order
  pythonVersion: z.string().optional(), // e.g. "3.12"
});

export type ExampleEntry = z.infer<typeof ExampleEntrySchema>;

export interface LoadedExample {
  files: Record<string, string>; // basename -> contents, in pane order
  pythonVersion?: string;
}
