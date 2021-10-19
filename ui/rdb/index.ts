import RegistryView from './views/RegistryView.svelte';
import CommandsView from './views/CommandsView.svelte';
<<<<<<< HEAD
import NodeTreeView from './views/NodeTreeView.svelte';
=======
>>>>>>> upstream/master

declare const viewName; // Provided by ViewProviders
let view;

switch(viewName) {
	case 'RegistryView':
		view = RegistryView;
		break;
	case 'CommandsView':
		view = CommandsView;
		break;
<<<<<<< HEAD
    case 'NodeTreeView':
        view = NodeTreeView;
        break;
=======
>>>>>>> upstream/master
}
const app = new view({
	target: document.body
});
export {app};
