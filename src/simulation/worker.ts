import type { SimulationRequest, SimulationResponse } from '../model';
import { initialResult, step } from './engine';
let state = initialResult();
self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const req = event.data;
  if (req.type === 'reset') state = initialResult();
  state = step(req.circuit, state, req.type === 'reset' ? 0 : req.dt);
  self.postMessage({
    type: 'result',
    requestId: req.requestId,
    result: state,
  } satisfies SimulationResponse);
};
