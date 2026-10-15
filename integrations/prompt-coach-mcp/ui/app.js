import { CoachController } from './model.mjs';
import { createMcpHostAdapter } from './host-adapter.mjs';
import { createCoachView } from './view.mjs';

const root = document.getElementById('app');
if (root) {
  let controller;
  let view;
  const adapter = createMcpHostAdapter({
    onResult: (result) => controller?.receive(result),
    onConnection: (status) => controller?.setConnection(status),
    onError: (message) => controller?.setError(message),
  });
  controller = new CoachController(adapter, { restored: adapter.restoredState(), onChange: () => view?.render() });
  view = createCoachView(root, controller, adapter);
  view.render();
  void adapter.connect();
}
