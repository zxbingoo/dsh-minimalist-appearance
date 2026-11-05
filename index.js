import z from '@deepseek-ai/schemastery';
import {
  NS, DEFAULTS, IMAGE_DATA_PATTERN, MAX_IMAGE_DATA_LENGTH,
  validateState, summary,
} from './core.js';

/** Ordinary serializable Host forms; fonts and layout are intentionally absent. */
export const Config = z.object({
  preset: z.union(['original', 'forest', 'sea', 'sand']).default(DEFAULTS.preset).volatile(),
  mode: z.union(['inherit', 'light', 'dark', 'system']).default(DEFAULTS.mode).volatile(),
  accent: z.string().max(7).pattern(/^(?:|#[0-9A-Fa-f]{6})$(?![\s\S])/).default(DEFAULTS.accent).volatile(),
  background: z.union(['none', 'forest', 'sea', 'sand', 'upload']).default(DEFAULTS.background).volatile(),
  fade: z.number().step(1).min(0).max(100).default(DEFAULTS.fade).volatile(),
  imageData: z.string().max(MAX_IMAGE_DATA_LENGTH).pattern(IMAGE_DATA_PATTERN).default(DEFAULTS.imageData).volatile(),
});

const PATCH_PROPERTIES = Object.freeze({
  preset: { type: 'string', enum: ['original', 'forest', 'sea', 'sand'] },
  mode: { type: 'string', enum: ['inherit', 'light', 'dark', 'system'], description: 'Color mode for base colors or forest/sea/sand presets. inherit uses the native DSH mode without changing its preference.' },
  accent: { type: 'string', description: 'A #RRGGBB color, or an empty string to use the preset accent.' },
  background: { type: 'string', enum: ['none', 'forest', 'sea', 'sand', 'upload'] },
  fade: { type: 'integer', minimum: 0, maximum: 100, description: 'Background fade from 0 (strong) to 100 (hidden).' },
  imageData: {
    type: 'string',
    description: 'Empty to clear, or a PNG/JPEG/WebP base64 data URL of at most 2 MiB decoded. Prefer the Appearance page for uploading images to avoid large conversation input. Required with upload unless an image is already saved.',
  },
});

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    preset: PATCH_PROPERTIES.preset,
    mode: { type: 'string', enum: ['inherit', 'light', 'dark', 'system'] },
    accent: { type: 'string' },
    background: PATCH_PROPERTIES.background,
    fade: { type: 'integer' },
    image: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] },
            byteLength: { type: 'integer' },
          },
          required: ['mimeType', 'byteLength'],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['preset', 'mode', 'accent', 'background', 'fade', 'image'],
  additionalProperties: false,
};

function argumentsOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Arguments must be an object');
  }
  for (const key of Object.keys(input)) {
    if (!['action', 'patch', 'expectedRevision'].includes(key)) throw new TypeError(`Unknown argument: ${key}`);
  }
  if (!['get', 'set', 'reset'].includes(input.action)) throw new TypeError('action must be get, set, or reset');
  if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) {
    throw new TypeError('expectedRevision must be a non-negative safe integer');
  }
  if (input.action === 'set') {
    if (!Object.hasOwn(input, 'patch')) throw new TypeError('set requires a patch');
    const patch = validateState(input.patch, { partial: true });
    if (!Object.keys(patch).length) throw new TypeError('set requires at least one appearance field');
    return { ...input, patch };
  }
  if (Object.hasOwn(input, 'patch')) throw new TypeError('patch is only valid with set');
  if (input.action === 'get' && input.expectedRevision !== undefined) {
    throw new TypeError('expectedRevision is only valid with set or reset');
  }
  return input;
}

function readOwn(settings) {
  const descriptor = settings.describe({ redactSecrets: true }).find((row) => row.ns === NS);
  if (!descriptor) throw new Error('Appearance settings are unavailable; enable the appearance plugin and try again');
  return descriptor;
}

/**
 * Both the plugin UI and this tool use the existing settings.mutate service.
 * Complete-state validation adds upload dependencies to the scalar Host form
 * constraints. A generic settings editor can stage an empty upload choice;
 * the Client must not render that image until complete-state validation passes.
 */
async function operate(settings, input, signal) {
  const args = argumentsOf(input);
  if (signal?.aborted) throw new Error('Appearance operation was cancelled');
  let descriptor = readOwn(settings);
  if (args.action !== 'get') {
    const patch = args.action === 'reset' ? { ...DEFAULTS } : args.patch;
    validateState(args.action === 'reset' ? patch : { ...descriptor.value, ...patch });
    const ops = Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value }));
    if (signal?.aborted) throw new Error('Appearance operation was cancelled');
    await settings.mutate(NS, ops, args.expectedRevision ?? descriptor.revision);
    descriptor = readOwn(settings);
  }
  return { action: args.action, revision: descriptor.revision, state: summary(descriptor.value) };
}

/** Register effects only while their providing services are available. */
export function apply(ctx) {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    child.inject(['tools'], (toolCtx) => {
      toolCtx.effect(() => toolCtx.tools.register({
        name: 'dsh_appearance',
        deferLoading: true,
        description: 'Read, change, or reset DSH colors and backgrounds for this profile, shared by its sessions. Leaves fonts and layout unchanged. Returns a revision and image metadata without image contents.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'set', 'reset'] },
            patch: { type: 'object', properties: PATCH_PROPERTIES, additionalProperties: false, description: 'Fields to change; required only for set.' },
            expectedRevision: { type: 'integer', minimum: 0, description: 'Optional revision from get; set/reset refuse a stale revision.' },
          },
          required: ['action'],
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['get', 'set', 'reset'] },
              revision: { type: 'integer' },
              state: SUMMARY_SCHEMA,
            },
            required: ['action', 'revision', 'state'],
            additionalProperties: false,
          },
          render(_args, value) {
            return [{ type: 'text', text: JSON.stringify(value) }];
          },
        },
        isConcurrencySafe(args) { return args?.action === 'get'; },
        async execute(args, exec) { return operate(child.settings, args, exec.signal); },
      }));
    });
  });
}
