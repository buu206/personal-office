// SpriteCollab rows run counterclockwise from down in screen coordinates.
export function facingRow(dx, dy) {
  return (Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) + 8) % 8;
}

// Display heights are composition choices, measured from visible pixels.
export const displayHeights = [117, 102, 99, 205, 106];

export function positionAt(time, index) {
  const phase = time * .3 + index * 1.4;
  const centerX = [370, 200, 560, 805, 660][index];
  const centerY = [495, 640, 640, 520, 230][index];
  return {
    x: centerX + Math.sin(phase) * 65,
    y: centerY + Math.cos(phase) * 22,
    dx: Math.cos(phase) * 65 * .3,
    dy: -Math.sin(phase) * 22 * .3,
  };
}
