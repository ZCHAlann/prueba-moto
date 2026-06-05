export const polarToCartesian = (
  cx: number, cy: number, r: number, angleDeg: number
) => {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
};

// Genera un path SVG para un arco entre startAngle y endAngle (en grados)
// Convención: 0°=right, 90°=down, 180°=left, 270°=up
export const arcPath = (
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number
): string => {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end   = polarToCartesian(cx, cy, r, endAngle);
  const diff  = endAngle - startAngle;
  const largeArc = Math.abs(diff) > 180 ? 1 : 0;
  const sweep = diff > 0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
};