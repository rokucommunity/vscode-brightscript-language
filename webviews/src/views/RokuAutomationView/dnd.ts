/* eslint-disable object-shorthand */
/* eslint-disable curly */
export function draggable(node, data) {
    let state: any = data;

    node.draggable = true;
    node.style.cursor = 'grab';

    function handleDragstart(e) {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData('text/plain', state);
    }

    node.addEventListener('dragstart', handleDragstart);

    return {
        update(data) {
            state = data;
        },

        destroy() {
            node.removeEventListener('dragstart', handleDragstart);
        }
    };
}

export function dropzone(node, options) {
    let state: any = {
        dropEffect: 'move',
        dragoverClass: 'droppable',
        ...options
    };

    function handleDragenter(e) {
        if (!(e.target instanceof HTMLElement)) return;
        e.target.classList.add(state.dragoverClass);
    }

    function handleDragleave(e) {
        if (!(e.target instanceof HTMLElement)) return;
        e.target.classList.remove(state.dragoverClass);
    }

    function handleDragover(e) {
        e.preventDefault();
        if (!e.dataTransfer) return;
        e.dataTransfer.dropEffect = state.dropEffect;
    }

    function handleDrop(e) {
        e.preventDefault();
        if (!e.dataTransfer) return;
        const data: any = e.dataTransfer.getData('text/plain');
        if (!(e.target instanceof HTMLElement)) return;
        e.target.classList.remove(state.dragoverClass);
        state.onDropzone(data, e);
        e.stopPropagation();
    }

    node.addEventListener('dragenter', handleDragenter);
    node.addEventListener('dragleave', handleDragleave);
    node.addEventListener('dragover', handleDragover);
    node.addEventListener('drop', handleDrop);

    return {
        update(options) {
            state = {
                dropEffect: 'move',
                dragoverClass: 'droppable',
                ...options
            };
        },

        destroy() {
            node.removeEventListener('dragenter', handleDragenter);
            node.removeEventListener('dragleave', handleDragleave);
            node.removeEventListener('dragover', handleDragover);
            node.removeEventListener('drop', handleDrop);
        }
    };
}