import type { FabricObject } from 'fabric';

export const blendModes: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};

export function hasBlending(objects: FabricObject[]): boolean {
  return objects.some(o => o.globalCompositeOperation !== 'source-over' || ('getObjects' in o && hasBlending((o as unknown as { getObjects(): FabricObject[] }).getObjects())));
}
