import {
  buildQuadraticBezierPath,
  computeControlOffsetFromHandle,
  defaultEdgeControlOffset,
  edgeMidpoint,
  parseFlowEdgeKey,
  resolveEdgeControlOffset
} from './workflowFlowEdges';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

{
  const { handleX, handleY, labelX, labelY } = buildQuadraticBezierPath(0, 0, 200, 0, {
    offsetX: 0,
    offsetY: 40
  });
  assert(handleX === 100, 'handle x on horizontal edge');
  assert(handleY === 40, 'handle y on horizontal edge');
  assertClose(labelX, handleX, 'label x matches handle');
  assertClose(labelY, handleY, 'label y matches handle');
}

{
  const offset = computeControlOffsetFromHandle(0, 0, 200, 100, 120, 80);
  const mid = edgeMidpoint(0, 0, 200, 100);
  assertClose(offset.offsetX, 120 - mid.x, 'offset x from handle');
  assertClose(offset.offsetY, 80 - mid.y, 'offset y from handle');
}

{
  const forward = defaultEdgeControlOffset(0, 0, 200, 0, false);
  const backward = defaultEdgeControlOffset(0, 0, 200, 0, true);
  assert(forward.offsetY !== 0, 'forward default has curve offset');
  assert(backward.offsetY !== 0, 'backward default has curve offset');
  assert(Math.sign(forward.offsetY) !== Math.sign(backward.offsetY), 'forward and backward curve opposite sides');
  assert(Math.abs(backward.offsetY) > Math.abs(forward.offsetY), 'backward default is stronger');
}

{
  const offset = resolveEdgeControlOffset(
    { offsetX: 12, offsetY: -8, curvature: 0.5 },
    0,
    0,
    100,
    0,
    false
  );
  assert(offset.offsetX === 12 && offset.offsetY === -8, 'stored offsets win over curvature');
}

{
  assert(parseFlowEdgeKey('a::b')?.sourceKey === 'a', 'parse valid edge key');
  assert(parseFlowEdgeKey('a::') === null, 'reject empty target key');
  assert(parseFlowEdgeKey('::b') === null, 'reject empty source key');
}

console.log('workflowFlowEdges tests passed');
